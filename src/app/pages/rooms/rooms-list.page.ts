import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RoomsService, Room, RoomMember } from '../../services/rooms.service';
import { FriendsService } from '../../services/friends.service';
import { ConversationsService } from '../../services/conversations.service';
import { AuthService } from '../../modules/auth/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-rooms-list',
  templateUrl: './rooms-list.page.html',
  styleUrls: ['./rooms-list.page.scss'],
  standalone:false
})
export class RoomsListPage implements OnInit, OnDestroy {
  rooms: Room[] = [];
  name = '';
  link = '';
  description = '';
  createLoading = false;
  editId: number | null = null;
  editName = '';
  editLink = '';
  editDescription = '';
  members: Record<number, RoomMember[]> = {};
  membersLoading: Record<number, boolean> = {};
  memberInputs: Record<number, string> = {};
  addingMember: Record<number, boolean> = {};
  avatarUploading: Record<number, boolean> = {};
  private newAvatarFile: File | null = null;
  newAvatarPreview: string | null = null;
  friends: FriendSummary[] = [];
  friendsLoading = false;
  private friendsLoaded = false;
  showFriendPicker: Record<number, boolean> = {};
  showCreateCard = true;
  searchTerm = '';
  expandedRoomId?: string;

  private readonly mediaBase = environment.socketUrl.replace(/\/$/, '');

  private readonly roomsService = inject(RoomsService);
  private readonly convs = inject(ConversationsService);
  readonly auth = inject(AuthService);
  private readonly friendsService = inject(FriendsService);

  ngOnInit() { this.load(); }

  ngOnDestroy(): void {
    this.revokeNewAvatarPreview();
  }

  load() {
    this.roomsService.list().subscribe({
      next: (rooms) => {
        this.rooms = rooms;
        const activeIds = new Set(rooms.map((room) => room.id));
        if (this.expandedRoomId && !activeIds.has(Number(this.expandedRoomId))) {
          this.expandedRoomId = undefined;
        }
        Object.keys(this.members).forEach((key) => {
          const id = Number(key);
          if (!activeIds.has(id)) {
            delete this.members[id];
            delete this.memberInputs[id];
            delete this.membersLoading[id];
            delete this.addingMember[id];
            delete this.avatarUploading[id];
            delete this.showFriendPicker[id];
          }
        });
        rooms.forEach((room) => {
          if (this.isOwner(room)) {
            if (!this.members[room.id]) {
              this.members[room.id] = [];
            }
            this.fetchMembers(room.id);
            if (!this.friendsLoaded) {
              this.loadFriends();
            }
          } else {
            delete this.members[room.id];
            delete this.memberInputs[room.id];
            delete this.membersLoading[room.id];
            delete this.addingMember[room.id];
            delete this.avatarUploading[room.id];
            delete this.showFriendPicker[room.id];
          }
        });
      },
      error: (err) => alert(err?.error?.error || 'Erro ao carregar salas')
    });
  }

  get totalMembers(): number {
    return this.rooms.reduce((total, room) => {
      const localCount = this.members[room.id]?.length;
      if (typeof localCount === 'number') {
        return total + localCount;
      }
      return total + (room.member_count ?? 0);
    }, 0);
  }

  get filteredRooms(): Room[] {
    if (!this.searchTerm.trim()) {
      return this.rooms;
    }
    const term = this.searchTerm.trim().toLowerCase();
    return this.rooms.filter((room) => {
      const haystack = [room.name, room.description, room.link]
        .filter(Boolean)
        .map((value) => value!.toLowerCase());
      return haystack.some((value) => value.includes(term));
    });
  }

  private loadFriends() {
    if (this.friendsLoaded) return;
    this.friendsLoading = true;
    this.friendsService.list().subscribe({
      next: (friends) => {
        this.friends = friends.map((item) => ({
          id: item.id,
          name: item.name,
          nickname: item.nickname,
          email: item.email
        }));
        this.friendsLoading = false;
        this.friendsLoaded = true;
      },
      error: (err) => {
        this.friendsLoading = false;
        console.warn('[rooms] Falha ao carregar amigos', err?.error || err?.message);
      }
    });
  }

