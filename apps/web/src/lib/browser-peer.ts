import { DataChannelTransport, decodeSignal, LoopbackTransport, MultiplayerClient, parseClientMessage, Rooms, RtcLink, type Peer, type RtcEvent } from '@sp/net';
import { SCENARIOS, WEAPONS } from '@sp/content';

/** Keeps browser authority out of UI/controller state; only the client is exposed to the screen. */
export class BrowserPeer {
  client: MultiplayerClient | null = null;
  failed = false;
  private rooms: Rooms | null = null;
  private link: RtcLink | null = null;
  private room = '';
  private stopped = false;
  private unsubscribe: (() => void) | null = null;
  constructor(private config: RTCConfiguration | undefined, private changed: () => void) {}

  async host(): Promise<string> {
    this.rooms = new Rooms(SCENARIOS.kestrel!, WEAPONS);
    this.client = new MultiplayerClient(location.origin, undefined, () => new LoopbackTransport(this.rooms!));
    await this.waitForRoom();
    if (this.stopped) throw new Error('Cancelled');
    this.room = this.client.room!.room;
    const link = this.link = new RtcLink(this.config);
    const peer: Peer = { send: (message) => link.send({ version: 1, ...message }), close: () => link.close() };
    let suspendedSeat: ReturnType<Rooms['disconnect']> = null;
    let count = 0; let windowStart = Date.now();
    this.unsubscribe = link.subscribe((event) => {
      if (event.kind === 'message') {
        try {
          if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); count = 0; }
          if (++count > 120) throw new Error('Rate limit');
          const message = parseClientMessage(event.data);
          if (message.kind === 'create' || ((message.kind === 'join' || message.kind === 'resume') && message.room !== this.room)) throw new Error('Wrong room');
          if (suspendedSeat && message.kind === 'command') {
            peer.send({ kind: 'result', requestId: message.requestId, ok: false, error: 'opponentDisconnected' });
          } else if (suspendedSeat && message.kind === 'resume' && message.token === suspendedSeat.token) {
            // Our connected event restores the seat; neither side may play before it arrives.
          } else if (suspendedSeat && message.kind === 'leave') this.rooms!.closeRoom(this.room);
          else this.rooms!.handle(peer, message);
        } catch { link.close(); }
      } else if (event.kind === 'suspend') suspendedSeat = this.rooms!.disconnect(peer);
      else if (event.kind === 'resume' && suspendedSeat) {
        this.rooms!.handle(peer, { version: 1, kind: 'resume', ...suspendedSeat });
        suspendedSeat = null;
      } else if (event.kind === 'close') {
        this.failed = true;
        this.rooms?.disconnect(peer);
        this.rooms?.closeRoom(this.room);
      }
      this.changed();
    });
    return link.offer(this.room);
  }
  async join(code: string): Promise<string> {
    decodeSignal(code, 'offer');
    const link = this.link = new RtcLink(this.config);
    this.unsubscribe = link.subscribe((event: RtcEvent) => {
      if (event.kind === 'open') {
        this.client = new MultiplayerClient(location.origin, undefined, () => new DataChannelTransport(link), { automaticReconnect: false });
        let joined = false;
        this.client.subscribe((message) => {
          if (message.kind === 'status' && message.status === 'connected' && !joined) { joined = true; this.client!.join(link.room); }
          this.changed();
        });
      }
      if (event.kind === 'close') this.failed = true;
      this.changed();
    });
    return link.answer(code);
  }
  async accept(code: string): Promise<void> {
    if (!this.link) throw new Error('No offer');
    await this.link.acceptAnswer(code);
  }
  dispose(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribe?.(); this.unsubscribe = null;
    if (this.rooms && this.room) this.rooms.closeRoom(this.room);
    this.client?.dispose(); this.link?.close();
  }
  private waitForRoom(): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = this.client!;
      const timer = setTimeout(() => { unsubscribe(); reject(new Error('Room timeout')); }, 8000);
      const unsubscribe = client.subscribe((message) => {
        if (message.kind === 'status' && message.status === 'connected') client.create();
        if (message.kind === 'room') { clearTimeout(timer); unsubscribe(); resolve(); }
      });
    });
  }
}
