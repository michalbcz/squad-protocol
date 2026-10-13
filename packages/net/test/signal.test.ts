import { expect, it } from 'vitest';
import { encodeSignal, decodeSignal } from '../src/signal';

it('round trips a versioned role-specific signal and rejects corruption, oversized codes and wrong rooms', () => {
  const offer = { format: 'squad-protocol/webrtc-signal' as const, version: 1 as const, kind: 'offer' as const, room: 'ABCD1234', sdp: 'v=0\r\na=fingerprint:sha-256 ABC\r\n' };
  const code = encodeSignal(offer);
  expect(decodeSignal(code, 'offer')).toEqual(offer);
  expect(() => decodeSignal(code, 'answer')).toThrow();
  expect(() => decodeSignal(code, 'offer', 'FFFF1234')).toThrow();
  for (const bad of ['garbage', 'SPRTC1.!', 'SPRTC1.' + 'a'.repeat(100_000)]) expect(() => decodeSignal(bad, 'offer')).toThrow();
  expect(() => encodeSignal({ ...offer, version: 2 } as unknown as typeof offer)).toThrow();
});
