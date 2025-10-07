import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ConversationsService } from '../../services/conversations.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../modules/auth/auth.service';

@Component({
  selector: 'app-conversation-chat',
  templateUrl: './conversation-chat.page.html',
  styleUrls: ['./conversation-chat.page.scss'],
  standalone: false
})
export class ConversationChatPage implements OnInit, OnDestroy {
  convId!: number;
  messages: any[] = [];
  content = '';
  typingUsers = new Set<number>();
  private handlers: { [k: string]: (...args: any[]) => void } = {};

  private readonly route = inject(ActivatedRoute);
  private readonly convSvc = inject(ConversationsService);
  private readonly socketSvc = inject(SocketService);
  readonly auth = inject(AuthService);

  ngOnInit() {
    this.convId = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
    const socket = this.socketSvc.connect(this.auth.token!);
    socket.emit('conv:join', { conversationId: this.convId });
    this.handlers['new'] = (msg: any) => {
      if (msg.conversation_id === this.convId) {
        this.messages.push(msg);
        this.markRead(msg.id);
      }
    };
    this.handlers['typing'] = ({ userId, typing }: any) => {
      if (typing) this.typingUsers.add(userId); else this.typingUsers.delete(userId);
    };
    socket.on('conv:message:new', this.handlers['new']);
    socket.on('conv:typing', this.handlers['typing']);
  }

  ngOnDestroy() {
    const socket = this.socketSvc.get();
    if (socket) {
      socket.emit('conv:leave', { conversationId: this.convId });
      socket.off('conv:message:new', this.handlers['new']);
      socket.off('conv:typing', this.handlers['typing']);
    }
  }

  load() {
    this.convSvc.getMessages(this.convId).subscribe((list) => (this.messages = list));
  }

  send() {
    const text = this.content.trim();
    if (!text) return;
    // HTTP fallback; realtime também suportado
    this.convSvc.sendMessage(this.convId, text).subscribe((msg) => {
      this.messages.push(msg);
      this.content = '';
      this.markRead(msg.id);
    });
  }

  onTyping() {
    this.socketSvc.get()?.emit('conv:typing', { conversationId: this.convId, typing: true });
  }

  markRead(lastId: number) {
    this.convSvc.markRead(this.convId, lastId).subscribe();
  }
}
