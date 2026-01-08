import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../../modules/auth/auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { UsersService } from '../../services/users.service';
import { GenresService } from '../../services/genres.service';
import { GameTypesService } from '../../services/game-types.service';
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
  private readonly genresService = inject(GenresService);
  private readonly typesService = inject(GameTypesService);
  private readonly toastCtrl = inject(ToastController);
  private readonly loadingCtrl = inject(LoadingController);

  private headers() {
    return this.auth.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) } : {};
  }

  periodos: { label: string; value: string }[] = [
    { label: 'Manhã', value: 'Manha' },
    { label: 'Tarde', value: 'Tarde' },
    { label: 'Noite', value: 'Noite' },
    { label: 'Madrugada', value: 'Madrugada' },
  ];
  diasSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  horariosSelecionados: { [key: string]: string[] } = {};

  ngOnInit() {
    this.form = { ...this.auth.user };
    if (this.auth.user?.id) {
      this.form.id = this.auth.user.id;
    }
    this.genresService.list().subscribe(list => this.form.genreOptions = list);
    this.typesService.list().subscribe(list => this.form.typeOptions = list);
    this.inicializarHorarios();
    // Exibe skeleton brevemente e libera a UI
    setTimeout(() => { this.loading = false; }, 300);
  }

  isArray(value: any): boolean {
    return Array.isArray(value);
  }

  inicializarHorarios() {
    // Inicializa os horários selecionados a partir do form.available_times
    const parsed = this.parseSchedule(this.form.available_times);
    const normalized = this.normalizeScheduleMap(parsed);
    this.horariosSelecionados = normalized;
    this.form.available_times = JSON.stringify(normalized);
  }

  async salvar() {
    if (!this.hasAtLeastOneScheduleSlot()) {
      this.error = 'Selecione pelo menos um dia e horário em que joga';
      const t = await this.toastCtrl.create({ message: this.error, color: 'warning', duration: 2500 });
      await t.present();
      return;
    }
    const userId = this.getLoggedUserId();
    if (!userId) {
      this.error = 'Sessão inválida. Faça login novamente para continuar.';
      const toast = await this.toastCtrl.create({ message: this.error, color: 'danger', duration: 2500 });
      await toast.present();
      return;
    }
    this.loading = true;
    const loader = await this.loadingCtrl.create({ message: 'Salvando…' });
    await loader.present();
    this.http.put(`/api/users/${userId}`, this.form, this.headers()).subscribe({
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
    const userId = this.getLoggedUserId();
    if (!userId) {
      this.error = 'Sessão inválida. Faça login novamente para continuar.';
      const toast = await this.toastCtrl.create({ message: this.error, color: 'danger', duration: 2500 });
      await toast.present();
      return;
    }
    const loader = await this.loadingCtrl.create({ message: 'Enviando imagem…' });
    await loader.present();
    this.users.uploadAvatar(userId, file).subscribe({
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
    const normalizedValue = this.normalizePeriodValue(periodo);
    if (!normalizedValue) return;
    const base = Array.isArray(this.horariosSelecionados[dia]) ? [...this.horariosSelecionados[dia]] : [];
    let current = this.normalizePeriodList(base);
    if (checked) {
      if (!current.includes(normalizedValue)) current.push(normalizedValue);
    } else {
      current = current.filter((value) => value !== normalizedValue);
    }
    current = this.normalizePeriodList(current);
    const draft = { ...this.horariosSelecionados, [dia]: current };
    const normalized = this.normalizeScheduleMap(draft);
    this.horariosSelecionados = normalized;
    this.form.available_times = JSON.stringify(normalized);
  }

  private readonly periodMap: Record<string, string> = {
    manha: 'Manha',
    tarde: 'Tarde',
    noite: 'Noite',
    madrugada: 'Madrugada',
  };

  private parseSchedule(raw: unknown): Record<string, string[]> {
    if (!raw) return {};
    let value: unknown = raw;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return {};
      try {
        value = JSON.parse(trimmed);
      } catch {
        return {};
      }
    }
    const result: Record<string, string[]> = {};
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const day = 'day' in entry ? String((entry as any).day) : '';
        const periods = Array.isArray((entry as any).periods)
          ? (entry as any).periods.map((p: unknown) => String(p))
          : [];
        if (day && periods.length) {
          result[day] = periods;
        }
      });
      return result;
    }
    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([day, periods]) => {
        if (Array.isArray(periods)) {
          result[day] = periods.map((p) => String(p));
        }
      });
      return result;
    }
    return {};
  }

  private normalizeScheduleMap(source: Record<string, string[]>): Record<string, string[]> {
    const byDayKey = new Map<string, string[]>();
    Object.entries(source || {}).forEach(([dia, periods]) => {
      const key = this.normalizeDayKey(dia);
      if (!Array.isArray(periods)) return;
      const list = this.normalizePeriodList(periods);
      if (!byDayKey.has(key)) {
        byDayKey.set(key, list);
      } else {
        byDayKey.set(key, this.normalizePeriodList([...(byDayKey.get(key) ?? []), ...list]));
      }
    });
    const normalized: Record<string, string[]> = {};
    this.diasSemana.forEach((dia) => {
      const key = this.normalizeDayKey(dia);
      normalized[dia] = this.normalizePeriodList(byDayKey.get(key) ?? []);
    });
    return normalized;
  }

  private hasAtLeastOneScheduleSlot(): boolean {
    return Object.values(this.horariosSelecionados || {}).some((periods) => Array.isArray(periods) && periods.length > 0);
  }

  private normalizePeriodValue(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return '';
    const key = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return this.periodMap[key] || trimmed;
  }

  private normalizePeriodList(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    values.forEach((value) => {
      const normalized = this.normalizePeriodValue(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(normalized);
    });
    const order = new Map(this.periodos.map((option, index) => [option.value, index]));
    result.sort((a, b) => (order.get(a) ?? 100) - (order.get(b) ?? 100));
    return result;
  }

  private normalizeDayKey(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
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

  getPeriodIcon(periodo: string): string {
    const icons: Record<string, string> = {
      'Manha': 'sunny-outline',
      'Tarde': 'partly-sunny-outline',
      'Noite': 'moon-outline',
      'Madrugada': 'moon-outline'
    };
    return icons[periodo] || 'time-outline';
  }

  private getLoggedUserId(): number | null {
    const raw = this.auth.user?.id ?? this.form?.id;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }
}
