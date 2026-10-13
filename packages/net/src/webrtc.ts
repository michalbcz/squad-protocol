import { MAX_FRAME_BYTES, type ClientMessage, type ServerMessage } from './protocol';
import { decodeSignal, encodeSignal } from './signal';
import type { Transport, TransportEvent } from './transport';

export type RtcEvent = { kind: 'open' } | { kind: 'close' } | { kind: 'suspend' } | { kind: 'resume' } | { kind: 'message'; data: unknown };
export class RtcLink {
  readonly pc: RTCPeerConnection;
  room = '';
  private channel: RTCDataChannel | null = null;
  private listeners = new Set<(event: RtcEvent) => void>();
  private opened = false;
  private closed = false;
  private suspended = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }) {
    this.pc = new RTCPeerConnection(config);
    this.pc.addEventListener('datachannel', (event) => {
      if (this.channel || event.channel.label !== 'squad-protocol' || event.channel.protocol !== 'squad-protocol/v1') { event.channel.close(); return; }
      this.attach(event.channel);
    });
    this.pc.addEventListener('connectionstatechange', () => {
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') this.close();
      else if (this.opened && this.pc.connectionState === 'disconnected') {
        if (!this.suspended) { this.suspended = true; this.emit({ kind: 'suspend' }); }
        this.clearTimer(); this.timer = setTimeout(() => this.close(), 30_000);
      } else if (this.opened && this.pc.connectionState === 'connected' && this.suspended) {
        this.suspended = false; this.clearTimer(); this.emit({ kind: 'resume' });
      }
    });
  }
  get ready(): boolean { return this.opened && !this.closed && this.channel?.readyState === 'open'; }
  subscribe(fn: (event: RtcEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  async offer(room: string): Promise<string> {
    this.room = room;
    this.attach(this.pc.createDataChannel('squad-protocol', { ordered: true, protocol: 'squad-protocol/v1' }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    return this.localCode('offer');
  }
  async answer(code: string): Promise<string> {
    const signal = decodeSignal(code, 'offer'); this.room = signal.room;
    await this.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    const result = await this.localCode('answer'); this.awaitConnection(); return result;
  }
  async acceptAnswer(code: string): Promise<void> {
    const signal = decodeSignal(code, 'answer', this.room);
    await this.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    this.awaitConnection();
  }
  send(input: unknown): void {
    // Seat recovery/control frames can arrive before the other peer's ICE-state notification.
    // Gameplay is paused by the client/authority; an open channel still carries recovery frames.
    if (!this.ready) throw new Error('RTC channel unavailable');
    const frame = JSON.stringify(input);
    if (new TextEncoder().encode(frame).byteLength > MAX_FRAME_BYTES || this.channel!.bufferedAmount > 1024 * 1024) { this.close(); throw new Error('RTC frame limit'); }
    this.channel!.send(frame);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.clearTimer();
    this.channel?.close(); this.pc.close();
    this.emit({ kind: 'close' }); this.listeners.clear();
  }
  private attach(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.addEventListener('open', () => {
      if (this.closed) return;
      this.opened = true; this.clearTimer(); this.emit({ kind: 'open' });
    });
    channel.addEventListener('close', () => this.close());
    channel.addEventListener('error', () => this.close());
    channel.addEventListener('message', (event) => {
      try {
        if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).byteLength > MAX_FRAME_BYTES) throw new Error('Invalid frame');
        const data: unknown = JSON.parse(event.data);
        this.emit({ kind: 'message', data });
      } catch { this.close(); }
    });
  }
  private async localCode(kind: 'offer' | 'answer'): Promise<string> {
    if (this.pc.iceGatheringState !== 'complete') await new Promise<void>((resolve, reject) => {
      const done = () => {
        if (this.pc.iceGatheringState === 'complete') { cleanup(); resolve(); }
      };
      const unsubscribe = this.subscribe((event) => { if (event.kind === 'close') { cleanup(); reject(new Error('RTC setup cancelled')); } });
      const timer = setTimeout(() => { cleanup(); reject(new Error('ICE gathering timed out')); }, 12_000);
      const cleanup = () => { clearTimeout(timer); unsubscribe(); this.pc.removeEventListener('icegatheringstatechange', done); };
      this.pc.addEventListener('icegatheringstatechange', done); done();
    });
    if (this.closed || !this.pc.localDescription?.sdp) throw new Error('RTC setup cancelled');
    return encodeSignal({ format: 'squad-protocol/webrtc-signal', version: 1, kind, room: this.room, sdp: this.pc.localDescription.sdp });
  }
  private awaitConnection(): void { if (!this.opened && !this.closed) { this.clearTimer(); this.timer = setTimeout(() => this.close(), 120_000); } }
  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private emit(event: RtcEvent): void { for (const fn of this.listeners) fn(event); }
}

export class DataChannelTransport implements Transport {
  private listeners = new Set<(event: TransportEvent) => void>();
  private unsubscribe: () => void;
  private closed = false;
  constructor(private link: RtcLink) {
    this.unsubscribe = link.subscribe((event) => {
      if (event.kind === 'message') {
        const message = event.data as ServerMessage;
        if (!message || message.version !== 1 || !['room', 'snapshot', 'update', 'result', 'error', 'closed'].includes(message.kind)) this.emit({ kind: 'invalid' });
        else this.emit({ kind: 'message', message });
      } else this.emit(event);
    });
    if (link.ready) queueMicrotask(() => this.emit({ kind: 'open' }));
  }
  send(message: ClientMessage): void { this.link.send(message); }
  subscribe(fn: (event: TransportEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.link.close();
    this.unsubscribe(); this.listeners.clear();
  }
  private emit(event: TransportEvent): void { for (const fn of this.listeners) fn(event); }
}
