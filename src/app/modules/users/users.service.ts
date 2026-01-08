import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private base = '/api/users';
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private headers() {
    return { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) };
  }

  list() { return this.http.get<any[]>(this.base, this.headers()); }
  get(id: number) { return this.http.get<any>(`${this.base}/${id}`, this.headers()); }
  create(dto: any) { return this.http.post(this.base, dto, this.headers()); }
  update(id: number, dto: any) { return this.http.put(`${this.base}/${id}`, dto, this.headers()); }
  delete(id: number) { return this.http.delete(`${this.base}/${id}`, this.headers()); }

  ban(id: number, minutes = 24 * 60, reason?: string) {
    return this.http.post(
      `${this.base}/${id}/ban`,
      { minutes, reason: reason || undefined },
      this.headers()
    );
  }

  unban(id: number, reason?: string) {
    return this.http.post(
      `${this.base}/${id}/unban`,
      { reason: reason || undefined },
      this.headers()
    );
  }
}