import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  canActivate(): boolean {
    if (!this.auth.isLogged()) {
      this.router.navigateByUrl('/login');
      return false;
    }
    return true;
  }
}