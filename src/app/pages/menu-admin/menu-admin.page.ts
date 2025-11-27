import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, LoadingController } from '@ionic/angular';
import { AuthService } from '../../modules/auth/auth.service';
import { UsersService } from '../../services/users.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-menu-admin',
  templateUrl: './menu-admin.page.html',
  styleUrls: ['./menu-admin.page.scss'],
  standalone: false,
})
export class MenuAdminPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toastCtrl = inject(ToastController);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly users = inject(UsersService);

  uploading = false;
  avatarUrl = this.normalizeAvatar(this.auth.user?.avatar_url);

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  get user() {
    return this.auth.user;
  }

  async onFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement | null;
    const file = input?.files && input.files[0];
    if (!file || !this.user?.id) return;
    if (file.size > 20 * 1024 * 1024) {
      await this.presentToast('Imagem maior que 20MB', 'warning');
      input!.value = '';
      return;
    }

    this.uploading = true;
    const loader = await this.loadingCtrl.create({ message: 'Enviando imagem…' });
    await loader.present();

    this.users.uploadAvatar(this.user.id, file).subscribe({
      next: async (res) => {
        this.setAvatar(res.avatar_url);
        await loader.dismiss();
        await this.presentToast('Foto atualizada', 'success');
      },
      error: async (err) => {
        await loader.dismiss();
        const message = err?.error?.error || 'Erro ao enviar imagem';
        await this.presentToast(message, 'danger');
      }
    }).add(() => {
      this.uploading = false;
      if (input) input.value = '';
    });
  }

  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement | null;
    if (!img) return;
    if ((img as any).dataset && (img as any).dataset.fallbackApplied) return;
    try { (img as any).dataset.fallbackApplied = '1'; } catch {}
    img.src = 'assets/icon/favicon.png';
  }

  private setAvatar(rawUrl?: string) {
    const normalized = this.normalizeAvatar(rawUrl);
    this.avatarUrl = normalized;
    if (this.auth.user) {
      this.auth.user = { ...this.auth.user, avatar_url: rawUrl };
      localStorage.setItem('user', JSON.stringify(this.auth.user));
    }
  }

  private normalizeAvatar(url?: string | null) {
    if (!url) return 'assets/icon/favicon.png';
    if (/^https?:/i.test(url)) return url;
    return `${environment.socketUrl}${url}`;
  }

  private async presentToast(message: string, color: 'success' | 'warning' | 'danger') {
    const toast = await this.toastCtrl.create({ message, color, duration: 2000 });
    await toast.present();
  }

}
