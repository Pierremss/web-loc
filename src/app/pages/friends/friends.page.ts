import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FriendsService } from '../../services/friends.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../modules/auth/auth.service';
import { UsersService, UserSummary } from '../../services/users.service';
import { environment } from '../../../environments/environment';
import { MessagesService } from '../../services/messages.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-friends',
  templateUrl: './friends.page.html',
  styleUrls: ['./friends.page.scss'],
  standalone: false,
})
export class FriendsPage implements OnInit, OnDestroy {
  friends: any[] = [];
  requests: any[] = [];
  q = '';
  results: UserSummary[] = [];
  loading = false; // loading da busca
  pageLoading = true; // skeleton inicial da página

  private reloadTimer: any;

  private readonly friendsSvc = inject(FriendsService);
  private readonly socketSvc = inject(SocketService);
  readonly auth = inject(AuthService);
  private readonly users = inject(UsersService);
  private readonly messages = inject(MessagesService);
  private dmNewHandler: any;
  private dmReadHandler: any;

  ngOnInit() {
  this.reload();
  setTimeout(() => { this.pageLoading = false; }, 300);
    const token = this.auth.token!;
    const socket = this.socketSvc.connect(token);
    socket.on('friend:request', () => this.loadRequests());
    socket.on('friend:accepted', () => this.reload());
    socket.on('friend:declined', () => this.loadRequests());

    this.dmNewHandler = (msg: any) => {
      const me = Number(this.auth.user?.id);
      const receiverId = Number(msg?.receiver_id);
      const senderId = Number(msg?.sender_id);
      if (!Number.isFinite(me) || receiverId !== me) return;
      if (!Number.isFinite(senderId)) return;
      const i = (this.friends || []).findIndex(f => Number(f?.id) === senderId);
      if (i < 0) return;
      const current = this.friends[i];
      const next = { ...current, unread_count: (Number(current?.unread_count) || 0) + 1 };
      this.friends = [
        ...this.friends.slice(0, i),
        next,
        ...this.friends.slice(i + 1)
      ];
    };
    socket.on('message:new', this.dmNewHandler);

    // Quando mensagens são marcadas como lidas (inclusive pelo próprio usuário),
    // recarrega a lista para refletir unread_count correto em tempo real.
    this.dmReadHandler = () => this.scheduleReloadFriends();
    socket.on('message:read', this.dmReadHandler);
  }

  ngOnDestroy() {
    const socket = this.socketSvc.get();
    if (socket && this.dmNewHandler) {
      socket.off('message:new', this.dmNewHandler);
    }
    if (socket && this.dmReadHandler) {
      socket.off('message:read', this.dmReadHandler);
    }
    this.dmNewHandler = null;
    this.dmReadHandler = null;

    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  ionViewWillEnter() {
    this.reload();
  }

  private scheduleReloadFriends() {
    // Debounce para evitar múltiplos hits no endpoint em sequência.
    if (this.reloadTimer) return;
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      this.loadFriends();
    }, 250);
  }

  reload() {
    this.loadFriends();
    this.loadRequests();
  }

  get activeFriends() {
    return (this.friends || []).filter(f => (f?.relation ?? 'friend') !== 'blocked');
  }

  get blockedFriends() {
    return (this.friends || []).filter(f => (f?.relation ?? 'friend') === 'blocked');
  }

  loadFriends() {
    this.friendsSvc.list().subscribe(r => {
      const list = Array.isArray(r) ? r : [];
      // Mantém organização: amigos primeiro, bloqueados por último.
      this.friends = [...list].sort((a, b) => {
        const ar = (a?.relation ?? 'friend') as string;
        const br = (b?.relation ?? 'friend') as string;
        if (ar !== br) return ar === 'blocked' ? 1 : -1;
        const an = String(a?.name ?? a?.nickname ?? '').toLocaleLowerCase('pt-BR');
        const bn = String(b?.name ?? b?.nickname ?? '').toLocaleLowerCase('pt-BR');
        return an.localeCompare(bn, 'pt-BR');
      });
    });
  }
  loadRequests() { this.friendsSvc.requests().subscribe(r => this.requests = r); }

  trackById(_: number, item: any) {
    return item?.id ?? _;
  }

  onSearch() {
    const query = this.q.trim();
    if (query.length < 2) { this.results = []; return; }
    this.loading = true;
    this.users.search(query).subscribe({
      next: (res) => { this.results = res.items; },
      error: () => {},
    }).add(() => this.loading = false);
  }

  sendRequestTo(userId: number) {
    this.friendsSvc.sendRequest(userId).subscribe(() => {
      this.results = this.results.filter(u => u.id !== userId);
    });
  }

  accept(fromUserId: number) {
    this.friendsSvc.accept(fromUserId).subscribe(() => this.reload());
  }

  decline(fromUserId: number) {
    this.friendsSvc.decline(fromUserId).subscribe(() => this.loadRequests());
  }

  remove(friendId: number) {
    forkJoin({
      unblock: this.messages.unblock(friendId, { restoreFriendship: false }).pipe(catchError(() => of(null))),
      remove: this.friendsSvc.remove(friendId).pipe(catchError(() => of(null))),
    }).subscribe(() => this.loadFriends());
  }

  unblock(userId: number) {
    this.messages.unblock(userId).subscribe({
      next: () => this.loadFriends(),
      error: () => alert('Não foi possível remover agora.')
    });
  }

  normalizeAvatar(url?: string | null) {
    if (!url) return 'assets/icon/favicon.png';
    if (/^https?:/i.test(url)) return url;
    return `${environment.socketUrl}${url}`;
  }

  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement | null;
    if (!img) return;
    if ((img as any).dataset && (img as any).dataset.fallbackApplied) return;
    try { (img as any).dataset.fallbackApplied = '1'; } catch {}
    img.src = 'assets/icon/favicon.png';
  }
}
