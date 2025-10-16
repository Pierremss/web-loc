import { Component, OnInit, inject } from '@angular/core';
import { RoomsService, Room } from '../../services/rooms.service';
import { ConversationsService } from '../../services/conversations.service';
import { AuthService } from '../../modules/auth/auth.service';

@Component({
  selector: 'app-rooms-list',
  templateUrl: './rooms-list.page.html',
  styleUrls: ['./rooms-list.page.scss'],
  standalone:false
})
export class RoomsListPage implements OnInit {
  rooms: Room[] = [];
  name = '';
  link = '';
  description = '';
  editId: number | null = null;
  editName = '';
  editLink = '';
  editDescription = '';

  private readonly roomsService = inject(RoomsService);
  private readonly convs = inject(ConversationsService);
  readonly auth = inject(AuthService);

  ngOnInit() { this.load(); }

  load() { this.roomsService.list().subscribe(r => this.rooms = r); }

  create() {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    if (!this.name.trim()) return alert('Informe um nome');
    this.roomsService.create({ name: this.name.trim(), link: this.link.trim() || undefined, description: this.description.trim() || undefined }).subscribe({ next: () => { this.name = ''; this.link = ''; this.description = ''; this.load(); }, error: e => alert(e?.error?.error || 'Erro') });
  }

  startEdit(r: Room) { this.editId = r.id; this.editName = r.name; this.editLink = r.link || ''; this.editDescription = r.description || ''; }
  cancelEdit() { this.editId = null; this.editName = ''; this.editLink = ''; this.editDescription = ''; }
  saveEdit() { if (!this.editId) return; this.roomsService.update(this.editId, { name: this.editName, link: this.editLink || undefined, description: this.editDescription || undefined }).subscribe({ next: () => { this.cancelEdit(); this.load(); }, error: e => alert(e?.error?.error || 'Erro') }); }

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
}
