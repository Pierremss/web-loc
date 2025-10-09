import { Component, OnInit, inject } from '@angular/core';
import { GamesService, Game } from './games.service';
import { AuthService } from '../auth/auth.service';
import { Platform } from '../../model/platform';
import { PlatformsService } from '../../services/platforms.service';

@Component({
  selector: 'app-games-list',
  templateUrl: './games-list.page.html',
  styleUrls: ['./games-list.page.scss'],
  standalone: false,
})
export class GamesListPage implements OnInit {
  games: Game[] = [];
  filteredGames: Game[] = [];
  name = '';
  selectedPlatformIds: number[] = [];
  platformOptions: Platform[] = [];
  searchTerm = '';

  editId: number | null = null;
  editName = '';
  editPlatformIds: number[] = [];

  platformFormName = '';
  platformEditId: number | null = null;
  platformEditName = '';

  private readonly gamesService = inject(GamesService);
  private readonly platformsService = inject(PlatformsService);
  readonly auth = inject(AuthService);

  ngOnInit() {
    this.refreshData();
  }

  ionViewWillEnter() {
    this.refreshData();
  }

  private refreshData() {
    this.refreshPlatforms();
    this.loadGames();
  }

  private loadGames() {
    this.gamesService.list().subscribe(games => {
      this.games = games;
      this.searchGames();
    });
  }

  private refreshPlatforms() {
    this.platformsService.list().subscribe(list => {
      this.platformOptions = [...list].sort((a, b) => a.name.localeCompare(b.name));
      this.syncSelectedPlatforms();
    });
  }

  private syncSelectedPlatforms() {
    const availableIds = new Set(this.platformOptions.map(p => p.id));
    this.selectedPlatformIds = this.selectedPlatformIds.filter(id => availableIds.has(id));
    this.editPlatformIds = this.editPlatformIds.filter(id => availableIds.has(id));
  }

  formatPlatforms(platforms: Platform[] = []): string {
    if (!platforms.length) return '—';
    return platforms.map(p => p.name).join(', ');
  }

  searchGames() {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredGames = this.games;
    } else {
      this.filteredGames = this.games.filter(game =>
        game.name.toLowerCase().includes(term)
      );
    }
  }

  create() {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    if (!this.name.trim() || this.selectedPlatformIds.length === 0) {
      return alert('Informe um nome e ao menos uma plataforma');
    }
    this.gamesService.create({ name: this.name.trim(), platforms: this.selectedPlatformIds }).subscribe({
      next: () => {
        this.name = '';
        this.selectedPlatformIds = [];
        this.loadGames();
      },
      error: err => alert(err?.error?.error || 'Erro ao criar jogo')
    });
  }

  remove(id: number) {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    if (!confirm('Deseja realmente excluir este jogo?')) return;
    this.gamesService.delete(id).subscribe({
      next: () => this.loadGames(),
      error: err => alert(err?.error?.error || 'Erro ao excluir jogo')
    });
  }

  startEdit(game: Game) {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    this.editId = game.id;
    this.editName = game.name;
    this.editPlatformIds = (game.platforms || []).map(p => p.id);
  }

  cancelEdit() {
    this.editId = null;
    this.editName = '';
    this.editPlatformIds = [];
  }

  saveEdit() {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    if (!this.editName.trim() || this.editPlatformIds.length === 0) {
      return alert('Preencha todos os campos');
    }
    this.gamesService.update(this.editId!, { name: this.editName.trim(), platforms: this.editPlatformIds }).subscribe({
      next: () => {
        this.cancelEdit();
        this.loadGames();
      },
      error: err => alert(err?.error?.error || 'Erro ao atualizar jogo')
    });
  }

  createPlatform() {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    const name = this.platformFormName.trim();
    if (!name) return alert('Informe o nome da plataforma');
    this.platformsService.create({ name }).subscribe({
      next: () => {
        this.platformFormName = '';
        this.refreshPlatforms();
        this.loadGames();
      },
      error: err => alert(err?.error?.error || 'Erro ao criar plataforma')
    });
  }

  startPlatformEdit(platform: Platform) {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    this.platformEditId = platform.id;
    this.platformEditName = platform.name;
  }

  cancelPlatformEdit() {
    this.platformEditId = null;
    this.platformEditName = '';
  }

  savePlatformEdit() {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    if (!this.platformEditId) return;
    const name = this.platformEditName.trim();
    if (!name) return alert('Informe o nome da plataforma');
    this.platformsService.update(this.platformEditId, { name }).subscribe({
      next: () => {
        this.cancelPlatformEdit();
        this.refreshPlatforms();
        this.loadGames();
      },
      error: err => alert(err?.error?.error || 'Erro ao atualizar plataforma')
    });
  }

  removePlatform(id: number) {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    if (!confirm('Remover esta plataforma? Jogos perderão esta associação.')) return;
    this.platformsService.delete(id).subscribe({
      next: () => {
        this.refreshPlatforms();
        this.loadGames();
      },
      error: err => alert(err?.error?.error || 'Erro ao remover plataforma')
    });
  }
}