import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../modules/auth/auth.service';

@Component({
  selector: 'app-menu-admin',
  templateUrl: './menu-admin.page.html',
  styleUrls: ['./menu-admin.page.scss'],
  standalone: false,
})
export class MenuAdminPage implements OnInit {

  constructor(private router: Router, private auth: AuthService) { }

  ngOnInit() {
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

}
