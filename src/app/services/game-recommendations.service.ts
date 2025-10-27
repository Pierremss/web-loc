import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

@Injectable({ providedIn: 'root' })
export class GameRecommendationsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/game-recommendations`;

  create(payload: { gameName: string; platform: string; genre: string; gameType: string; notes?: string | null }): Observable<GameRecommendation> {
    return this.http.post<GameRecommendation>(this.base, payload);
  }

  list(): Observable<GameRecommendation[]> {
    return this.http.get<GameRecommendation[]>(this.base);
  }

  update(id: number, payload: { status?: 'pending' | 'accepted' | 'rejected'; adminNotes?: string | null }): Observable<GameRecommendation> {
    return this.http.patch<GameRecommendation>(`${this.base}/${id}`, payload);
  }
}
