import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class MessagesService {
  private base = `${environment.apiBase}/messages`;
  private readonly http = inject(HttpClient);

  getConversation(userId: number, limit = 50, before?: string) {
    let params = new HttpParams().set('limit', limit);
    if (before) params = params.set('before', before);
    return this.http.get<any[]>(`${this.base}/conversation/${userId}`, { params });
  }

  send(toUserId: number, content: string, replyToId?: number) {
    const body: any = { toUserId, content };
    if (replyToId) {
      body.replyToId = replyToId;
    }
    return this.http.post(`${this.base}/send`, body);
  }

  markRead(messageId: number) {
    return this.http.post(`${this.base}/read`, { messageId });
  }

  edit(messageId: number, content: string) {
    return this.http.post(`${this.base}/edit`, { messageId, content });
  }

  remove(messageId: number) {
    return this.http.delete(`${this.base}/${messageId}`).pipe(
      catchError(() => this.http.post(`${this.base}/delete`, { messageId }))
    );
  }

  react(messageId: number, emoji: string) {
    return this.http.post(`${this.base}/react`, { messageId, emoji });
  }

  block(blockedId: number) {
    return this.http.post(`${this.base}/block`, { blockedId });
  }

  unblock(blockedId: number) {
    return this.http.post(`${this.base}/unblock`, { blockedId });
  }
}
