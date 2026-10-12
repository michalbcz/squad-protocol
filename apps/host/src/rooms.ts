import { randomBytes } from 'node:crypto';
import { Match, type Command, type Scenario, type WeaponDef } from '@sp/engine';
import { type ClientMessage, type ServerBody, type SubmitError } from '@sp/net';

export interface Peer { send(message: ServerBody): void; close(): void }
interface Seat { side: string; token: string; peer: Peer | null; results: Map<string, ServerBody> }
interface Room { code: string; seats: Seat[]; match: Match | null; revision: number; touched: number; unsubscribe?: () => void }
export class Rooms {
  private rooms = new Map<string, Room>();
  private bindings = new Map<Peer, { room: Room; seat: Seat }>();
  constructor(private scenario: Scenario, private weapons: Record<string, WeaponDef>, private now = () => Date.now(), private seed = () => randomBytes(4).readInt32LE()) {}

  handle(peer: Peer, message: ClientMessage): void {
    this.sweep();
    const binding = this.bindings.get(peer);
    if (message.kind === 'create' || message.kind === 'join' || message.kind === 'resume') {
      if (binding) return this.error(peer, 'alreadyJoined');
      if (message.kind === 'create') {
        if (this.rooms.size >= 100) return this.error(peer, 'capacity');
        let code: string;
        do { code = randomBytes(4).toString('hex').toUpperCase(); } while (this.rooms.has(code));
        const room: Room = { code, seats: [], match: null, revision: 0, touched: this.now() };
        this.rooms.set(code, room);
        this.claim(room, peer, this.scenario.sides[0]!.id);
      } else {
        const room = this.rooms.get(message.room);
        if (!room) return this.error(peer, 'roomNotFound');
        if (message.kind === 'join') {
          if (room.seats.length >= 2 || room.match) return this.error(peer, 'roomFull');
          this.claim(room, peer, this.scenario.sides[1]!.id);
        } else {
          const seat = room.seats.find((s) => s.token === message.token);
          if (!seat) return this.error(peer, 'invalidToken');
          if (seat.peer) { this.bindings.delete(seat.peer); seat.peer.close(); }
          seat.peer = peer;
          this.bindings.set(peer, { room, seat });
          room.touched = this.now();
          this.broadcastRoom(room);
          if (room.match) this.snapshot(room, seat);
        }
      }
      return;
    }
    if (!binding) return this.error(peer, 'roomNotFound');
    const { room, seat } = binding;
    room.touched = this.now();
    if (message.kind === 'leave') return this.destroy(room, 'left');
    if (message.kind === 'start') {
      if (seat !== room.seats[0]) return this.error(peer, 'notHost');
      if (room.match || room.seats.length !== 2 || room.seats.some((s) => !s.peer)) return this.error(peer, 'notReady');
      const scenario = { ...this.scenario, sides: this.scenario.sides.map((s) => ({ ...s, controller: 'human' as const })) };
      room.match = new Match(scenario, this.weapons, this.seed(), { recordCommands: false });
      this.broadcastRoom(room);
      for (const s of room.seats) this.snapshot(room, s);
      return;
    }
    const cached = seat.results.get(message.requestId);
    if (cached) { this.snapshot(room, seat); peer.send(cached); return; }
    const reject = (error: SubmitError) => this.result(seat, message.requestId, false, error);
    if (!room.match) return reject('notReady');
    if (room.seats.some((s) => !s.peer)) return reject('opponentDisconnected');
    if (message.command.side !== seat.side) return reject('notYourTurn');
    if (message.revision !== room.revision) { this.snapshot(room, seat); return reject('stale'); }
    // Subscribe for this command only, so its id is attached solely to the issuing side.
    const updates: ServerBody[] = [];
    const unsubscribe = room.match.subscribe((side, view, events) => {
      const update: ServerBody = { kind: 'update', view, events, revision: room.revision + 1, ...(side === seat.side ? { requestId: message.requestId } : {}) };
      updates.push(update);
    });
    const result = room.match.submit(message.command as Command);
    unsubscribe();
    if (!result.ok) return reject(result.error);
    room.revision++;
    for (const update of updates) {
      if (update.kind === 'update') room.seats.find((s) => s.side === update.view.side)?.peer?.send(update);
    }
    // The raw engine result contains unredacted events and must never cross the wire.
    this.result(seat, message.requestId, true);
  }

  disconnect(peer: Peer): void {
    const binding = this.bindings.get(peer);
    if (!binding) return;
    this.bindings.delete(peer);
    binding.seat.peer = null;
    binding.room.touched = this.now();
    this.broadcastRoom(binding.room);
  }

  sweep(): void {
    for (const room of this.rooms.values()) {
      if (room.seats.every((s) => !s.peer) && this.now() - room.touched >= 30 * 60_000) this.destroy(room, 'expired');
    }
  }

  private claim(room: Room, peer: Peer, side: string): void {
    const seat: Seat = { side, token: randomBytes(24).toString('hex'), peer, results: new Map() };
    room.seats.push(seat);
    this.bindings.set(peer, { room, seat });
    room.touched = this.now();
    this.broadcastRoom(room);
  }
  private broadcastRoom(room: Room): void {
    for (const s of room.seats) s.peer?.send({ kind: 'room', room: room.code, side: s.side, token: s.token, started: !!room.match, players: room.seats.map((p) => ({ side: p.side, connected: !!p.peer })) });
  }
  private snapshot(room: Room, seat: Seat): void {
    if (!room.match) return;
    const { id, titleKey, briefingKey, strings } = this.scenario;
    seat.peer?.send({ kind: 'snapshot', scenario: { id, titleKey, briefingKey, strings }, view: room.match.view(seat.side), revision: room.revision });
  }
  private result(seat: Seat, requestId: string, ok: boolean, error?: SubmitError): void {
    const reply: ServerBody = { kind: 'result', requestId, ok, ...(error ? { error } : {}) };
    seat.results.set(requestId, reply);
    if (seat.results.size > 128) seat.results.delete(seat.results.keys().next().value!);
    seat.peer?.send(reply);
  }
  private error(peer: Peer, code: Extract<ServerBody, { kind: 'error' }>['code']): void { peer.send({ kind: 'error', code }); }
  private destroy(room: Room, reason: 'left' | 'expired'): void {
    for (const seat of room.seats) if (seat.peer) {
      this.bindings.delete(seat.peer);
      seat.peer.send({ kind: 'closed', reason });
    }
    this.rooms.delete(room.code);
  }
}
