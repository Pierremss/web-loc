import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class GamesService {
  private base = '/api/games';
  constructor(private http: HttpClient, private auth: AuthService) {}
  private headers() {
    return this.auth.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) } : {};
  }

  list() { return this.http.get<any[]>(this.base); }
  get(id: number) { return this.http.get<any>(`${this.base}/${id}`); }
  create(dto: any) { return this.http.post(this.base, dto, this.headers()); }
  update(id: number, dto: any) { return this.http.put(`${this.base}/${id}`, dto, this.headers()); }
  delete(id: number) { return this.http.delete(`${this.base}/${id}`, this.headers()); }
}