import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../modules/auth/auth.service';
import { GameRecommendationsService } from '../../services/game-recommendations.service';

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

  readonly form = this.fb.group({
    gameName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(255)]],
    platform: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(255)]],
    gameType: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(255)]],
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

    const value = this.form.value;
    const payload = {
      gameName: (value.gameName ?? '').trim(),
      platform: (value.platform ?? '').trim(),
      gameType: (value.gameType ?? '').trim(),
      genre: (value.genre ?? '').trim(),
      notes: value.notes && value.notes.trim().length ? value.notes.trim() : undefined,
    };

    this.submitting = true;
    this.recommendations.create(payload).subscribe({
      next: () => {
        this.submitting = false;
        this.form.reset({ gameName: '', platform: '', gameType: '', genre: '', notes: '' });
        this.presentToast('Recomendação enviada! Obrigado pela sua sugestão.', 'success');
      },
      error: (err) => {
        this.submitting = false;
        const message = err?.error?.errors?.[0]?.msg || err?.error?.error || 'Não foi possível enviar a recomendação.';
        this.presentToast(message, 'danger');
      }
    });
  }

  showError(controlName: string) {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
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
