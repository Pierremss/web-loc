import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../modules/auth/auth.service';

type ResetStage = 'request' | 'code' | 'password' | 'success';

function passwordsMatchValidator(control: AbstractControl) {
  const password = control.get('password')?.value;
  const confirm = control.get('confirmPassword')?.value;
  if (!password || !confirm) return null;
  return password === confirm ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-recuperar-senha',
  templateUrl: './recuperar-senha.page.html',
  styleUrls: ['./recuperar-senha.page.scss'],
  standalone: false,
})
export class RecuperarSenhaPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastController);
  private readonly router = inject(Router);

  stage: ResetStage = 'request';
  sending = false;
  resetting = false;
  emailSent?: string;
  expiresAt?: string | null;
  expiresInMinutes?: number;
  private codeValue?: string;

  readonly requestForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  readonly codeForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]]
  });

  readonly passwordForm = this.fb.group(
    {
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: passwordsMatchValidator }
  );

  get emailControl() {
    return this.requestForm.get('email');
  }

  get codeControl() {
    return this.codeForm.get('code');
  }

  get passwordControl() {
    return this.passwordForm.get('password');
  }

  get confirmPasswordControl() {
    return this.passwordForm.get('confirmPassword');
  }

  get passwordMismatch() {
    return this.passwordForm.hasError('passwordMismatch') && this.confirmPasswordControl?.touched;
  }

  get stepLabel(): string | null {
    if (this.stage === 'success') {
      return null;
    }

    const steps: Record<Exclude<ResetStage, 'success'>, string> = {
      request: 'Passo 1 de 3',
      code: 'Passo 2 de 3',
      password: 'Passo 3 de 3'
    } as const;

    return steps[this.stage];
  }

  submitEmail() {
    if (this.requestForm.invalid || this.sending) {
      this.requestForm.markAllAsTouched();
      return;
    }

    const email = String(this.emailControl?.value ?? '').trim().toLowerCase();
    if (!email) {
      this.presentToast('Informe um e-mail válido.', 'warning');
      return;
    }

    this.requestForm.patchValue({ email });

    this.sending = true;
    this.auth.requestPasswordReset(email)
      .pipe(finalize(() => (this.sending = false)))
      .subscribe({
        next: (res) => {
          this.emailSent = email;
          this.expiresAt = res.expiresAt ?? null;
          this.expiresInMinutes = res.expiresInMinutes;
          this.stage = 'code';
          this.codeForm.reset();
          this.passwordForm.reset();
          this.codeValue = undefined;
          this.presentToast(res.message || 'Se encontrarmos este e-mail, enviaremos um código para redefinição.', 'success');
        },
        error: (err) => {
          const message = err?.error?.error || 'Não foi possível iniciar a redefinição agora. Tente novamente em instantes.';
          this.presentToast(message, 'danger');
        }
      });
  }

  resendCode() {
    if (!this.emailSent || this.sending) return;
    this.requestForm.patchValue({ email: this.emailSent });
    this.submitEmail();
  }

  backToEmail() {
    this.stage = 'request';
    this.codeForm.reset();
    this.passwordForm.reset();
    this.emailSent = undefined;
    this.expiresAt = undefined;
    this.codeValue = undefined;
  }

  backToCode() {
    if (this.stage === 'password') {
      this.stage = 'code';
      this.codeValue = undefined;
      this.passwordForm.reset();
    }
  }

  submitCode() {
    if (this.codeForm.invalid || this.resetting) {
      this.codeForm.markAllAsTouched();
      return;
    }

    const email = this.emailSent;
    if (!email) {
      this.presentToast('Informe o e-mail novamente para continuar.', 'warning');
      this.stage = 'request';
      return;
    }

    const code = String(this.codeControl?.value ?? '').trim();
    if (!code) {
      this.presentToast('Informe o código enviado para o e-mail cadastrado.', 'warning');
      return;
    }

    this.codeValue = code;
    this.stage = 'password';
    this.passwordForm.reset();
  }

  submitReset() {
    if (this.passwordForm.invalid || this.resetting) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const email = this.emailSent;
    if (!email) {
      this.presentToast('Informe o e-mail novamente para continuar.', 'warning');
      this.stage = 'request';
      return;
    }

    const code = this.codeValue || '';
    if (!code) {
      this.presentToast('Confirme o código antes de criar uma nova senha.', 'warning');
      this.stage = 'code';
      return;
    }

    const password = String(this.passwordControl?.value ?? '');

    this.resetting = true;
    this.auth.resetPassword({ email, code, password })
      .pipe(finalize(() => (this.resetting = false)))
      .subscribe({
        next: (res) => {
          this.stage = 'success';
          this.presentToast(res.message || 'Senha atualizada com sucesso.', 'success');
        },
        error: (err) => {
          const message = err?.error?.error || 'Não foi possível atualizar a senha. Confirme o código e tente novamente.';
          this.presentToast(message, 'danger');
        }
      });
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'warning' | 'primary' = 'primary') {
    const toast = await this.toast.create({
      message,
      color,
      duration: 3000,
      position: 'bottom'
    });
    await toast.present();
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
