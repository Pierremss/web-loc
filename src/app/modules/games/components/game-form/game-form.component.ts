import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ValidatorFn, Validators } from '@angular/forms';
import { Platform } from '../../../../model/platform';
import { Genre } from '../../../../services/genres.service';
import { GameType } from '../../../../services/game-types.service';
import { Game } from '../../games.service';
import { GamePayload } from '../../games-admin.facade';

@Component({
  selector: 'app-game-form',
  templateUrl: './game-form.component.html',
  styleUrls: ['./game-form.component.scss'],
  standalone:false
})
export class GameFormComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);

  @Input() mode: 'create' | 'edit' = 'create';
  @Input() game: Game | null = null;
  @Input() platforms: Platform[] | null = [];
  @Input() genres: Genre[] | null = [];
  @Input() types: GameType[] | null = [];
  @Input() processing = false;

  @Output() save = new EventEmitter<GamePayload>();
  @Output() cancel = new EventEmitter<void>();

  protected submitted = false;

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(3)]),
    platforms: this.fb.nonNullable.control<number[]>([], { validators: [this.requireSelection()] }),
    genres: this.fb.nonNullable.control<number[]>([]),
    types: this.fb.nonNullable.control<number[]>([]),
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] && this.mode === 'create') {
      this.resetForm();
    }

    if (changes['game'] && this.game && this.mode === 'edit') {
      this.form.patchValue({
        name: this.game.name,
        platforms: (this.game.platforms ?? []).map(platform => platform.id),
        genres: (this.game.genres ?? []).map(genre => genre.id),
        types: (this.game.types ?? []).map(type => type.id),
      });
      this.submitted = false;
    }

    if (changes['platforms'] && this.platforms) {
      this.syncControlWithOptions('platforms', this.platforms.map(item => item.id));
    }

    if (changes['genres'] && this.genres) {
      this.syncControlWithOptions('genres', this.genres.map(item => item.id));
    }

    if (changes['types'] && this.types) {
      this.syncControlWithOptions('types', this.types.map(item => item.id));
    }
  }

  protected onSubmit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, platforms, genres, types } = this.form.getRawValue();
    this.save.emit({
      name: name.trim(),
      platforms,
      genres,
      types,
    });
  }

  protected onCancel(): void {
    this.cancel.emit();
  }

  protected get nameCtrl(): AbstractControl | null {
    return this.form.get('name');
  }

  protected get platformsCtrl(): AbstractControl | null {
    return this.form.get('platforms');
  }

  private resetForm(): void {
    this.form.reset({
      name: '',
      platforms: [],
      genres: [],
      types: [],
    });
    this.submitted = false;
  }

  private syncControlWithOptions(controlName: 'platforms' | 'genres' | 'types', allowedIds: number[]): void {
    const control = this.form.get(controlName);
    if (!control) return;
    const value = (control.value as number[]) ?? [];
    const filtered = value.filter(id => allowedIds.includes(id));
    if (filtered.length !== value.length) {
      control.setValue(filtered);
    }
  }

  private requireSelection(): ValidatorFn {
    return (control: AbstractControl) => {
      const value = control.value as number[] | null | undefined;
      if (value && value.length > 0) {
        return null;
      }
      return { required: true };
    };
  }
}
