import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Game } from '../../games.service';

@Component({
  selector: 'app-game-list',
  templateUrl: './game-list.component.html',
  styleUrls: ['./game-list.component.scss'],
})
export class GameListComponent {
  @Input() games: Game[] | null = [];
  @Input() processing = false;
  @Input() searchTerm = '';

  @Output() edit = new EventEmitter<Game>();
  @Output() remove = new EventEmitter<Game>();

  trackByGameId(_index: number, game: Game): number {
    return game.id;
  }

  formatPlatforms(game: Game): string {
    if (!game.platforms?.length) return 'Sem plataformas definidas';
    return game.platforms.map(platform => platform.name).join(', ');
  }

  formatGenres(game: Game): string {
    if (!game.genres?.length) return 'Sem gêneros associados';
    return game.genres.map(genre => genre.name).join(', ');
  }

  formatTypes(game: Game): string {
    if (!game.types?.length) return 'Sem tipos associados';
    return game.types.map(type => type.name).join(', ');
  }

  onEdit(game: Game): void {
    this.edit.emit(game);
  }

  onRemove(game: Game): void {
    this.remove.emit(game);
  }
}
