import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/protocol';

describe('network boundary', () => {
  it('accepts only the initial version and rejects unknown or malformed commands', () => {
    expect(parseClientMessage({ version: 1, kind: 'create' })).toEqual({ version: 1, kind: 'create' });
    for (const message of [
      { version: 2, kind: 'create' }, { version: 1, kind: 'create', token: 'injected' },
      { version: 1, kind: 'command', requestId: 'a', revision: 0, command: { type: 'move', side: 'blue', unitId: 'b1', path: [{ x: -1, y: 0 }] } },
      { version: 1, kind: 'command', requestId: 'a', revision: 0, command: { type: 'turn', side: 'blue', unitId: 'b1', facing: 9 } },
    ]) expect(() => parseClientMessage(message)).toThrow();
  });
});
