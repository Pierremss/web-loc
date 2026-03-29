import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Game } from '../../games.service';

@Component({
  selector: 'app-game-list',
  templateUrl: './game-list.component.html',
  styleUrls: ['./game-list.component.scss'],
  standalone: false
})
export class GameListComponent {
  @Input() games: Game[] | null = [];
  @Input() processing = false;
  @Input() searchTerm = '';

  @Output() edit = new EventEmitter<Game>();
  @Output() remove = new EventEmitter<Game>();

  protected readonly serverUrl = 'http://localhost:3333';

  trackByGameId(_index: number, game: Game): number {
    return game.id;
  }

  getGameImage(game: Game): string | null {
    const imagePath = game.custom_image || game.background_image;
    if (!imagePath) return null;
    
    // Se já é uma URL completa, retorna como está
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    
    // Se começa com /, adiciona o serverUrl
    return `${this.serverUrl}${imagePath}`;
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

  formatReleaseDate(game: Game): string {
    if (!game.released) return 'Data não informada';
    const date = new Date(game.released);
    if (Number.isNaN(date.getTime())) return game.released;
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: 'long',
        day: '2-digit'
      }).format(date);
    } catch {
      return date.toLocaleDateString('pt-BR');
    }
  }

  formatRating(game: Game): string {
    if (game.rating === null || game.rating === undefined || Number.isNaN(game.rating)) return '—';
    return `${Number(game.rating).toFixed(1)} / 5`;
  }

  onEdit(game: Game): void {
    this.edit.emit(game);
  }

  onRemove(game: Game): void {
    this.remove.emit(game);
  }
}
