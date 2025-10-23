import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Platform } from '../../model/platform';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export interface Game {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
  rawg_id?: number;
  slug?: string | null;
  description?: string | null;
  released?: string | null;
  background_image?: string | null;
  rating?: number | null;
  ratings_count?: number | null;
  metacritic?: number | null;
  platforms: Platform[];
  genres?: { id: number; name: string }[];
  types?: { id: number; name: string }[];
}

export type GameOrder =
  | 'name'
  | '-name'
  | 'released'
  | '-released'
  | 'rating'
  | '-rating'
  | 'metacritic'
  | '-metacritic'
  | 'created_at'
  | '-created_at';

export interface GamesQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  platforms?: number[];
  genres?: number[];
  types?: number[];
  order?: GameOrder;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface GamesListResponse {
  data: Game[];
  meta: PaginationMeta;
}

@Injectable({ providedIn: 'root' })
export class GamesService {
  private base = `${environment.apiBase}/games`;
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private headers() {
    return this.auth.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) } : {};
  }

  list(query: GamesQuery = {}): Observable<Game[]> {
    return this.listWithMeta(query).pipe(map((response) => response.data));
  }

  listWithMeta(query: GamesQuery = {}): Observable<GamesListResponse> {
    return this.http.get<GamesListResponse>(this.base, { params: this.buildParams(query) });
  }
  get(id: number): Observable<Game> { return this.http.get<Game>(`${this.base}/${id}`); }
  create(dto: any) { return this.http.post<Game>(this.base, dto, this.headers()); }
  update(id: number, dto: any) { return this.http.put<Game>(`${this.base}/${id}`, dto, this.headers()); }
  delete(id: number) { return this.http.delete<void>(`${this.base}/${id}`, this.headers()); }

  private buildParams(query: GamesQuery): HttpParams {
    let params = new HttpParams();
    if (query.page) params = params.set('page', String(query.page));
    if (query.pageSize) params = params.set('pageSize', String(query.pageSize));
    if (query.order) params = params.set('order', query.order);

    const normalizedSearch = query.search?.trim();
    if (normalizedSearch) params = params.set('search', normalizedSearch);

    const serializeIds = (values?: number[]) =>
      Array.isArray(values) ? values.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0) : [];

    const platforms = serializeIds(query.platforms);
    if (platforms.length) params = params.set('platforms', platforms.join(','));

    const genres = serializeIds(query.genres);
    if (genres.length) params = params.set('genres', genres.join(','));

    const types = serializeIds(query.types);
    if (types.length) params = params.set('types', types.join(','));

    return params;
  }
}