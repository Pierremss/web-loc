import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ConversationsService } from '../../services/conversations.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../modules/auth/auth.service';

@Component({
  selector: 'app-conversations-list',
  templateUrl: './conversations-list.page.html',
  styleUrls: ['./conversations-list.page.scss'],
  standalone: false
})
export class ConversationsListPage implements OnInit {
  rooms: any[] = [];
  name = '';
  is_public = true;
  typing: Partial<Record<number, Set<number>>> = {};
  private typingHandler = ({ userId, typing, conversationId }: any) => {
    if (!conversationId) return;
    const set = this.typing[conversationId] ?? (this.typing[conversationId] = new Set<number>());
    if (typing) {
      set.add(userId);
    } else {
      set.delete(userId);
    }
  };

  private readonly convSvc = inject(ConversationsService);
  private readonly router = inject(Router);
  private readonly sockets = inject(SocketService);
  readonly auth = inject(AuthService);

  ngOnInit() {
    this.load();
    const s = this.sockets.connect(this.auth.token!);
    s.on('conv:typing', this.typingHandler);
  }

  load() {
    this.convSvc.list().subscribe((list) => (this.rooms = list));
  }

  create() {
    const title = this.name.trim();
    if (!title) return;
    this.convSvc.create({ name: title, is_public: this.is_public }).subscribe((room) => {
      this.name = '';
      this.router.navigate(['/conversations', room.id]);
    });
  }

  open(room: any) {
    this.router.navigate(['/conversations', room.id]);
  }
}
