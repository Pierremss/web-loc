import { Component, OnInit, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../modules/auth/auth.service';
import { GameRecommendationsService } from '../../services/game-recommendations.service';
import { Genre, GenresService } from '../../services/genres.service';
import { Platform } from '../../model/platform';
import { PlatformsService } from '../../services/platforms.service';
import { GameType, GameTypesService } from '../../services/game-types.service';

function requireNonEmptyArray(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  return Array.isArray(value) && value.length > 0 ? null : { required: true };
}

@Component({
  selector: 'app-recomendar-jogo',
  templateUrl: './recomendar-jogo.page.html',
  styleUrls: ['./recomendar-jogo.page.scss'],
  standalone: false,
})
export class RecomendarJogoPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastController);
  private readonly router = inject(Router);
  private readonly recommendations = inject(GameRecommendationsService);
  private readonly genres = inject(GenresService);
  private readonly platforms = inject(PlatformsService);
  private readonly gameTypes = inject(GameTypesService);
  readonly auth = inject(AuthService);

  submitting = false;
  platformOptions: Platform[] = [];
  typeOptions: GameType[] = [];
  genreOptions: Genre[] = [];

  readonly form = this.fb.nonNullable.group({
    gameName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(255)]],
    platforms: this.fb.nonNullable.control<number[]>([], [requireNonEmptyArray]),
    gameTypes: this.fb.nonNullable.control<number[]>([], [requireNonEmptyArray]),
    genres: this.fb.nonNullable.control<number[]>([], [requireNonEmptyArray]),
    notes: ['', [Validators.maxLength(4000)]],
  });

  ngOnInit() {
    if (this.auth.isAdmin()) {
      this.router.navigateByUrl('/home');
      return;
    }

    this.loadGenres();
    this.loadPlatforms();
    this.loadGameTypes();
  }

  private loadGenres() {
    this.genres.list().subscribe({
      next: (genres) => {
        this.genreOptions = [...(genres || [])].sort((a, b) => a.name.localeCompare(b.name));
      },
      error: () => {
        this.genreOptions = [];
      },
    });
  }

  private loadPlatforms() {
    this.platforms.list().subscribe({
      next: (platforms) => {
        this.platformOptions = [...(platforms || [])].sort((a, b) => a.name.localeCompare(b.name));
      },
      error: () => {
        this.platformOptions = [];
      },
    });
  }

  private loadGameTypes() {
    this.gameTypes.list().subscribe({
      next: (types) => {
        this.typeOptions = [...(types || [])].sort((a, b) => a.name.localeCompare(b.name));
      },
      error: () => {
        this.typeOptions = [];
      },
    });
  }

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting) return;

    const { gameName, platforms, gameTypes, genres, notes } = this.form.getRawValue();
    
    // Buscar nomes das plataformas, tipos e gêneros selecionados
    const platformNames = this.platformOptions
      .filter(p => platforms.includes(p.id))
      .map(p => p.name);
    const typeNames = this.typeOptions
      .filter(t => gameTypes.includes(t.id))
      .map(t => t.name);
    const genreNames = this.genreOptions
      .filter(g => genres.includes(g.id))
      .map(g => g.name);

    const payload = {
      gameName: gameName.trim(),
      platform: platformNames.join(', '),
      gameType: typeNames.join(', '),
      genre: genreNames.join(', '),
      notes: notes && notes.trim().length ? notes.trim() : undefined,
    };

    this.submitting = true;
    this.recommendations.create(payload).subscribe({
      next: () => {
        this.submitting = false;
        this.form.reset({ gameName: '', platforms: [] as number[], gameTypes: [] as number[], genres: [] as number[], notes: '' });
        this.presentToast('Recomendação enviada! Obrigado pela sua sugestão.', 'success');
      },
      error: (err) => {
        this.submitting = false;
        const message = err?.error?.errors?.[0]?.msg || err?.error?.error || 'Não foi possível enviar a recomendação.';
        this.presentToast(message, 'danger');
      }
    });
  }

  showError(controlName: 'gameName' | 'platforms' | 'gameTypes' | 'genres' | 'notes') {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  isPlatformSelected(platform: Platform): boolean {
    return this.form.controls.platforms.value.includes(platform.id);
  }

  onTogglePlatform(platform: Platform, checked: boolean) {
    const control = this.form.controls.platforms;
    const current = [...control.value];
    const next = new Set<number>(current);
    if (checked) {
      next.add(platform.id);
    } else {
      next.delete(platform.id);
    }
    control.setValue(Array.from(next));
    control.markAsDirty();
    control.markAsTouched();
    control.updateValueAndValidity();
  }

  isGameTypeSelected(type: GameType): boolean {
    return this.form.controls.gameTypes.value.includes(type.id);
  }

  onToggleGameType(type: GameType, checked: boolean) {
    const control = this.form.controls.gameTypes;
    const current = [...control.value];
    const next = new Set<number>(current);
    if (checked) {
      next.add(type.id);
    } else {
      next.delete(type.id);
    }
    control.setValue(Array.from(next));
    control.markAsDirty();
    control.markAsTouched();
    control.updateValueAndValidity();
  }

  isGenreSelected(genre: Genre): boolean {
    return this.form.controls.genres.value.includes(genre.id);
  }

  onToggleGenre(genre: Genre, checked: boolean) {
    const control = this.form.controls.genres;
    const current = [...control.value];
    const next = new Set<number>(current);
    if (checked) {
      next.add(genre.id);
    } else {
      next.delete(genre.id);
    }
    control.setValue(Array.from(next));
    control.markAsDirty();
    control.markAsTouched();
    control.updateValueAndValidity();
  }

  private async presentToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toast.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    toast.present();
  }
}
