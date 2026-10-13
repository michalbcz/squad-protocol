import { z } from 'zod';
import type { CommandError, GameEvent, PlayerView, Scenario, SideId } from '@sp/engine';

export const PROTOCOL_VERSION = 1;
export const MAX_FRAME_BYTES = 64 * 1024;
export const SEAT_REPLACED_CLOSE_CODE = 4001;
const id = z.string().min(1).max(64);
const vec = z.strictObject({ x: z.number().int().min(0).max(1024), y: z.number().int().min(0).max(1024) });
const command = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('move'), side: id, unitId: id, path: z.array(vec).min(1).max(1024) }),
  z.strictObject({ type: z.literal('turn'), side: id, unitId: id, facing: z.number().int().min(0).max(7) }),
  z.strictObject({ type: z.literal('fire'), side: id, unitId: id, target: vec, mode: z.enum(['snap', 'aimed', 'auto']) }),
  z.strictObject({ type: z.literal('toggleDoor'), side: id, unitId: id, at: vec }),
  z.strictObject({ type: z.literal('endTurn'), side: id }),
]);
const version = z.literal(PROTOCOL_VERSION);
const room = z.string().regex(/^[A-Z0-9]{8}$/);
export const ClientMessageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ version, kind: z.literal('create') }),
  z.strictObject({ version, kind: z.literal('join'), room }),
  z.strictObject({ version, kind: z.literal('resume'), room, token: z.string().min(32).max(64) }),
  z.strictObject({ version, kind: z.literal('start') }),
  z.strictObject({ version, kind: z.literal('leave') }),
  z.strictObject({ version, kind: z.literal('command'), requestId: id, revision: z.number().int().nonnegative(), command }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export function parseClientMessage(input: unknown): ClientMessage { return ClientMessageSchema.parse(input); }
export type ScenarioInfo = Pick<Scenario, 'id' | 'titleKey' | 'briefingKey' | 'strings'>;
export type NetError = 'invalidMessage' | 'versionMismatch' | 'roomNotFound' | 'roomFull' | 'invalidToken' | 'alreadyJoined' | 'notReady' | 'notHost' | 'capacity' | 'rateLimited' | 'disconnected' | 'timeout' | 'stale' | 'opponentDisconnected' | 'seatReplaced';
export type SubmitError = CommandError | NetError;
export type SubmitResult = { ok: true; events: GameEvent[] } | { ok: false; error: SubmitError };
export type RoomInfo = { room: string; side: SideId; token: string; started: boolean; players: { side: SideId; connected: boolean }[] };
type Envelope = { version: 1 };
export type ServerMessage = Envelope & (
  | ({ kind: 'room' } & RoomInfo)
  | { kind: 'snapshot'; scenario: ScenarioInfo; view: PlayerView; revision: number }
  | { kind: 'update'; view: PlayerView; events: GameEvent[]; revision: number; requestId?: string }
  | { kind: 'result'; requestId: string; ok: boolean; error?: SubmitError }
  | { kind: 'error'; code: NetError }
  | { kind: 'closed'; reason: 'left' | 'expired' }
);
export type ServerBody = ServerMessage extends infer T ? T extends Envelope ? Omit<T, 'version'> : never : never;
