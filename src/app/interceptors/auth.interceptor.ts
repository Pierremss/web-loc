import { Injectable, inject } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../modules/auth/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = localStorage.getItem('token');
    const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
    return next.handle(authReq).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.auth.logout();
          this.router.navigateByUrl('/login');
        } else if (err.status === 403 && (err.error?.error === 'banned' || err.error?.error === 'deleted')) {
          const qp: any = {};
          if (err.error?.error === 'banned') {
            qp.banned = '1';
            if (err.error?.banned_until) qp.banned_until = String(err.error.banned_until);
          }
          if (err.error?.error === 'deleted') {
            qp.deleted = '1';
          }
          this.auth.logout();
          const qs = new URLSearchParams(qp).toString();
          this.router.navigateByUrl(qs ? `/login?${qs}` : '/login');
        }
        return throwError(() => err);
      })
    );
  }
}
