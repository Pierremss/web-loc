import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Room {
  id: number;
  owner_id: number;
  name: string;
  link?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  owner_nickname?: string | null;
  member_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface RoomMember {
  room_id: number;
  user_id: number;
  nickname?: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member';
  avatar_url?: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class RoomsService {
  private base = `${environment.apiBase}/rooms`;
  private readonly http = inject(HttpClient);

  list() { return this.http.get<Room[]>(this.base); }
  create(payload: { name: string; link?: string; description?: string }, avatar?: File) {
    const form = new FormData();
    form.append('name', payload.name);
    if (payload.link) form.append('link', payload.link);
    if (payload.description) form.append('description', payload.description);
    if (avatar) form.append('avatar', avatar);
    return this.http.post<Room>(this.base, form);
  }
  update(id: number, payload: Partial<Room>) { return this.http.put<Room>(`${this.base}/${id}`, payload); }
  delete(id: number) { return this.http.delete(`${this.base}/${id}`); }
  share(id: number, conversationId: number) { return this.http.post<any>(`${this.base}/${id}/share`, { conversation_id: conversationId }); }
  uploadAvatar(id: number, file: File) {
    const form = new FormData();
    form.append('avatar', file);
    return this.http.post<{ avatar_url: string }>(`${this.base}/${id}/avatar`, form);
  }
  listMembers(id: number) { return this.http.get<RoomMember[]>(`${this.base}/${id}/members`); }
  addMember(id: number, email: string) { return this.http.post<RoomMember>(`${this.base}/${id}/members`, { email }); }
  removeMember(id: number, userId: number) { return this.http.delete(`${this.base}/${id}/members/${userId}`); }
}
