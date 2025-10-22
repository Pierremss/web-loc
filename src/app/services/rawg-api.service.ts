import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RawgPlatformRef {
  platform: {
    id: number;
    name: string;
    slug: string;
  };
}

export interface RawgGame {
  id: number;
  name: string;
  slug: string;
  background_image?: string;
  description_raw?: string;
  metacritic?: number;
  rating: number;
  ratings_count: number;
  released?: string;
  platforms?: RawgPlatformRef[];
  genres?: { id: number; name: string; slug: string }[];
  tags?: { id: number; name: string; slug: string }[];
}

export interface RawgPagedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface RawgSearchOptions {
  page?: number;
  pageSize?: number;
  ordering?: string;
  genres?: string;
  platforms?: string;
  dates?: string;
}

@Injectable({ providedIn: 'root' })
export class RawgApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.rawgApiBaseUrl;
  private readonly apiKey = environment.rawgApiKey;

  private composeParams(params: HttpParams = new HttpParams()): HttpParams {
    const withKey = this.apiKey ? params.set('key', this.apiKey) : params;
    return withKey;
  }

  searchGames(query: string, options: RawgSearchOptions = {}): Observable<RawgPagedResponse<RawgGame>> {
    let params = this.composeParams()
      .set('search', query)
      .set('page', String(options.page ?? 1))
      .set('page_size', String(options.pageSize ?? 20));

    if (options.ordering) params = params.set('ordering', options.ordering);
    if (options.genres) params = params.set('genres', options.genres);
    if (options.platforms) params = params.set('platforms', options.platforms);
    if (options.dates) params = params.set('dates', options.dates);

    return this.http.get<RawgPagedResponse<RawgGame>>(`${this.baseUrl}/games`, { params });
  }

  getGameDetails(gameId: number): Observable<RawgGame> {
    const params = this.composeParams();
    return this.http.get<RawgGame>(`${this.baseUrl}/games/${gameId}`, { params });
  }

  getSuggestedGames(seedGameId: number): Observable<RawgGame[]> {
    const params = this.composeParams();
    return this.http
      .get<{ results: RawgGame[] }>(`${this.baseUrl}/games/${seedGameId}/suggested`, { params })
      .pipe(map(response => response.results));
  }
}
