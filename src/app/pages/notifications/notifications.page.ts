import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';

import { AuthService } from '../../modules/auth/auth.service';
import { FriendsService } from '../../services/friends.service';
import { ConversationsService } from '../../services/conversations.service';
import { SocketService } from '../../services/socket.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
  standalone: false,
})
export class NotificationsPage implements OnInit, OnDestroy, ViewWillEnter {
  loading = false;

  pendingRequests: any[] = [];
  unreadFriends: any[] = [];
  unreadRooms: any[] = [];

  private readonly auth = inject(AuthService);
  private readonly friends = inject(FriendsService);
  private readonly convs = inject(ConversationsService);
  private readonly sockets = inject(SocketService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  private readonly mediaBase = environment.socketUrl.replace(/\/$/, '');

  private reloadTimer: any;
  private handlers: Record<string, any> = {};

  ngOnInit(): void {
    this.bindRealtime();
  }

  ngOnDestroy(): void {
    this.unbindRealtime();
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  ionViewWillEnter(): void {
    this.load();
  }

  private scheduleReload() {
    if (!this.isPlayer) return;
    if (this.reloadTimer) return;
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      this.zone.run(() => this.load());
    }, 250);
  }

  private bindRealtime() {
    if (!this.auth.token || !this.isPlayer) return;
    const s = this.sockets.connect(this.auth.token);

    this.handlers['friend:request'] = () => this.scheduleReload();
    this.handlers['friend:accepted'] = () => this.scheduleReload();
    this.handlers['friend:declined'] = () => this.scheduleReload();
    this.handlers['message:new'] = () => this.scheduleReload();
    this.handlers['message:read'] = () => this.scheduleReload();
    this.handlers['conv:message:notify'] = () => this.scheduleReload();
    this.handlers['conv:read'] = () => this.scheduleReload();
    this.handlers['conv:member:added'] = () => this.scheduleReload();

    s.on('friend:request', this.handlers['friend:request']);
    s.on('friend:accepted', this.handlers['friend:accepted']);
    s.on('friend:declined', this.handlers['friend:declined']);
    s.on('message:new', this.handlers['message:new']);
    s.on('message:read', this.handlers['message:read']);
    s.on('conv:message:notify', this.handlers['conv:message:notify']);
    s.on('conv:read', this.handlers['conv:read']);
    s.on('conv:member:added', this.handlers['conv:member:added']);
  }

  private unbindRealtime() {
    const s = this.sockets.get();
    if (!s) return;
    const entries = Object.entries(this.handlers);
    for (const [evt, handler] of entries) {
      if (handler) s.off(evt, handler);
    }
    this.handlers = {};
  }

  get isPlayer(): boolean {
    return this.auth.isLogged() && !this.auth.isAdmin();
  }

  get totalUnread(): number {
    const friends = this.unreadFriends.reduce((sum, f) => sum + (Number(f?.unread_count) || 0), 0);
    const rooms = this.unreadRooms.reduce((sum, r) => sum + (Number(r?.unread_count) || 0), 0);
    const requests = this.pendingRequests.length || 0;
    return friends + rooms + requests;
  }

  load() {
    if (!this.auth.isLogged()) {
      this.pendingRequests = [];
      this.unreadFriends = [];
      this.unreadRooms = [];
      return;
    }

    this.loading = true;

    // Carrega em paralelo via subscriptions simples (sem depender de forkJoin/rxjs aqui)
    let pending = 3;
    const done = () => {
      pending -= 1;
      if (pending <= 0) this.loading = false;
    };

    this.friends.requests().subscribe({
      next: (list) => {
        this.pendingRequests = Array.isArray(list) ? list : [];
        done();
      },
      error: () => {
        this.pendingRequests = [];
        done();
      },
    });

    this.friends.list().subscribe({
      next: (list) => {
        const friends = Array.isArray(list) ? list : [];
        this.unreadFriends = friends
          .filter((f: any) => (Number(f?.unread_count) || 0) > 0)
          .sort((a: any, b: any) => (Number(b?.unread_count) || 0) - (Number(a?.unread_count) || 0));
        done();
      },
      error: () => {
        this.unreadFriends = [];
        done();
      },
    });

    this.convs.list().subscribe({
      next: (list) => {
        const rooms = Array.isArray(list) ? list : [];
        this.unreadRooms = rooms
          .filter((r: any) => (Number(r?.unread_count) || 0) > 0)
          .sort((a: any, b: any) => (Number(b?.unread_count) || 0) - (Number(a?.unread_count) || 0));
        done();
      },
      error: () => {
        this.unreadRooms = [];
        done();
      },
    });
  }

  openFriends() {
    this.router.navigate(['/friends']);
  }

  openFriendChat(friend: any) {
    const id = Number(friend?.id);
    if (!Number.isFinite(id)) return;
    this.router.navigate(['/chat', id]);
  }

  openRoom(room: any) {
    const id = Number(room?.id);
    if (!Number.isFinite(id)) return;
    this.router.navigate(['/conversations', id], { state: { room } });
  }

  normalizeAvatar(url?: string | null) {
    if (!url) return 'assets/icon/favicon.png';
    if (/^https?:/i.test(url)) return url;
    return `${this.mediaBase}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement | null;
    if (!img) return;
    if ((img as any).dataset && (img as any).dataset.fallbackApplied) return;
    try { (img as any).dataset.fallbackApplied = '1'; } catch {}
    img.src = 'assets/icon/favicon.png';
  }

  trackById(_i: number, item: any) {
    return item?.id;
  }
}
