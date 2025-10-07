import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../modules/auth/auth.service';

@Component({
  selector: 'app-menu-admin',
  templateUrl: './menu-admin.page.html',
  styleUrls: ['./menu-admin.page.scss'],
  standalone: false,
})
export class MenuAdminPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

}
