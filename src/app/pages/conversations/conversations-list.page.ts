import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ConversationsService } from '../../services/conversations.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../modules/auth/auth.service';
import { FriendsService } from '../../services/friends.service';
import { environment } from '../../../environments/environment';
import { finalize } from 'rxjs/operators';
import { IonModal, ViewWillEnter } from '@ionic/angular';

@Component({
  selector: 'app-conversations-list',
  templateUrl: './conversations-list.page.html',
  styleUrls: ['./conversations-list.page.scss'],
  standalone: false
})
export class ConversationsListPage implements OnInit, OnDestroy, ViewWillEnter {
  rooms: any[] = [];
  deleting: Record<number, boolean> = {};
  name = '';
  description = '';
  is_public = true;
  searchTerm = '';
  isCreateModalOpen = false;
  createLoading = false;
  friendSearch = '';
  friends: FriendSummary[] = [];
  friendsLoading = false;
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
  private newAvatarFile: File | null = null;
  newAvatarPreview: string | null = null;
  private friendsLoaded = false;
  private selectedFriendIds = new Set<number>();
  private readonly mediaBase = environment.socketUrl.replace(/\/$/, '');
  @ViewChild('createModal') createModal?: IonModal;

  private readonly convSvc = inject(ConversationsService);
  private readonly router = inject(Router);
  private readonly sockets = inject(SocketService);
  private readonly friendsService = inject(FriendsService);
  readonly auth = inject(AuthService);

  private convNotifyHandler: any;

  ngOnInit() {
    const s = this.sockets.connect(this.auth.token!);
    s.on('conv:typing', this.typingHandler);

    this.convNotifyHandler = (msg: any) => {
      const convId = Number(msg?.conversation_id);
      const senderId = Number(msg?.sender_id);
      const me = Number(this.auth.user?.id);
      if (!Number.isFinite(convId) || !Number.isFinite(senderId)) return;
      if (Number.isFinite(me) && senderId === me) return;
      const i = (this.rooms || []).findIndex(r => Number(r?.id) === convId);
      if (i < 0) return;
      const current = this.rooms[i];
      const next = this.decorateRoom({
        ...current,
        unread_count: (Number(current?.unread_count) || 0) + 1,
        last_message: msg?.content ?? current?.last_message,
        last_sender_id: senderId,
        last_sender_name: msg?.sender_name ?? current?.last_sender_name,
      });
      // mantém o item atualizado; opcionalmente pode mover para topo
      this.rooms = [
        next,
        ...this.rooms.slice(0, i),
        ...this.rooms.slice(i + 1)
      ];
    };
    s.on('conv:message:notify', this.convNotifyHandler);
  }

  ionViewWillEnter(): void {
    this.load();
  }

  get canSubmitCreate(): boolean {
    return this.name.trim().length > 0 && this.selectedFriendIds.size > 0 && !this.createLoading;
  }

  ngOnDestroy(): void {
    this.revokeNewAvatarPreview();

    const s = this.sockets.get();
    if (s && this.convNotifyHandler) {
      s.off('conv:message:notify', this.convNotifyHandler);
    }
    this.convNotifyHandler = null;
  }

  get filteredRooms() {
    if (!this.searchTerm.trim()) {
      return this.rooms;
    }
    const term = this.searchTerm.trim().toLowerCase();
    return this.rooms.filter((room) => {
      const haystack = [room.name, room.last_message, room.description]
        .filter(Boolean)
        .map((value) => value!.toLowerCase());
      return haystack.some((value) => value.includes(term));
    });
  }

  get totalUnread(): number {
    return this.rooms.reduce((total, room) => total + (room.unread_count || 0), 0);
  }

  load() {
    this.convSvc.list().subscribe((list) => (this.rooms = list.map((room) => this.decorateRoom(room))));
  }

  create() {
    const title = this.name.trim();
    if (!title) {
      alert('Informe um nome para a sala');
      return;
    }

    if (this.selectedFriendIds.size < 1) {
      alert('Para criar uma sala, convide pelo menos 1 amigo para participar.');
      return;
    }
    const payload = {
      name: title,
      description: this.description.trim() || undefined,
      is_public: this.is_public,
      members: Array.from(this.selectedFriendIds)
    };
    this.createLoading = true;
    this.convSvc
      .create(payload, this.newAvatarFile || undefined)
      .pipe(finalize(() => (this.createLoading = false)))
      .subscribe({
        next: (room) => {
          if (!room) return;
          this.upsertRoom(room);
          const dismissPromise = this.createModal?.onDidDismiss() ?? Promise.resolve();
          this.closeCreateModal(true);
          dismissPromise.then(() =>
            this.router.navigate(['/conversations', room.id]).finally(() => this.load())
          );
        },
        error: (err) => {
          const serverMessage = [err?.error?.error, err?.error?.details].filter(Boolean).join(' – ');
          alert(serverMessage || 'Não foi possível criar a sala');
        }
      });
  }

  openCreateModal() {
    this.isCreateModalOpen = true;
    this.loadFriends();
  }

  closeCreateModal(reset = false) {
    this.isCreateModalOpen = false;
    if (reset) {
      this.resetCreateForm();
    }
  }

  onSearchInput(event: Event) {
    const detail = (event as CustomEvent<{ value?: string }>).detail;
    this.searchTerm = (detail?.value || '').replace(/^\s+/, '');
  }

