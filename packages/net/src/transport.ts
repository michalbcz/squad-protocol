import type { ClientMessage, ServerMessage } from './protocol';

export type TransportEvent = { kind: 'open' } | { kind: 'close'; code?: number } | { kind: 'message'; message: ServerMessage } | { kind: 'invalid' };
export interface Transport {
  send(message: ClientMessage): void;
  subscribe(fn: (event: TransportEvent) => void): () => void;
  close(): void;
}

export function hostUrl(input: string): string {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid host URL');
  return url.origin;
}

export class WebSocketTransport implements Transport {
  private socket: WebSocket;
  private listeners = new Set<(event: TransportEvent) => void>();
  constructor(host: string) {
    const url = new URL('/ws', hostUrl(host));
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(url);
    this.socket.addEventListener('open', () => this.emit({ kind: 'open' }));
    this.socket.addEventListener('close', (event) => this.emit({ kind: 'close', code: event.code }));
    this.socket.addEventListener('error', () => { /* The close event drives recovery. */ });
    this.socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (!message || message.version !== 1 || !['room', 'snapshot', 'update', 'result', 'error', 'closed'].includes(message.kind)) throw new Error('Invalid frame');
        this.emit({ kind: 'message', message });
      } catch { this.emit({ kind: 'invalid' }); }
    });
  }
  send(message: ClientMessage): void { this.socket.send(JSON.stringify(message)); }
  subscribe(fn: (event: TransportEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  close(): void { this.socket.close(); }
  private emit(event: TransportEvent): void { for (const fn of this.listeners) fn(event); }
}
