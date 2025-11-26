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
    return !!this.user?.is_admin;
  }

  isLogged() {
    return !!this.user;
  }
}