  create() {
    if (!this.name.trim()) return alert('Informe um nome');
    const payload = {
      name: this.name.trim(),
      link: this.link.trim() || undefined,
      description: this.description.trim() || undefined
    };
    this.createLoading = true;
    this.roomsService.create(payload, this.newAvatarFile || undefined).subscribe({
      next: () => {
        this.name = '';
        this.link = '';
        this.description = '';
        this.clearNewAvatar();
        this.load();
        this.createLoading = false;
      },
      error: (err) => {
        this.createLoading = false;
        alert(err?.error?.error || 'Erro ao criar sala');
      }
    });
  }

  startEdit(r: Room) { this.editId = r.id; this.editName = r.name; this.editLink = r.link || ''; this.editDescription = r.description || ''; }
  cancelEdit() { this.editId = null; this.editName = ''; this.editLink = ''; this.editDescription = ''; }
  saveEdit() {
    if (!this.editId) return;
    const name = this.editName.trim();
    if (!name) return alert('Informe um nome para a sala');
    const payload = {
      name,
      link: this.editLink.trim() || undefined,
      description: this.editDescription.trim() || undefined
    };
    const roomId = this.editId;
    this.roomsService.update(roomId, payload).subscribe({
      next: (updated) => {
        const idx = this.rooms.findIndex((room) => room.id === roomId);
        if (idx >= 0) {
          this.rooms[idx] = { ...this.rooms[idx], ...updated };
        }
        this.cancelEdit();
      },
      error: (err) => alert(err?.error?.error || 'Erro ao atualizar sala')
    });
  }

  remove(id: number) { if (!confirm('Remover sala?')) return; this.roomsService.delete(id).subscribe({ next: () => this.load(), error: e => alert(e?.error?.error || 'Erro') }); }

  shareToConversation(roomId: number) {
    // Permite escolher uma conversa (simples prompt para acelerar); ideal: modal com listagem
    this.convs.list().subscribe(convs => {
      const choices = convs.map((c:any, i:number) => `${i+1}) ${c.name || 'Privada #' + c.id}`).join('\n');
      const sel = prompt('Escolha uma conversa para compartilhar:\n' + choices + '\nDigite o número:');
      const idx = Number(sel) - 1;
      if (isNaN(idx) || idx < 0 || idx >= convs.length) return alert('Seleção inválida');
      const convId = convs[idx].id;
      this.roomsService.share(roomId, convId).subscribe({ next: () => alert('Sala compartilhada na conversa'), error: e => alert(e?.error?.error || 'Erro') });
    });
  }

  isOwner(room: Room): boolean {
    return this.auth.user?.id === room.owner_id;
  }

  private fetchMembers(roomId: number): void {
    this.membersLoading[roomId] = true;
    this.roomsService.listMembers(roomId).subscribe({
      next: (list) => {
        this.members[roomId] = list;
        this.membersLoading[roomId] = false;
        this.updateMemberCount(roomId);
      },
      error: (err) => {
        this.membersLoading[roomId] = false;
        if (err?.status !== 403) {
          console.warn('[rooms] Falha ao carregar membros', roomId, err?.error || err?.message);
        }
      }
    });
  }

  addMember(roomId: number) {
    const email = (this.memberInputs[roomId] || '').trim();
    if (!email) return alert('Informe o e-mail do jogador');
    this.inviteToRoom(roomId, email, () => {
      this.memberInputs[roomId] = '';
    });
  }

  toggleFriendPicker(roomId: number) {
    this.showFriendPicker[roomId] = !this.showFriendPicker[roomId];
    if (this.showFriendPicker[roomId]) {
      this.loadFriends();
    }
  }

  onSearchInput(event: Event) {
    const detail = (event as CustomEvent<{ value?: string }>).detail;
    this.searchTerm = (detail?.value || '').replace(/^\s+/, '');
  }

