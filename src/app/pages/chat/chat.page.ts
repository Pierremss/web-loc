import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MessagesService } from '../../services/messages.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../modules/auth/auth.service';
import { UsersService } from '../../services/users.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
  standalone: false,
})
export class ChatPage implements OnInit, OnDestroy {
  otherId!: number;
  messages: any[] = [];
  content = '';
  isTyping = false;
  private typingTimer: any;
  private typingUiTimer: any;
  peerName = 'Amigo';
  peerAvatar = 'assets/icon/favicon.png';
  atBottom = true;
  newMessages = 0;

  private handlerNew: any;
  private handlerTyping: any;
  private handlerEdited: any;
  private handlerDeleted: any;
  private handlerDelivered: any;
  private handlerRead: any;

  private readonly route = inject(ActivatedRoute);
  private readonly msgSvc = inject(MessagesService);
  private readonly socketSvc = inject(SocketService);
  readonly auth = inject(AuthService);
  private readonly users = inject(UsersService);

  ngOnInit() {
    this.otherId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadPeer();
    this.load();
    const socket = this.socketSvc.connect(this.auth.token!);
    this.handlerNew = (msg: any) => {
      if (msg.sender_id === this.otherId || msg.receiver_id === this.otherId) {
        this.messages.push(msg);
        // confirma entrega
        socket.emit('message:delivered', { messageId: msg.id });
        // marca leitura imediata se chat estiver focado
        socket.emit('message:read', { messageId: msg.id });
        if (!this.atBottom) {
          this.newMessages++;
        } else {
          setTimeout(() => this.scrollToBottom(), 0);
        }
      }
    };
    this.handlerTyping = ({ fromUserId, typing }: any) => {
      if (fromUserId === this.otherId) {
        this.isTyping = !!typing;
        if (typing) {
          clearTimeout(this.typingUiTimer);
          this.typingUiTimer = setTimeout(() => this.isTyping = false, 2000);
        }
      }
    };
    this.handlerEdited = (msg: any) => {
      const i = this.messages.findIndex(m => m.id === msg.id);
      if (i >= 0) this.messages[i] = { ...this.messages[i], ...msg };
    };
    this.handlerDeleted = ({ id }: any) => {
      const i = this.messages.findIndex(m => m.id === id);
      if (i >= 0) this.messages[i].deleted_at = new Date();
    };
    this.handlerDelivered = ({ messageId }: any) => {
      const i = this.messages.findIndex(m => m.id === messageId);
      if (i >= 0) this.messages[i].delivered_at = new Date();
    };
    this.handlerRead = ({ messageId }: any) => {
      const i = this.messages.findIndex(m => m.id === messageId);
      if (i >= 0) this.messages[i].read_at = new Date();
    };
    socket.on('message:new', this.handlerNew);
    socket.on('message:typing', this.handlerTyping);
    socket.on('message:edited', this.handlerEdited);
    socket.on('message:deleted', this.handlerDeleted);
    socket.on('message:delivered', this.handlerDelivered);
    socket.on('message:read', this.handlerRead);
  }

  ngOnDestroy() {
    const socket = this.socketSvc.get();
    socket?.off('message:new', this.handlerNew);
    socket?.off('message:typing', this.handlerTyping);
    socket?.off('message:edited', this.handlerEdited);
    socket?.off('message:deleted', this.handlerDeleted);
    socket?.off('message:delivered', this.handlerDelivered);
    socket?.off('message:read', this.handlerRead);
  }

  load() {
    this.msgSvc.getConversation(this.otherId).subscribe(list => {
      this.messages = list;
      if (this.messages.length) {
        const last = this.messages[this.messages.length - 1];
        this.msgSvc.markRead(last.id).subscribe();
      }
      setTimeout(() => this.scrollToBottom(true), 0);
    });
  }

  send() {
    const text = this.content.trim();
    if (!text) return;
    this.msgSvc.send(this.otherId, text).subscribe((msg: any) => {
      this.messages.push(msg);
      this.content = '';
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      setTimeout(() => this.scrollToBottom(), 0);
    });
  }

  onTyping() {
    const s = this.socketSvc.get();
    s?.emit('message:typing', { toUserId: this.otherId, typing: true });
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => s?.emit('message:typing', { toUserId: this.otherId, typing: false }), 1500);
  }

  onTypingEnd() {
    const s = this.socketSvc.get();
    s?.emit('message:typing', { toUserId: this.otherId, typing: false });
  }

  edit(m: any) {
    const content = prompt('Editar mensagem', m.content);
    if (content == null) return;
    this.msgSvc.edit(m.id, content).subscribe({
      next: (updated: any) => Object.assign(m, updated),
      error: (e) => alert('Não foi possível editar: ' + (e?.error?.error || e.message))
    });
  }

  remove(m: any) {
    if (!confirm('Excluir mensagem?')) return;
    this.msgSvc.remove(m.id).subscribe({
      next: () => m.deleted_at = new Date(),
      error: (e) => alert('Não foi possível excluir: ' + (e?.error?.error || e.message))
    });
  }

  loadPeer() {
    // Usa perfil público (não exige ser o próprio usuário)
    this.users.getPublicProfile(this.otherId).subscribe({
      next: (u: any) => {
        if (!u) return;
        this.peerName = u.nickname || u.name || this.peerName;
        if (u.avatar_url) this.peerAvatar = this.normalizeAvatar(u.avatar_url);
      },
      error: () => {
        // fallback silencioso
      }
    });
  }

  private normalizeAvatar(url: string) {
    if (!url) return this.peerAvatar;
    if (/^https?:/i.test(url)) return url;
    return `${environment.socketUrl}${url}`;
  }

  onAvatarError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (!img) return;
    // evita loop infinito
    if (img.dataset['fallbackApplied']) return;
    img.dataset['fallbackApplied'] = '1';
    img.src = 'assets/icon/favicon.png';
  }

  onScroll(ev: any) {
    const el = (ev?.target as HTMLElement) || ev?.target?.el;
    if (!(el instanceof HTMLElement)) return;
    const threshold = 120; // px
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.atBottom = distance < threshold;
    if (this.atBottom) this.newMessages = 0;
  }

  scrollToBottom(force = false) {
    const container = document.querySelector<HTMLElement>('.messages');
    if (!container) return;
    const behavior: ScrollBehavior = force ? 'auto' : 'smooth';
    container.scrollTo({ top: container.scrollHeight, behavior });
  }

  async openReactions(ev: Event, m: any) {
    // Placeholder: simples prompt; pode ser substituído por popover customizado
    const emoji = prompt('Reagir com emoji (ex: 👍, ❤️, 😂)');
    if (!emoji) return;
    await this.msgSvc.react(m.id, emoji).subscribe();
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }
}
