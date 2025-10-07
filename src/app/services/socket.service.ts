import { Injectable } from '@angular/core';
import io, { Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  connect(token: string) {
    if (this.socket?.connected) return this.socket;
    this.socket = io(environment.socketUrl || window.location.origin, {
      auth: { token }
    });
    return this.socket;
  }

  get() {
    return this.socket;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}