  clearSearch() {
    this.searchTerm = '';
  }

  onAccordionChange(event: Event) {
    const group = event as CustomEvent<{ value?: string | string[] }>;
    const value = group.detail?.value;
    if (Array.isArray(value)) {
      this.expandedRoomId = value[0];
    } else {
      this.expandedRoomId = value ?? undefined;
    }
  }

  addFriendToRoom(roomId: number, friend: FriendSummary) {
    if (this.isMember(roomId, friend.id)) return;
    this.inviteToRoom(roomId, friend.email);
  }

  isMember(roomId: number, userId: number): boolean {
    return (this.members[roomId] || []).some((member) => member.user_id === userId);
  }

  private inviteToRoom(roomId: number, email: string, onSuccess?: () => void) {
    this.addingMember[roomId] = true;
    this.roomsService.addMember(roomId, email).subscribe({
      next: (member) => {
        const current = this.members[roomId] ? [...this.members[roomId]] : [];
        const idx = current.findIndex((m) => m.user_id === member.user_id);
        if (idx >= 0) {
          current[idx] = member;
        } else {
          current.push(member);
        }
        this.members[roomId] = current;
        this.updateMemberCount(roomId);
        this.addingMember[roomId] = false;
        onSuccess?.();
      },
      error: (err) => {
        this.addingMember[roomId] = false;
        alert(err?.error?.error || 'Não foi possível adicionar o jogador');
      }
    });
  }

  onNewRoomAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    this.revokeNewAvatarPreview();
    this.newAvatarFile = file;
    this.newAvatarPreview = URL.createObjectURL(file);
    input.value = '';
  }

  clearNewAvatar() {
    this.newAvatarFile = null;
    this.revokeNewAvatarPreview();
  }

  private revokeNewAvatarPreview() {
    if (this.newAvatarPreview) {
      URL.revokeObjectURL(this.newAvatarPreview);
      this.newAvatarPreview = null;
    }
  }

  removeMember(roomId: number, userId: number) {
    if (!confirm('Remover este jogador da sala?')) return;
    this.roomsService.removeMember(roomId, userId).subscribe({
      next: () => {
        const current = this.members[roomId] || [];
        this.members[roomId] = current.filter((m) => m.user_id !== userId);
        this.updateMemberCount(roomId);
      },
      error: (err) => alert(err?.error?.error || 'Não foi possível remover o jogador')
    });
  }

  onAvatarFileSelected(roomId: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    this.avatarUploading[roomId] = true;
    this.roomsService.uploadAvatar(roomId, file).subscribe({
      next: (result) => {
        const idx = this.rooms.findIndex((room) => room.id === roomId);
        if (idx >= 0) {
          this.rooms[idx] = { ...this.rooms[idx], avatar_url: result.avatar_url };
        }
        this.avatarUploading[roomId] = false;
        input.value = '';
      },
      error: (err) => {
        this.avatarUploading[roomId] = false;
        input.value = '';
        alert(err?.error?.error || 'Não foi possível atualizar a imagem da sala');
      }
    });
  }

  normalizeRoomAvatar(url?: string | null): string {
    if (!url) return 'assets/icon/favicon.png';
    if (/^https?:\/\//i.test(url)) return url;
    const normalized = url.startsWith('/') ? url : `/${url}`;
    return `${this.mediaBase}${normalized}`;
  }

  onAvatarError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img) img.src = 'assets/icon/favicon.png';
  }

  private updateMemberCount(roomId: number): void {
    const index = this.rooms.findIndex((room) => room.id === roomId);
    if (index >= 0) {
      const count = this.members[roomId]?.length ?? 0;
      this.rooms[index] = { ...this.rooms[index], member_count: count };
    }
  }

  toggleCreateCard() {
    this.showCreateCard = !this.showCreateCard;
  }
}

interface FriendSummary {
  id: number;
  name?: string | null;
  nickname?: string | null;
  email: string;
}
