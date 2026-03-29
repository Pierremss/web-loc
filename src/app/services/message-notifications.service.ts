import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../modules/auth/auth.service';
import { SocketService } from './socket.service';
import { UsersService } from './users.service';
import { ConversationsService } from './conversations.service';
import { environment } from '../../environments/environment';

type CachedUser = { name: string; avatar_url?: string | null };
type CachedConversation = { name: string; avatar_url?: string | null };

@Injectable({ providedIn: 'root' })
export class MessageNotificationsService {
  private initialized = false;

  private dmHandler: any;
  private convHandler: any;
  private convMemberAddedHandler: any;

  private readonly userCache = new Map<number, CachedUser>();
  private readonly convCache = new Map<number, CachedConversation>();

  private readonly zone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly auth = inject(AuthService);
  private readonly sockets = inject(SocketService);
  private readonly users = inject(UsersService);
  private readonly convs = inject(ConversationsService);

  init() {
    if (this.initialized) return;
    if (!this.auth.isLogged() || this.auth.isAdmin() || !this.auth.token) return;

    const socket = this.sockets.connect(this.auth.token);

    this.dmHandler = (msg: any) => {
      this.zone.run(() => void this.handleDirectMessage(msg));
    };

    this.convHandler = (msg: any) => {
      this.zone.run(() => void this.handleConversationMessage(msg));
    };

    this.convMemberAddedHandler = (payload: any) => {
      this.zone.run(() => void this.handleConversationMemberAdded(payload));
    };

    socket.on('message:new', this.dmHandler);
    socket.on('conv:message:notify', this.convHandler);
    socket.on('conv:member:added', this.convMemberAddedHandler);

    this.initialized = true;
  }

  teardown() {
    const socket = this.sockets.get();
    if (!socket) return;
    if (this.dmHandler) socket.off('message:new', this.dmHandler);
    if (this.convHandler) socket.off('conv:message:notify', this.convHandler);
    if (this.convMemberAddedHandler) socket.off('conv:member:added', this.convMemberAddedHandler);
    this.dmHandler = null;
    this.convHandler = null;
    this.convMemberAddedHandler = null;
    this.initialized = false;
  }

  private isOnDirectChat(peerId: number) {
    const path = (this.router.url || '').split('?')[0];
    return path === `/chat/${peerId}`;
  }

  private isOnConversation(convId: number) {
    const path = (this.router.url || '').split('?')[0];
    return path === `/conversations/${convId}`;
  }

