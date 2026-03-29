import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../modules/auth/auth.service';

export interface Genre { id: number; name: string; }

@Injectable({ providedIn: 'root' })
export class GenresService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private base = '/api/genres';

  private headers() { return this.auth.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) } : {}; }

  list(): Observable<Genre[]> { return this.http.get<Genre[]>(this.base); }
  create(dto: { name: string }) { return this.http.post<Genre>(this.base, dto, this.headers()); }
  update(id: number, dto: { name: string }) { return this.http.put<Genre>(`${this.base}/${id}`, dto, this.headers()); }
  delete(id: number) { return this.http.delete<void>(`${this.base}/${id}`, this.headers()); }
}
