import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FriendsService {
  private base = `${environment.apiBase}/friends`;
  constructor(private http: HttpClient) {}

  list() { return this.http.get<any[]>(`${this.base}`); }
  requests() { return this.http.get<any[]>(`${this.base}/requests`); }
  sendRequest(toUserId: number) { return this.http.post(`${this.base}/request`, { toUserId }); }
  accept(requesterId: number) { return this.http.post(`${this.base}/accept`, { requesterId }); }
  decline(requesterId: number) { return this.http.post(`${this.base}/decline`, { requesterId }); }
  remove(friendId: number) { return this.http.delete(`${this.base}/${friendId}`); }
}
