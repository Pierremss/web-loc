import { Injectable, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { BehaviorSubject, EMPTY, Observable, forkJoin, of } from 'rxjs';
import { catchError, finalize, map, tap } from 'rxjs/operators';
import { Game, GameOrder, GamesService, PaginationMeta } from './games.service';
import { PlatformsService } from '../../services/platforms.service';
import { GenresService, Genre } from '../../services/genres.service';
import { GameTypesService, GameType } from '../../services/game-types.service';
import { Platform } from '../../model/platform';

export interface GamePayload {
  name: string;
  platforms: number[];
  genres: number[];
  types: number[];
}

export interface GameFiltersState {
  platforms: number[];
  genres: number[];
  types: number[];
  sort: GameOrder;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class GamesAdminFacade {
  private readonly defaultPageSize = 24;
  private readonly gamesService = inject(GamesService);
  private readonly platformsService = inject(PlatformsService);
  private readonly genresService = inject(GenresService);
  private readonly typesService = inject(GameTypesService);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);

  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  readonly loading$ = this.loadingSubject.asObservable();

  private readonly loadingMoreSubject = new BehaviorSubject<boolean>(false);
  readonly loadingMore$ = this.loadingMoreSubject.asObservable();

  private readonly processingSubject = new BehaviorSubject<boolean>(false);
  readonly processing$ = this.processingSubject.asObservable();

  private readonly gamesSubject = new BehaviorSubject<Game[]>([]);
  readonly games$ = this.gamesSubject.asObservable();

  private readonly metaSubject = new BehaviorSubject<PaginationMeta | null>(null);
  readonly meta$ = this.metaSubject.asObservable();

  private readonly platformsSubject = new BehaviorSubject<Platform[]>([]);
  readonly platforms$ = this.platformsSubject.asObservable();

  private readonly genresSubject = new BehaviorSubject<Genre[]>([]);
  readonly genres$ = this.genresSubject.asObservable();

  private readonly typesSubject = new BehaviorSubject<GameType[]>([]);
  readonly types$ = this.typesSubject.asObservable();

  private readonly filtersSubject = new BehaviorSubject<GameFiltersState>({
    platforms: [],
    genres: [],
    types: [],
    sort: 'name',
    pageSize: this.defaultPageSize,
  });
  readonly filters$ = this.filtersSubject.asObservable();

  private readonly searchTermSubject = new BehaviorSubject<string>('');
  readonly searchTerm$ = this.searchTermSubject.asObservable();

  private state: {
    page: number;
    pageSize: number;
    search: string;
    platforms: number[];
    genres: number[];
    types: number[];
    order: GameOrder;
  } = {
    page: 1,
    pageSize: this.defaultPageSize,
    search: '',
    platforms: [],
    genres: [],
    types: [],
    order: 'name',
  };

  loadInitialData(): void {
    if (this.loadingSubject.value) return;
    this.loadingSubject.next(true);
    forkJoin({
      games: this.gamesService.listWithMeta(this.buildQuery()),
      platforms: this.platformsService.list(),
      genres: this.genresService.list(),
      types: this.typesService.list(),
    })
      .pipe(
        tap(({ games, platforms, genres, types }) => {
          this.gamesSubject.next(games.data);
          this.metaSubject.next(games.meta);
          this.emitFilters();
          this.platformsSubject.next(this.sortByName(platforms));
          this.genresSubject.next(this.sortByName(genres));
          this.typesSubject.next(this.sortByName(types));
        }),
        catchError(err => {
          this.handleHttpError('Não foi possível carregar os dados iniciais', err);
          return EMPTY;
        }),
        finalize(() => this.loadingSubject.next(false))
      )
      .subscribe();
  }

  refreshGames(): void {
    this.fetchGames({ reset: true }).subscribe();
  }

  refreshTaxonomies(): void {
    forkJoin({
      platforms: this.platformsService.list(),
      genres: this.genresService.list(),
      types: this.typesService.list(),
    })
      .pipe(
        tap(({ platforms, genres, types }) => {
          this.platformsSubject.next(this.sortByName(platforms));
          this.genresSubject.next(this.sortByName(genres));
          this.typesSubject.next(this.sortByName(types));
        }),
        catchError(err => {
          this.handleHttpError('Não foi possível atualizar as taxonomias', err);
          return EMPTY;
        })
      )
      .subscribe();
  }

  setSearchTerm(term: string): void {
    const normalized = term.trim();
    if (normalized === this.state.search) return;
    this.searchTermSubject.next(normalized);
    this.state.search = normalized;
    this.fetchGames({ reset: true }).subscribe();
  }

  updateFilters(filters: Partial<{ platforms: (number | string)[]; genres: (number | string)[]; types: (number | string)[]; sort: string | null; pageSize: number | string }>): void {
    const normalized = this.normalizeFilters(filters);
    let changed = false;

    if (normalized.pageSize !== undefined && normalized.pageSize !== this.state.pageSize) {
      this.state.pageSize = normalized.pageSize;
      changed = true;
    }
    if (normalized.sort && normalized.sort !== this.state.order) {
      this.state.order = normalized.sort;
      changed = true;
    }
    if (normalized.platforms && !this.areArraysEqual(normalized.platforms, this.state.platforms)) {
      this.state.platforms = normalized.platforms;
      changed = true;
    }
    if (normalized.genres && !this.areArraysEqual(normalized.genres, this.state.genres)) {
      this.state.genres = normalized.genres;
      changed = true;
    }
    if (normalized.types && !this.areArraysEqual(normalized.types, this.state.types)) {
      this.state.types = normalized.types;
      changed = true;
    }

    if (!changed) return;

    this.state.page = 1;
    this.emitFilters();
    this.fetchGames({ reset: true, setLoading: true }).subscribe();
  }

  resetFilters(): void {
    this.state = {
      ...this.state,
      page: 1,
      pageSize: this.defaultPageSize,
      search: '',
      platforms: [],
      genres: [],
      types: [],
      order: 'name',
    };
    this.searchTermSubject.next('');
    this.emitFilters();
    this.fetchGames({ reset: true, setLoading: true }).subscribe();
  }

  loadMore(): Observable<boolean> {
    const meta = this.metaSubject.value;
    if (this.loadingMoreSubject.value || !meta?.hasNext) return of(false);
    this.loadingMoreSubject.next(true);
    this.state.page = meta.page + 1;
    return this.fetchGames({ append: true }).pipe(
      finalize(() => this.loadingMoreSubject.next(false))
    );
  }

  createGame(payload: GamePayload): Observable<{ success: boolean; gameId?: number }> {
    this.processingSubject.next(true);
    return this.gamesService.create(this.normalizePayload(payload)).pipe(
      tap(() => {
        void this.presentToast('Jogo criado com sucesso', 'success');
        this.refreshGames();
      }),
      map((game: any) => ({ success: true, gameId: game.id })),
      catchError(err => {
        this.handleHttpError('Não foi possível criar o jogo', err);
        return of({ success: false });
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  updateGame(id: number, payload: GamePayload): Observable<boolean> {
    this.processingSubject.next(true);
    return this.gamesService.update(id, this.normalizePayload(payload)).pipe(
      tap(() => {
        void this.presentToast('Jogo atualizado com sucesso', 'success');
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível atualizar o jogo', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  deleteGame(id: number): Observable<boolean> {
    this.processingSubject.next(true);
    return this.gamesService.delete(id).pipe(
      tap(() => {
        void this.presentToast('Jogo removido', 'success');
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível remover o jogo', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  createPlatform(name: string): Observable<boolean> {
    this.processingSubject.next(true);
    return this.platformsService.create({ name }).pipe(
      tap(() => {
        void this.presentToast('Plataforma criada', 'success');
        this.refreshTaxonomies();
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível criar a plataforma', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  updatePlatform(id: number, name: string): Observable<boolean> {
    this.processingSubject.next(true);
    return this.platformsService.update(id, { name }).pipe(
      tap(() => {
        void this.presentToast('Plataforma atualizada', 'success');
        this.refreshTaxonomies();
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível atualizar a plataforma', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  deletePlatform(id: number): Observable<boolean> {
    this.processingSubject.next(true);
    return this.platformsService.delete(id).pipe(
      tap(() => {
        void this.presentToast('Plataforma removida', 'success');
        this.refreshTaxonomies();
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível remover a plataforma', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  createGenre(name: string): Observable<boolean> {
    this.processingSubject.next(true);
    return this.genresService.create({ name }).pipe(
      tap(() => {
        void this.presentToast('Gênero criado', 'success');
        this.refreshTaxonomies();
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível criar o gênero', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  updateGenre(id: number, name: string): Observable<boolean> {
    this.processingSubject.next(true);
    return this.genresService.update(id, { name }).pipe(
      tap(() => {
        void this.presentToast('Gênero atualizado', 'success');
        this.refreshTaxonomies();
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível atualizar o gênero', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  deleteGenre(id: number): Observable<boolean> {
    this.processingSubject.next(true);
    return this.genresService.delete(id).pipe(
      tap(() => {
        void this.presentToast('Gênero removido', 'success');
        this.refreshTaxonomies();
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível remover o gênero', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  createType(name: string): Observable<boolean> {
    this.processingSubject.next(true);
    return this.typesService.create({ name }).pipe(
      tap(() => {
        void this.presentToast('Tipo criado', 'success');
        this.refreshTaxonomies();
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível criar o tipo', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  updateType(id: number, name: string): Observable<boolean> {
    this.processingSubject.next(true);
    return this.typesService.update(id, { name }).pipe(
      tap(() => {
        void this.presentToast('Tipo atualizado', 'success');
        this.refreshTaxonomies();
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível atualizar o tipo', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  deleteType(id: number): Observable<boolean> {
    this.processingSubject.next(true);
    return this.typesService.delete(id).pipe(
      tap(() => {
        void this.presentToast('Tipo removido', 'success');
        this.refreshTaxonomies();
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível remover o tipo', err);
        return of(false);
      }),
      finalize(() => this.processingSubject.next(false))
    );
  }

  async confirmAction(options: { header?: string; message: string; confirmText?: string; cancelText?: string }): Promise<boolean> {
    const alert = await this.alertCtrl.create({
      header: options.header ?? 'Confirmação',
      message: options.message,
      buttons: [
        { text: options.cancelText ?? 'Cancelar', role: 'cancel' },
        { text: options.confirmText ?? 'Confirmar', role: 'confirm' },
      ],
      cssClass: 'games-admin-confirm-alert',
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm';
  }

  private normalizePayload(payload: GamePayload) {
    const dto: any = {
      name: payload.name.trim(),
      platforms: payload.platforms,
      genres: payload.genres.filter(Boolean),
      types: payload.types.filter(Boolean),
    };

    if (!dto.genres.length) delete dto.genres;
    if (!dto.types.length) delete dto.types;

    return dto;
  }

  private sortByName<T extends { name: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }

  private fetchGames(options: { reset?: boolean; append?: boolean; setLoading?: boolean } = {}): Observable<boolean> {
    if (options.reset) {
      this.state.page = 1;
    }
    const query = this.buildQuery();
    if (options.setLoading) this.loadingSubject.next(true);

    return this.gamesService.listWithMeta(query).pipe(
      tap((response) => {
        const combined = options.append
          ? [...this.gamesSubject.value, ...response.data]
          : response.data;
        this.gamesSubject.next(this.deduplicateGames(combined));
        this.metaSubject.next(response.meta);
        this.state.page = response.meta?.page ?? this.state.page;
        this.state.pageSize = response.meta?.pageSize ?? this.state.pageSize;
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível carregar a lista de jogos', err);
        return of(false);
      }),
      finalize(() => {
        if (options.setLoading) this.loadingSubject.next(false);
      })
    );
  }

  private buildQuery() {
    return {
      page: this.state.page,
      pageSize: this.state.pageSize,
      search: this.state.search || undefined,
      platforms: this.state.platforms,
      genres: this.state.genres,
      types: this.state.types,
      order: this.state.order,
    };
  }

  private emitFilters(): void {
    this.filtersSubject.next({
      platforms: [...this.state.platforms],
      genres: [...this.state.genres],
      types: [...this.state.types],
      sort: this.state.order,
      pageSize: this.state.pageSize,
    });
  }

  private normalizeFilters(filters: Partial<{ platforms?: (number | string)[]; genres?: (number | string)[]; types?: (number | string)[]; sort?: string | null; pageSize?: number | string }>) {
    const normalized: Partial<{ platforms: number[]; genres: number[]; types: number[]; sort: GameOrder; pageSize: number }> = {};

    if (filters.platforms !== undefined) normalized.platforms = this.normalizeIdArray(filters.platforms);
    if (filters.genres !== undefined) normalized.genres = this.normalizeIdArray(filters.genres);
    if (filters.types !== undefined) normalized.types = this.normalizeIdArray(filters.types);
    if (filters.sort !== undefined) normalized.sort = this.normalizeOrder(filters.sort);
    if (filters.pageSize !== undefined) normalized.pageSize = this.normalizePageSize(filters.pageSize);

    return normalized;
  }

  private normalizeIdArray(values: any): number[] {
    if (!Array.isArray(values)) return [];
    const ids = values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    return [...new Set(ids)];
  }

  private normalizeOrder(order: string | null | undefined): GameOrder {
    const fallback = this.state.order || 'name';
    if (!order) return fallback;
    const value = String(order).trim() as GameOrder;
    const allowed: GameOrder[] = ['name', '-name', 'released', '-released', 'rating', '-rating', 'metacritic', '-metacritic', 'created_at', '-created_at'];
    return allowed.includes(value) ? value : fallback;
  }

  private normalizePageSize(value: number | string | undefined): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return this.defaultPageSize;
    return Math.min(Math.max(Math.round(numeric), 6), 100);
  }

  private areArraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => x - y);
    return sortedA.every((value, index) => value === sortedB[index]);
  }

  private deduplicateGames(games: Game[]): Game[] {
    const seen = new Set<number>();
    const unique: Game[] = [];
    for (const game of games) {
      if (!seen.has(game.id)) {
        seen.add(game.id);
        unique.push(game);
      }
    }
    return unique;
  }

  private async presentToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'bottom',
      buttons: [{ text: 'Fechar', role: 'cancel' }],
    });
    await toast.present();
  }

  private handleHttpError(defaultMessage: string, error: any) {
    console.error(defaultMessage, error);
    const message = error?.error?.error || error?.message || defaultMessage;
    void this.presentToast(message, 'danger');
  }
}
