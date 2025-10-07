import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ConversationsService {
  private base = `${environment.apiBase}/conversations`;
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<any[]>(`${this.base}`);
  }

  create(payload: { name?: string; description?: string; is_public?: boolean; members?: number[] }) {
    return this.http.post<any>(`${this.base}`, payload);
  }

  getMessages(conversationId: number, limit = 50, before?: string) {
    let params = new HttpParams().set('limit', limit);
    if (before) params = params.set('before', before);
    return this.http.get<any[]>(`${this.base}/${conversationId}/messages`, { params });
  }

  sendMessage(conversationId: number, content: string, reply_to_id?: number) {
    return this.http.post<any>(`${this.base}/${conversationId}/messages`, { content, reply_to_id });
  }

  join(conversationId: number) {
    return this.http.post(`${this.base}/${conversationId}/join`, {});
  }

  leave(conversationId: number) {
    return this.http.post(`${this.base}/${conversationId}/leave`, {});
  }

  markRead(conversationId: number, lastId: number) {
    return this.http.post(`${this.base}/${conversationId}/read`, { last_read_message_id: lastId });
  }
}
