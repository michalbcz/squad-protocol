import { z } from 'zod';

const schema = z.strictObject({ format: z.literal('squad-protocol/webrtc-signal'), version: z.literal(1), kind: z.enum(['offer', 'answer']), room: z.string().regex(/^[A-Z0-9]{8}$/), sdp: z.string().min(1).max(48 * 1024) });
export type PeerSignal = z.infer<typeof schema>;
const PREFIX = 'SPRTC1.';
export function encodeSignal(input: PeerSignal): string {
  const signal = schema.parse(input);
  const bytes = new TextEncoder().encode(JSON.stringify(signal));
  return PREFIX + btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decodeSignal(code: string, kind: PeerSignal['kind'], room?: string): PeerSignal {
  const clean = code.trim();
  if (clean.length > 70 * 1024 || !clean.startsWith(PREFIX) || !/^[A-Za-z0-9_-]+$/.test(clean.slice(PREFIX.length))) throw new Error('Invalid signal');
  const binary = atob(clean.slice(PREFIX.length).replaceAll('-', '+').replaceAll('_', '/'));
  const json = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
  const signal = schema.parse(JSON.parse(json));
  if (signal.kind !== kind || (room && signal.room !== room)) throw new Error('Wrong signal');
  return signal;
}
