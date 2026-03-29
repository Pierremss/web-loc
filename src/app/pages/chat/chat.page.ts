import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessagesService } from '../../services/messages.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../modules/auth/auth.service';
import { UsersService } from '../../services/users.service';
import { NotificationsBadgeSyncService } from '../../services/notifications-badge-sync.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { environment } from '../../../environments/environment';
import { ActionSheetController, ActionSheetButton, AlertController, ModalController } from '@ionic/angular';
import { ReportUserModalComponent } from './report-user.modal';

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
  blocked = false;
  blockedByMe = false;
  blockedMe = false;
  private typingTimer: any;
  private typingUiTimer: any;
  peerName = 'Amigo';
  peerAvatar = 'assets/icon/favicon.png';
  atBottom = true;
  newMessages = 0;
  replyingTo: any | null = null;
  messageMap: Record<number, any> = {};
  private swipeTracker: { pointerId: number; startX: number; startY: number; message: any; triggered: boolean; lastOffset: number } | null = null;
  private readonly swipeTriggerThreshold = 64;
  private readonly swipeMaxOffset = 120;
  private readonly swipeVerticalTolerance = 80;

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
  private handlerNew: any;
  private handlerTyping: any;
  private handlerEdited: any;
  private handlerDeleted: any;
  private handlerHidden: any;
  private handlerDelivered: any;
  private handlerRead: any;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly msgSvc = inject(MessagesService);
  private readonly socketSvc = inject(SocketService);
  readonly auth = inject(AuthService);
  private readonly users = inject(UsersService);
  private readonly badgeSync = inject(NotificationsBadgeSyncService);
  private readonly actionSheet = inject(ActionSheetController);
  private readonly alertCtrl = inject(AlertController);
  private readonly modalCtrl = inject(ModalController);

  ngOnInit() {
    this.otherId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadBlockStatus();
    this.loadPeer();
    this.load();
    const socket = this.socketSvc.connect(this.auth.token!);
    this.handlerNew = (msg: any) => {
      if (msg.sender_id === this.otherId || msg.receiver_id === this.otherId) {
        const decorated = this.decorateMessage(msg);
        this.registerMessage(decorated);
        this.linkReplyPreview(decorated);
        this.messages.push(decorated);
        this.injectDateMarkers();
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
      if (i >= 0) {
        this.messages[i] = this.decorateMessage({ ...this.messages[i], ...msg });
        this.registerMessage(this.messages[i]);
        this.linkReplyPreview(this.messages[i]);
        if (this.replyingTo?.id === this.messages[i].id) {
          this.replyingTo = this.messages[i];
        }
        this.refreshReplyDependents(msg.id);
        this.injectDateMarkers();
      }
    };
    this.handlerDeleted = ({ id }: any) => {
      const i = this.messages.findIndex(m => m.id === id);
      if (i >= 0) {
        this.messages[i].deleted_at = new Date();
        this.decorateMessage(this.messages[i]);
        this.registerMessage(this.messages[i]);
        this.linkReplyPreview(this.messages[i]);
        if (this.replyingTo?.id === id) {
          this.clearReply();
        }
        this.refreshReplyDependents(id);
        this.injectDateMarkers();
      }
    };

    this.handlerHidden = ({ id }: any) => {
      const msgId = Number(id);
      if (!Number.isFinite(msgId)) return;
      const before = this.messages.length;
      this.messages = (this.messages || []).filter((m: any) => m.__isMarker || Number(m?.id) !== msgId);
      if (this.messages.length !== before) {
        if (this.replyingTo?.id === msgId) {
          this.replyingTo = null;
        }
        delete this.messageMap[msgId];
        this.injectDateMarkers();
      }
    };
    this.handlerDelivered = ({ messageId }: any) => {
      const i = this.messages.findIndex(m => m.id === messageId);
      if (i >= 0) {
        this.messages[i].delivered_at = new Date();
        this.decorateMessage(this.messages[i]);
        this.registerMessage(this.messages[i]);
        this.linkReplyPreview(this.messages[i]);
        this.injectDateMarkers();
      }
    };
    this.handlerRead = ({ messageId }: any) => {
      const i = this.messages.findIndex(m => m.id === messageId);
      if (i >= 0) {
        this.messages[i].read_at = new Date();
        this.decorateMessage(this.messages[i]);
        this.registerMessage(this.messages[i]);
        this.linkReplyPreview(this.messages[i]);
        this.injectDateMarkers();
      }
    };
    socket.on('message:new', this.handlerNew);
    socket.on('message:typing', this.handlerTyping);
    socket.on('message:edited', this.handlerEdited);
    socket.on('message:deleted', this.handlerDeleted);
    socket.on('message:hidden', this.handlerHidden);
    socket.on('message:delivered', this.handlerDelivered);
    socket.on('message:read', this.handlerRead);
  }

  ngOnDestroy() {
    const socket = this.socketSvc.get();
    socket?.off('message:new', this.handlerNew);
    socket?.off('message:typing', this.handlerTyping);
    socket?.off('message:edited', this.handlerEdited);
    socket?.off('message:deleted', this.handlerDeleted);
    socket?.off('message:hidden', this.handlerHidden);
    socket?.off('message:delivered', this.handlerDelivered);
    socket?.off('message:read', this.handlerRead);
  }

  load() {
    this.msgSvc.getConversation(this.otherId).subscribe({
      next: (list) => {
        this.messageMap = {};
        this.messages = list.map(m => {
          const decorated = this.decorateMessage(m);
          this.registerMessage(decorated);
          this.linkReplyPreview(decorated);
          return decorated;
        });
        this.injectDateMarkers();
        this.replyingTo = null;

        const meId = Number(this.auth.user?.id);
        const hasUnreadIncoming = this.messages.some(m =>
          !m?.__isMarker &&
          Number(m?.sender_id) === Number(this.otherId) &&
          Number(m?.receiver_id) === meId &&
          !m?.read_at
        );

        if (hasUnreadIncoming && Number.isFinite(meId)) {
          this.msgSvc.markConversationRead(this.otherId).subscribe({
            next: () => {
              // Atualiza menu/notificações após marcar tudo como lido.
              this.badgeSync.requestRefresh();
            },
            error: () => {}
          });
        }
        setTimeout(() => this.scrollToBottom(true), 0);
      },
      error: () => {}
    });
  }

  send() {
    const text = this.content.trim();
    if (!text || this.blocked) return;
    const replyToId = this.replyingTo?.id != null ? Number(this.replyingTo.id) : undefined;
    this.msgSvc.send(this.otherId, text, replyToId).subscribe({
      next: (msg: any) => {
        const decorated = this.decorateMessage(msg);
        this.registerMessage(decorated);
        this.linkReplyPreview(decorated);
        this.messages.push(decorated);
        this.injectDateMarkers();
        this.content = '';
        this.replyingTo = null;
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
        setTimeout(() => this.scrollToBottom(), 0);
      },
      error: (err) => {
        const blocked = err?.status === 403 && (err?.error?.error === 'blocked');
        if (blocked) {
          this.blocked = true;
          this.blockedByMe = false;
          this.blockedMe = true;
          this.presentBlockingMessage('Envio de mensagens indisponível',
            'Este jogador bloqueou o contato. Por isso, não é possível enviar mensagens neste chat.');
        } else {
          this.presentBlockingMessage('Falha ao enviar', 'Não foi possível enviar a mensagem agora. Tente novamente em instantes.');
        }
      }
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
      next: (updated: any) => {
        Object.assign(m, updated);
        this.decorateMessage(m);
        this.injectDateMarkers();
      },
      error: (e) => alert('Não foi possível editar: ' + (e?.error?.error || e.message))
    });
  }

  remove(m: any) {
    this.msgSvc.remove(m.id).subscribe({
      next: () => {
        m.deleted_at = new Date();
        this.decorateMessage(m);
        this.injectDateMarkers();
      },
      error: (e) => alert('Não foi possível excluir: ' + (e?.error?.error || e.message))
    });
  }

  async confirmRemove(m: any) {
    const id = Number(m?.id);
    if (!Number.isFinite(id)) return;
    if (m?.deleted_at) return;
    const isMine = Number(m?.sender_id) === Number(this.auth.user?.id);
    if (!isMine) return;

    const dialog = await this.alertCtrl.create({
      header: 'Apagar mensagem',
      message: 'Deseja apagar esta mensagem? Ela ficará como “Mensagem excluída”.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Apagar',
          role: 'destructive',
          handler: () => this.remove(m),
        },
      ],
    });
    await dialog.present();
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

  startReply(message: any) {
    if (!message || message.deleted_at) {
      return;
    }
    this.replyingTo = message;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  clearReply() {
    this.replyingTo = null;
  }

  async openChatActions() {
    const buttons: ActionSheetButton[] = this.blocked
      ? (
        this.blockedByMe
          ? [
              {
                text: 'Desbloquear usuário',
                icon: 'lock-open-outline',
                handler: () => this.unblockPeer(),
              },
              {
                text: 'Denunciar jogador',
                icon: 'flag-outline',
                handler: () => this.reportPeer(),
              },
              {
                text: 'Ver perfil',
                icon: 'person-circle-outline',
                handler: () => this.viewProfile(),
              },
              {
                text: 'Cancelar',
                role: 'cancel',
                icon: 'close',
              }
            ]
          : [
              {
                text: 'Bloquear de volta',
                role: 'destructive',
                icon: 'ban',
                handler: () => this.blockPeer(),
              },
              {
                text: 'Denunciar jogador',
                icon: 'flag-outline',
                handler: () => this.reportPeer(),
              },
              {
                text: 'Ver perfil',
                icon: 'person-circle-outline',
                handler: () => this.viewProfile(),
              },
              {
                text: 'Cancelar',
                role: 'cancel',
                icon: 'close',
              }
            ]
      ) : [
        {
          text: 'Bloquear usuário',
          role: 'destructive',
          icon: 'ban',
          handler: () => this.blockPeer(),
        },
        {
          text: 'Denunciar jogador',
          icon: 'flag-outline',
          handler: () => this.reportPeer(),
        },
        {
          text: 'Ver perfil',
          icon: 'person-circle-outline',
          handler: () => this.viewProfile(),
        },
        {
          text: 'Limpar mensagens',
          icon: 'trash-outline',
          handler: () => this.clearMessages(),
        },
        {
          text: 'Cancelar',
          role: 'cancel',
          icon: 'close',
        }
      ];

    const sheet = await this.actionSheet.create({
      header: this.peerName || 'Opções',
      buttons,
      cssClass: 'chat-action-sheet'
    });
    await sheet.present();
  }

  private async reportPeer() {
    const modal = await this.modalCtrl.create({
      component: ReportUserModalComponent,
      componentProps: {
        reportedUserId: this.otherId,
        reportedUserName: this.peerName || null,
      },
      backdropDismiss: false,
    });

    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role !== 'done' || !data?.ok) return;

    // Recomendação pós-denúncia: sugerir bloquear
    const confirm = await this.alertCtrl.create({
      header: 'Denúncia enviada',
      message: 'Para sua segurança, recomendamos bloquear este jogador para evitar novos contatos.',
      buttons: [
        { text: 'Agora não', role: 'cancel', cssClass: 'report-sent-cancel' },
        {
          text: 'Bloquear jogador',
          role: 'destructive',
          cssClass: 'report-sent-block',
          handler: () => this.blockPeer(),
        }
      ],
      cssClass: 'report-sent-alert',
      mode: 'ios'
    });
    await confirm.present();
  }

  private blockPeer() {
    this.msgSvc.block(this.otherId).subscribe({
      next: () => {
        this.blocked = true;
        this.blockedByMe = true;
        this.blockedMe = false;
        this.presentBlockingMessage(
          'Jogador bloqueado',
          'Você bloqueou este jogador. Para sua segurança, o envio de mensagens foi desativado. Você pode desbloquear a qualquer momento.'
        );
        this.router.navigate(['/home']);
      },
      error: () => this.presentBlockingMessage('Não foi possível bloquear', 'Tente novamente em instantes.')
    });
  }

  private unblockPeer() {
    this.msgSvc.unblock(this.otherId).subscribe({
      next: () => {
        this.blocked = false;
        this.blockedByMe = false;
        this.blockedMe = false;
        this.presentBlockingMessage('Jogador desbloqueado', 'Pronto! Você já pode voltar a conversar normalmente.');
        this.load();
      },
      error: () => this.presentBlockingMessage('Não foi possível desbloquear', 'Tente novamente em instantes.')
    });
  }

  private loadBlockStatus() {
    this.msgSvc.getBlockStatus(this.otherId).subscribe({
      next: (s) => {
        this.blocked = s.blockedByMe || s.blockedMe;
        this.blockedByMe = s.blockedByMe;
        this.blockedMe = s.blockedMe;
      },
      error: () => {}
    });
  }

  private async presentBlockingMessage(header: string, message: string) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  private viewProfile() {
    this.router.navigate(['/user-profile', this.otherId]);
  }

  private clearMessages() {
    this.msgSvc.clearConversation(this.otherId).subscribe({
      next: () => {
        this.messages = [];
        this.messageMap = {};
        this.replyingTo = null;
        this.newMessages = 0;
        this.injectDateMarkers();
        this.load();
      },
      error: () => alert('Não foi possível limpar as mensagens agora.')
    });
  }

  onBubblePointerDown(ev: PointerEvent, message: any) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) {
      return;
    }
    if ((ev.target as HTMLElement)?.closest('.bubble-menu')) {
      return;
    }
    this.swipeTracker = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      message,
      triggered: false,
      lastOffset: 0,
    };
    this.prepareSwipeVisual(message);
  }

  onBubblePointerMove(ev: PointerEvent) {
    if (!this.swipeTracker || this.swipeTracker.pointerId !== ev.pointerId) {
      return;
    }
    const dx = ev.clientX - this.swipeTracker.startX;
    const dy = ev.clientY - this.swipeTracker.startY;
    const offset = dx > 0 ? Math.min(dx, this.swipeMaxOffset) : 0;
    this.applySwipeOffset(this.swipeTracker.message, offset);
    this.swipeTracker.lastOffset = offset;
    const verticalDistance = Math.abs(dy);
    if (!this.swipeTracker.triggered && offset >= this.swipeTriggerThreshold && verticalDistance < this.swipeVerticalTolerance) {
      this.swipeTracker.triggered = true;
      this.startReply(this.swipeTracker.message);
    }
  }

  onBubblePointerEnd(ev: PointerEvent) {
    if (this.swipeTracker && this.swipeTracker.pointerId === ev.pointerId) {
      this.finalizeSwipeVisual(this.swipeTracker.message, this.swipeTracker.lastOffset > 0);
      this.swipeTracker = null;
    }
  }

  onBubblePointerCancel(ev?: PointerEvent) {
    if (!this.swipeTracker) {
      return;
    }
    if (!ev || this.swipeTracker.pointerId === ev.pointerId) {
      this.finalizeSwipeVisual(this.swipeTracker.message, this.swipeTracker.lastOffset > 0);
      this.swipeTracker = null;
    }
  }

  private prepareSwipeVisual(message: any) {
    if (!message) {
      return;
    }
    this.clearSwipeVisualState(message);
    message.__swipeActive = true;
  }

  private applySwipeOffset(message: any, offset: number) {
    if (!message) {
      return;
    }
    const clamped = Math.max(0, Math.min(offset, this.swipeMaxOffset));
    const eased = clamped <= this.swipeTriggerThreshold
      ? clamped
      : this.swipeTriggerThreshold + (clamped - this.swipeTriggerThreshold) * 0.35;
    message.__swipeOffset = eased;
  }

  private finalizeSwipeVisual(message: any, animate: boolean) {
    if (!message) {
      return;
    }
    if (!animate) {
      this.clearSwipeVisualState(message);
      return;
    }
    if (message.__swipeReleaseTimer) {
      clearTimeout(message.__swipeReleaseTimer);
    }
    message.__swipeActive = false;
    message.__swipeReleasing = true;
    message.__swipeOffset = 0;
    message.__swipeReleaseTimer = setTimeout(() => {
      message.__swipeReleasing = false;
      message.__swipeReleaseTimer = undefined;
    }, 180);
  }

  private clearSwipeVisualState(message: any) {
    if (!message) {
      return;
    }
    if (message.__swipeReleaseTimer) {
      clearTimeout(message.__swipeReleaseTimer);
      message.__swipeReleaseTimer = undefined;
    }
    message.__swipeOffset = 0;
    message.__swipeActive = false;
    message.__swipeReleasing = false;
  }

  getSwipeTransform(message: any) {
    if (!message) {
      return null;
    }
    const offset = Number(message.__swipeOffset) || 0;
    return offset ? `translateX(${offset}px)` : null;
  }

  isSwipeActive(message: any) {
    return !!message?.__swipeActive;
  }

  isSwipeReleasing(message: any) {
    return !!message?.__swipeReleasing;
  }

  private registerMessage(message: any) {
    if (!message || message.id == null) {
      return;
    }
    const key = Number(message.id);
    this.messageMap[key] = message;
  }

  private linkReplyPreview(message: any) {
    if (!message) return;
    const replyId = message.reply_to_id ?? message.replyToId ?? null;
    if (replyId == null) {
      delete message.__replyTarget;
      return;
    }
    const key = Number(replyId);
    const target = this.messageMap[key] ?? this.messages.find(m => !m.__isMarker && Number(m.id) === key);
    if (target) {
      message.__replyTarget = target;
    } else {
      delete message.__replyTarget;
    }
  }

  private refreshReplyDependents(targetId: number) {
    const key = Number(targetId);
    for (const msg of this.messages) {
      if (msg.__isMarker) continue;
      const replyId = msg.reply_to_id ?? msg.replyToId ?? null;
      if (replyId != null && Number(replyId) === key) {
        this.linkReplyPreview(msg);
      }
    }
  }

  async openMessageOptions(message: any) {
    const isMine = Number(message.sender_id) === Number(this.auth.user?.id);
    const buttons: ActionSheetButton[] = [
      {
        text: 'Responder',
        icon: 'return-up-forward-outline',
        handler: () => this.startReply(message),
      },
      {
        text: 'Reagir',
        icon: 'happy-outline',
        handler: () => this.openReactions(message),
      },
    ];

    buttons.push({
      text: 'Apagar para mim',
      icon: 'eye-off-outline',
      role: 'destructive',
      handler: () => {
        const msgId = Number(message?.id);
        if (!Number.isFinite(msgId)) return;
        this.msgSvc.hide(msgId).subscribe({
          next: () => this.handlerHidden?.({ id: msgId }),
          error: (e) => alert('Não foi possível apagar: ' + (e?.error?.error || e.message))
        });
      },
    });

    if (isMine) {
      buttons.push(
        {
          text: 'Editar',
          icon: 'create-outline',
          handler: () => this.edit(message),
        },
        {
          text: 'Apagar para todos',
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => this.confirmRemove(message),
        },
      );
    }

    buttons.push({ text: 'Cancelar', role: 'cancel', icon: 'close' });

    const sheet = await this.actionSheet.create({
      header: 'Opções da mensagem',
      buttons,
      mode: 'ios',
      cssClass: 'chat-action-sheet',
    });

    await sheet.present();
  }

  private decorateMessage(message: any) {
    if (!message || typeof message !== 'object') {
      return message;
    }

    const rawTimestamp =
      message.sent_at ??
      message.sentAt ??
      message.created_at ??
      message.createdAt ??
      message.updated_at ??
      message.updatedAt ??
      message.__sentDate ??
      null;

    let displayTime = '--:--';
    let displayDate = '';
    if (rawTimestamp) {
      const date = rawTimestamp instanceof Date ? rawTimestamp : new Date(rawTimestamp);
      if (!Number.isNaN(date.getTime())) {
        displayTime = this.timeFormatter.format(date);
        message.__sentDate = date;
        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (!isToday) {
          if (date.toDateString() === yesterday.toDateString()) {
            displayDate = 'Ontem';
          } else {
            displayDate = this.shortDateFormatter.format(date);
          }
        }
        message.__displayDateLabel = this.dateLabel(date, today, yesterday);
      } else {
        delete message.__sentDate;
        delete message.__displayDateLabel;
      }
    } else {
      delete message.__sentDate;
      delete message.__displayDateLabel;
    }
    message.__displayTime = displayTime;
    message.__displayDate = displayDate;
    return message;
  }

  private dateLabel(date: Date, today: Date, yesterday: Date) {
    if (date.toDateString() === today.toDateString()) return 'Hoje';
    if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
    const diffInDays = Math.floor((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
    const weekday = this.weekdayFormatter.format(date);
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    if (diffInDays <= 6) {
      return capitalizedWeekday;
    }
    return `${capitalizedWeekday}, ${this.shortDateFormatter.format(date)}`;
  }

  private injectDateMarkers() {
    const markers: any[] = [];
    let lastLabel = '';
    for (const msg of this.messages.filter(m => !m.__isMarker).sort((a, b) => {
      const aDate = a.__sentDate ? a.__sentDate.getTime() : 0;
      const bDate = b.__sentDate ? b.__sentDate.getTime() : 0;
      return aDate - bDate;
    })) {
      if (!msg.__sentDate) {
        markers.push(msg);
        continue;
      }
      const label = msg.__displayDateLabel || this.shortDateFormatter.format(msg.__sentDate);
      if (label !== lastLabel) {
        markers.push({ __isMarker: true, __label: label, __timestamp: msg.__sentDate.getTime() });
        lastLabel = label;
      }
      markers.push(msg);
    }
    if (!markers.length) {
      this.messages = [];
      return;
    }
    this.messages = markers;
  }

  openReactions(message: any) {
    // Placeholder: simples prompt; substituir por popover customizado futuramente
    const emoji = prompt('Reagir com emoji (ex: 👍, ❤️, 😂)');
    if (!emoji) return;
    this.msgSvc.react(message.id, emoji).subscribe({
      next: () => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}),
      error: () => {},
    });
  }
}
