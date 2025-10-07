import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  email = '';
  password = '';
  loading = false;
  error = '';
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  submit() {
    this.loading = true;
    this.error = '';
    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.loading = false;
        if (this.auth.user?.is_admin) {
          this.router.navigateByUrl('/home', { replaceUrl: true });
        } else {
          this.router.navigateByUrl('/home', { replaceUrl: true });
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'Falha no login';
      }
    });
  }
}