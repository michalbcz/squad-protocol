import { Match } from '@sp/engine';
import { SCENARIOS, WEAPONS } from '@sp/content';
import { describe, it } from 'vitest';
import { createMemory, nextCommand } from '../src';

// Opt-in report: `just balance [seeds] [scenario]`. Skipped in normal test runs.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

describe.skipIf(!env.SEEDS)('balance report', () => {
  it('AI vs AI', () => {
    const seeds = Number(env.SEEDS);
    const scenario = SCENARIOS[env.SCENARIO ?? 'kestrel'];
    if (!scenario) throw new Error(`Unknown scenario ${env.SCENARIO}`);
    const wins: Record<string, number> = {};
    let turns = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const m = new Match(scenario, WEAPONS, seed);
      const mem = Object.fromEntries(scenario.sides.map((s) => [s.id, createMemory()]));
      while (!m.state.over) {
        const side = m.state.activeSide;
        m.submit(nextCommand(m.view(side), mem[side]!));
      }
      wins[m.state.winner ?? 'draw'] = (wins[m.state.winner ?? 'draw'] ?? 0) + 1;
      turns += m.state.turn;
    }
    console.log(`\n${scenario.id}: ${seeds} games, avg ${(turns / seeds).toFixed(1)} turns`);
    for (const [side, n] of Object.entries(wins)) console.log(`  ${side.padEnd(6)} ${n} (${Math.round((n / seeds) * 100)}%)`);
  });
});
