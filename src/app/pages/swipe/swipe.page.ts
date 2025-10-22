import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { IonModal, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PlatformsService } from '../../services/platforms.service';
import { SwipeDeckFilters, SwipeDeckItem, SwipeProfile, SwipeService } from '../../services/swipe.service';
import { Platform } from '../../model/platform';

interface CompatibilitySummary {
  label: string;
  details: string;
}

@Component({
  selector: 'app-swipe',
  templateUrl: './swipe.page.html',
  styleUrls: ['./swipe.page.scss'],
  standalone: false,
})
export class SwipePage implements OnInit {
  items: SwipeDeckItem[] = [];
  loading = false;
  busy = false;
  dragging = false;
  dx = 0;
  dy = 0;
  angle = 0;
  Math = Math;

  filters: SwipeDeckFilters = { limit: 20, minCompatibility: 0 };
  platformOptions: Platform[] = [];
  styleOptions = ['Casual', 'Competitivo', 'Cooperativo'];
  periodOptions = ['Manha', 'Tarde', 'Noite', 'Madrugada'];
  compatibilityFloor = 0;
  private readonly dayOrder = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  private readonly dayLabels: Record<string, string> = {
    Segunda: 'Seg.',
    'Segunda-feira': 'Seg.',
    Terça: 'Ter.',
    'Terça-feira': 'Ter.',
    Quarta: 'Qua.',
    'Quarta-feira': 'Qua.',
    Quinta: 'Qui.',
    'Quinta-feira': 'Qui.',
    Sexta: 'Sex.',
    'Sexta-feira': 'Sex.',
    'Sábado': 'Sáb.',
    Domingo: 'Dom.'
  };
  private readonly periodLabels: Record<string, string> = {
    manha: 'Manhã',
    manhã: 'Manhã',
    tarde: 'Tarde',
    noite: 'Noite',
    madrugada: 'Madrugada'
  };

  profileDetails: SwipeProfile | null = null;
  profileLoading = false;
  isProfileOpen = false;
  isFilterOpen = false;

  private readonly swipe = inject(SwipeService);
  private readonly platforms = inject(PlatformsService);
  private readonly toast = inject(ToastController);
  @ViewChild('profileModal') profileModal?: IonModal;
  @ViewChild('filterModal') filterModal?: IonModal;

  ngOnInit() {
    this.loadPlatforms();
    void this.load('initial');
  }

  private loadPlatforms() {
    this.platforms.list().subscribe({
      next: (platforms) => {
        this.platformOptions = [...platforms].sort((a, b) => a.name.localeCompare(b.name));
      },
    });
  }

  async load(reason: 'initial' | 'refresh' | 'auto' = 'initial') {
    if (this.loading) return;
    this.loading = true;
    try {
      const payload = await firstValueFrom(this.swipe.deck(this.filters));
      this.items = payload?.items || [];
      if (!this.items.length && reason === 'refresh') {
        await this.presentToast('Nenhum jogador disponível no momento. Tente novamente em instantes.');
      }
    } catch {
      if (reason !== 'auto') {
        await this.presentToast('Não foi possível atualizar os jogadores.', 'danger');
      }
      this.items = this.items || [];
    } finally {
      this.loading = false;
    }
  }

  async handlePullRefresh(event: CustomEvent) {
    await this.load('refresh');
    const refresher = event.target as { complete?: () => void } | null;
    refresher?.complete?.();
  }

  onRefresh() {
    void this.load('refresh');
  }

  top(): SwipeDeckItem | undefined {
    return this.items[0];
  }

  compatibilitySummary(item?: SwipeDeckItem): CompatibilitySummary {
    if (!item) return { label: '', details: '' };
    const label = `${item.compatibility.score}% compatível`;
    const segments: string[] = [];
    if (item.compatibility.commonGames.length) {
      segments.push(`${item.compatibility.commonGames.length} jogo(s) em comum`);
    }
    if (item.compatibility.sharedPlatforms.length) {
      segments.push(`${item.compatibility.sharedPlatforms.length} plataforma(s)`);
    }
    if (item.compatibility.styleMatch) segments.push('Estilo igual');
    if (item.compatibility.scheduleOverlap.length) segments.push('Horários compatíveis');
    return { label, details: segments.join(' • ') };
  }

  onLike() {
    if (this.busy) return;
    const current = this.top();
    if (!current) return;
    this.busy = true;
    this.swipe.like(current.id).subscribe({
      next: (res) => {
        this.pop();
        if (res?.matched) {
          void this.presentToast(res.message || 'É um match!', 'dark');
        }
      },
      error: async () => {
        this.busy = false;
        await this.presentToast('Erro ao enviar like', 'danger');
      },
    });
  }

