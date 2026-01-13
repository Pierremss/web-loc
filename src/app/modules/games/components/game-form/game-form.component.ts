import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ValidatorFn, Validators } from '@angular/forms';
import { Platform } from '../../../../model/platform';
import { Genre } from '../../../../services/genres.service';
import { GameType } from '../../../../services/game-types.service';
import { Game } from '../../games.service';
import { GamePayload } from '../../games-admin.facade';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../auth/auth.service';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-game-form',
  templateUrl: './game-form.component.html',
  styleUrls: ['./game-form.component.scss'],
  standalone:false
})
export class GameFormComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastController);

  @Input() mode: 'create' | 'edit' = 'create';
  @Input() game: Game | null = null;
  @Input() platforms: Platform[] | null = [];
  @Input() genres: Genre[] | null = [];
  @Input() types: GameType[] | null = [];
  @Input() processing = false;

  @Output() save = new EventEmitter<GamePayload>();
  @Output() cancel = new EventEmitter<void>();
  @Output() imagePending = new EventEmitter<{ gameId: number; upload: () => Promise<void> }>();

  protected submitted = false;
  public imagePreview: string | null = null;
  public selectedFile: File | null = null;
  public uploadingImage = false;

  private headers() {
    return this.auth.token ? { headers: new HttpHeaders({ Authorization: `Bearer ${this.auth.token}` }) } : {};
  }

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(3)]),
    platforms: this.fb.nonNullable.control<number[]>([], { validators: [this.requireSelection()] }),
    genres: this.fb.nonNullable.control<number[]>([]),
    types: this.fb.nonNullable.control<number[]>([]),
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] && this.mode === 'create') {
      this.resetForm();
    }

    if (changes['game'] && this.game && this.mode === 'edit') {
      this.form.patchValue({
        name: this.game.name,
        platforms: (this.game.platforms ?? []).map(platform => platform.id),
        genres: (this.game.genres ?? []).map(genre => genre.id),
        types: (this.game.types ?? []).map(type => type.id),
      });
      this.submitted = false;
    }

    if (changes['platforms'] && this.platforms) {
      this.syncControlWithOptions('platforms', this.platforms.map(item => item.id));
    }

    if (changes['genres'] && this.genres) {
      this.syncControlWithOptions('genres', this.genres.map(item => item.id));
    }

    if (changes['types'] && this.types) {
      this.syncControlWithOptions('types', this.types.map(item => item.id));
    }
  }

  protected onSubmit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, platforms, genres, types } = this.form.getRawValue();
    const payload = {
      name: name.trim(),
      platforms,
      genres,
      types,
    };
    
    this.save.emit(payload);
  }

  protected onCancel(): void {
    this.cancel.emit();
  }

  protected get nameCtrl(): AbstractControl | null {
    return this.form.get('name');
  }

  protected get platformsCtrl(): AbstractControl | null {
    return this.form.get('platforms');
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (file.size > maxSize) {
      this.presentToast('Imagem muito grande. Máximo: 10MB', 'danger');
      return;
    }

    if (!file.type.match(/^image\/(jpeg|png|gif|webp)$/)) {
      this.presentToast('Formato inválido. Use JPG, PNG, GIF ou WEBP', 'danger');
      return;
    }

    this.selectedFile = file;

    // Preview da imagem
    const reader = new FileReader();
    reader.onload = (e) => {
      this.imagePreview = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  protected removeImage(): void {
    this.imagePreview = null;
    this.selectedFile = null;

    // Se está editando e tem imagem no servidor, deletar
    if (this.mode === 'edit' && this.game?.id && this.game?.custom_image) {
      this.http.delete(`/api/games/${this.game.id}/image`, this.headers()).subscribe({
        next: () => {
          if (this.game) this.game.custom_image = null;
          this.presentToast('Imagem removida', 'success');
        },
        error: () => {
          this.presentToast('Erro ao remover imagem', 'danger');
        }
      });
    }
  }

  protected async uploadImage(gameId: number): Promise<void> {
    if (!this.selectedFile) return;

    this.uploadingImage = true;
    const formData = new FormData();
    formData.append('gameImage', this.selectedFile);

    console.log('Enviando imagem para /api/games/' + gameId + '/image');

    return new Promise((resolve, reject) => {
      this.http.post(`/api/games/${gameId}/image`, formData, this.headers()).subscribe({
        next: (response) => {
          console.log('Upload bem-sucedido', response);
          this.uploadingImage = false;
          this.selectedFile = null;
          this.imagePreview = null;
          this.presentToast('Imagem enviada com sucesso', 'success');
          resolve();
        },
        error: (err) => {
          console.error('Erro no upload', err);
          this.uploadingImage = false;
          this.presentToast(err?.error?.error || 'Erro ao enviar imagem', 'danger');
          reject(err);
        }
      });
    });
  }

  // Método público para ser chamado após criar/editar o jogo
  public async uploadImageIfNeeded(gameId: number): Promise<void> {
    if (this.selectedFile) {
      console.log('Fazendo upload da imagem para o jogo', gameId);
      await this.uploadImage(gameId);
    } else {
      console.log('Nenhuma imagem selecionada para upload');
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toast.create({
      message,
      duration: 2000,
      color,
      position: 'top'
    });
    await toast.present();
  }

  private resetForm(): void {
    this.form.reset({
      name: '',
      platforms: [],
      genres: [],
      types: [],
    });
    this.submitted = false;
    this.imagePreview = null;
    this.selectedFile = null;
  }

  private syncControlWithOptions(controlName: 'platforms' | 'genres' | 'types', allowedIds: number[]): void {
    const control = this.form.get(controlName);
    if (!control) return;
    const value = (control.value as number[]) ?? [];
    const filtered = value.filter(id => allowedIds.includes(id));
    if (filtered.length !== value.length) {
      control.setValue(filtered);
    }
  }

  private requireSelection(): ValidatorFn {
    return (control: AbstractControl) => {
      const value = control.value as number[] | null | undefined;
      if (value && value.length > 0) {
        return null;
      }
      return { required: true };
    };
  }
}
