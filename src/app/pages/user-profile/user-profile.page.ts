import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { UsersService, UserSummary, FavoriteGame } from '../../services/users.service';
import { AuthService } from '../../modules/auth/auth.service';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.page.html',
  styleUrls: ['./user-profile.page.scss'],
  standalone: false,
})
export class UserProfilePage implements OnInit {
  user: UserSummary | null = null;
  favorites: FavoriteGame[] = [];
  meId: number | null = null;
  loading = true;
  error: string | null = null;
  private readonly route = inject(ActivatedRoute);
  private readonly users = inject(UsersService);
  private readonly auth = inject(AuthService);

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.meId = this.auth.user?.id ?? null;
    if (!id || Number.isNaN(id)) { this.error = 'ID inválido'; this.loading = false; return; }
    // Buscar perfil público do usuário
    this.users.getPublicProfile(id).subscribe({
      next: (u) => { this.user = u; this.error = null; },
      error: (e) => {
        // Fallback: se for o próprio usuário, tentar endpoint privado
        if (this.meId && id === this.meId) {
          this.users.getById(id).subscribe({
            next: (u) => { this.user = u; this.error = null; },
            error: (err2) => { this.user = null; this.error = (err2?.error?.error || 'Perfil não encontrado'); },
          }).add(() => { this.loading = false; });
        } else {
          this.user = null;
          this.error = (e?.error?.error || 'Perfil não encontrado');
          this.loading = false;
        }
      },
      complete: () => { this.loading = false; }
    });

    this.loadFavorites(id);
  }

  private loadFavorites(id: number) {
    this.users.getFavorites(id).subscribe({
      next: (list) => { this.favorites = list || []; },
      error: (e) => {
        if (e?.status === 403) {
          this.favorites = [];
        }
      }
    });
  }

  initials(u: UserSummary | null): string {
    if (!u) return '??';
    const source = u.name || u.nickname || '??';
    const parts = source.trim().split(/\s+/);
    const first = parts[0]?.[0] || '?';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] || '');
    return `${first}${last}`.toUpperCase();
  }

  avatarBg(url?: string | null) {
    return url ? `url(${url})` : 'none';
  }

  platformList(u: any): string[] {
    const raw = u?.platforms;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean).map((p) => String(p));
    return String(raw)
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length);
  }

  availabilityChips(u: any): string[] {
    const raw = u?.available_times;
    if (raw == null) return [];

    const normalizeSlot = (slot: any): string | null => {
      const value = String(slot ?? '').trim();
      if (!value) return null;
      const key = value.toLowerCase();
      if (key === 'manha' || key === 'manhã') return 'Manhã';
      if (key === 'tarde') return 'Tarde';
      if (key === 'noite') return 'Noite';
      return value;
    };

    const dayOrder = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const dayAliases: Record<string, string> = {
      'segunda': 'Segunda',
      'terca': 'Terça',
      'terça': 'Terça',
      'quarta': 'Quarta',
      'quinta': 'Quinta',
      'sexta': 'Sexta',
      'sabado': 'Sábado',
      'sábado': 'Sábado',
      'domingo': 'Domingo',
    };

    const toMap = (input: any): Record<string, any> | null => {
      if (!input) return null;
      if (typeof input === 'object') return input as Record<string, any>;
      if (typeof input !== 'string') return null;
      const text = input.trim();
      if (!text) return null;
      if (text.startsWith('{') || text.startsWith('[')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
          // segue fallback
        }
      }
      return null;
    };

    const map = toMap(raw);
    if (!map) {
      const fallback = String(raw).trim();
      return fallback ? [fallback] : [];
    }

    const normalizedEntries: Array<{ day: string; slots: string[] }> = [];
    for (const [k, v] of Object.entries(map)) {
      const dayKey = String(k ?? '').trim();
      if (!dayKey) continue;
      const canonical = dayAliases[dayKey.toLowerCase()] ?? dayKey;
      const arr = Array.isArray(v) ? v : (v == null ? [] : [v]);
      const slots = arr.map(normalizeSlot).filter(Boolean) as string[];
      normalizedEntries.push({ day: canonical, slots });
    }

    const orderIndex = (day: string) => {
      const idx = dayOrder.indexOf(day);
      return idx === -1 ? 999 : idx;
    };

    normalizedEntries.sort((a, b) => orderIndex(a.day) - orderIndex(b.day));

    const chips: string[] = [];
    for (const entry of normalizedEntries) {
      if (!entry.slots.length) continue;
      for (const slot of entry.slots) {
        chips.push(`${entry.day}: ${slot}`);
      }
    }
    return chips;
  }

  joinedDate(u: any): string {
    if (!u?.created_at) return '—';
    const dt = new Date(u.created_at);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  }
}
