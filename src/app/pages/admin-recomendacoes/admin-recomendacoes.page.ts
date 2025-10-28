import { Component, OnInit, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { finalize } from 'rxjs/operators';
import { GameRecommendation, GameRecommendationsService, GameRecommendationUpdateResponse } from '../../services/game-recommendations.service';

@Component({
  selector: 'app-admin-recomendacoes',
  templateUrl: './admin-recomendacoes.page.html',
  styleUrls: ['./admin-recomendacoes.page.scss'],
  standalone: false,
})
export class AdminRecomendacoesPage implements OnInit {
  private readonly service = inject(GameRecommendationsService);
  private readonly alert = inject(AlertController);
  private readonly toast = inject(ToastController);

  recommendations: GameRecommendation[] = [];
  loading = false;
  error = '';
  counts = { pending: 0, accepted: 0, rejected: 0 };
  selectedOrder: 'created-desc' | 'created-asc' | 'name-asc' | 'name-desc' = 'created-desc';

  private readonly dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  ngOnInit() {
    this.load();
  }

  load(event?: CustomEvent) {
    if (!event) this.loading = true;
    this.service.list({ order: this.selectedOrder })
      .pipe(finalize(() => {
        this.loading = false;
        if (event && 'detail' in event && typeof (event as any).detail?.complete === 'function') {
          (event as any).detail.complete();
        }
      }))
      .subscribe({
        next: (list) => {
          this.applyData(list || []);
          this.error = '';
        },
        error: (err) => {
          this.error = err?.error?.error || 'Não foi possível carregar as recomendações.';
          this.presentToast(this.error, 'danger');
        }
      });
  }

  trackById(_: number, item: GameRecommendation) {
    return item.id;
  }

  onOrderChange(order: string | number | null | undefined) {
    const allowed = ['created-desc', 'created-asc', 'name-asc', 'name-desc'] as const;
    const input = typeof order === 'string' ? order : '';
    const value = (allowed as readonly string[]).includes(input)
      ? (input as typeof allowed[number])
      : this.selectedOrder;
    if (this.selectedOrder === value) return;
    this.selectedOrder = value;
    this.load();
  }

  statusLabel(status: GameRecommendation['status']) {
    switch (status) {
      case 'accepted': return 'Aceita';
      case 'rejected': return 'Rejeitada';
      default: return 'Pendente';
    }
  }

  statusColor(status: GameRecommendation['status']) {
    switch (status) {
      case 'accepted': return 'success';
      case 'rejected': return 'danger';
      default: return 'warning';
    }
  }

  formatDate(value?: string | null) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return this.dateFormatter.format(date);
  }

  async decide(rec: GameRecommendation, decision: 'accepted' | 'rejected') {
    const header = decision === 'accepted' ? 'Aceitar recomendação' : 'Rejeitar recomendação';
    const message = decision === 'accepted'
      ? 'Confirme para marcar a sugestão como aceita. Você pode adicionar uma nota interna (opcional).'
      : 'Confirme para marcar a sugestão como rejeitada. Você pode adicionar uma nota explicando o motivo (opcional).';

    const alert = await this.alert.create({
      header,
      message,
      inputs: [
        {
          name: 'adminNotes',
          type: 'textarea',
          placeholder: 'Notas internas (opcional)',
          attributes: { rows: 3 },
          value: rec.adminNotes || '',
        }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: decision === 'accepted' ? 'Aceitar' : 'Rejeitar',
          handler: (data: any) => {
            const notes = typeof data?.adminNotes === 'string' ? data.adminNotes.trim() : undefined;
            this.applyDecision(rec, decision, notes);
          }
        }
      ]
    });

    await alert.present();
  }

  async reopen(rec: GameRecommendation) {
    const alert = await this.alert.create({
      header: 'Reabrir recomendação',
      message: 'Deseja mover esta recomendação de volta para pendente?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Reabrir',
          handler: () => this.applyDecision(rec, 'pending')
        }
      ]
    });

    await alert.present();
  }

  get hasPending() {
    return this.counts.pending > 0;
  }

  private applyDecision(rec: GameRecommendation, status: GameRecommendation['status'], adminNotes?: string) {
    const payload: { status?: GameRecommendation['status']; adminNotes?: string | null } = { status };
    if (adminNotes !== undefined) {
      payload.adminNotes = adminNotes.length ? adminNotes : null;
    }

    this.service.update(rec.id, payload).subscribe({
      next: (updated: GameRecommendationUpdateResponse) => {
        const { message, ...recommendation } = updated;
        this.updateLocal(recommendation);
        const fallbackMessage = status === 'pending'
          ? 'Recomendação reaberta.'
          : status === 'accepted'
            ? 'Recomendação marcada como aceita.'
            : 'Recomendação marcada como rejeitada.';
        this.presentToast(message || fallbackMessage, 'success');
      },
      error: (err) => {
        const message = err?.error?.error || 'Não foi possível atualizar a recomendação.';
        this.presentToast(message, 'danger');
      }
    });
  }

  private applyData(list: GameRecommendation[]) {
    const sorted = this.sortRecommendations(list);
    this.recommendations = sorted;
    this.counts = list.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, { pending: 0, accepted: 0, rejected: 0 } as { pending: number; accepted: number; rejected: number });
  }

  private updateLocal(updated: GameRecommendation) {
    const index = this.recommendations.findIndex(r => r.id === updated.id);
    if (index >= 0) {
      this.recommendations[index] = updated;
    } else {
      this.recommendations.push(updated);
    }
  this.applyData([...this.recommendations]);
  }

  private sortRecommendations(list: GameRecommendation[]) {
    const copy = [...list];
    switch (this.selectedOrder) {
      case 'created-asc':
        return copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case 'name-asc':
        return copy.sort((a, b) => this.localeCompare(a.gameName, b.gameName) || this.resolveDateFallback(a, b, false));
      case 'name-desc':
        return copy.sort((a, b) => this.localeCompare(b.gameName, a.gameName) || this.resolveDateFallback(a, b, true));
      case 'created-desc':
      default:
        return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  private resolveDateFallback(a: GameRecommendation, b: GameRecommendation, desc = false) {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return desc ? -diff : diff;
  }

  private localeCompare(a: string, b: string) {
    return (a || '').localeCompare(b || '', 'pt-BR', { sensitivity: 'base' });
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'primary' | 'warning' = 'primary') {
    const toast = await this.toast.create({
      message,
      color,
      duration: 2800,
      position: 'bottom'
    });
    await toast.present();
  }
}
