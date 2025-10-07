import { Component, OnInit, inject } from '@angular/core';
import { SwipeService } from '../../services/swipe.service';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-swipe',
  templateUrl: './swipe.page.html',
  styleUrls: ['./swipe.page.scss'],
  standalone: false,
})
export class SwipePage implements OnInit {
  items: any[] = [];
  loading = false;
  busy = false;
  dragging = false;
  dx = 0;
  dy = 0;
  angle = 0;
  Math = Math;
  private readonly swipe = inject(SwipeService);

  ngOnInit() {
    void this.load();
  }

  async load() {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await firstValueFrom(this.swipe.deck(20));
      this.items = res?.items || [];
    } catch {
      this.items = this.items || [];
    } finally {
      this.loading = false;
    }
  }

  top() { return this.items[0]; }

  onLike() {
    if (this.busy || !this.top()) return;
    const u = this.top();
    this.busy = true;
    this.swipe.like(u.id).subscribe({
      next: () => {
        this.items.shift();
        this.busy = false;
        if (this.items.length < 5) void this.load();
      },
      error: () => { this.busy = false; }
    });
  }

  onPass() {
    if (this.busy || !this.top()) return;
    const u = this.top();
    this.busy = true;
    this.swipe.pass(u.id).subscribe({
      next: () => {
        this.items.shift();
        this.busy = false;
        if (this.items.length < 5) void this.load();
      },
      error: () => { this.busy = false; }
    });
  }

  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement | null;
    if (!img) return;
    if ((img as any).dataset && (img as any).dataset.fallbackApplied) return;
    try { (img as any).dataset.fallbackApplied = '1'; } catch {}
    img.src = 'assets/icon/favicon.png';
  }

  normalizeAvatar(url?: string | null) {
    if (!url) return 'assets/icon/favicon.png';
    if (/^https?:/i.test(url)) return url;
    return `${environment.socketUrl}${url}`;
  }

  // Gestos
  onDragStart(ev: TouchEvent | MouseEvent) {
    this.dragging = true;
    this.dx = 0; this.dy = 0; this.angle = 0;
  }
  onDragMove(ev: TouchEvent | MouseEvent) {
    if (!this.dragging) return;
    const point = 'touches' in ev ? ev.touches[0] : (ev as MouseEvent);
    // usar movimento relativo via dataset
    const card = document.getElementById('swipe-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    this.dx = point.clientX - cx;
    this.dy = point.clientY - cy;
    this.angle = (this.dx / rect.width) * 15; // máx ~15 graus
  }
  onDragEnd() {
    if (!this.dragging) return;
    this.dragging = false;
    const threshold = 120;
    if (this.dx > threshold) { this.onLike(); }
    else if (this.dx < -threshold) { this.onPass(); }
    this.dx = 0; this.dy = 0; this.angle = 0;
  }

  async onRefresh() {
    await this.load();
  }

  async handlePullRefresh(event: CustomEvent) {
    await this.load();
    const refresher = event.target as any;
    if (refresher && typeof refresher.complete === 'function') {
      refresher.complete();
    }
  }
}
