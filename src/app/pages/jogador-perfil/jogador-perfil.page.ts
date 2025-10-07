import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../modules/auth/auth.service';
import { GamesService } from '../../modules/games/games.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-jogador-perfil',
  templateUrl: './jogador-perfil.page.html',
  styleUrls: ['./jogador-perfil.page.scss'],
  standalone: false,
})
export class JogadorPerfilPage implements OnInit {
  // Tipagem dos favoritos com suporte a timestamp
  favoritos: FavoriteGame[] = [];
  favoritosFiltrados: FavoriteGame[] = [];
  todosJogos: any[] = [];
  readonly auth = inject(AuthService);
  private readonly gamesService = inject(GamesService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  user: any = this.auth.user;
  novoFavorito: number | null = null;
  loading = false;
  error = '';
  filtro = '';
  ordenacao: 'az' | 'recent' = 'az';

  private headers() {
    return this.auth.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) } : {};
  }

  ngOnInit() {
    this.carregarFavoritos();
    this.gamesService.list().subscribe(jogos => this.todosJogos = jogos);
  }

  carregarFavoritos() {
    this.loading = true;
    this.http.get<any[]>(`/api/users/${this.user.id}/favoritos`, this.headers()).subscribe({
      next: favs => {
        // Mapeia possíveis campos de data vindos do backend para _ts
        this.favoritos = (favs || []).map((f: any, idx: number) => {
          const rawTs = f.created_at || f.added_at || f.favorited_at || f.updated_at || f.timestamp;
          let ts = 0;
          if (rawTs) {
            const parsed = new Date(rawTs).getTime();
            ts = isNaN(parsed) ? 0 : parsed;
          }
          const fav: FavoriteGame = { ...f, _idx: idx, _ts: ts };
          return fav;
        });
        this.applyFiltro();
        this.loading = false;
      },
      error: err => {
        this.error = 'Erro ao carregar favoritos';
        this.loading = false;
      }
    });
  }

  applyFiltro() {
    const term = (this.filtro || '').toLowerCase();
    let list = this.favoritos.slice();
    if (term) list = list.filter(j => ((j.name || '') as string).toLowerCase().includes(term));
    if (this.ordenacao === 'az') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else {
      // Recentes: usa timestamp real quando existir; fallback para _idx
      list.sort((a, b) => {
        const at = typeof a._ts === 'number' && a._ts > 0 ? a._ts : (typeof a._idx === 'number' ? a._idx : 0);
        const bt = typeof b._ts === 'number' && b._ts > 0 ? b._ts : (typeof b._idx === 'number' ? b._idx : 0);
        return bt - at;
      });
    }
    this.favoritosFiltrados = list;
  }

  adicionarFavorito(gameId: number) {
    this.http.post(`/api/users/${this.user.id}/favoritos`, { gameId }, this.headers()).subscribe(() => {
      this.carregarFavoritos();
    });
  }

  removerFavorito(gameId: number) {
    this.http.delete(`/api/users/${this.user.id}/favoritos/${gameId}`, this.headers()).subscribe(() => {
      this.carregarFavoritos();
    });
  }

  editarPerfil() {
    this.router.navigate(['/editar-perfil']);
  }

  sair() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  excluirConta() {
    if (confirm('Tem certeza que deseja excluir sua conta?')) {
      this.http.delete(`/api/users/${this.user.id}`, this.headers()).subscribe(() => {
        this.auth.logout();
        this.router.navigate(['/login']);
      });
    }
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

// Contrato local para favoritos, com metadados internos
interface FavoriteGame {
  id: number;
  name: string;
  // Campos possivelmente vindos do backend
  created_at?: string;
  added_at?: string;
  favorited_at?: string;
  updated_at?: string;
  timestamp?: string | number;
  // Metadados internos para UI
  _idx?: number;
  _ts?: number; // timestamp em ms para ordenação
  [k: string]: any;
}
