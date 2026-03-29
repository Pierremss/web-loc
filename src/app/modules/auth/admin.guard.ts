import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  async canActivate(): Promise<boolean | UrlTree> {
    if (!this.auth.isLogged()) {
      await this.presentToast('Faça login para continuar.', 'warning');
      return this.router.parseUrl('/login');
    }

    if (!this.auth.isAdmin()) {
      await this.presentToast('Acesso restrito a administradores.', 'danger');
      return this.router.parseUrl('/home');
    }

    return true;
  }

  private async presentToast(message: string, color: 'warning' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
