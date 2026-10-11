import { parseScenario, type ScenarioInput, type WeaponDef } from '../src';

export const RIFLE: WeaponDef = {
  id: 'rifle',
  nameKey: 'weapon.rifle',
  range: 16,
  damage: [20, 20],
  ap: { snap: 6, aimed: 12, auto: 10 },
  accuracy: { snap: 1, aimed: 1, auto: 1 },
  autoShots: 3,
};
export const WEAPONS = { rifle: RIFLE };

const template = { maxAp: 30, maxHp: 50, armor: 0, accuracy: 100 };

export function scenario(map: string[], units: { id: string; side: string; x: number; y: number; facing?: number }[]) {
  const input: ScenarioInput = {
    format: 'squad-protocol/scenario',
    version: 1,
    id: 't',
    titleKey: 't',
    briefingKey: 't',
    map,
    sides: [
      { id: 'a', nameKey: 'a' },
      { id: 'b', nameKey: 'b' },
    ],
    units: units.map((u) => ({ ...u, nameKey: u.id, weaponId: 'rifle', template })),
  };
  return parseScenario(input);
}
