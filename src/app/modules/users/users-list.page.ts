import { Component, OnInit, inject } from '@angular/core';
import { UsersService } from './users.service';

@Component({
  selector: 'app-users-list',
  templateUrl: './users-list.page.html',
  styleUrls: ['./users-list.page.scss'],
  standalone: false,
})
export class UsersListPage implements OnInit {
  users: any[] = [];
  searchTerm: string = '';
  filteredUsers: any[] = [];

  private readonly usersService = inject(UsersService);

  ngOnInit() { this.load(); }
  ionViewWillEnter() { this.load(); }

  load() {
    this.usersService.list().subscribe(u => {
      this.users = u;
      this.searchUsers();
    });
  }

  searchUsers() {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredUsers = this.users;
    } else {
      this.filteredUsers = this.users.filter(user =>
        user.name.toLowerCase().includes(term)
      );
    }
  }

  remove(id: number) { this.usersService.delete(id).subscribe(() => this.load()); }
}
