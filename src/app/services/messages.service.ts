import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { catchError } from 'rxjs/operators';
import { Observable } from 'rxjs';

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

  clearConversation(userId: number) {
    return this.http.post(`${this.base}/conversation/${userId}/clear`, {});
  }

  getBlockStatus(userId: number) {
    return this.http.get<{ blockedByMe: boolean; blockedMe: boolean }>(`${this.base}/block-status/${userId}`);
  }

  markRead(messageId: number) {
    return this.http.post(`${this.base}/read`, { messageId });
  }

  markConversationRead(userId: number) {
    return this.http.post(`${this.base}/conversation/${userId}/read`, {});
  }

  edit(messageId: number, content: string) {
    return this.http.post(`${this.base}/edit`, { messageId, content });
  }

  remove(messageId: number) {
    return this.http.delete(`${this.base}/${messageId}`).pipe(
      catchError(() => this.http.post(`${this.base}/delete`, { messageId }))
    );
  }

  hide(messageId: number) {
    return this.http.post(`${this.base}/delete`, { messageId, scope: 'me' });
  }

  react(messageId: number, emoji: string) {
    return this.http.post(`${this.base}/react`, { messageId, emoji });
  }

  block(blockedId: number) {
    return this.http.post(`${this.base}/block`, { blockedId });
  }

  unblock(blockedId: number, options?: { restoreFriendship?: boolean }) {
    const restoreFriendship = options?.restoreFriendship;
    const body: any = { blockedId };
    if (restoreFriendship !== undefined) body.restoreFriendship = restoreFriendship;
    return this.http.post(`${this.base}/unblock`, body);
  }

  reportUser(reportedUserId: number, reason?: string) {
    const body: any = { reportedUserId };
    if (reason) body.reason = reason;
    return this.http.post(`${this.base}/report-user`, body);
  }

  reportUserWithEvidence(
    reportedUserId: number,
    payload: { category?: string; details?: string; photos?: File[] }
  ): Observable<any> {
    const fd = new FormData();
    fd.append('reportedUserId', String(reportedUserId));
    if (payload?.category) fd.append('category', String(payload.category));
    if (payload?.details) fd.append('details', String(payload.details));
    const photos = Array.isArray(payload?.photos) ? payload.photos : [];
    for (const f of photos) {
      if (f instanceof File) fd.append('photos', f, f.name);
    }
    return this.http.post(`${this.base}/report-user`, fd);
  }

  getReports(limit = 100) {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<any[]>(`${this.base}/reports`, { params });
  }

  deleteReport(id: number) {
    return this.http.delete<{ ok: boolean; deleted?: number; scope?: 'active' | 'archive' }>(`${this.base}/reports/${id}`);
  }

  clearReports() {
    return this.http.delete<{ ok: boolean; deleted?: number }>(`${this.base}/reports`);
  }
}
