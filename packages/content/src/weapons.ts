import type { WeaponDef } from '@sp/engine';

export const WEAPONS: Record<string, WeaponDef> = {
  pulseRifle: {
    id: 'pulseRifle',
    nameKey: 'weapon.pulseRifle',
    range: 16,
    damage: [12, 22],
    ap: { snap: 6, aimed: 12, auto: 10 },
    accuracy: { snap: 0.8, aimed: 1.15, auto: 0.6 },
    autoShots: 3,
  },
  marksmanLaser: {
    id: 'marksmanLaser',
    nameKey: 'weapon.marksmanLaser',
    range: 22,
    damage: [20, 32],
    ap: { snap: 8, aimed: 14, auto: null },
    accuracy: { snap: 0.75, aimed: 1.3, auto: 0 },
    autoShots: 1,
  },
  sidearm: {
    id: 'sidearm',
    nameKey: 'weapon.sidearm',
    range: 10,
    damage: [8, 14],
    ap: { snap: 4, aimed: 8, auto: null },
    accuracy: { snap: 0.9, aimed: 1.1, auto: 0 },
    autoShots: 1,
  },
};
