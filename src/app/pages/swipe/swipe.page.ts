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
    const img = ev.target as HTMLImageElement | null;
    if (!img) return;
    if ((img as any).dataset && (img as any).dataset.fallbackApplied) return;
    try {
      (img as any).dataset.fallbackApplied = '1';
    } catch {}
    img.src = 'assets/icon/favicon.png';
  }

  normalizeAvatar(url?: string | null) {
    if (!url) return 'assets/icon/favicon.png';
    if (/^https?:/i.test(url)) return url;
    return `${environment.socketUrl}${url}`;
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
}
