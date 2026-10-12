import { z } from 'zod';
import type { Facing, GameState, Tile, WeaponDef } from './types';

/** Map legend for compact, hand-editable scenario files. */
export const LEGEND: Record<string, Tile> = {
  '.': { terrain: 'floor' },
  ',': { terrain: 'grass' },
  ':': { terrain: 'rubble' },
  '~': { terrain: 'water' },
  ' ': { terrain: 'void' },
  '#': { terrain: 'floor', feature: 'wall', featureHp: 40 },
  'D': { terrain: 'floor', feature: 'door', featureHp: 20, doorOpen: false },
  'd': { terrain: 'floor', feature: 'door', featureHp: 20, doorOpen: true },
  'C': { terrain: 'floor', feature: 'crate', featureHp: 15 },
  'W': { terrain: 'floor', feature: 'window', featureHp: 1 },
};

const vec = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() });

export const UnitTemplateSchema = z.object({
  maxAp: z.number().int().positive(),
  maxHp: z.number().int().positive(),
  armor: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(100),
});

export const ScenarioSchema = z.object({
  format: z.literal('squad-protocol/scenario'),
  version: z.literal(1),
  id: z.string().min(1),
  titleKey: z.string(),
  briefingKey: z.string(),
  /** Per-scenario translations: locale -> key -> ICU message. */
  strings: z.record(z.string(), z.record(z.string(), z.string())).default({}),
  map: z.array(z.string()).min(1),
  sides: z.array(z.object({ id: z.string(), nameKey: z.string(), controller: z.enum(['human', 'ai']).default('human') })).min(2),
  units: z.array(
    vec.extend({
      id: z.string(),
      side: z.string(),
      nameKey: z.string(),
      facing: z.number().int().min(0).max(7).default(0),
      template: UnitTemplateSchema,
      weaponId: z.string(),
    }),
  ),
  victory: z
    .array(z.union([z.object({ type: z.literal('eliminate') }), z.object({ type: z.literal('turnLimit'), turns: z.number().int().positive(), winner: z.string() })]))
    .default([{ type: 'eliminate' }]),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioInput = z.input<typeof ScenarioSchema>;

export function parseScenario(data: unknown): Scenario {
  const s = ScenarioSchema.parse(data);
  const width = Math.max(...s.map.map((r) => r.length));
  for (const u of s.units) {
    if (!s.sides.some((side) => side.id === u.side)) throw new Error(`Unit ${u.id} has unknown side ${u.side}`);
    if (u.x >= width || u.y >= s.map.length) throw new Error(`Unit ${u.id} is outside the map`);
  }
  for (const row of s.map) for (const ch of row) if (!(ch in LEGEND)) throw new Error(`Unknown map symbol '${ch}'`);
  return s;
}

export function createGame(scenario: Scenario, weapons: Record<string, WeaponDef>, seed: number): GameState {
  const width = Math.max(...scenario.map.map((r) => r.length));
  const height = scenario.map.length;
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) tiles.push(structuredClone(LEGEND[scenario.map[y]![x] ?? ' ']!));
  }
  for (const u of scenario.units) if (!weapons[u.weaponId]) throw new Error(`Unknown weapon ${u.weaponId}`);
  const first = scenario.sides[0]!.id;
  return {
    version: 1,
    rng: seed | 0,
    turn: 1,
    activeSide: first,
    sides: scenario.sides.map((s) => ({ id: s.id, nameKey: s.nameKey, controller: s.controller })),
    map: { width, height, tiles },
    units: scenario.units.map((u) => ({
      id: u.id,
      side: u.side,
      nameKey: u.nameKey,
      pos: { x: u.x, y: u.y },
      facing: u.facing as Facing,
      ap: u.side === first ? u.template.maxAp : 0,
      maxAp: u.template.maxAp,
      hp: u.template.maxHp,
      maxHp: u.template.maxHp,
      armor: u.template.armor,
      accuracy: u.template.accuracy,
      weaponId: u.weaponId,
      alive: true,
    })),
    weapons,
    victory: scenario.victory,
    winner: null,
    over: false,
  };
}