  onPass() {
    if (this.busy) return;
    const current = this.top();
    if (!current) return;
    this.busy = true;
    this.swipe.pass(current.id).subscribe({
      next: () => this.pop(),
      error: async () => {
        this.busy = false;
        await this.presentToast('Erro ao pular jogador', 'danger');
      },
    });
  }

  private pop() {
    this.items.shift();
    this.busy = false;
    this.profileDetails = null;
    this.isProfileOpen = false;
    if (this.items.length < 5) void this.load('auto');
  }

  onImgError(ev: Event) {
    const target = ev.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (target.dataset['fallbackApplied']) return;
    try {
      target.dataset['fallbackApplied'] = '1';
    } catch {}
    target.src = 'assets/icon/favicon.png';
  }

  normalizeAvatar(url?: string | null) {
    if (!url) return 'assets/icon/favicon.png';
    if (/^https?:/i.test(url)) return url;
    return `${environment.socketUrl}${url}`;
  }

  availabilitySummary(raw?: string | null): string {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return '';
    const schedule = this.parseScheduleObject(value);
    if (schedule) {
      const summary = this.buildScheduleSummary(schedule);
      if (summary) return summary;
    }
    return this.formatFallbackSchedule(value);
  }

  platformList(item?: SwipeDeckItem) {
    if (!item) return '';
    return item.platforms.map((p) => p.name).join(', ');
  }

  async openProfile(item: SwipeDeckItem) {
    if (this.profileLoading) return;
    this.profileLoading = true;
    try {
      this.profileDetails = await firstValueFrom(this.swipe.profile(item.id));
      this.isProfileOpen = true;
    } catch {
      await this.presentToast('Não foi possível carregar o perfil.', 'danger');
    } finally {
      this.profileLoading = false;
    }
  }

  closeProfile() {
    this.isProfileOpen = false;
    if (!this.profileLoading) {
      this.profileDetails = null;
    }
  }

  profileSchedules() {
    if (!this.profileDetails) return [];
    return this.profileDetails.availableTimes;
  }

  profileFavoriteGames() {
    return this.profileDetails?.favoriteGames ?? [];
  }

  onProfileAction(action: 'like' | 'pass') {
    const current = this.top();
    if (!current) {
      this.closeProfile();
      return;
    }
    if (action === 'like') this.onLike();
    if (action === 'pass') this.onPass();
    this.closeProfile();
  }

