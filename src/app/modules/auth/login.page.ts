import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  email = '';
  password = '';
  loading = false;
  error = '';

  readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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

  ionViewWillEnter() {
    const qp = this.route.snapshot.queryParamMap;
    const banned = qp.get('banned');
    const bannedUntil = qp.get('banned_until');
    const deleted = qp.get('deleted');

    if (banned === '1') {
      this.error = this.buildBannedMessage(bannedUntil);
    } else if (deleted === '1') {
      this.error = 'Esta conta foi excluída e não está mais disponível. Se você acredita que isso foi um engano, entre em contato com a administração.';
    }
  }

  submit() {
    this.loading = true;
    this.error = '';
    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.loading = false;
        if (this.auth.user?.is_admin) {
          this.router.navigateByUrl('/home', { replaceUrl: true });
        } else {
          this.router.navigateByUrl('/home', { replaceUrl: true });
        }
      },
      error: (err) => {
        this.loading = false;
        const code = err?.error?.error;
        if (err?.status === 403 && code === 'banned') {
          this.error = this.buildBannedMessage(err?.error?.banned_until);
          return;
        }
        if (err?.status === 403 && code === 'deleted') {
          this.error = 'Esta conta foi excluída e não está mais disponível. Se você acredita que isso foi um engano, entre em contato com a administração.';
          return;
        }

        this.error = err?.error?.message || err?.error?.error || 'Falha no login';
      }
    });
  }

  private buildBannedMessage(bannedUntil?: string | null) {
    const formatted = this.formatDateTime(bannedUntil);
    return formatted
      ? `Acesso suspenso temporariamente até ${formatted}.`
      : 'Acesso suspenso temporariamente.';
  }

  private formatDateTime(value?: string | null) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    // Suporta formatos comuns do MySQL ("YYYY-MM-DD HH:mm:ss") e ISO.
    const isoCandidate = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
    const dt = new Date(isoCandidate);
    const ts = dt.getTime();
    if (Number.isNaN(ts)) return raw;

    const datePart = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dt);
    const timePart = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
    return `${datePart} às ${timePart}`;
  }
}