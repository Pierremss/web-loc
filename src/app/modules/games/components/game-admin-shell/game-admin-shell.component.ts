import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { InfiniteScrollCustomEvent } from '@ionic/angular';
import { combineLatest, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, take, takeUntil } from 'rxjs/operators';
import { GamesAdminFacade, GameFiltersState, GamePayload } from '../../games-admin.facade';
import { Game } from '../../games.service';

@Component({
  selector: 'app-game-admin-shell',
  templateUrl: './game-admin-shell.component.html',
  styleUrls: ['./game-admin-shell.component.scss'],
  standalone: false
})
export class GameAdminShellComponent implements OnInit, OnDestroy {
  private readonly facade = inject(GamesAdminFacade);
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  protected readonly searchControl = this.fb.nonNullable.control('', { updateOn: 'change' });
  protected readonly filtersGroup = this.fb.nonNullable.group({
    platforms: [[] as number[]],
    genres: [[] as number[]],
    types: [[] as number[]],
    sort: ['name'],
    pageSize: [24],
  });

  protected readonly sortOptions = [
    { value: 'name', label: 'Nome (A-Z)', icon: 'text-outline' },
    { value: '-name', label: 'Nome (Z-A)', icon: 'swap-vertical-outline' },
    { value: '-created_at', label: 'Mais recentes', icon: 'sparkles-outline' },
    { value: 'created_at', label: 'Mais antigos', icon: 'time-outline' },
    { value: '-rating', label: 'Nota RAWG', icon: 'star-half-outline' },
    { value: '-metacritic', label: 'Metacritic', icon: 'pulse-outline' }
  ];

  protected readonly pageSizeOptions = [12, 24, 48, 72];

  protected readonly vm$ = combineLatest({
    loading: this.facade.loading$,
    processing: this.facade.processing$,
    games: this.facade.games$,
    searchTerm: this.facade.searchTerm$,
    platforms: this.facade.platforms$,
    genres: this.facade.genres$,
    types: this.facade.types$,
    meta: this.facade.meta$,
    filters: this.facade.filters$,
    loadingMore: this.facade.loadingMore$
  });

  protected formMode: 'create' | 'edit' = 'create';
  protected currentGame: Game | null = null;
  protected isFormOpen = false;

  ngOnInit(): void {
    this.facade.loadInitialData();

    this.facade.searchTerm$
      .pipe(takeUntil(this.destroy$))
      .subscribe(term => this.searchControl.setValue(term, { emitEvent: false }));

    this.searchControl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(term => this.facade.setSearchTerm(term.trim()));

    this.facade.filters$
      .pipe(takeUntil(this.destroy$))
      .subscribe((filters: GameFiltersState) => {
        this.filtersGroup.setValue({
          platforms: filters.platforms,
          genres: filters.genres,
          types: filters.types,
          sort: filters.sort,
          pageSize: filters.pageSize
        }, { emitEvent: false });
      });

    this.filtersGroup.valueChanges
      .pipe(
        debounceTime(200),
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        takeUntil(this.destroy$)
      )
      .subscribe(value => {
        this.facade.updateFilters({
          platforms: value.platforms ?? [],
          genres: value.genres ?? [],
          types: value.types ?? [],
          sort: value.sort ?? 'name',
          pageSize: value.pageSize ?? 24
        });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected openCreate(): void {
    this.formMode = 'create';
    this.currentGame = null;
    this.isFormOpen = true;
  }

  protected openEdit(game: Game): void {
    this.formMode = 'edit';
    this.currentGame = game;
    this.isFormOpen = true;
  }

  protected closeForm(): void {
    this.isFormOpen = false;
    this.currentGame = null;
    this.formMode = 'create';
  }

  protected handleSave(payload: GamePayload): void {
    const request$ = this.formMode === 'create'
      ? this.facade.createGame(payload)
      : this.facade.updateGame(this.currentGame!.id, payload);

    request$.pipe(take(1)).subscribe(success => {
      if (success) {
        this.closeForm();
      }
    });
  }

  protected async handleDelete(game: Game): Promise<void> {
    const confirmed = await this.facade.confirmAction({
      message: `Tem certeza que deseja remover "${game.name}"? Esta ação não pode ser desfeita.`,
      confirmText: 'Remover',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;
    this.facade.deleteGame(game.id).pipe(take(1)).subscribe();
  }

  protected clearFilters(): void {
    this.facade.resetFilters();
  }

  protected loadMore(event: Event): void {
    const infiniteEvent = event as InfiniteScrollCustomEvent;
    this.facade.loadMore().pipe(take(1)).subscribe(success => {
      infiniteEvent.target.complete();
      if (!success) {
        infiniteEvent.target.disabled = true;
      }
    });
  }
}
