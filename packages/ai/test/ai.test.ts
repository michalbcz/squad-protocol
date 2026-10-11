import { Match } from '@sp/engine';
import { SCENARIOS, WEAPONS } from '@sp/content';
import { describe, expect, it } from 'vitest';
import { createMemory, nextCommand } from '../src';

describe('AI vs AI', () => {
  it.each([1, 2, 3, 4, 5])('plays Kestrel to completion without illegal commands (seed %i)', (seed) => {
    const m = new Match(SCENARIOS.kestrel!, WEAPONS, seed);
    const memories = { blue: createMemory(), red: createMemory() };
    let guard = 0;
    while (!m.state.over && guard++ < 5000) {
      const side = m.state.activeSide as 'blue' | 'red';
      const cmd = nextCommand(m.view(side), memories[side]);
      const r = m.submit(cmd);
      expect(r, JSON.stringify(cmd)).toMatchObject({ ok: true });
    }
    expect(m.state.over).toBe(true);
  });
});
