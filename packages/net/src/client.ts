import type { Command } from '@sp/engine';
import type { ClientMessage, NetError, RoomInfo, ServerMessage, SubmitResult } from './protocol';
import { WebSocketTransport, hostUrl, type Transport } from './transport';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'closed';
export interface Credential { room: string; token: string }
export type ClientUpdate = ServerMessage | { kind: 'status'; status: ConnectionStatus };
type Snapshot = Extract<ServerMessage, { kind: 'snapshot' }>;
interface Pending { command: Command; resolve(result: SubmitResult): void; timer: ReturnType<typeof setTimeout> }

export class MultiplayerClient {
  readonly host: string;
  status: ConnectionStatus = 'connecting';
  room: RoomInfo | null = null;
  snapshot: Snapshot | null = null;
  synced = false;
  error: NetError | null = null;
  private credential: Credential | null = null;
  private listeners = new Set<(event: ClientUpdate) => void>();
  private pending = new Map<string, Pending>();
  private transport: Transport | null = null;
  private unsubscribe: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private disposed = false;
  private serial = 0;
  private requestPrefix = Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('');

  constructor(host: string, credential?: Credential, private factory: (host: string) => Transport = (url) => new WebSocketTransport(url)) {
    this.host = hostUrl(host);
    this.credential = credential ? { room: credential.room, token: credential.token } : null;
    this.connect();
  }
  subscribe(fn: (event: ClientUpdate) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  create(): void { this.send({ version: 1, kind: 'create' }); }
  join(room: string): void { this.send({ version: 1, kind: 'join', room: room.trim().toUpperCase() }); }
  resume(credential: Credential): void {
    this.credential = { room: credential.room, token: credential.token };
    this.send({ version: 1, kind: 'resume', ...this.credential });
  }
  start(): void { this.send({ version: 1, kind: 'start' }); }
  leave(): void {
    if (this.status === 'connected' && this.room) this.send({ version: 1, kind: 'leave' });
    this.credential = null;
    this.dispose();
  }
  reconnect(): void {
    if (this.disposed) return;
    this.attempts = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connect();
  }
  submit(command: Command): Promise<SubmitResult> {
    if (this.status !== 'connected' || !this.synced || !this.snapshot) return Promise.resolve({ ok: false, error: 'disconnected' });
    if (!this.room?.players.every((p) => p.connected) || this.room.players.length !== 2) return Promise.resolve({ ok: false, error: 'opponentDisconnected' });
    if (this.pending.size) return Promise.resolve({ ok: false, error: 'notReady' });
    const requestId = `${this.requestPrefix}:${++this.serial}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ ok: false, error: 'timeout' });
        // A command may have committed; recover its authoritative snapshot, never replay it blindly.
        this.transport?.close();
      }, 8000);
      this.pending.set(requestId, { command: structuredClone(command), resolve, timer });
      this.send({ version: 1, kind: 'command', requestId, revision: this.snapshot!.revision, command });
    });
  }
  commandFor(requestId: string | undefined): Command | undefined { return requestId ? this.pending.get(requestId)?.command : undefined; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopTransport();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.failPending('disconnected');
    this.listeners.clear();
  }
  private connect(): void {
    this.stopTransport();
    this.setStatus(this.attempts ? 'reconnecting' : 'connecting');
    try {
      const transport = this.factory(this.host);
      this.transport = transport;
      this.unsubscribe = transport.subscribe((event) => {
        if (transport !== this.transport || this.disposed) return;
        if (event.kind === 'open') {
          if (this.openTimer) clearTimeout(this.openTimer);
          this.error = null;
          this.setStatus('connected');
          if (this.credential) this.send({ version: 1, kind: 'resume', ...this.credential });
          else this.attempts = 0;
        } else if (event.kind === 'close') this.lostConnection();
        else if (event.kind === 'invalid') {
          this.error = 'invalidMessage';
          this.emit({ version: 1, kind: 'error', code: 'invalidMessage' });
          transport.close();
        } else this.receive(event.message);
      });
      this.openTimer = setTimeout(() => { transport.close(); }, 8000);
    } catch { this.lostConnection(); }
  }
  private receive(message: ServerMessage): void {
    if (message.kind === 'room') {
      this.room = message;
      this.credential = { room: message.room, token: message.token };
      this.attempts = 0;
      if (!message.started) this.synced = true;
    } else if (message.kind === 'snapshot') { this.snapshot = message; this.synced = true; }
    else if (message.kind === 'update' && this.snapshot) {
      this.snapshot = { ...this.snapshot, view: message.view, revision: message.revision };
    } else if (message.kind === 'result') {
      const pending = this.pending.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        pending.resolve(message.ok ? { ok: true, events: [] } : { ok: false, error: message.error ?? 'invalidMessage' });
      }
    } else if (message.kind === 'error') {
      this.error = message.code;
      this.failPending(message.code);
      if (['invalidToken', 'roomNotFound'].includes(message.code)) {
        const wasPlaying = !!this.snapshot;
        this.credential = null;
        this.room = null;
        this.snapshot = null;
        this.synced = false;
        if (wasPlaying) { this.setStatus('closed'); this.stopTransport(); }
      }
    } else if (message.kind === 'closed') {
      this.credential = null;
      this.room = null;
      this.failPending('roomNotFound');
      this.setStatus('closed');
      this.stopTransport();
    }
    this.emit(message);
  }
  private lostConnection(): void {
    this.synced = false;
    this.failPending('disconnected');
    this.stopTransport();
    if (this.disposed || this.status === 'closed') return;
    if (this.credential && this.attempts < 5) {
      this.setStatus('reconnecting');
      this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, Math.min(5000, 500 * 2 ** this.attempts++));
    } else this.setStatus('disconnected');
  }
  private stopTransport(): void {
    if (this.openTimer) clearTimeout(this.openTimer);
    this.openTimer = null;
    this.unsubscribe?.(); this.unsubscribe = null;
    const transport = this.transport; this.transport = null;
    transport?.close();
  }
  private send(message: ClientMessage): void {
    if (this.status !== 'connected') {
      this.error = 'disconnected'; this.emit({ version: 1, kind: 'error', code: 'disconnected' }); return;
    }
    try { this.transport?.send(message); }
    catch { this.lostConnection(); }
  }
  private failPending(error: NetError): void {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.resolve({ ok: false, error }); }
    this.pending.clear();
  }
  private setStatus(status: ConnectionStatus): void { this.status = status; this.emit({ kind: 'status', status }); }
  private emit(message: ClientUpdate): void { for (const fn of this.listeners) fn(message); }
}