  onFriendSearch(event: Event) {
    const detail = (event as CustomEvent<{ value?: string }>).detail;
    this.friendSearch = (detail?.value || '').trim();
  }

  clearSearch() {
    this.searchTerm = '';
  }

  open(room: any) {
    this.router.navigate(['/conversations', room.id], { state: { room } });
  }

  canDelete(room: any): boolean {
    if (!room) return false;
    const ownerId = Number(room.owner_id ?? room.ownerId);
    return Number.isFinite(ownerId) && ownerId === this.auth.user?.id;
  }

  confirmDelete(room: any, event?: Event) {
    event?.stopPropagation();
    if (!room || !this.canDelete(room)) return;
    if (this.deleting[room.id]) return;
    const confirmed = confirm(`Excluir a sala "${room.name || 'Sem título'}"? Esta ação remove todas as mensagens.`);
    if (!confirmed) return;
    this.deleting[room.id] = true;
    this.convSvc.delete(room.id).subscribe({
      next: () => {
        delete this.deleting[room.id];
        this.rooms = this.rooms.filter((r) => r.id !== room.id);
      },
      error: (err) => {
        delete this.deleting[room.id];
        const message = [err?.error?.error, err?.error?.details, err?.message].filter(Boolean).join(' - ');
        alert(message || 'Não foi possível excluir a sala.');
      }
    });
  }

  private resetCreateForm() {
    this.name = '';
    this.description = '';
    this.is_public = true;
    this.friendSearch = '';
    this.selectedFriendIds.clear();
    this.clearAvatar();
  }

  private upsertRoom(room: any) {
    const normalized = this.decorateRoom(room);
    const remaining = this.rooms.filter((existing) => existing.id !== normalized.id);
    this.rooms = [normalized, ...remaining];
  }

  private decorateRoom(room: any) {
    const normalized = {
      ...room,
      last_message: room?.last_message ?? null,
      last_sender_id: room?.last_sender_id ?? room?.lastSenderId ?? null,
      last_sender_name: room?.last_sender_name ?? room?.lastSenderName ?? null,
      unread_count: room?.unread_count ?? 0
    };
    const senderIdRaw = normalized.last_sender_id;
    const senderId = senderIdRaw == null ? null : Number(senderIdRaw);
    const hasSender = typeof senderId === 'number' && Number.isFinite(senderId);
    const senderIsMe = hasSender && senderId === this.auth.user?.id;
    const fallbackName = hasSender ? `Jogador #${senderId}` : 'Participante';
    normalized.__lastSenderIsMe = senderIsMe;
    normalized.__lastSenderName = senderIsMe ? 'Você' : (normalized.last_sender_name || fallbackName);
    const lastMessage = typeof normalized.last_message === 'string' ? normalized.last_message.trim() : '';
    normalized.__lastMessage = lastMessage.length ? lastMessage : null;
    return normalized;
  }

  private loadFriends() {
    if (this.friendsLoaded) return;
    this.friendsLoading = true;
    this.friendsService.list().subscribe({
      next: (friends) => {
        this.friends = friends.map((friend) => ({
          id: friend.id,
          name: friend.name,
          nickname: friend.nickname,
          email: friend.email,
          relation: friend.relation || 'friend'
        }));
        this.friendsLoaded = true;
        this.friendsLoading = false;
      },
      error: (err) => {
        this.friendsLoading = false;
        console.warn('[conversations] Falha ao carregar amigos', err?.error || err?.message);
      }
    });
  }

  onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    this.revokeNewAvatarPreview();
    this.newAvatarFile = file;
    this.newAvatarPreview = URL.createObjectURL(file);
    input.value = '';
  }

  clearAvatar() {
    this.newAvatarFile = null;
    this.revokeNewAvatarPreview();
  }

  private revokeNewAvatarPreview() {
    if (this.newAvatarPreview) {
      URL.revokeObjectURL(this.newAvatarPreview);
      this.newAvatarPreview = null;
    }
  }

  toggleFriendSelection(id: number) {
    if (this.selectedFriendIds.has(id)) {
      this.selectedFriendIds.delete(id);
    } else {
      this.selectedFriendIds.add(id);
    }
  }

  removeFriendSelection(id: number) {
    this.selectedFriendIds.delete(id);
  }

  isFriendSelected(id: number): boolean {
    return this.selectedFriendIds.has(id);
  }

  selectedFriendsList(): FriendSummary[] {
    const selected = new Set(this.selectedFriendIds);
    return this.friends.filter((friend) => selected.has(friend.id));
  }

  filteredFriendsForSelection(): FriendSummary[] {
    const term = this.friendSearch.toLowerCase();
    return this.friends.filter((friend) => {
      if (!term) return true;
      return [friend.nickname, friend.name, friend.email]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }

  displayFriendName(friend: FriendSummary): string {
    return (friend.nickname?.trim() || friend.name?.trim() || friend.email).trim();
  }

  initialsFromName(raw?: string | null): string {
    const source = (raw || '').trim();
    if (!source) return '?';
    const parts = source.split(/\s+/).slice(0, 2);
    const initials = parts.map((part) => part[0]).join('');
    return initials.toUpperCase();
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
}

interface FriendSummary {
  id: number;
  name?: string | null;
  nickname?: string | null;
  email: string;
  relation?: 'friend' | 'blocked' | string;
}
