import { Component, OnInit, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { MessagesService } from '../../services/messages.service';
import { environment } from '../../../environments/environment';

type UserReportRow = {
  id: number;
  created_at: string;
  context: string;
  reason: string | null;
  attachments?: { url: string }[];
  reporter_id: number | null;
  reporter_name: string | null;
  reporter_nickname: string | null;
  reporter_email: string | null;
  reported_id: number | null;
  reported_name: string | null;
  reported_nickname: string | null;
  reported_email: string | null;
};

@Component({
  selector: 'app-admin-denuncias',
  templateUrl: './admin-denuncias.page.html',
  styleUrls: ['./admin-denuncias.page.scss'],
  standalone: false,
})
export class AdminDenunciasPage implements OnInit {
  private readonly messages = inject(MessagesService);
  private readonly alert = inject(AlertController);
  private readonly toast = inject(ToastController);

  private readonly mediaBase = environment.socketUrl.replace(/\/$/, '');

  loading = true;
  error = '';
  reports: UserReportRow[] = [];
  selectedOrder: 'created-desc' | 'created-asc' | 'name-asc' | 'name-desc' = 'created-desc';

  ngOnInit() {
    this.load();
  }

  load(ev?: any) {
    this.loading = !ev;
    this.error = '';

    // Sem limite -> backend retorna todas (inclui histórico archive)
    this.messages.getReports(0).subscribe({
      next: (rows) => {
        this.applyData((rows || []) as UserReportRow[]);
        this.loading = false;
        ev?.target?.complete?.();
      },
      error: () => {
        this.error = 'Não foi possível carregar as denúncias agora.';
        this.loading = false;
        ev?.target?.complete?.();
      }
    });
  }

  onOrderChange(order: string | number | null | undefined) {
    const allowed = ['created-desc', 'created-asc', 'name-asc', 'name-desc'] as const;
    const input = typeof order === 'string' ? order : '';
    const value = (allowed as readonly string[]).includes(input)
      ? (input as typeof allowed[number])
      : this.selectedOrder;
    if (this.selectedOrder === value) return;
    this.selectedOrder = value;
    this.applyData([...this.reports]);
  }

  private applyData(list: UserReportRow[]) {
    const normalized = (list || []).map((r) => {
      const att = Array.isArray((r as any)?.attachments) ? (r as any).attachments : [];
      const attachments = att
        .map((a: any) => ({ url: this.normalizeMediaUrl(a?.url) }))
        .filter((a: any) => !!a.url);
      return { ...r, attachments };
    });
    this.reports = this.sortReports(normalized);
  }

  private normalizeMediaUrl(url?: string | null): string {
    const value = String(url ?? '').trim();
    if (!value) return '';
    if (/^https?:/i.test(value)) return value;
    const suffix = value.startsWith('/') ? value : `/${value}`;
    return `${this.mediaBase}${suffix}`;
  }

  private sortReports(list: UserReportRow[]) {
    const copy = [...list];
    switch (this.selectedOrder) {
      case 'created-asc':
        return copy.sort((a, b) => this.dateTimeValue(a.created_at) - this.dateTimeValue(b.created_at));
      case 'name-asc':
        return copy.sort((a, b) => this.localeCompare(this.reportedLabel(a), this.reportedLabel(b)) || this.resolveDateFallback(a, b, false));
      case 'name-desc':
        return copy.sort((a, b) => this.localeCompare(this.reportedLabel(b), this.reportedLabel(a)) || this.resolveDateFallback(a, b, true));
      case 'created-desc':
      default:
        return copy.sort((a, b) => this.dateTimeValue(b.created_at) - this.dateTimeValue(a.created_at));
    }
  }

  private resolveDateFallback(a: UserReportRow, b: UserReportRow, desc = false) {
    const diff = this.dateTimeValue(a.created_at) - this.dateTimeValue(b.created_at);
    return desc ? -diff : diff;
  }

  private localeCompare(a: string, b: string) {
    return (a || '').localeCompare(b || '', 'pt-BR', { sensitivity: 'base' });
  }

  private dateTimeValue(value: string) {
    const dt = new Date(value);
    const ts = dt.getTime();
    return Number.isNaN(ts) ? 0 : ts;
  }

  private reportedLabel(rep: UserReportRow) {
    return this.displayUser(rep.reported_name, rep.reported_nickname, rep.reported_id);
  }

  trackById(_: number, item: UserReportRow) {
    return item.id;
  }

  formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return { datePart: value, timePart: '' };
    }

    const datePart = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);

    const timePart = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);

    return { datePart, timePart };
  }

  displayUser(name: string | null, nickname: string | null, id: number | null) {
    const label = (nickname || name || (id != null ? `Usuário #${id}` : 'Usuário'));
    return label;
  }

  formatContext(value: string | null | undefined) {
    const input = (value || '').trim();
    switch (input) {
      case 'direct_chat':
        return 'Chat direto';
      case 'group_chat':
        return 'Chat em grupo';
      case 'chat':
        return 'Chat';
      default:
        return input || 'Chat';
    }
  }

  async confirmDelete(rep: UserReportRow) {
    if (!rep?.id) return;

    const reported = this.displayUser(rep.reported_name, rep.reported_nickname, rep.reported_id);
    const isArchive = Number(rep.id) < 0;
    const label = isArchive ? 'denúncia do histórico' : 'denúncia';

    const alert = await this.alert.create({
      header: 'Apagar denúncia',
      message: `Confirme para apagar esta ${label} de <strong>${reported}</strong>. Esta ação não pode ser desfeita.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Apagar',
          role: 'destructive',
          handler: () => this.deleteReport(rep),
        }
      ]
    });

    await alert.present();
  }

  private deleteReport(rep: UserReportRow) {
    const id = Number(rep.id);
    this.messages.deleteReport(id).subscribe({
      next: () => {
        this.reports = this.reports.filter(r => r.id !== rep.id);
        this.presentToast('Denúncia apagada.', 'success');
      },
      error: (err) => {
        const status = Number(err?.status || 0);
        const backendMsg = err?.error?.error;
        const msg = typeof backendMsg === 'string' && backendMsg.trim().length
          ? backendMsg
          : (status === 404 || status === 405)
            ? 'Seu servidor não reconheceu a ação de apagar por item. Reinicie o backend na versão mais recente.'
            : 'Não foi possível apagar a denúncia.';
        this.presentToast(msg, 'danger');
      }
    });
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'primary' | 'warning' = 'primary') {
    const toast = await this.toast.create({
      message,
      color,
      duration: 2500,
      position: 'bottom'
    });
    await toast.present();
  }

  async confirmClearAll() {
    if (this.loading || !this.reports.length) return;

    const alert = await this.alert.create({
      header: 'Apagar denúncias',
      message: 'Confirme para apagar todas as denúncias registradas. Esta ação não pode ser desfeita.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Apagar tudo',
          role: 'destructive',
          handler: () => this.clearAll(),
        }
      ]
    });

    await alert.present();
  }

  private clearAll() {
    this.loading = true;
    this.error = '';

    this.messages.clearReports().subscribe({
      next: (res) => {
        const deleted = Number(res?.deleted ?? 0);
        this.reports = [];
        this.loading = false;
        this.presentToast(`Denúncias apagadas (${deleted}).`, 'success');
      },
      error: (err) => {
        this.loading = false;
        const msg = err?.error?.error || 'Não foi possível apagar as denúncias.';
        this.presentToast(msg, 'danger');
      }
    });
  }
}
