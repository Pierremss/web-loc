import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ConversationsService {
  private base = `${environment.apiBase}/conversations`;
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<any[]>(`${this.base}`);
  }

  get(id: number) {
    return this.http.get<any>(`${this.base}/${id}`);
  }

  create(payload: { name?: string; description?: string; is_public?: boolean; members?: number[] }, avatarFile?: File) {
    if (!avatarFile) {
      return this.http.post<any>(`${this.base}`, payload);
    }
    const form = new FormData();
    if (payload.name !== undefined) form.append('name', payload.name ?? '');
    if (payload.description !== undefined) form.append('description', payload.description ?? '');
    if (payload.is_public !== undefined) form.append('is_public', String(payload.is_public));
    if (payload.members?.length) {
      form.append('members', JSON.stringify(payload.members));
    }
    form.append('avatar', avatarFile);
    return this.http.post<any>(`${this.base}`, form);
  }

  update(conversationId: number, payload: { name?: string; description?: string; is_public?: boolean }) {
    return this.http.put<any>(`${this.base}/${conversationId}`, payload);
  }

  uploadAvatar(conversationId: number, avatarFile: File) {
    const form = new FormData();
    form.append('avatar', avatarFile);
    return this.http.post<{ avatar_url: string }>(`${this.base}/${conversationId}/avatar`, form);
  }

  listMembers(conversationId: number) {
    return this.http.get<any[]>(`${this.base}/${conversationId}/members`);
  }

  addMember(conversationId: number, email: string) {
    return this.http.post<any>(`${this.base}/${conversationId}/members`, { email });
  }

  removeMember(conversationId: number, userId: number) {
    return this.http.delete(`${this.base}/${conversationId}/members/${userId}`);
  }

  getMessages(conversationId: number, limit = 50, before?: string) {
    let params = new HttpParams().set('limit', limit);
    if (before) params = params.set('before', before);
    return this.http.get<any[]>(`${this.base}/${conversationId}/messages`, { params });
  }

  sendMessage(conversationId: number, content: string, reply_to_id?: number) {
    return this.http.post<any>(`${this.base}/${conversationId}/messages`, { content, reply_to_id });
  }

  deleteMessage(conversationId: number, messageId: number) {
    return this.http.delete(`${this.base}/${conversationId}/messages/${messageId}`);
  }

  hideMessage(conversationId: number, messageId: number) {
    return this.http.post(`${this.base}/${conversationId}/messages/${messageId}/delete`, { scope: 'me' });
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

  delete(conversationId: number) {
    return this.http.delete(`${this.base}/${conversationId}`);
  }
}
