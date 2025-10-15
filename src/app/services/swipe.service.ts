import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Platform } from '../model/platform';

export interface SwipeDeckFilters {
  limit?: number;
  minCompatibility?: number;
  platformIds?: number[];
  gameStyle?: string | null;
  period?: string | null;
}

export interface SwipeDeckResponse {
  items: SwipeDeckItem[];
  filters: {
    applied: {
      platformIds: number[];
      gameStyle: string | null;
      period: string | null;
      minCompatibility: number;
    };
  };
}

export interface SwipeDeckItem {
  id: number;
  name: string;
  nickname?: string;
  avatar_url?: string;
  game_style?: string;
  platforms: Platform[];
  compatibility: SwipeCompatibility;
  summary: {
    bio: string;
    favoriteCount: number;
    availableTimes: string | null;
  };
}

export interface SwipeCompatibility {
  score: number;
  weights: { games: number; platforms: number; style: number; schedule: number };
  totals: { games: number; platforms: number; schedule: number };
  breakdown: { games: number; platforms: number; style: number; schedule: number };
  commonGames: { id: number; name: string }[];
  sharedPlatforms: Platform[];
  styleMatch: boolean;
  scheduleOverlap: { day: string; periods: string[] }[];
}

export interface SwipeProfile {
  id: number;
  name: string;
  nickname?: string;
  avatar_url?: string;
  game_style?: string;
  profile?: string;
  platforms: Platform[];
  availableTimes: { day: string; periods: string[] }[];
  favoriteGames: { id: number; name: string; created_at: string }[];
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class SwipeService {
  private base = `${environment.apiBase}/swipe`;
  private readonly http = inject(HttpClient);

  deck(filters: SwipeDeckFilters = {}) {
    let params = new HttpParams();
    if (filters.limit) params = params.set('limit', String(filters.limit));
    if (filters.minCompatibility !== undefined) params = params.set('minCompatibility', String(filters.minCompatibility));
    if (filters.platformIds?.length) params = params.set('platformIds', filters.platformIds.join(','));
    if (filters.gameStyle) params = params.set('gameStyle', filters.gameStyle);
    if (filters.period) params = params.set('period', filters.period);
    return this.http.get<SwipeDeckResponse>(`${this.base}/deck`, { params });
  }

  profile(userId: number) {
    return this.http.get<SwipeProfile>(`${this.base}/profile/${userId}`);
  }

  like(toUserId: number) {
    return this.http.post<{ matched: boolean; message: string }>(`${this.base}/like`, { toUserId });
  }

  pass(toUserId: number) {
    return this.http.post(`${this.base}/pass`, { toUserId });
  }
}
