import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from './modules/auth/auth.service';
import { environment } from '../environments/environment';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss']
})
export class HomePage implements OnInit {
  loading = true;
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  get themeToggleIcon(): string {
    return this.theme.isDark ? 'sunny-outline' : 'moon-outline';
  }

  get themeToggleText(): string {
    return this.theme.isDark ? 'Tema claro' : 'Tema escuro';
  }

  get themeToggleAria(): string {
    return this.theme.isDark ? 'Ativar tema claro' : 'Ativar tema escuro';
  }

  toggleTheme() {
    this.theme.toggle();
  }

  ngOnInit() {
    // Breve skeleton na abertura
    setTimeout(() => { this.loading = false; }, 250);
  }

  navigateToLogin() {
    // Navigation logic if needed
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
