import { Component, Input, inject } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { MessagesService } from '../../services/messages.service';

export type ReportCategory =
  | 'Conteúdo impróprio'
  | 'Xingamentos'
  | 'Assédio'
  | 'Spam'
  | 'Golpe/Fraude'
  | 'Outros';

@Component({
  selector: 'app-report-user-modal',
  templateUrl: './report-user.modal.html',
  styleUrls: ['./report-user.modal.scss'],
  standalone: false,
})
export class ReportUserModalComponent {
  @Input() reportedUserId!: number;
  @Input() reportedUserName?: string | null;

  readonly categories: ReportCategory[] = [
    'Conteúdo impróprio',
    'Xingamentos',
    'Assédio',
    'Spam',
    'Golpe/Fraude',
    'Outros',
  ];

  category: ReportCategory = 'Conteúdo impróprio';
  details = '';

  photos: File[] = [];
  photoPreviews: { file: File; url: string }[] = [];

  submitting = false;

  private readonly modal = inject(ModalController);
  private readonly msgSvc = inject(MessagesService);
  private readonly toastCtrl = inject(ToastController);

  titleLabel() {
    const name = String(this.reportedUserName ?? '').trim();
    return name ? `Denunciar ${name}` : 'Denunciar jogador';
  }

  async close(role: 'cancel' | 'dismiss' = 'dismiss') {
    this.cleanupPreviews();
    await this.modal.dismiss(null, role);
  }

  onFilesSelected(ev: Event) {
    const input = ev.target as HTMLInputElement | null;
    const list = input?.files;
    if (!list || !list.length) return;

    const incoming = Array.from(list);
    for (const f of incoming) {
      if (!/^image\//i.test(f.type)) continue;
      if (this.photos.some((p) => p.name === f.name && p.size === f.size && p.lastModified === f.lastModified)) {
        continue;
      }
      this.photos.push(f);
      this.photoPreviews.push({ file: f, url: URL.createObjectURL(f) });
    }

    // Permite re-selecionar o mesmo arquivo
    try {
      if (input) input.value = '';
    } catch {}
  }

  removePhoto(idx: number) {
    const entry = this.photoPreviews[idx];
    if (entry?.url) URL.revokeObjectURL(entry.url);

    const file = entry?.file;
    this.photoPreviews.splice(idx, 1);
    if (file) {
      this.photos = this.photos.filter((p) => p !== file);
    }
  }

  private cleanupPreviews() {
    for (const p of this.photoPreviews) {
      try {
        if (p?.url) URL.revokeObjectURL(p.url);
      } catch {}
    }
    this.photoPreviews = [];
  }

  private async toast(message: string) {
    const t = await this.toastCtrl.create({
      message,
      duration: 2200,
      position: 'bottom',
    });
    await t.present();
  }

  async submit() {
    if (!Number.isFinite(Number(this.reportedUserId)) || Number(this.reportedUserId) <= 0) {
      await this.toast('Usuário inválido para denúncia.');
      return;
    }

    if (this.submitting) return;
    this.submitting = true;

    const details = String(this.details ?? '').trim();
    const normalizedDetails = details.length > 900 ? details.slice(0, 900) : details;

    try {
      const res = await firstValueFrom(
        this.msgSvc.reportUserWithEvidence(this.reportedUserId, {
          category: this.category,
          details: normalizedDetails || undefined,
          photos: this.photos,
        })
      );

      this.cleanupPreviews();
      await this.modal.dismiss({ ok: true, result: res }, 'done');
    } catch (err: any) {
      const apiError = err?.error;
      const firstValidation = Array.isArray(apiError?.errors) ? apiError.errors[0] : null;

      if (apiError?.error === 'invalid_user') {
        await this.toast('Não foi possível denunciar: usuário inválido.');
      } else if (apiError?.error === 'invalid_target') {
        await this.toast('Você não pode denunciar a si mesmo.');
      } else if (firstValidation?.msg) {
        await this.toast(String(firstValidation.msg));
      } else {
        await this.toast('Não foi possível enviar a denúncia agora. Tente novamente mais tarde.');
      }
    } finally {
      this.submitting = false;
    }
  }
}
