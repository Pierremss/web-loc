import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { combineLatest, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, take, takeUntil } from 'rxjs/operators';
import { GamesAdminFacade, GamePayload } from '../../games-admin.facade';
import { Game } from '../../games.service';

@Component({
  selector: 'app-game-admin-shell',
  templateUrl: './game-admin-shell.component.html',
  styleUrls: ['./game-admin-shell.component.scss'],
  standalone:false
})
export class GameAdminShellComponent implements OnInit, OnDestroy {
  private readonly facade = inject(GamesAdminFacade);
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  protected readonly searchControl = this.fb.nonNullable.control('', { updateOn: 'change' });
  protected readonly vm$ = combineLatest({
    loading: this.facade.loading$,
    processing: this.facade.processing$,
    games: this.facade.filteredGames$,
    searchTerm: this.facade.searchTerm$,
    platforms: this.facade.platforms$,
    genres: this.facade.genres$,
    types: this.facade.types$,
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
      cancelText: 'Cancelar',
    });
    if (!confirmed) return;
    this.facade.deleteGame(game.id).pipe(take(1)).subscribe();
  }
}
