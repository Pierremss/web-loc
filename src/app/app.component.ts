import { Component, inject } from '@angular/core';
import { AuthService } from './modules/auth/auth.service';
import { ThemeService } from './services/theme.service';
import { FriendsService } from './services/friends.service';
import { ConversationsService } from './services/conversations.service';
import { SocketService } from './services/socket.service';
import { MessageNotificationsService } from './services/message-notifications.service';
import { NotificationsBadgeSyncService } from './services/notifications-badge-sync.service';
import { Router, NavigationEnd } from '@angular/router';
import { MenuController } from '@ionic/angular';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  appPages: Array<{ title: string; url?: string; icon: string; show: () => boolean; action?: () => void }> = [
    { title: 'Home', url: '/home', icon: 'home-outline', show: () => true },
    // Itens visíveis apenas para jogadores (não para administradores)
    { title: 'Descobrir Perfis', url: '/swipe', icon: 'sparkles-outline', show: () => this.auth.isLogged() && !this.auth.isAdmin() },
    { title: 'Meu Perfil', url: '/jogador-perfil', icon: 'person-outline', show: () => this.auth.isLogged() && !this.auth.isAdmin() },
    { title: 'Amigos', url: '/friends', icon: 'people-outline', show: () => this.auth.isLogged() && !this.auth.isAdmin() },
    { title: 'Salas', url: '/conversations', icon: 'chatbubbles-outline', show: () => this.auth.isLogged() && !this.auth.isAdmin() },
    { title: 'Recomendar Jogo', url: '/recomendar-jogo', icon: 'game-controller-outline', show: () => this.auth.isLogged() &&  !this.auth.isAdmin()},
    // Itens do admin
    { title: 'Gerenciar Jogos', url: '/games', icon: 'game-controller-outline', show: () => this.auth.isAdmin() },
    { title: 'Usuários', url: '/users', icon: 'people-outline', show: () => this.auth.isAdmin() },
    { title: 'Recomendações', url: '/admin/recomendacoes', icon: 'bulb-outline', show: () => this.auth.isAdmin() },
    { title: 'Denuncias', url: '/admin/denuncias', icon: 'alert-circle-outline', show: () => this.auth.isAdmin() },
  ];

  pendingRequests = 0;
  showMenu = true;
  unreadRooms = 0;
  unreadFriends = 0;
  private realtimeBound = false;
  private badgeRefreshTimer: any;

  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly friends = inject(FriendsService);
  private readonly sockets = inject(SocketService);
  private readonly convs = inject(ConversationsService);
  private readonly router = inject(Router);
  private readonly menu = inject(MenuController);
  private readonly msgNotifs = inject(MessageNotificationsService);
  private readonly badgeSync = inject(NotificationsBadgeSyncService);

  constructor() {
    // garante que o tema seja aplicado o mais cedo possível
    try { /* instância criada via inject */ } catch {}
    this.refreshPending();
    this.refreshUnreadRooms();
    this.refreshUnreadFriends();
    this.ensureRealtime();

    // Permite que páginas/ações que marcam como lido forcem sync imediato do sininho.
    this.badgeSync.refresh$.subscribe(() => this.scheduleBadgeRefresh());

    // Controlar visibilidade do menu: esconder em /login e /register
    const update = (url: string) => {
      const path = url.split('?')[0];
      this.showMenu = !(path.startsWith('/login') || path.startsWith('/register'));

      // Mantém badges sincronizados ao navegar (ex.: após ler mensagens).
      if (this.auth.isLogged() && !this.auth.isAdmin()) {
        if (path.startsWith('/conversations')) {
          this.refreshUnreadRooms();
        }
        if (path.startsWith('/friends') || path.startsWith('/chat/')) {
          this.refreshUnreadFriends();
        }
        if (path.startsWith('/notifications')) {
          this.scheduleBadgeRefresh();
        }
      }
    };
    update(this.router.url || '');
    this.router.events.subscribe(evt => {
      if (evt instanceof NavigationEnd) {
        update(evt.urlAfterRedirects || evt.url);
        this.ensureRealtime();
      }
    });
  }

  get totalNotifications(): number {
    const a = Number(this.unreadFriends) || 0;
    const b = Number(this.unreadRooms) || 0;
    const c = Number(this.pendingRequests) || 0;
    return a + b + c;
  }

  async openNotifications() {
    try {
      await this.menu.close();
    } catch {}
    this.router.navigate(['/notifications']);
  }

  private ensureRealtime() {
    // Se o usuário logar após abrir o app, inicializa aqui sem duplicar handlers
    if (!this.auth.token) {
      if (this.realtimeBound) {
        this.realtimeBound = false;
        this.sockets.disconnect();
      }
      return;
    }
    if (this.realtimeBound) return;
    const s = this.sockets.connect(this.auth.token);
    this.realtimeBound = true;
    s.on('friend:request', () => this.refreshPending());
    s.on('friend:accepted', () => this.refreshPending());
    s.on('friend:declined', () => this.refreshPending());
    s.on('message:new', () => this.refreshUnreadFriends());
    s.on('message:read', () => this.refreshUnreadFriends());
    s.on('conv:message:new', () => this.refreshUnreadRooms());
    s.on('conv:message:notify', () => this.refreshUnreadRooms());
    s.on('conv:read', () => this.refreshUnreadRooms());
    s.on('conv:member:added', () => this.refreshUnreadRooms());

    // Notificações (jogador): DM e salas
    this.msgNotifs.init();
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
        this.unreadRooms = (rooms || []).reduce((sum: number, r: any) => {
          const count = Number(r?.unread_count ?? 0);
          return sum + (Number.isFinite(count) ? count : 0);
        }, 0);
      },
      error: () => { this.unreadRooms = 0; }
    });
  }

  refreshUnreadFriends() {
    if (!this.auth.isLogged()) { this.unreadFriends = 0; return; }
    this.friends.list().subscribe({
      next: (friends) => {
        this.unreadFriends = (friends || []).reduce((sum: number, f: any) => {
          const count = Number(f?.unread_count ?? 0);
          return sum + (Number.isFinite(count) ? count : 0);
        }, 0);
      },
      error: () => { this.unreadFriends = 0; }
    });
  }

  private scheduleBadgeRefresh() {
    if (!this.auth.isLogged() || this.auth.isAdmin()) return;
    if (this.badgeRefreshTimer) return;
    this.badgeRefreshTimer = setTimeout(() => {
      this.badgeRefreshTimer = null;
      this.refreshPending();
      this.refreshUnreadRooms();
      this.refreshUnreadFriends();
    }, 200);
  }
}
