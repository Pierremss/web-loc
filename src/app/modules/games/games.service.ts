import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Platform } from '../../model/platform';
import { AuthService } from '../auth/auth.service';

export interface Game {
  id: number;
  name: string;
  created_at?: string;
  platforms: Platform[];
  genres?: { id: number; name: string }[];
  types?: { id: number; name: string }[];
}

@Injectable({ providedIn: 'root' })
export class GamesService {
  private base = '/api/games';
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private headers() {
    return this.auth.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) } : {};
  }

  list(): Observable<Game[]> { return this.http.get<Game[]>(this.base); }
  get(id: number): Observable<Game> { return this.http.get<Game>(`${this.base}/${id}`); }
  create(dto: any) { return this.http.post<Game>(this.base, dto, this.headers()); }
  update(id: number, dto: any) { return this.http.put<Game>(`${this.base}/${id}`, dto, this.headers()); }
  delete(id: number) { return this.http.delete<void>(`${this.base}/${id}`, this.headers()); }
}