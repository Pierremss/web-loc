import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../modules/auth/auth.service';
import { GamesService, Game } from '../../modules/games/games.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { GenresService, Genre } from '../../services/genres.service';
import { Subject, catchError, debounceTime, finalize, of, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-jogador-perfil',
  templateUrl: './jogador-perfil.page.html',
  styleUrls: ['./jogador-perfil.page.scss'],
  standalone: false,
})
export class JogadorPerfilPage implements OnInit {
  // Tipagem dos favoritos com suporte a timestamp
  favoritos: FavoriteGame[] = [];
  favoritosFiltrados: FavoriteGame[] = [];
  genreOptions: Genre[] = [];
  readonly auth = inject(AuthService);
  private readonly gamesService = inject(GamesService);
  private readonly genresService = inject(GenresService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  novoFavorito: number | null = null;
  novoFavoritoNome: string | null = null;

  // Picker (busca + filtro)
  isGamePickerOpen = false;
  gamePickerSearch = '';
  gamePickerGenreIds: number[] = [];
  gamePickerLoading = false;
  gamePickerResults: Game[] = [];
  private readonly destroyRef = inject(DestroyRef);
  private readonly gameSearchTrigger$ = new Subject<void>();
  loading = false;
  error = '';
  filtro = '';
  ordenacao: 'az' | 'recent' = 'az';

  private headers() {
    return this.auth.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) } : {};
  }

  ngOnInit() {
    this.carregarFavoritos();
    this.loadGenres();
    this.setupGamePickerSearch();
  }

  private loadGenres(): void {
    this.genresService.list().subscribe({
      next: (list) => {
        this.genreOptions = [...(list || [])].sort((a, b) => a.name.localeCompare(b.name));
      },
      error: () => {
        this.genreOptions = [];
      }
    });
  }

  private setupGamePickerSearch(): void {
    this.gameSearchTrigger$
      .pipe(
        debounceTime(200),
        switchMap(() => {
          this.gamePickerLoading = true;
          const search = (this.gamePickerSearch || '').trim();
          const genres = Array.isArray(this.gamePickerGenreIds)
            ? this.gamePickerGenreIds.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0)
            : [];
          return this.gamesService
            .list({ pageSize: 60, order: 'name', search: search || undefined, genres: genres.length ? genres : undefined })
            .pipe(
              catchError(() => of([] as Game[])),
              finalize(() => (this.gamePickerLoading = false))
            );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((games) => {
        this.gamePickerResults = [...(games || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      });
  }

  openGamePicker(): void {
    this.isGamePickerOpen = true;
    this.queueGamePickerSearch();
  }

  queueGamePickerSearch(): void {
    this.gameSearchTrigger$.next();
  }

  setGamePickerSearch(value: string): void {
    this.gamePickerSearch = value;
    this.queueGamePickerSearch();
  }

  setGamePickerGenres(value: any): void {
    const raw = Array.isArray(value) ? value : [];
    this.gamePickerGenreIds = raw.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
    this.queueGamePickerSearch();
  }

  selectNovoFavorito(game: Game): void {
    this.novoFavorito = Number(game?.id) || null;
    this.novoFavoritoNome = game?.name || null;
    this.isGamePickerOpen = false;
  }

  carregarFavoritos() {
    const userId = this.resolveUserId();
    if (!userId) {
      this.error = 'Sessão inválida. Faça login novamente para visualizar os favoritos.';
      this.loading = false;
      return;
    }
    this.loading = true;
    this.http.get<any[]>(`/api/users/${userId}/favoritos`, this.headers()).subscribe({
      next: favs => {
        this.error = '';
        // Mapeia possíveis campos de data vindos do backend para _ts
        this.favoritos = (favs || []).map((f: any, idx: number) => {
          const rawTs = f.created_at || f.added_at || f.favorited_at || f.updated_at || f.timestamp;
          let ts = 0;
          if (rawTs) {
            const parsed = new Date(rawTs).getTime();
            ts = isNaN(parsed) ? 0 : parsed;
          }
          const fav: FavoriteGame = { ...f, _idx: idx, _ts: ts };
          return fav;
        });
        this.applyFiltro();
        this.loading = false;
      },
      error: err => {
        this.error = 'Erro ao carregar favoritos';
        this.loading = false;
      }
    });
  }

  applyFiltro() {
    const term = (this.filtro || '').toLowerCase();
    let list = this.favoritos.slice();
    if (term) list = list.filter(j => ((j.name || '') as string).toLowerCase().includes(term));
    if (this.ordenacao === 'az') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else {
      // Recentes: usa timestamp real quando existir; fallback para _idx
      list.sort((a, b) => {
        const at = typeof a._ts === 'number' && a._ts > 0 ? a._ts : (typeof a._idx === 'number' ? a._idx : 0);
        const bt = typeof b._ts === 'number' && b._ts > 0 ? b._ts : (typeof b._idx === 'number' ? b._idx : 0);
        return bt - at;
      });
    }
    this.favoritosFiltrados = list;
  }

  adicionarFavorito(gameId: number) {
    const userId = this.resolveUserId();
    if (!userId) {
      this.error = 'Sessão inválida. Faça login novamente para continuar.';
      return;
    }
    this.http.post(`/api/users/${userId}/favoritos`, { gameId }, this.headers()).subscribe(() => {
      this.carregarFavoritos();
    });
  }

  removerFavorito(gameId: number) {
    const userId = this.resolveUserId();
    if (!userId) {
      this.error = 'Sessão inválida. Faça login novamente para continuar.';
      return;
    }
    this.http.delete(`/api/users/${userId}/favoritos/${gameId}`, this.headers()).subscribe(() => {
      this.carregarFavoritos();
    });
  }

  editarPerfil() {
    this.router.navigate(['/editar-perfil']);
  }

  sair() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  excluirConta() {
    if (confirm('Tem certeza que deseja excluir sua conta?')) {
      const userId = this.resolveUserId();
      if (!userId) {
        this.error = 'Sessão inválida. Faça login novamente para continuar.';
        return;
      }
      this.http.delete(`/api/users/${userId}`, this.headers()).subscribe(() => {
        this.auth.logout();
        this.router.navigate(['/login']);
      });
    }
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

  get user() {
    return this.auth.user;
  }

  private resolveUserId(): number | null {
    const raw = this.auth.user?.id;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }
}

// Contrato local para favoritos, com metadados internos
interface FavoriteGame {
  id: number;
  name: string;
  // Campos possivelmente vindos do backend
  created_at?: string;
  added_at?: string;
  favorited_at?: string;
  updated_at?: string;
  timestamp?: string | number;
  // Metadados internos para UI
  _idx?: number;
  _ts?: number; // timestamp em ms para ordenação
  [k: string]: any;
}
