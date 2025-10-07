import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../../modules/auth/auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { UsersService } from '../../services/users.service';
import { environment } from '../../../environments/environment';
import { ToastController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-editar-perfil',
  templateUrl: './editar-perfil.page.html',
  styleUrls: ['./editar-perfil.page.scss'],
  standalone: false,
})
export class EditarPerfilPage implements OnInit {
  form: any = {};
  loading = true;
  error = '';
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly users = inject(UsersService);
  private readonly toastCtrl = inject(ToastController);
  private readonly loadingCtrl = inject(LoadingController);

  private headers() {
    return this.auth.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) } : {};
  }

  periodos = ['Madrugada', 'Manhã', 'Tarde', 'Noite'];
  diasSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  horariosSelecionados: { [key: string]: string[] } = {};

  ngOnInit() {
    this.form = { ...this.auth.user };
    this.inicializarHorarios();
  // Exibe skeleton brevemente e libera a UI
  setTimeout(() => { this.loading = false; }, 300);
  }

  isArray(value: any): boolean {
    return Array.isArray(value);
  }

  inicializarHorarios() {
    // Inicializa os horários selecionados a partir do form.available_times
    if (this.form.available_times) {
      try {
        const horarios = JSON.parse(this.form.available_times);
        this.horariosSelecionados = horarios;
      } catch (e) {
        this.horariosSelecionados = {};
      }
    } else {
      this.horariosSelecionados = {};
    }
  }

  async salvar() {
    this.loading = true;
    const loader = await this.loadingCtrl.create({ message: 'Salvando…' });
    await loader.present();
    this.http.put(`/api/users/${this.form.id}`, this.form, this.headers()).subscribe({
      next: async (updated: any) => {
        // Atualiza estado local (form)
        this.form = { ...updated };
        // Sincroniza auth.user e localStorage para refletir mudanças ao reabrir
        if (this.auth.user) {
          this.auth.user = { ...this.auth.user, ...updated } as any;
          localStorage.setItem('user', JSON.stringify(this.auth.user));
        }
        this.loading = false;
        await loader.dismiss();
        const t = await this.toastCtrl.create({ message: 'Perfil atualizado', color: 'success', duration: 2000 });
        await t.present();
        this.router.navigate(['/jogador-perfil']);
      },
      error: async (err) => {
        this.error = err?.error?.error || 'Erro ao salvar perfil';
        this.loading = false;
        await loader.dismiss();
        const t = await this.toastCtrl.create({ message: this.error, color: 'danger', duration: 2500 });
        await t.present();
      }
    });
  }

  async onFile(ev: any) {
    const file: File = ev.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      this.error = 'Imagem maior que 20MB';
      const t = await this.toastCtrl.create({ message: this.error, color: 'warning', duration: 2500 });
      await t.present();
      return;
    }
    const loader = await this.loadingCtrl.create({ message: 'Enviando imagem…' });
    await loader.present();
    this.users.uploadAvatar(this.form.id, file).subscribe({
      next: async res => {
        this.form.avatar_url = res.avatar_url;
        if (this.auth.user) {
          this.auth.user.avatar_url = res.avatar_url;
          localStorage.setItem('user', JSON.stringify(this.auth.user));
        }
        await loader.dismiss();
        const t = await this.toastCtrl.create({ message: 'Avatar atualizado', color: 'success', duration: 2000 });
        await t.present();
      },
      error: async err => {
        this.error = err?.error?.error || 'Erro no upload do avatar';
        await loader.dismiss();
        const t = await this.toastCtrl.create({ message: this.error, color: 'danger', duration: 2500 });
        await t.present();
      }
    });
  }

  onHorarioChange(dia: string, periodo: string, checked: boolean) {
    if (!this.horariosSelecionados[dia]) {
      this.horariosSelecionados[dia] = [];
    }

    if (checked) {
      if (!this.horariosSelecionados[dia].includes(periodo)) {
        this.horariosSelecionados[dia].push(periodo);
      }
    } else {
      this.horariosSelecionados[dia] = this.horariosSelecionados[dia].filter(p => p !== periodo);
    }

    // Atualiza o form.available_times com os horários selecionados
    this.form.available_times = JSON.stringify(this.horariosSelecionados);
  }

  normalizeAvatar(url?: string | null) {
    if (!url) return 'assets/icon/favicon.png';
    if (/^https?:/i.test(url)) return url;
    return `${environment.socketUrl}${url}`;
  }

  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement | null;
    if (!img) return;
    if ((img as any).dataset && (img as any).dataset.fallbackApplied) return;
    try { (img as any).dataset.fallbackApplied = '1'; } catch {}
    img.src = 'assets/icon/favicon.png';
  }
}
