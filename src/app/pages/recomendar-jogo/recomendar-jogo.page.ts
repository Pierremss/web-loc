import { Component, OnInit, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../modules/auth/auth.service';
import { GameRecommendationsService } from '../../services/game-recommendations.service';

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
  readonly auth = inject(AuthService);

  submitting = false;
  readonly platformOptions = ['PC', 'Mobile', 'Nintendo', 'Xbox', 'PlayStation 5'];
  readonly typeOptions = ['Casual', 'Competitivo'];

  readonly form = this.fb.nonNullable.group({
    gameName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(255)]],
    platforms: this.fb.nonNullable.control<string[]>([], [requireNonEmptyArray]),
    gameType: this.fb.nonNullable.control(this.typeOptions[0], [Validators.required, Validators.minLength(2), Validators.maxLength(255)]),
    genre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(255)]],
    notes: ['', [Validators.maxLength(4000)]],
  });

  ngOnInit() {
    if (this.auth.isAdmin()) {
      this.router.navigateByUrl('/menu-admin');
      return;
    }
  }

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting) return;

    const { gameName, platforms, gameType, genre, notes } = this.form.getRawValue();
    const payload = {
      gameName: gameName.trim(),
      platform: platforms.map((p) => p.trim()).filter(Boolean).join(', '),
      gameType: gameType.trim(),
      genre: genre.trim(),
      notes: notes && notes.trim().length ? notes.trim() : undefined,
    };

    this.submitting = true;
    this.recommendations.create(payload).subscribe({
      next: () => {
        this.submitting = false;
        this.form.reset({ gameName: '', platforms: [] as string[], gameType: this.typeOptions[0], genre: '', notes: '' });
        this.presentToast('Recomendação enviada! Obrigado pela sua sugestão.', 'success');
      },
      error: (err) => {
        this.submitting = false;
        const message = err?.error?.errors?.[0]?.msg || err?.error?.error || 'Não foi possível enviar a recomendação.';
        this.presentToast(message, 'danger');
      }
    });
  }

  showError(controlName: 'gameName' | 'platforms' | 'gameType' | 'genre' | 'notes') {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  isPlatformSelected(option: string): boolean {
    const control = this.form.controls.platforms;
    return control.value.includes(option);
  }

  onTogglePlatform(option: string, checked: boolean) {
    const control = this.form.controls.platforms;
    const current = [...control.value];
    const next = new Set<string>(current);
    if (checked) {
      next.add(option);
    } else {
      next.delete(option);
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