  applyFilters() {
    this.filters.minCompatibility = this.compatibilityFloor;
    this.filters.platformIds = (this.filters.platformIds || [])
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0);
    this.filters.limit = 20;
    void this.load('refresh');
    this.isFilterOpen = false;
    this.filterModal?.dismiss();
  }

  resetFilters() {
    this.filters = { limit: 20, minCompatibility: 0 };
    this.compatibilityFloor = 0;
    void this.load('refresh');
    this.isFilterOpen = false;
    this.filterModal?.dismiss();
  }

  openFilters() {
    this.isFilterOpen = true;
  }

  closeFilters() {
    this.isFilterOpen = false;
    this.filterModal?.dismiss();
  }

  onDragStart(_event?: TouchEvent | MouseEvent) {
    this.dragging = true;
    this.dx = 0;
    this.dy = 0;
    this.angle = 0;
  }

  onDragMove(ev: TouchEvent | MouseEvent) {
    if (!this.dragging) return;
    const point = 'touches' in ev ? ev.touches[0] : (ev as MouseEvent);
    const card = document.getElementById('swipe-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    this.dx = point.clientX - cx;
    this.dy = point.clientY - cy;
    this.angle = (this.dx / rect.width) * 15;
  }

  onDragEnd(_event?: TouchEvent | MouseEvent) {
    if (!this.dragging) return;
    this.dragging = false;
    const threshold = 120;
    if (this.dx > threshold) {
      this.onLike();
    } else if (this.dx < -threshold) {
      this.onPass();
    }
    this.dx = 0;
    this.dy = 0;
    this.angle = 0;
  }

  private async presentToast(message: string, color: 'dark' | 'danger' = 'dark') {
    try {
      const toast = await this.toast.create({
        message,
        color,
        duration: 2500,
        position: 'bottom',
      });
      await toast.present();
    } catch {}
  }

  private parseScheduleObject(raw: string): Record<string, string[]> | null {
    const first = raw.trim()[0];
    if (first !== '{' && first !== '[') return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const result: Record<string, string[]> = {};
        parsed.forEach((entry) => {
          if (!entry || typeof entry !== 'object') return;
          const day = 'day' in entry ? String((entry as any).day) : '';
          const periods = Array.isArray((entry as any).periods)
            ? (entry as any).periods.map((p: unknown) => String(p))
            : [];
          if (day && periods.length) {
            result[day] = periods;
          }
        });
        return Object.keys(result).length ? result : null;
      }
      if (parsed && typeof parsed === 'object') {
        const result: Record<string, string[]> = {};
        Object.entries(parsed as Record<string, unknown>).forEach(([day, periods]) => {
          if (Array.isArray(periods) && periods.length) {
            result[day] = periods.map((p) => String(p));
          }
        });
        return Object.keys(result).length ? result : null;
      }
    } catch {}
    return null;
  }

  private buildScheduleSummary(schedule: Record<string, string[]>): string {
    const segments: string[] = [];
    this.dayOrder.forEach((day) => {
      const formatted = this.formatPeriods(schedule[day]);
      if (!formatted.length) return;
      const label = this.dayLabels[day] || this.normalizeDayLabel(day);
      segments.push(`${label}: ${formatted.join(', ')}`);
    });
    if (!segments.length) {
      Object.entries(schedule).forEach(([day, periods]) => {
        const formatted = this.formatPeriods(periods);
        if (!formatted.length) return;
        const label = this.dayLabels[day] || this.normalizeDayLabel(day);
        segments.push(`${label}: ${formatted.join(', ')}`);
      });
    }
    return segments.join(' • ').trim();
  }

  private formatFallbackSchedule(text: string): string {
    const cleaned = text
      .replace(/[{}\[\]"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return '';
    const normalizedSeparators = cleaned.replace(/,\s*(?=[^:]+:)/g, '; ');
    const segments = normalizedSeparators.split(/;|\||•/).map((segment) => segment.trim()).filter(Boolean);
    if (!segments.length) {
      return this.normalizeDayAndPeriod(cleaned);
    }
    const formatted = segments.map((segment) => {
      const [dayPart, rest] = segment.split(':');
      if (!rest) {
        return this.normalizeDayAndPeriod(segment);
      }
      const dayLabel = this.normalizeDayLabel(dayPart);
      const periods = this.uniqueSequence(
        rest.split(/,|\//)
          .map((value) => this.normalizePeriodLabel(value))
          .filter(Boolean)
      );
      return periods.length ? `${dayLabel}: ${periods.join(', ')}` : dayLabel;
    });
    return formatted.join(' • ');
  }

  private formatPeriods(periods: unknown): string[] {
    if (!Array.isArray(periods)) return [];
    const formatted = periods
      .map((period) => this.normalizePeriodLabel(String(period)))
      .filter(Boolean);
    return this.uniqueSequence(formatted);
  }

  private normalizePeriodLabel(period: string): string {
    const trimmed = period.trim();
    if (!trimmed) return '';
    const normalized = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return this.periodLabels[normalized] || this.titleize(trimmed);
  }

  private normalizeDayLabel(day: string | undefined): string {
    if (!day) return '';
    const trimmed = day.trim();
    if (!trimmed) return '';
    const normalized = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const map: Record<string, string> = {
      segunda: 'Segunda',
      'segunda-feira': 'Segunda',
      seg: 'Segunda',
      terca: 'Terça',
      'terca-feira': 'Terça',
      ter: 'Terça',
      quarta: 'Quarta',
      'quarta-feira': 'Quarta',
      qua: 'Quarta',
      quinta: 'Quinta',
      'quinta-feira': 'Quinta',
      qui: 'Quinta',
      sexta: 'Sexta',
      'sexta-feira': 'Sexta',
      sex: 'Sexta',
      sabado: 'Sábado',
      sab: 'Sábado',
      domingo: 'Domingo',
      dom: 'Domingo'
    };
    return map[normalized] || this.titleize(trimmed);
  }

  private normalizeDayAndPeriod(fragment: string): string {
    if (!fragment.includes(':')) {
      return this.uniqueSequence(
        fragment
          .split(/,|\//)
          .map((piece) => this.normalizePeriodLabel(piece))
          .filter(Boolean)
      ).join(', ');
    }
    return fragment
      .split(/\s*•\s*|;\s*|\|\s*/)
      .map((segment) => {
        const [dayPart, rest] = segment.split(':');
        if (!dayPart) return '';
        const dayLabel = this.normalizeDayLabel(dayPart);
        if (!rest) return dayLabel;
        const periods = this.uniqueSequence(
          rest.split(/,|\//)
            .map((piece) => this.normalizePeriodLabel(piece))
            .filter(Boolean)
        );
        return periods.length ? `${dayLabel}: ${periods.join(', ')}` : dayLabel;
      })
      .filter(Boolean)
      .join(' • ');
  }

  private titleize(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return '';
    return trimmed.replace(/(^|\s|\-)([a-zá-ú])/g, (_match: string, prefix: string, letter: string) => {
      const safePrefix = prefix ?? '';
      const safeLetter = letter ?? '';
      return `${safePrefix}${safeLetter.toUpperCase()}`;
    });
  }

  private uniqueSequence(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    values.forEach((value) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      result.push(value);
    });
    return result;
  }
}
