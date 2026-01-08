import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GameRecommendation {
  id: number;
  gameName: string;
  platform: string;
  genre: string;
  gameType: string;
  notes?: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  adminNotes?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdGameId?: number;
  user?: {
    id: number;
    name?: string | null;
    nickname?: string | null;
    email?: string | null;
  };
}

export interface GameRecommendationUpdateResponse extends GameRecommendation {
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class GameRecommendationsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/game-recommendations`;

  create(payload: { gameName: string; platform: string; genre: string; gameType: string; notes?: string | null }): Observable<GameRecommendation> {
    return this.http.post<GameRecommendation>(this.base, payload);
  }

  list(params?: { order?: 'created-desc' | 'created-asc' | 'name-asc' | 'name-desc' }): Observable<GameRecommendation[]> {
    let httpParams = new HttpParams();
    if (params?.order) {
      httpParams = httpParams.set('order', params.order);
    }
    return this.http.get<GameRecommendation[]>(this.base, { params: httpParams });
  }

  listMine(): Observable<GameRecommendation[]> {
    return this.list({ order: 'created-desc' });
  }

  update(id: number, payload: { status?: 'accepted' | 'rejected'; adminNotes?: string | null }): Observable<GameRecommendationUpdateResponse> {
    return this.http.patch<GameRecommendationUpdateResponse>(`${this.base}/${id}`, payload);
  }

  delete(id: number): Observable<{ ok: boolean; deleted?: number }> {
    return this.http.delete<{ ok: boolean; deleted?: number }>(`${this.base}/${id}`);
  }

  adminClearAll(): Observable<{ ok: boolean; deleted?: number }> {
    return this.http.delete<{ ok: boolean; deleted?: number }>(`${this.base}/admin/clear`);
  }
}
