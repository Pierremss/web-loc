import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';

export interface User {
  id: number;
  name: string;
  email: string;
  nickname?: string;
  platforms?: string;
  game_style?: string;
  available_times?: string;
  profile?: string;
  avatar_url?: string;
  is_admin: number | boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base = '/api/auth';
  user: User | null = null;
  token: string | null = null;
  private readonly http = inject(HttpClient);

  constructor() {
    this.token = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    this.user = u ? JSON.parse(u) : null;
    this.hydrateUserFromToken();
  }

  login(email: string, password: string) {
    return this.http.post<any>(`${this.base}/login`, { email, password }).pipe(
      tap(res => {
        this.token = res.token;
        this.user = res.user;
        localStorage.setItem('token', this.token!);
        localStorage.setItem('user', JSON.stringify(this.user));
      })
    );
  }

  register(data: any) {
    return this.http.post(`${this.base}/register`, data);
  }

  requestPasswordReset(email: string) {
    return this.http.post<{ success: boolean; message: string; delivered?: boolean; expiresAt?: string; expiresInMinutes?: number }>(
      `${this.base}/forgot-password`,
      { email }
    );
  }

  resetPassword(payload: { email: string; code: string; password: string }) {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.base}/reset-password`,
      payload
    );
  }

  sendVerificationCode(email: string) {
    return this.http.post<{ success: boolean; delivered: boolean; message?: string; expiresAt?: string; expiresInMinutes?: number }>(
      `/api/verification/send`,
      { email }
    );
  }

  confirmVerification(email: string, code: string) {
    return this.http.post<{ success: boolean; userId: number; alreadyVerified?: boolean }>(
      `/api/verification/confirm`,
      { email, code }
    );
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  isAdmin() {
    if (typeof this.user?.is_admin !== 'undefined') return !!this.user?.is_admin;
    if (!this.token) return false;
    const payload = this.decodeTokenPayload(this.token);
    return !!payload?.is_admin;
  }

  isLogged() {
    return !!this.user;
  }

  private hydrateUserFromToken() {
    if (!this.token) return;
    // Se já temos user completo (incluindo is_admin), não precisa hidratar.
    if (
      this.user &&
      Number.isFinite(Number((this.user as any).id)) &&
      typeof (this.user as any).is_admin !== 'undefined'
    ) {
      return;
    }
    const payload = this.decodeTokenPayload(this.token);
    if (!payload) return;
    const tokenId = Number(payload.id ?? payload.userId ?? payload.sub);
    if (!Number.isFinite(tokenId)) return;

    const nextUser: User = {
      id: tokenId,
      name: this.user?.name ?? payload.name ?? '',
      email: this.user?.email ?? payload.email ?? '',
      nickname: this.user?.nickname ?? payload.nickname,
      platforms: this.user?.platforms ?? payload.platforms,
      game_style: this.user?.game_style ?? payload.game_style,
      available_times: this.user?.available_times ?? payload.available_times,
      profile: this.user?.profile ?? payload.profile,
      avatar_url: this.user?.avatar_url ?? payload.avatar_url,
      is_admin: typeof this.user?.is_admin !== 'undefined'
        ? this.user!.is_admin
        : !!payload.is_admin
    };
    this.user = nextUser;
    localStorage.setItem('user', JSON.stringify(this.user));
  }

  private decodeTokenPayload(token: string | null): any | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4 !== 0) payload += '=';
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
}