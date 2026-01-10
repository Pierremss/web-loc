import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ConversationsService } from '../../services/conversations.service';
import { SocketService } from '../../services/socket.service';
import { NotificationsBadgeSyncService } from '../../services/notifications-badge-sync.service';
import { AuthService } from '../../modules/auth/auth.service';
import { FriendsService } from '../../services/friends.service';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-conversation-chat',
  templateUrl: './conversation-chat.page.html',
  styleUrls: ['./conversation-chat.page.scss'],
  standalone: false
})
export class ConversationChatPage implements OnInit, OnDestroy {
  convId!: number;
  messages: any[] = [];
  displayMessages: any[] = [];
  content = '';
  typingUsers = new Set<number>();
  atBottom = true;
  newMessages = 0;
  detailsOpen = false;
  membersManagerOpen = false;
  newMemberEmail = '';
  newMemberNickname = '';
  friends: FriendSummary[] = [];
  friendsLoading = false;
  friendSearch = '';
  addingFriend: Record<number, boolean> = {};
  private friendsLoaded = false;
  conversation?: ConversationDetail | null;
  members: ConversationMember[] = [];
  private memberIndex = new Map<number, ConversationMember>();
  private seenMessageIds = new Set<number>();
  private lastMarkedReadId = 0;
  get hasMessages(): boolean {
    return this.messages.length > 0;
  }
  private readonly timeFormatter = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  private readonly shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  private readonly weekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
  });
  private handlers: { [k: string]: (...args: any[]) => void } = {};

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly convSvc = inject(ConversationsService);
  private readonly socketSvc = inject(SocketService);
  private readonly badgeSync = inject(NotificationsBadgeSyncService);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly alertCtrl = inject(AlertController);
  private readonly friendsService = inject(FriendsService);
  readonly auth = inject(AuthService);
  private readonly mediaBase = environment.socketUrl.replace(/\/$/, '');

  ngOnInit() {
    this.convId = Number(this.route.snapshot.paramMap.get('id'));
    this.prefillConversationFromState();
    this.loadConversationMeta();
    this.load();
    const socket = this.socketSvc.connect(this.auth.token!);
    socket.emit('conv:join', { conversationId: this.convId });
    this.handlers['new'] = (msg: any) => {
      if (msg.conversation_id === this.convId) {
        const decorated = this.decorateMessage({ ...msg });
        const messageId = Number(decorated?.id ?? msg.id);
        const isDuplicate = Number.isFinite(messageId) && this.seenMessageIds.has(messageId);
        this.insertOrUpdateMessage(decorated);
        this.refreshDisplayMessages();
        if (!isDuplicate) {
          if (Number.isFinite(messageId)) {
            this.markRead(messageId as number);
          }
          if (!this.atBottom) {
            this.newMessages++;
          } else {
            this.scrollToBottom();
          }
        }
      }
    };
    this.handlers['typing'] = ({ userId, typing }: any) => {
      if (typing) this.typingUsers.add(userId); else this.typingUsers.delete(userId);
    };
    this.handlers['read'] = ({ conversationId, userId, last_read_message_id }: any) => {
      if (Number(conversationId) !== this.convId) return;
      this.applyReadReceipt(Number(userId), Number(last_read_message_id));
    };
    this.handlers['deleted'] = ({ id, conversationId }: any) => {
      if (Number(conversationId) !== this.convId) return;
      const msgId = Number(id);
      if (!Number.isFinite(msgId)) return;
      const target = this.messages.find((m: any) => Number(m?.id) === msgId);
      if (!target) return;
      target.deleted_at = new Date();
      target.content = '';
      this.decorateMessage(target);
      this.refreshDisplayMessages();
    };
    this.handlers['hidden'] = ({ id, conversationId }: any) => {
      if (Number(conversationId) !== this.convId) return;
      const msgId = Number(id);
      if (!Number.isFinite(msgId)) return;
      const before = this.messages.length;
      this.messages = (this.messages || []).filter((m: any) => Number(m?.id) !== msgId);
      if (this.messages.length !== before) {
        this.refreshDisplayMessages();
      }
    };
    socket.on('conv:message:new', this.handlers['new']);
    socket.on('conv:typing', this.handlers['typing']);
    socket.on('conv:read', this.handlers['read']);
    socket.on('conv:message:deleted', this.handlers['deleted']);
    socket.on('conv:message:hidden', this.handlers['hidden']);
  }

  ngOnDestroy() {
    const socket = this.socketSvc.get();
    if (socket) {
      socket.emit('conv:leave', { conversationId: this.convId });
      socket.off('conv:message:new', this.handlers['new']);
      socket.off('conv:typing', this.handlers['typing']);
      socket.off('conv:read', this.handlers['read']);
      socket.off('conv:message:deleted', this.handlers['deleted']);
      socket.off('conv:message:hidden', this.handlers['hidden']);
    }
  }

  async confirmDeleteMessage(message: any) {
    const msgId = Number(message?.id);
    if (!Number.isFinite(msgId)) return;
    if (message?.deleted_at) return;

    const me = Number(this.auth.user?.id);
    if (!Number.isFinite(me) || Number(message?.sender_id) !== me) {
      return;
    }

    const dialog = await this.alertCtrl.create({
      header: 'Apagar mensagem',
      message: 'Deseja apagar esta mensagem? Ela ficará como “Mensagem excluída”.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Apagar',
          role: 'destructive',
          handler: () => {
            this.convSvc.deleteMessage(this.convId, msgId).subscribe({
              next: () => {
                message.deleted_at = new Date();
                message.content = '';
                this.decorateMessage(message);
                this.refreshDisplayMessages();
              },
              error: (err) => window.alert(err?.error?.error || 'Não foi possível apagar a mensagem')
            });
          }
        }
      ]
    });
    await dialog.present();
  }

  async openMessageOptions(message: any) {
    if (!message || message?.deleted_at) return;
    const msgId = Number(message?.id);
    if (!Number.isFinite(msgId)) return;

    const me = Number(this.auth.user?.id);
    const senderId = Number(message?.sender_id);
    const isMine = Number.isFinite(me) && Number.isFinite(senderId) && me === senderId;

    const buttons: any[] = [];

    // Disponível para qualquer mensagem: esconder apenas para mim
    buttons.push({
      text: 'Apagar para mim',
      icon: 'eye-off-outline',
      role: 'destructive',
      handler: () => {
        this.convSvc.hideMessage(this.convId, msgId).subscribe({
          next: () => {
            this.messages = (this.messages || []).filter((m: any) => Number(m?.id) !== msgId);
            this.refreshDisplayMessages();
          },
          error: (err) => window.alert(err?.error?.error || 'Não foi possível apagar a mensagem')
        });
      },
    });

    // Apenas para mensagens do próprio usuário: apagar para todos
    if (isMine) {
      buttons.push({
        text: 'Apagar para todos',
        icon: 'trash-outline',
        role: 'destructive',
        handler: () => this.confirmDeleteMessage(message),
      });
    }
    buttons.push({ text: 'Cancelar', role: 'cancel', icon: 'close' });

    const sheet = await this.actionSheetCtrl.create({
      header: 'Opções da mensagem',
      buttons,
      cssClass: 'chat-action-sheet',
      mode: 'ios',
    });
    await sheet.present();
  }

  load() {
    this.convSvc.getMessages(this.convId).subscribe((list) => {
      this.seenMessageIds.clear();
      this.messages = [];
      list.forEach((m: any) => {
        const decorated = this.decorateMessage(m);
        this.insertOrUpdateMessage(decorated);
      });
      this.refreshDisplayMessages();
      this.markLatestMessageAsRead();
      setTimeout(() => this.scrollToBottom(true), 0);
    });
  }

  private loadConversationMeta() {
    this.convSvc.get(this.convId).subscribe({
      next: (conv) => {
        this.conversation = conv;
        const members = Array.isArray(conv?.members) ? conv.members : [];
        this.setMembers(members);
      },
      error: (err) => {
        console.warn('[conversation] Falha ao carregar metadados', err?.error || err);
      }
    });
  }

  get isConversationOwner(): boolean {
    const me = Number(this.auth.user?.id);
    const ownerId = Number(this.conversation?.owner_id);
    return Number.isFinite(me) && Number.isFinite(ownerId) && me === ownerId;
  }

  get canManageConversation(): boolean {
    if (this.isConversationOwner) return true;
    const me = Number(this.auth.user?.id);
    const myMember = this.members.find((m) => Number(m.user_id) === me);
    const role = String(myMember?.role || '').toLowerCase();
    return role === 'admin' || role === 'owner';
  }

  get displayLastActivity(): string {
    const last = this.messages.length ? this.messages[this.messages.length - 1] : null;
    const date: Date | null = last?.__sentDate || (last?.created_at ? new Date(last.created_at) : null);
    if (!date || Number.isNaN(date.getTime())) return 'Sem registro';
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return `Hoje, ${this.timeFormatter.format(date)}`;
    }
    return `${this.shortDateFormatter.format(date)}`;
  }

  async openConversationActions() {
    const buttons: any[] = [
      {
        text: 'Ver dados da sala',
        icon: 'information-circle-outline',
        handler: () => (this.detailsOpen = true)
      },
      {
        text: 'Sair do grupo',
        icon: 'log-out-outline',
        role: 'destructive',
        handler: () => this.confirmLeaveConversation()
      }
    ];

    if (this.canManageConversation) {
      buttons.push(
        {
          text: 'Editar nome',
          icon: 'create-outline',
          handler: () => this.promptEditName()
        },
        {
          text: 'Editar descrição',
          icon: 'document-text-outline',
          handler: () => this.promptEditDescription()
        },
        {
          text: 'Alterar foto',
          icon: 'image-outline',
          handler: () => this.triggerAvatarPicker()
        },
        {
          text: 'Gerenciar integrantes',
          icon: 'people-outline',
          handler: () => this.openMembersManager()
        }
      );
    }

    buttons.push({ text: 'Cancelar', icon: 'close', role: 'cancel' });

    const sheet = await this.actionSheetCtrl.create({
      header: this.roomName,
      buttons,
      cssClass: 'chat-action-sheet'
    });
    await sheet.present();
  }

  private async confirmLeaveConversation() {
    const dialog = await this.alertCtrl.create({
      header: 'Sair do grupo',
      message: 'Você realmente quer sair deste grupo?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Sair',
          role: 'destructive',
          handler: () => {
            this.convSvc.leave(this.convId).subscribe({
              next: () => this.router.navigate(['/conversations']),
              error: (err) => window.alert(err?.error?.error || 'Não foi possível sair do grupo')
            });
          }
        }
      ]
    });
    await dialog.present();
  }

  private async promptEditName() {
    const dialog = await this.alertCtrl.create({
      header: 'Editar nome da sala',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Nome da sala',
          value: this.conversation?.name || ''
        }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Salvar',
          handler: (data) => {
            const name = String(data?.name ?? '').trim();
            if (!name.length) return false;
            this.convSvc.update(this.convId, { name }).subscribe({
              next: (updated) => {
                this.conversation = { ...(this.conversation || ({} as any)), ...updated };
              },
                error: (err) => window.alert(err?.error?.error || 'Não foi possível atualizar o nome')
            });
            return true;
          }
        }
      ]
    });
      await dialog.present();
  }

  private async promptEditDescription() {
      const dialog = await this.alertCtrl.create({
      header: 'Editar descrição',
      inputs: [
        {
          name: 'description',
          type: 'textarea',
          placeholder: 'Descreva a sala (opcional)',
          value: this.conversation?.description || ''
        }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Salvar',
          handler: (data) => {
            const description = String(data?.description ?? '').trim();
            this.convSvc.update(this.convId, { description }).subscribe({
              next: (updated) => {
                this.conversation = { ...(this.conversation || ({} as any)), ...updated };
              },
                error: (err) => window.alert(err?.error?.error || 'Não foi possível atualizar a descrição')
            });
            return true;
          }
        }
      ]
    });
      await dialog.present();
  }

  private triggerAvatarPicker() {
    const el = document.querySelector<HTMLInputElement>('input[type="file"][data-conv-avatar]');
    el?.click();
  }

  onConversationAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    this.convSvc.uploadAvatar(this.convId, file).subscribe({
      next: (result) => {
        this.conversation = { ...(this.conversation || ({} as any)), avatar_url: result.avatar_url };
        input.value = '';
      },
      error: (err) => {
        input.value = '';
        window.alert(err?.error?.error || 'Não foi possível atualizar a imagem da sala');
      }
    });
  }

  openMembersManager() {
    this.membersManagerOpen = true;
    this.loadFriends();
  }

  closeMembersManager() {
    this.membersManagerOpen = false;
  }

  onFriendSearch(event: Event) {
    const detail = (event as CustomEvent<{ value?: string }>).detail;
    this.friendSearch = (detail?.value || '').trim();
  }

  filteredFriendsForAdd(): FriendSummary[] {
    const term = this.friendSearch.toLowerCase();
    return (this.friends || []).filter((friend) => {
      if (friend.relation && friend.relation !== 'friend') return false;
      if (!term) return true;
      return [friend.nickname, friend.name, friend.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }

  displayFriendName(friend: FriendSummary): string {
    return String(friend?.nickname || friend?.name || friend?.email || '').trim() || 'Amigo';
  }

  isFriendAlreadyMember(friendId: number): boolean {
    const id = Number(friendId);
    return Number.isFinite(id) && this.memberIndex.has(id);
  }

  addFriendToConversation(friend: FriendSummary) {
    const friendId = Number(friend?.id);
    const email = String(friend?.email || '').trim();
    if (!Number.isFinite(friendId) || !email) return;
    if (this.isFriendAlreadyMember(friendId)) return;
    if (this.addingFriend[friendId]) return;

    this.addingFriend[friendId] = true;
    this.convSvc.addMember(this.convId, email).subscribe({
      next: (member) => {
        this.addingFriend[friendId] = false;
        this.upsertMember(member);
      },
      error: (err) => {
        this.addingFriend[friendId] = false;
        window.alert(err?.error?.error || 'Não foi possível adicionar o jogador');
      }
    });
  }

  private loadFriends() {
    if (this.friendsLoaded || this.friendsLoading) return;
    this.friendsLoading = true;
    this.friendsService.list().subscribe({
      next: (friends) => {
        this.friends = (friends || []).map((f: any) => ({
          id: Number(f?.id),
          name: f?.name ?? null,
          nickname: f?.nickname ?? null,
          email: String(f?.email || '').trim(),
          relation: f?.relation || 'friend'
        })).filter((f: FriendSummary) => Number.isFinite(f.id) && !!f.email);
        this.friendsLoaded = true;
        this.friendsLoading = false;
      },
      error: (err) => {
        this.friendsLoading = false;
        console.warn('[conversation] Falha ao carregar amigos', err?.error || err?.message);
      }
    });
  }

  private upsertMember(member: ConversationMember) {
    const enriched = { ...(member as any) } as ConversationMember;
    const current = this.members ? [...this.members] : [];
    const uid = Number(enriched?.user_id);
    const idx = current.findIndex((m) => Number(m.user_id) === uid);
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...enriched };
    } else {
      current.push(enriched);
    }
    this.setMembers(current);
  }

  submitNewMember() {
    const email = this.newMemberEmail.trim();
    if (!email) {
      window.alert('Informe o e-mail do jogador.');
      return;
    }
    this.convSvc.addMember(this.convId, email).subscribe({
      next: (member) => {
        const enriched = { ...member } as ConversationMember;
        if (!enriched.nickname && this.newMemberNickname.trim()) enriched.nickname = this.newMemberNickname.trim();
        this.upsertMember(enriched);
        this.newMemberEmail = '';
        this.newMemberNickname = '';
      },
      error: (err) => window.alert(err?.error?.error || 'Não foi possível adicionar o jogador')
    });
  }

  async confirmRemoveMember(member: ConversationMember) {
    const memberId = Number(member?.user_id);
    const me = Number(this.auth.user?.id);
    if (!Number.isFinite(memberId)) return;
    if (memberId === me) {
      return window.alert('Você não pode se remover por aqui. Use “Sair da sala”.');
    }
    if (Number(this.conversation?.owner_id) === memberId) {
      return window.alert('Não é possível remover o dono da sala.');
    }

    const label = member.nickname || member.name || member.email || `ID ${memberId}`;
    const confirmAlert = await this.alertCtrl.create({
      header: 'Remover jogador',
      message: `Remover <strong>${String(label)}</strong> da sala?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover',
          role: 'destructive',
          handler: () => {
            this.convSvc.removeMember(this.convId, memberId).subscribe({
              next: () => {
                const current = this.members || [];
                this.setMembers(current.filter((m) => Number(m.user_id) !== memberId));
              },
              error: (err) => window.alert(err?.error?.error || 'Não foi possível remover o jogador')
            });
          }
        }
      ]
    });
    await confirmAlert.present();
  }

  private decorateMessage(message: any) {
    if (!message || typeof message !== 'object') return message;

    const rawTimestamp =
      message.sent_at ??
      message.sentAt ??
      message.created_at ??
      message.createdAt ??
      message.updated_at ??
      message.updatedAt ??
      null;

    if (rawTimestamp) {
      const date = rawTimestamp instanceof Date ? rawTimestamp : new Date(rawTimestamp);
      if (!Number.isNaN(date.getTime())) {
        message.__sentDate = date;
        message.__displayTime = this.timeFormatter.format(date);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (date.toDateString() !== today.toDateString()) {
          message.__displayDate = this.shortDateFormatter.format(date);
        } else {
          message.__displayDate = '';
        }
        message.__displayDateLabel = this.getDateLabel(date, today, yesterday);
      } else {
        delete message.__sentDate;
        delete message.__displayTime;
        delete message.__displayDate;
        delete message.__displayDateLabel;
      }
    } else {
      delete message.__sentDate;
      delete message.__displayTime;
      delete message.__displayDate;
      delete message.__displayDateLabel;
    }

    return this.applyReadMetadata(this.applySenderMetadata(message));
  }

  isRoomMessage(content: string) {
    if (!content) return false;
    try {
      const parsed = JSON.parse(content);
      return parsed && parsed.type === 'room';
    } catch {
      return false;
    }
  }

  parseRoom(content: string) {
    try { const parsed = JSON.parse(content); return parsed; } catch { return null; }
  }

  send() {
    const text = this.content.trim();
    if (!text) return;
    // HTTP fallback; realtime também suportado
    this.convSvc.sendMessage(this.convId, text).subscribe((msg) => {
      const decorated = this.decorateMessage(msg);
      const messageId = Number(decorated?.id ?? msg?.id);
      const isDuplicate = Number.isFinite(messageId) && this.seenMessageIds.has(messageId);
      this.insertOrUpdateMessage(decorated);
      this.refreshDisplayMessages();
      this.content = '';
      if (!isDuplicate && Number.isFinite(messageId)) {
        this.markRead(messageId as number);
      }
      if (!isDuplicate) {
        if (!this.atBottom) {
          this.newMessages++;
        } else {
          setTimeout(() => this.scrollToBottom(), 0);
        }
      }
    });
  }

  triggerMessageImagePicker() {
    const el = document.querySelector<HTMLInputElement>('input[type="file"][data-conv-message-image]');
    el?.click();
  }

  onMessageImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    this.convSvc.sendImage(this.convId, file).subscribe({
      next: (msg) => {
        const decorated = this.decorateMessage(msg);
        const messageId = Number(decorated?.id ?? msg?.id);
        const isDuplicate = Number.isFinite(messageId) && this.seenMessageIds.has(messageId);
        this.insertOrUpdateMessage(decorated);
        this.refreshDisplayMessages();
        input.value = '';
        if (!isDuplicate && Number.isFinite(messageId)) {
          this.markRead(messageId as number);
        }
        if (!isDuplicate) {
          if (!this.atBottom) {
            this.newMessages++;
          } else {
            setTimeout(() => this.scrollToBottom(), 0);
          }
        }
      },
      error: (err) => {
        input.value = '';
        window.alert(err?.error?.error || 'Não foi possível enviar a imagem');
      }
    });
  }

  hasText(message: any): boolean {
    const value = typeof message?.content === 'string' ? message.content.trim() : '';
    return value.length > 0;
  }

  imageAttachments(message: any): any[] {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    return attachments.filter((a: any) => /^image\//i.test(String(a?.mime_type || '')) && !!a?.url);
  }

  normalizeMediaUrl(url?: string | null): string {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    const normalized = url.startsWith('/') ? url : `/${url}`;
    return `${this.mediaBase}${normalized}`;
  }

  onTyping() {
    this.socketSvc.get()?.emit('conv:typing', { conversationId: this.convId, typing: true });
  }

  markRead(lastId: number) {
    if (!Number.isFinite(lastId)) return;
    const currentUserId = Number(this.auth.user?.id);
    if (lastId > this.lastMarkedReadId) {
      this.lastMarkedReadId = lastId;
      this.convSvc.markRead(this.convId, lastId).subscribe({
        next: () => {
          // Emite evento para atualizar listas/badges em tempo real.
          this.socketSvc.get()?.emit('conv:read', { conversationId: this.convId, last_read_message_id: lastId });
          this.badgeSync.requestRefresh();
        },
        error: () => {}
      });
    }
    if (Number.isFinite(currentUserId)) {
      this.applyReadReceipt(currentUserId, lastId);
    }
  }

  private markLatestMessageAsRead() {
    const lastId = this.findLatestMessageId();
    if (lastId !== null) {
      this.markRead(lastId);
    }
  }

  private findLatestMessageId(): number | null {
    if (!this.messages.length) return null;
    const sorted = [...this.messages].sort((a, b) => {
      const aTime = a.__sentDate instanceof Date ? a.__sentDate.getTime() : 0;
      const bTime = b.__sentDate instanceof Date ? b.__sentDate.getTime() : 0;
      return aTime - bTime;
    });
    const last = sorted[sorted.length - 1];
    const lastId = Number(last?.id ?? last?.message_id);
    return Number.isFinite(lastId) ? lastId : null;
  }

  scrollToBottom(force = false) {
    requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>('.conversation-chat .messages');
      if (!container) return;
      const behavior: ScrollBehavior = force ? 'auto' : 'smooth';
      container.scrollTo({ top: container.scrollHeight, behavior });
    });
  }

  onScroll(ev: any) {
    const el = (ev?.target as HTMLElement) || ev?.target?.el;
    if (!(el instanceof HTMLElement)) return;
    const threshold = 120; // px
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.atBottom = distance < threshold;
    if (this.atBottom) this.newMessages = 0;
  }
    private setMembers(members: ConversationMember[]) {
      this.members = members;
      this.memberIndex.clear();
      for (const member of members) {
        if (member && Number.isFinite(Number(member.user_id))) {
          this.memberIndex.set(Number(member.user_id), member);
        }
      }
      this.messages = this.messages.map((msg) => this.applyReadMetadata(this.applySenderMetadata(msg)));
      this.refreshDisplayMessages();
    }

    private prefillConversationFromState() {
      const navState = this.router.getCurrentNavigation()?.extras?.state ?? history.state;
      const room = navState?.room;
      if (!room || typeof room !== 'object') return;
      if (!this.conversation) {
        this.conversation = room as ConversationDetail;
      } else {
        this.conversation = { ...room, ...this.conversation } as ConversationDetail;
      }
      if (Array.isArray(room.members) && room.members.length) {
        this.setMembers(room.members as ConversationMember[]);
      }
    }

    private insertOrUpdateMessage(message: any) {
      if (!message) return;
      const messageId = Number(message?.id ?? message?.message_id);
      if (Number.isFinite(messageId)) {
        const idx = this.messages.findIndex((m) => m?.id === messageId);
        if (idx >= 0) {
          this.messages[idx] = message;
        } else {
          this.messages.push(message);
        }
        this.seenMessageIds.add(messageId);
      } else {
        this.messages.push(message);
      }
    }

    private applySenderMetadata(message: any) {
      if (!message || typeof message !== 'object') return message;
      const senderId = Number(
        message.sender_id ??
        message.senderId ??
        message.user_id ??
        message.userId ??
        NaN
      );
      const existingAvatar = message.sender_avatar || message.sender_avatar_url || message.avatar_url || null;
      if (Number.isFinite(senderId)) {
        message.sender_id = senderId;
        const member = this.memberIndex.get(senderId);
        if (member) {
          if (!message.sender_name) {
            message.sender_name = member.nickname || member.name || member.email || message.sender_name;
          }
          if (!existingAvatar && member.avatar_url) {
            message.sender_avatar = member.avatar_url;
          }
        }
      }
      if (!message.sender_avatar && existingAvatar) {
        message.sender_avatar = existingAvatar;
      }
      if (!message.sender_name && Number.isFinite(senderId)) {
        message.sender_name = `Jogador #${senderId}`;
      }
      return message;
    }

    private applyReadMetadata(message: any) {
      if (!message || typeof message !== 'object') return message;
      const senderId = Number(message.sender_id);
      const collection = Array.isArray(message.read_by) ? message.read_by : [];
      const normalized = collection
        .map((entry: any) => this.normalizeReadEntry(entry))
        .filter((entry: ReadReceipt | null): entry is ReadReceipt => !!entry && entry.user_id !== senderId);
      message.read_by = normalized;
      return message;
    }

    private normalizeReadEntry(entry: any): ReadReceipt | null {
      if (!entry) return null;
      const userId = Number(entry.user_id ?? entry.id ?? entry.userId);
      if (!Number.isFinite(userId)) return null;
      const member = this.memberIndex.get(userId);
      const name = this.resolveReaderName(userId, entry.name || entry.display_name || entry.nickname || null);
      const avatar = entry.avatar_url || entry.avatar || member?.avatar_url || null;
      return { user_id: userId, name, avatar_url: avatar };
    }

    private applyReadReceipt(userId: number, lastId: number) {
      if (!Number.isFinite(userId) || !Number.isFinite(lastId)) return;
      let changed = false;
      for (const msg of this.messages) {
        const msgId = Number(msg?.id ?? msg?.message_id);
        if (!Number.isFinite(msgId) || msgId > lastId) continue;
        if (Number(msg.sender_id) === userId) continue;
        const receipts = this.ensureReceiptCollection(msg);
        const exists = receipts.some((entry: ReadReceipt) => entry.user_id === userId);
        if (exists) continue;
        const member = this.memberIndex.get(userId);
        receipts.push({
          user_id: userId,
          name: this.resolveReaderName(userId, member?.nickname || member?.name || member?.email || null),
          avatar_url: member?.avatar_url || null,
        });
        changed = true;
      }
      if (changed) {
        this.refreshDisplayMessages();
      }
    }

    receiptsFor(message: any): ReadReceipt[] {
      if (!message || typeof message !== 'object') return [];
      return this.ensureReceiptCollection(message);
    }

    receiptLabel(reader: ReadReceipt | null | undefined): string {
      if (!reader) return 'Jogador';
      const cleaned = typeof reader.name === 'string' ? reader.name.trim() : '';
      if (cleaned.length) return cleaned;
      return this.resolveReaderName(reader.user_id, null);
    }

    private ensureReceiptCollection(message: any): ReadReceipt[] {
      if (!Array.isArray(message.read_by)) {
        message.read_by = [] as ReadReceipt[];
      }
      return message.read_by as ReadReceipt[];
    }

    private resolveReaderName(userId: number, preferred: string | null | undefined): string {
      const cleaned = typeof preferred === 'string' ? preferred.trim() : '';
      if (cleaned.length) return cleaned;
      const member = this.memberIndex.get(userId);
      const memberName = member?.nickname || member?.name || member?.email || '';
      if (memberName) {
        return String(memberName);
      }
      return `Jogador #${userId}`;
    }

    private refreshDisplayMessages() {
      if (!this.messages.length) {
        this.displayMessages = [];
        return;
      }
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const sorted = [...this.messages].sort((a, b) => {
        const aTime = a.__sentDate instanceof Date ? a.__sentDate.getTime() : 0;
        const bTime = b.__sentDate instanceof Date ? b.__sentDate.getTime() : 0;
        return aTime - bTime;
      });
      const output: any[] = [];
      let lastLabel = '';
      for (const msg of sorted) {
        const date: Date | null = msg.__sentDate instanceof Date ? msg.__sentDate : null;
        const label = date ? (msg.__displayDateLabel || this.getDateLabel(date, today, yesterday)) : '';
        if (label && label !== lastLabel) {
          const markerId = date ? `marker-${date.getTime()}` : `marker-${label}-${output.length}`;
          output.push({ __isMarker: true, __label: label, __id: markerId });
          lastLabel = label;
        }
        output.push(msg);
      }
      this.displayMessages = output;
    }

    private getDateLabel(date: Date, today: Date, yesterday: Date) {
      if (date.toDateString() === today.toDateString()) return 'Hoje';
      if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
      const diffDays = Math.floor((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
      const weekday = this.weekdayFormatter.format(date);
      const normalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      if (diffDays <= 6) {
        return normalizedWeekday;
      }
      return `${normalizedWeekday}, ${this.shortDateFormatter.format(date)}`;
    }

    senderLabel(msg: any): string {
      if (!msg) return 'Participante';
      const senderId = Number(msg.sender_id);
      const baseName = msg.sender_name || (Number.isFinite(senderId) ? `Jogador #${senderId}` : 'Participante');
      const isMine = senderId === this.auth.user?.id;
      if (!isMine) return baseName;
      const selfName = this.auth.user?.nickname || this.auth.user?.name || baseName;
      return `${selfName}${selfName.includes('(Você)') ? '' : ' (Você)'}`.trim();
    }


  get participantSummary(): string {
    if (!this.members.length) {
      return 'Convidando jogadores...';
    }
    const names = this.members
      .map((member) => member.nickname || member.name || member.email)
      .filter((name): name is string => !!name);
    if (!names.length) {
      return `${this.members.length} participante(s)`;
    }
    if (names.length <= 3) {
      return names.join(', ');
    }
    return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
  }

  normalizeConversationAvatar(url?: string | null) {
    if (!url) return 'assets/icon/favicon.png';
    if (/^https?:\/\//i.test(url)) return url;
    const normalized = url.startsWith('/') ? url : `/${url}`;
    return `${this.mediaBase}${normalized}`;
  }

  onAvatarError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img) img.src = 'assets/icon/favicon.png';
  }

  get roomName(): string {
    return this.conversation?.name || `Sala #${this.convId}`;
  }

  get roomStatus(): string {
    if (this.typingUsers.size) {
      return `${this.typingUsers.size} digitando…`;
    }
    if (this.conversation?.description) {
      return this.conversation.description;
    }
    if (this.members.length) {
      return `${this.members.length} participantes conectados`;
    }
    return 'Convidando jogadores...';
  }

  initialsFromName(source?: string | number | null) {
    if (source == null) return '??';
    const value = String(source).trim();
    if (!value.length) return '??';
    const clean = value.replace(/[^A-Za-zÀ-ÿ0-9 ]+/g, ' ').trim();
    if (!clean.length) return '??';
      const parts = clean.split(/\s+/).filter((p) => p.trim().length);
    const first = parts[0]?.trim().charAt(0) ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1].trim().charAt(0) : (parts[0]?.trim().charAt(1) ?? '');
    const initials = `${first}${last}`.replace(/\s+/g, '').toUpperCase();
    return initials || value.substring(0, 2).toUpperCase();
  }
}

interface ConversationMember {
  user_id: number;
  role: string;
  name?: string | null;
  nickname?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface ConversationDetail {
  id: number;
  name?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  owner_id?: number | null;
  owner_name?: string | null;
  is_public?: boolean | number | null;
  members?: ConversationMember[];
}

interface ReadReceipt {
  user_id: number;
  name: string;
  avatar_url: string | null;
  __avatarError?: boolean;
}

interface FriendSummary {
  id: number;
  name?: string | null;
  nickname?: string | null;
  email: string;
  relation?: 'friend' | 'blocked' | string;
}
