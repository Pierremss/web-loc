import { Component, OnInit, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
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
  private readonly alertCtrl = inject(AlertController);

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

  isBanned(u: any): boolean {
    if (!u?.banned_until) return false;
    const d = new Date(u.banned_until);
    return Number.isFinite(d.getTime()) && d.getTime() > Date.now();
  }

  async ban(u: any) {
    if (!u || u.is_admin) return;
    const alert = await this.alertCtrl.create({
      header: 'Banir jogador',
      message: `Escolha por quanto tempo deseja suspender ${u.name}:`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: '24 horas',
          role: 'destructive',
          handler: () => {
            this.usersService.ban(u.id, 24 * 60).subscribe(() => this.load());
          }
        },
        {
          text: '30 dias',
          role: 'destructive',
          handler: () => {
            this.usersService.ban(u.id, 30 * 24 * 60).subscribe(() => this.load());
          }
        }
      ]
    });
    await alert.present();
  }

  async unban(u: any) {
    if (!u || u.is_admin) return;
    const alert = await this.alertCtrl.create({
      header: 'Remover suspensão',
      message: `Remover a suspensão de ${u.name}?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Desbanir',
          handler: () => {
            this.usersService.unban(u.id).subscribe(() => this.load());
          }
        }
      ]
    });
    await alert.present();
  }
}
