import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Room {
  id: number;
  owner_id: number;
  name: string;
  link?: string;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class RoomsService {
  private base = `${environment.apiBase}/rooms`;
  private readonly http = inject(HttpClient);

  list() { return this.http.get<Room[]>(this.base); }
  create(payload: { name: string; link?: string; description?: string }) { return this.http.post<Room>(this.base, payload); }
  update(id: number, payload: Partial<Room>) { return this.http.put<Room>(`${this.base}/${id}`, payload); }
  delete(id: number) { return this.http.delete(`${this.base}/${id}`); }
  share(id: number, conversationId: number) { return this.http.post<any>(`${this.base}/${id}/share`, { conversation_id: conversationId }); }
}