  private snippet(content: string, max = 90) {
    const cleaned = String(content ?? '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned;
  }

  private escapeHtml(value: any): string {
    const s = String(value ?? '');
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatWhen(value: any): string {
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (!Number.isFinite(d.getTime())) return '';
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return '';
    }
  }

  private normalizeAvatar(url?: string | null) {
    if (!url) return 'assets/icon/favicon.png';
    if (/^https?:/i.test(url)) return url;
    return `${environment.socketUrl}${url}`;
  }

  private async getUserDisplay(userId: number): Promise<CachedUser> {
    const cached = this.userCache.get(userId);
    if (cached) return cached;
    try {
      const u = await firstValueFrom(this.users.getPublicProfile(userId));
      const entry: CachedUser = {
        name: (u as any)?.nickname || (u as any)?.name || 'Amigo',
        avatar_url: (u as any)?.avatar_url ?? null,
      };
      this.userCache.set(userId, entry);
      return entry;
    } catch {
      const fallback: CachedUser = { name: 'Amigo' };
      this.userCache.set(userId, fallback);
      return fallback;
    }
  }

  private async getConversationDisplay(convId: number): Promise<CachedConversation> {
    const cached = this.convCache.get(convId);
    if (cached) return cached;
    try {
      const c = await firstValueFrom(this.convs.get(convId));
      const entry: CachedConversation = {
        name: (c as any)?.name || 'Sala',
        avatar_url: (c as any)?.avatar_url ?? null,
      };
      this.convCache.set(convId, entry);
      return entry;
    } catch {
      const fallback: CachedConversation = { name: 'Sala' };
      this.convCache.set(convId, fallback);
      return fallback;
    }
  }

  private async handleDirectMessage(msg: any) {
    if (!this.auth.isLogged() || this.auth.isAdmin()) return;

    const myId = Number(this.auth.user?.id);
    const senderId = Number(msg?.sender_id);
    const receiverId = Number(msg?.receiver_id);

    if (!Number.isFinite(senderId) || !Number.isFinite(receiverId)) return;
    if (Number.isFinite(myId) && receiverId !== myId) return;
    if (this.isOnDirectChat(senderId)) return;

    const preview = this.snippet(msg?.content ?? '');

    const cached = this.userCache.get(senderId);
    let display = cached ?? { name: 'Amigo' };
    if (!cached) {
      try {
        display = await Promise.race([
          this.getUserDisplay(senderId),
          new Promise<CachedUser>((resolve) => setTimeout(() => resolve({ name: 'Amigo' }), 650)),
        ]);
      } catch {
        display = { name: 'Amigo' };
      }
    }

    const senderLabel = String(display?.name || 'Amigo').trim() || 'Amigo';
    const when = this.formatWhen(msg?.created_at || msg?.createdAt || msg?.created);
    const text = preview || 'Você recebeu uma nova mensagem.';
    const messageText = when ? `${text} • ${when}` : text;

    await this.presentToast({
      header: senderLabel,
      message: messageText,
      icon: 'chatbubble-ellipses-outline',
      onOpen: () => this.router.navigate(['/chat', senderId]),
      openText: 'Ir ao chat',
      dismissText: 'Remover notificação',
      duration: 7000,
    });

    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  private async handleConversationMessage(msg: any) {
    if (!this.auth.isLogged() || this.auth.isAdmin()) return;

    const myId = Number(this.auth.user?.id);
    const convId = Number(msg?.conversation_id);
    const senderId = Number(msg?.sender_id);

    if (!Number.isFinite(convId) || !Number.isFinite(senderId)) return;
    if (Number.isFinite(myId) && senderId === myId) return;
    if (this.isOnConversation(convId)) return;

    const preview = this.snippet(msg?.content ?? '');

    const cachedConv = this.convCache.get(convId);
    let convDisplay = cachedConv ?? { name: 'Sala' };
    if (!cachedConv) {
      try {
        convDisplay = await Promise.race([
          this.getConversationDisplay(convId),
          new Promise<CachedConversation>((resolve) => setTimeout(() => resolve({ name: 'Sala' }), 650)),
        ]);
      } catch {
        convDisplay = { name: 'Sala' };
      }
    }

    let senderName = String(msg?.sender_name || '').trim();
    if (!senderName) {
      try {
        const senderDisplay = await Promise.race([
          this.getUserDisplay(senderId),
          new Promise<CachedUser>((resolve) => setTimeout(() => resolve({ name: 'Alguém' }), 650)),
        ]);
        senderName = String(senderDisplay?.name || 'Alguém');
      } catch {
        senderName = 'Alguém';
      }
    }

    const groupName = String(convDisplay?.name || 'Sala').trim() || 'Sala';
    const senderLabel = String(senderName || 'Alguém').trim() || 'Alguém';
    const when = this.formatWhen(msg?.created_at || msg?.createdAt || msg?.created);
    const text = preview ? `${senderLabel}: ${preview}` : `${senderLabel} enviou uma mensagem.`;
    const messageText = when ? `${text} • ${when}` : text;

    await this.presentToast({
      header: groupName,
      message: messageText,
      icon: 'chatbubbles-outline',
      onOpen: () => this.router.navigate(['/conversations', convId]),
      openText: 'Abrir chat de grupo',
      dismissText: 'Remover notificação',
      duration: 7000,
    });

    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  private async handleConversationMemberAdded(payload: any) {
    if (!this.auth.isLogged() || this.auth.isAdmin()) return;

    const convId = Number(payload?.conversationId ?? payload?.conversation_id);
    if (!Number.isFinite(convId)) return;
    if (this.isOnConversation(convId)) return;

    const addedByUserId = Number(payload?.addedByUserId ?? payload?.byUserId ?? payload?.by);

    const cachedConv = this.convCache.get(convId);
    let convDisplay = cachedConv ?? { name: 'Sala' };
    if (!cachedConv) {
      try {
        convDisplay = await Promise.race([
          this.getConversationDisplay(convId),
          new Promise<CachedConversation>((resolve) => setTimeout(() => resolve({ name: 'Sala' }), 650)),
        ]);
      } catch {
        convDisplay = { name: 'Sala' };
      }
    }

    let inviterName = '';
    if (Number.isFinite(addedByUserId)) {
      try {
        const inviter = await Promise.race([
          this.getUserDisplay(addedByUserId),
          new Promise<CachedUser>((resolve) => setTimeout(() => resolve({ name: '' }), 650)),
        ]);
        inviterName = String(inviter?.name || '').trim();
      } catch {
        inviterName = '';
      }
    }

    const groupName = String(convDisplay?.name || 'Sala').trim() || 'Sala';
    const text = inviterName ? `${inviterName} adicionou você à sala.` : 'Você foi adicionado(a) a uma sala.';

    await this.presentToast({
      header: groupName,
      message: text,
      icon: 'person-add-outline',
      cssClass: 'webloc-toast--group',
      onOpen: () => this.router.navigate(['/conversations', convId]),
      openText: 'Abrir sala',
      dismissText: 'Remover notificação',
      duration: 8000,
    });

    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  private async presentToast(opts: {
    header: string;
    message: string;
    icon?: string;
    onOpen: () => void;
    openText?: string;
    dismissText?: string;
    duration?: number;
    cssClass?: string | string[];
  }) {
    const toast = await this.toastCtrl.create({
      header: opts.header,
      message: opts.message,
      icon: opts.icon || undefined,
      duration: Number.isFinite(opts.duration) ? Number(opts.duration) : 4500,
      position: 'top',
      cssClass: opts.cssClass,
      buttons: [
        {
          text: opts.openText || 'Abrir',
          handler: () => {
            try {
              opts.onOpen();
            } catch {}
          },
        },
        {
          role: 'cancel',
          text: opts.dismissText || 'Remover',
        },
      ],
    });

    await toast.present();
  }
}
