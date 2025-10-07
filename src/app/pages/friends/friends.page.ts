import { Component, OnInit } from '@angular/core';
import { FriendsService } from '../../services/friends.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../modules/auth/auth.service';
import { UsersService, UserSummary } from '../../services/users.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-friends',
  templateUrl: './friends.page.html',
  styleUrls: ['./friends.page.scss'],
  standalone: false,
})
export class FriendsPage implements OnInit {
  friends: any[] = [];
  requests: any[] = [];
  q = '';
  results: UserSummary[] = [];
  loading = false; // loading da busca
  pageLoading = true; // skeleton inicial da página

  constructor(
    private friendsSvc: FriendsService,
    private socketSvc: SocketService,
    private auth: AuthService,
    private users: UsersService
  ) {}

  ngOnInit() {
  this.reload();
  setTimeout(() => { this.pageLoading = false; }, 300);
    const token = this.auth.token!;
    const socket = this.socketSvc.connect(token);
    socket.on('friend:request', () => this.loadRequests());
    socket.on('friend:accepted', () => this.reload());
    socket.on('friend:declined', () => this.loadRequests());
  }

  reload() {
    this.loadFriends();
    this.loadRequests();
  }

  loadFriends() { this.friendsSvc.list().subscribe(r => this.friends = r); }
  loadRequests() { this.friendsSvc.requests().subscribe(r => this.requests = r); }

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
    this.friendsSvc.remove(friendId).subscribe(() => this.loadFriends());
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
