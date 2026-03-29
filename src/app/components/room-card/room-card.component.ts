import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-room-card',
  templateUrl: './room-card.component.html',
  styleUrls: ['./room-card.component.scss']
})
export class RoomCardComponent {
  @Input() room: any;
  
  copyLink() {
    const link = (this.room && this.room.link) ? this.room.link : '';
    if (!link) return;
    if (navigator && (navigator as any).clipboard && typeof (navigator as any).clipboard.writeText === 'function') {
      (navigator as any).clipboard.writeText(link).catch(() => this.fallbackCopy(link));
    } else {
      this.fallbackCopy(link);
    }
  }

  private fallbackCopy(text: string) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {
      // ignore
    }
  }
}
