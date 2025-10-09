import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Platform } from '../model/platform';
import { AuthService } from '../modules/auth/auth.service';

@Injectable({ providedIn: 'root' })
export class PlatformsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private base = '/api/platforms';

  private headers() {
    return this.auth.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) } : {};
  }

  list(): Observable<Platform[]> {
    return this.http.get<Platform[]>(this.base);
  }

  create(dto: { name: string }): Observable<Platform> {
    return this.http.post<Platform>(this.base, dto, this.headers());
  }

  update(id: number, dto: { name: string }): Observable<Platform> {
    return this.http.put<Platform>(`${this.base}/${id}`, dto, this.headers());
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`, this.headers());
  }
}
