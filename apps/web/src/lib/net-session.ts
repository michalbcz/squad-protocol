import { MultiplayerClient, type SubmitResult, type ClientUpdate, type ScenarioInfo } from '@sp/net';
import type { Command, PlayerView } from '@sp/engine';
import type { Session, SessionUpdate } from './session';

export class NetSession implements Session {
  readonly scenario: ScenarioInfo;
  private currentView: PlayerView;
  private listeners = new Set<(update: SessionUpdate) => void>();
  private unsubscribe: () => void;
  constructor(readonly client: MultiplayerClient, private onDispose?: () => void) {
    if (!client.snapshot) throw new Error('Network session requires a snapshot');
    this.scenario = client.snapshot.scenario;
    this.currentView = client.snapshot.view;
    this.unsubscribe = client.subscribe((message) => this.receive(message));
  }
  get viewer(): string { return this.currentView.side; }
  get view(): PlayerView { return this.currentView; }
  get connection(): NonNullable<Session['connection']> {
    if (this.client.status !== 'connected') return this.client.status;
    if (!this.client.synced) return 'reconnecting';
    if (!this.client.room || this.client.room.players.length !== 2 || this.client.room.players.some((p) => !p.connected)) return 'opponentDisconnected';
    return 'connected';
  }
  submit(command: Command): Promise<SubmitResult> { return this.client.submit(command); }
  subscribe(fn: (update: SessionUpdate) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  acceptHandoff(): void {}
  reconnect(): void { this.client.reconnect(); }
  dispose(): void { this.unsubscribe(); this.listeners.clear(); this.client.leave(); this.onDispose?.(); }
  private receive(message: ClientUpdate): void {
    if (message.kind === 'snapshot' || message.kind === 'update') {
      this.currentView = message.view;
      const command = message.kind === 'update' ? this.client.commandFor(message.requestId) : undefined;
      this.emit({ kind: 'events', view: message.view, events: message.kind === 'update' ? message.events : [], command });
      if (message.kind === 'snapshot') this.emit({ kind: 'connection', status: this.connection });
    } else if (message.kind === 'room' || message.kind === 'status' || message.kind === 'closed' || message.kind === 'error') this.emit({ kind: 'connection', status: this.connection });
  }
  private emit(message: SessionUpdate): void { for (const listener of this.listeners) listener(message); }
}
