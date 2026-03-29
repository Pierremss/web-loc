import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface UserSummary {
  id: number;
  name: string;
  nickname?: string;
  email?: string;
  avatar_url?: string;
  profile?: string;
  platforms?: string[] | string | null;
  game_style?: string | null;
  favorite_genre?: string | null;
  available_times?: string | null;
  created_at?: string | null;
}

export interface FavoriteGame {
  id: number;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private base = `${environment.apiBase}/users`;
  private readonly http = inject(HttpClient);

  search(q: string) {
    const params = new HttpParams().set('q', q);
    return this.http.get<{ items: UserSummary[] }>(`${this.base}/search`, { params });
  }

  getById(id: number) {
    return this.http.get<UserSummary>(`${this.base}/${id}`);
  }

  // Add public profile fetch
  getPublicProfile(id: number) {
    return this.http.get<UserSummary>(`${this.base}/${id}/public`);
  }

  getFavorites(id: number) {
    return this.http.get<FavoriteGame[]>(`${this.base}/${id}/favoritos`);
  }

  uploadAvatar(id: number, file: File) {
    const form = new FormData();
    form.append('avatar', file);
    return this.http.post<{ avatar_url: string }>(`${this.base}/${id}/avatar`, form);
  }
}
