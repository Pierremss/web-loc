import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SwipeService {
  private base = `${environment.apiBase}/swipe`;
  private readonly http = inject(HttpClient);

  deck(limit = 20) { return this.http.get<{items:any[]}>(`${this.base}/deck`, { params: { limit } as any }); }
  like(toUserId: number) { return this.http.post<{matched:boolean; message:string}>(`${this.base}/like`, { toUserId }); }
  pass(toUserId: number) { return this.http.post(`${this.base}/pass`, { toUserId }); }
}
