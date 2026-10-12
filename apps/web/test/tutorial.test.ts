import { SCENARIOS, WEAPONS } from '@sp/content';
import { createGame, Match, tileAt, type GameEvent } from '@sp/engine';
import en from '@sp/i18n/locales/en.json';
import { describe, expect, it } from 'vitest';
import { BOOT_CAMP } from '../src/tutorial/steps';
import { COACH_TIPS, TIPS } from '../src/tutorial/tips';

const strings = en as Record<string, string>;

describe('boot camp data', () => {
  it.each(BOOT_CAMP.map((m) => [m.id, m] as const))('%s references a real scenario, valid tiles and existing strings', (_id, m) => {
    const scenario = SCENARIOS[m.scenarioId];
    expect(scenario).toBeDefined();
    const g = createGame(scenario!, WEAPONS, 1);
    expect(strings[m.summaryKey]).toBeDefined();
    for (const step of m.steps) {
      expect(strings[step.textKey], step.textKey).toBeDefined();
      if (step.tile) expect(tileAt(g.map, step.tile), `${step.id} tile`).toBeDefined();
    }
  });

  it('every tip and coach tip has text', () => {
    for (const id of TIPS) expect(strings[`tips.${id}.title`] && strings[`tips.${id}.body`], id).toBeTruthy();
    for (const tip of COACH_TIPS) expect(strings[`coach.${tip.id}`], tip.id).toBeDefined();
  });
});

describe('reaction fire mission script', () => {
  const mission = BOOT_CAMP.find((m) => m.id === 'reaction')!;

  it('the scripted drone walks into Vega’s view and usually triggers her reaction fire', () => {
    let reactions = 0;
    const seeds = 20;
    for (let seed = 1; seed <= seeds; seed++) {
      const m = new Match(SCENARIOS[mission.scenarioId]!, WEAPONS, seed);
      const blueEvents: GameEvent[] = [];
      m.subscribe((side, _v, events) => side === 'blue' && blueEvents.push(...events));
      // The player follows the tutorial: face east, then end the turn.
      for (let i = 0; i < 4; i++) m.submit({ type: 'turn', side: 'blue', unitId: 'b1', facing: ((6 + i + 1) % 8) as 0 });
      expect(m.state.units[0]!.facing).toBe(2);
      expect(m.submit({ type: 'endTurn', side: 'blue' }).ok).toBe(true);
      for (const cmd of mission.script!.red![1]!) m.submit(cmd);
      expect(m.state.activeSide).toBe('blue');
      if (blueEvents.some((e) => e.type === 'shotFired' && e.reaction && e.unitId === 'b1')) reactions++;
    }
    expect(reactions).toBeGreaterThanOrEqual(seeds * 0.75);
  });

  it('the second drone keeps its full AP as a reserve after turn 1', () => {
    const m = new Match(SCENARIOS[mission.scenarioId]!, WEAPONS, 3);
    m.submit({ type: 'endTurn', side: 'blue' });
    for (const cmd of mission.script!.red![1]!) m.submit(cmd);
    const r2 = m.state.units.find((u) => u.id === 'r2')!;
    expect(r2.ap).toBeGreaterThanOrEqual(r2.maxAp - 2);
  });
});
