import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NotificationsBadgeSyncService {
  private readonly refreshSubject = new Subject<void>();

  /** Emite um pedido para re-sincronizar contadores de notificação (sininho). */
  readonly refresh$ = this.refreshSubject.asObservable();

  requestRefresh() {
    this.refreshSubject.next();
  }
}
