import { Component } from '@angular/core';
import { AuthService } from './modules/auth/auth.service';
import { FriendsService } from './services/friends.service';
import { ConversationsService } from './services/conversations.service';
import { SocketService } from './services/socket.service';
import { Router, NavigationEnd } from '@angular/router';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  appPages = [
    { title: 'Home', url: '/home', icon: 'home-outline', show: () => true },
    { title: 'Amigos', url: '/friends', icon: 'people-outline', show: () => this.auth.isLogged() },
    { title: 'Descobrir (Swipe)', url: '/swipe', icon: 'sparkles-outline', show: () => this.auth.isLogged() },
    { title: 'Salas', url: '/conversations', icon: 'chatbubbles-outline', show: () => this.auth.isLogged() },
    { title: 'Meu Perfil', url: '/jogador-perfil', icon: 'person-outline', show: () => this.auth.isLogged() && !this.auth.isAdmin() },
    { title: 'Gerenciar Jogos', url: '/games', icon: 'game-controller-outline', show: () => this.auth.isAdmin() },
    { title: 'Usuários', url: '/users', icon: 'people-outline', show: () => this.auth.isAdmin() },
  ];

  pendingRequests = 0;
  showMenu = true;
  unreadRooms = 0;

  constructor(
    public auth: AuthService,
    private friends: FriendsService,
    private sockets: SocketService,
    private convs: ConversationsService,
    private router: Router,
  ) {
    this.refreshPending();
    this.refreshUnreadRooms();
    // Atualiza em tempo real via socket, se logado
    if (this.auth.token) {
      const s = this.sockets.connect(this.auth.token);
      s.on('friend:request', () => this.refreshPending());
      s.on('friend:accepted', () => this.refreshPending());
      s.on('friend:declined', () => this.refreshPending());
      s.on('conv:message:new', () => this.refreshUnreadRooms());
      s.on('conv:read', () => this.refreshUnreadRooms());
    }

    // Controlar visibilidade do menu: esconder em /login e /register
    const update = (url: string) => {
      const path = url.split('?')[0];
      this.showMenu = !(path.startsWith('/login') || path.startsWith('/register'));
    };
    update(this.router.url || '');
    this.router.events.subscribe(evt => {
      if (evt instanceof NavigationEnd) {
        update(evt.urlAfterRedirects || evt.url);
      }
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

  refreshPending() {
    if (!this.auth.isLogged()) { this.pendingRequests = 0; return; }
    this.friends.requests().subscribe({
      next: (list) => this.pendingRequests = list?.length || 0,
      error: () => this.pendingRequests = 0,
    });
  }

  refreshUnreadRooms() {
    if (!this.auth.isLogged()) { this.unreadRooms = 0; return; }
    this.convs.list().subscribe({
      next: (rooms) => {
        this.unreadRooms = (rooms || []).reduce((sum: number, r: any) => sum + (r.unread_count ? 1 : 0), 0);
      },
      error: () => { this.unreadRooms = 0; }
    });
  }
}
