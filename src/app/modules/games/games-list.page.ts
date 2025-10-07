import { Component, OnInit } from '@angular/core';
import { GamesService } from './games.service';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-games-list',
  templateUrl: './games-list.page.html',
  styleUrls: ['./games-list.page.scss'],
  standalone: false,
})
export class GamesListPage implements OnInit {
  games: any[] = [];
  name = '';
  platforms: string[] = [];
  allPlatforms = ['PlayStation','Xbox','Nintendo','PC'];
  searchTerm: string = '';
  filteredGames: any[] = [];

  editId: number|null = null;
  editName: string = '';
  editPlatforms: string[] = [];

  constructor(private gamesService: GamesService, public auth: AuthService) {}
  ngOnInit() { this.load(); }
  ionViewWillEnter() { this.load(); }
  load() {
    this.gamesService.list().subscribe(g => {
      this.games = g;
      this.searchGames();
    });
  }

  searchGames() {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredGames = this.games;
    } else {
      this.filteredGames = this.games.filter(game =>
        game.name.toLowerCase().includes(term)
      );
    }
  }
  create() {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    this.gamesService.create({ name: this.name, platforms: this.platforms }).subscribe(() => {
      this.name = '';
      this.platforms = [];
      this.load();
    });
  }
  remove(id: number) { 
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    this.gamesService.delete(id).subscribe(() => this.load()); 
  }

  startEdit(game: any) {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    this.editId = game.id;
    this.editName = game.name;
    this.editPlatforms = Array.isArray(game.platforms) ? [...game.platforms] : String(game.platforms).split(',');
  }

  cancelEdit() {
    this.editId = null;
    this.editName = '';
    this.editPlatforms = [];
  }

  saveEdit() {
    if (!this.auth.isAdmin()) return alert('Apenas admin');
    if (!this.editName || this.editPlatforms.length === 0) return alert('Preencha todos os campos');
    this.gamesService.update(this.editId!, { name: this.editName, platforms: this.editPlatforms }).subscribe(() => {
      this.cancelEdit();
      this.load();
    });
  }
}