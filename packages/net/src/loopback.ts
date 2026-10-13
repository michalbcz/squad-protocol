import { Rooms, type Peer } from './authority';
import { parseClientMessage, SEAT_REPLACED_CLOSE_CODE, type ClientMessage } from './protocol';
import type { Transport, TransportEvent } from './transport';

export class LoopbackTransport implements Transport {
  private listeners = new Set<(event: TransportEvent) => void>();
  private closed = false;
  private peer: Peer;
  constructor(private rooms: Rooms) {
    this.peer = {
      send: (message) => this.deliver({ kind: 'message', message: structuredClone({ version: 1, ...message }) }),
      close: () => this.close(SEAT_REPLACED_CLOSE_CODE),
    };
    this.deliver({ kind: 'open' });
  }
  send(message: ClientMessage): void {
    if (this.closed) throw new Error('Closed loopback');
    const plain = parseClientMessage(structuredClone(message));
    this.rooms.handle(this.peer, plain);
  }
  subscribe(fn: (event: TransportEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  close(code?: number): void {
    if (this.closed) return;
    this.closed = true; this.rooms.disconnect(this.peer);
    for (const fn of this.listeners) fn({ kind: 'close', code });
    this.listeners.clear();
  }
  private deliver(event: TransportEvent): void { queueMicrotask(() => { if (!this.closed) for (const fn of this.listeners) fn(event); }); }
}
