import { Component, OnInit, inject } from '@angular/core';
import { GamesService, Game } from './games.service';
import { AuthService } from '../auth/auth.service';
import { Platform } from '../../model/platform';
import { PlatformsService } from '../../services/platforms.service';
import { GenresService, Genre } from '../../services/genres.service';
import { GameTypesService, GameType } from '../../services/game-types.service';

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
  selectedGenreIds: number[] = [];
  selectedTypeIds: number[] = [];
  platformOptions: Platform[] = [];
  genreOptions: Genre[] = [];
  typeOptions: GameType[] = [];
  searchTerm = '';

  editId: number | null = null;
  editName = '';
  editPlatformIds: number[] = [];
  editGenreIds: number[] = [];
  editTypeIds: number[] = [];

  platformFormName = '';
  platformEditId: number | null = null;
  platformEditName = '';
  genreFormName = '';
  genreEditId: number | null = null;
  genreEditName = '';
  typeFormName = '';
  typeEditId: number | null = null;
  typeEditName = '';

  private readonly gamesService = inject(GamesService);
  private readonly platformsService = inject(PlatformsService);
  private readonly genresService = inject(GenresService);
  private readonly typesService = inject(GameTypesService);
  readonly auth = inject(AuthService);

  ngOnInit() {
    this.refreshData();
  }

  ionViewWillEnter() {
    this.refreshData();
  }

  private refreshData() {
    this.refreshPlatforms();
    this.refreshGenres();
    this.refreshTypes();
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

  private refreshGenres() {
    this.genresService.list().subscribe(list => {
      this.genreOptions = [...list].sort((a, b) => a.name.localeCompare(b.name));
      this.syncSelectedGenres();
    });
  }

  private refreshTypes() {
    this.typesService.list().subscribe(list => {
      this.typeOptions = [...list].sort((a, b) => a.name.localeCompare(b.name));
      this.syncSelectedTypes();
    });
  }

  private syncSelectedGenres() {
    const available = new Set(this.genreOptions.map(g => g.id));
    this.selectedGenreIds = this.selectedGenreIds.filter(id => available.has(id));
  }

  private syncSelectedTypes() {
    const available = new Set(this.typeOptions.map(t => t.id));
    this.selectedTypeIds = this.selectedTypeIds.filter(id => available.has(id));
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

  formatGenres(genres: Genre[] = []): string { if (!genres.length) return '—'; return genres.map(g => g.name).join(', '); }
  formatTypes(types: GameType[] = []): string { if (!types.length) return '—'; return types.map(t => t.name).join(', '); }

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
    const payload: any = { name: this.name.trim(), platforms: this.selectedPlatformIds };
    if (this.selectedGenreIds.length) payload.genres = this.selectedGenreIds;
    if (this.selectedTypeIds.length) payload.types = this.selectedTypeIds;
    this.gamesService.create(payload).subscribe({
      next: () => {
        this.name = '';
        this.selectedPlatformIds = [];
        this.selectedGenreIds = [];
        this.selectedTypeIds = [];
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
    this.editGenreIds = (game.genres || []).map(g => g.id);
    this.editTypeIds = (game.types || []).map(t => t.id);
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
  const dto: any = { name: this.editName.trim(), platforms: this.editPlatformIds };
  const editGenreIds = this.editGenreIds || [];
  const editTypeIds = this.editTypeIds || [];
    if (editGenreIds.length) dto.genres = editGenreIds;
    if (editTypeIds.length) dto.types = editTypeIds;
    this.gamesService.update(this.editId!, dto).subscribe({
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

  // Gêneros
  createGenre() {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    const name = this.genreFormName.trim();
    if (!name) return alert('Informe o nome do gênero');
    this.genresService.create({ name }).subscribe({ next: () => { this.genreFormName = ''; this.refreshGenres(); this.loadGames(); }, error: err => alert(err?.error?.error || 'Erro ao criar gênero') });
  }

  startGenreEdit(g: Genre) { if (!this.auth.isAdmin()) return alert('Apenas admin'); this.genreEditId = g.id; this.genreEditName = g.name; }
  cancelGenreEdit() { this.genreEditId = null; this.genreEditName = ''; }
  saveGenreEdit() { if (!this.auth.isAdmin()) return alert('Apenas admin'); if (!this.genreEditId) return; const name = this.genreEditName.trim(); if (!name) return alert('Informe o nome'); this.genresService.update(this.genreEditId, { name }).subscribe({ next: () => { this.cancelGenreEdit(); this.refreshGenres(); this.loadGames(); }, error: err => alert(err?.error?.error || 'Erro ao atualizar gênero') }); }
  removeGenre(id: number) { if (!this.auth.isAdmin()) return alert('Apenas admin'); if (!confirm('Remover este gênero? Jogos perderão esta associação.')) return; this.genresService.delete(id).subscribe({ next: () => { this.refreshGenres(); this.loadGames(); }, error: err => alert(err?.error?.error || 'Erro ao remover gênero') }); }

  // Tipos
  createType() { if (!this.auth.isAdmin()) return alert('Apenas admin'); const name = this.typeFormName.trim(); if (!name) return alert('Informe o nome do tipo'); this.typesService.create({ name }).subscribe({ next: () => { this.typeFormName = ''; this.refreshTypes(); this.loadGames(); }, error: err => alert(err?.error?.error || 'Erro ao criar tipo') }); }
  startTypeEdit(t: GameType) { if (!this.auth.isAdmin()) return alert('Apenas admin'); this.typeEditId = t.id; this.typeEditName = t.name; }
  cancelTypeEdit() { this.typeEditId = null; this.typeEditName = ''; }
  saveTypeEdit() { if (!this.auth.isAdmin()) return alert('Apenas admin'); if (!this.typeEditId) return; const name = this.typeEditName.trim(); if (!name) return alert('Informe o nome'); this.typesService.update(this.typeEditId, { name }).subscribe({ next: () => { this.cancelTypeEdit(); this.refreshTypes(); this.loadGames(); }, error: err => alert(err?.error?.error || 'Erro ao atualizar tipo') }); }
  removeType(id: number) { if (!this.auth.isAdmin()) return alert('Apenas admin'); if (!confirm('Remover este tipo? Jogos perderão esta associação.')) return; this.typesService.delete(id).subscribe({ next: () => { this.refreshTypes(); this.loadGames(); }, error: err => alert(err?.error?.error || 'Erro ao remover tipo') }); }
}