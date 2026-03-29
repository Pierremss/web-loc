import { Component, Input, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { take } from 'rxjs/operators';
import { GamesAdminFacade } from '../../games-admin.facade';
import { Platform } from '../../../../model/platform';
import { Genre } from '../../../../services/genres.service';
import { GameType } from '../../../../services/game-types.service';

@Component({
  selector: 'app-taxonomy-manager',
  templateUrl: './taxonomy-manager.component.html',
  styleUrls: ['./taxonomy-manager.component.scss'],
})
export class TaxonomyManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly facade = inject(GamesAdminFacade);

  @Input() platforms: Platform[] | null = [];
  @Input() genres: Genre[] | null = [];
  @Input() types: GameType[] | null = [];
  @Input() processing = false;

  protected readonly tabControl = this.fb.nonNullable.control<'platforms' | 'genres' | 'types'>('platforms');

  protected readonly platformForm = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(2)]),
  });

  protected readonly genreForm = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(2)]),
  });

  protected readonly typeForm = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(2)]),
  });

  protected readonly editForm = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(2)]),
  });

  protected editContext: { kind: 'platforms' | 'genres' | 'types'; id: number } | null = null;

  protected startEdit(kind: 'platforms' | 'genres' | 'types', id: number, name: string): void {
    this.editContext = { kind, id };
    this.editForm.patchValue({ name });
  }

  protected cancelEdit(): void {
    this.editContext = null;
    this.editForm.reset({ name: '' });
  }

  protected submitCreate(kind: 'platforms' | 'genres' | 'types'): void {
    const form = this.getForm(kind);
    if (!form) return;
    form.markAllAsTouched();
    if (form.invalid) return;

    const name = (form.value.name ?? '').trim();
    if (!name) return;

    const action$ =
      kind === 'platforms'
        ? this.facade.createPlatform(name)
        : kind === 'genres'
        ? this.facade.createGenre(name)
        : this.facade.createType(name);

    action$.pipe(take(1)).subscribe(success => {
      if (success) {
        form.reset({ name: '' });
      }
    });
  }

  protected submitEdit(): void {
    if (!this.editContext) return;
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) return;

    const name = (this.editForm.value.name ?? '').trim();
    if (!name) return;

    const { kind, id } = this.editContext;
    const action$ =
      kind === 'platforms'
        ? this.facade.updatePlatform(id, name)
        : kind === 'genres'
        ? this.facade.updateGenre(id, name)
        : this.facade.updateType(id, name);

    action$.pipe(take(1)).subscribe(success => {
      if (success) {
        this.cancelEdit();
      }
    });
  }

  protected async remove(kind: 'platforms' | 'genres' | 'types', name: string, id: number): Promise<void> {
    const confirmed = await this.facade.confirmAction({
      message: `Remover "${name}"? Jogos associados perderão essa referência.`,
      confirmText: 'Remover',
      cancelText: 'Cancelar',
    });
    if (!confirmed) return;

    const action$ =
      kind === 'platforms'
        ? this.facade.deletePlatform(id)
        : kind === 'genres'
        ? this.facade.deleteGenre(id)
        : this.facade.deleteType(id);

    action$.pipe(take(1)).subscribe();
  }

  private getForm(kind: 'platforms' | 'genres' | 'types') {
    switch (kind) {
      case 'platforms':
        return this.platformForm;
      case 'genres':
        return this.genreForm;
      case 'types':
        return this.typeForm;
      default:
        return null;
    }
  }
}
