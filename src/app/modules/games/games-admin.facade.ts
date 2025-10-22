import { Injectable, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { BehaviorSubject, EMPTY, Observable, forkJoin, of } from 'rxjs';
import { catchError, finalize, map, tap } from 'rxjs/operators';
import { Game, GamesService } from './games.service';
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

@Injectable({ providedIn: 'root' })
export class GamesAdminFacade {
  private readonly gamesService = inject(GamesService);
  private readonly platformsService = inject(PlatformsService);
  private readonly genresService = inject(GenresService);
  private readonly typesService = inject(GameTypesService);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);

  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  readonly loading$ = this.loadingSubject.asObservable();

  private readonly processingSubject = new BehaviorSubject<boolean>(false);
  readonly processing$ = this.processingSubject.asObservable();

  private readonly gamesSubject = new BehaviorSubject<Game[]>([]);
  readonly games$ = this.gamesSubject.asObservable();

  private readonly filteredGamesSubject = new BehaviorSubject<Game[]>([]);
  readonly filteredGames$ = this.filteredGamesSubject.asObservable();

  private readonly platformsSubject = new BehaviorSubject<Platform[]>([]);
  readonly platforms$ = this.platformsSubject.asObservable();

  private readonly genresSubject = new BehaviorSubject<Genre[]>([]);
  readonly genres$ = this.genresSubject.asObservable();

  private readonly typesSubject = new BehaviorSubject<GameType[]>([]);
  readonly types$ = this.typesSubject.asObservable();

  private readonly searchTermSubject = new BehaviorSubject<string>('');
  readonly searchTerm$ = this.searchTermSubject.asObservable();

  loadInitialData(): void {
    if (this.loadingSubject.value) return;
    this.loadingSubject.next(true);
    forkJoin({
      games: this.gamesService.list(),
      platforms: this.platformsService.list(),
      genres: this.genresService.list(),
      types: this.typesService.list(),
    })
      .pipe(
        tap(({ games, platforms, genres, types }) => {
          this.gamesSubject.next(this.sortGames(games));
          this.platformsSubject.next(this.sortByName(platforms));
          this.genresSubject.next(this.sortByName(genres));
          this.typesSubject.next(this.sortByName(types));
          this.applyFilter(this.searchTermSubject.value);
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
    this.gamesService
      .list()
      .pipe(
        tap(games => {
          this.gamesSubject.next(this.sortGames(games));
          this.applyFilter(this.searchTermSubject.value);
        }),
        catchError(err => {
          this.handleHttpError('Não foi possível atualizar a lista de jogos', err);
          return EMPTY;
        })
      )
      .subscribe();
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
    this.searchTermSubject.next(term);
    this.applyFilter(term);
  }

  createGame(payload: GamePayload): Observable<boolean> {
    this.processingSubject.next(true);
    return this.gamesService.create(this.normalizePayload(payload)).pipe(
      tap(() => {
        void this.presentToast('Jogo criado com sucesso', 'success');
        this.refreshGames();
      }),
      map(() => true),
      catchError(err => {
        this.handleHttpError('Não foi possível criar o jogo', err);
        return of(false);
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

  private applyFilter(term: string) {
    const games = this.gamesSubject.value;
    if (!term) {
      this.filteredGamesSubject.next(games);
      return;
    }
    const lowered = term.toLowerCase();
    this.filteredGamesSubject.next(
      games.filter(game => game.name.toLowerCase().includes(lowered))
    );
  }

  private sortGames(games: Game[]): Game[] {
    return [...games].sort((a, b) => a.name.localeCompare(b.name));
  }

  private sortByName<T extends { name: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
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
