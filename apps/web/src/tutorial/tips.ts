import type { GameController, UiSignal } from '../lib/controller.svelte';

/** General tips & tricks (`tips.<id>.title` / `tips.<id>.body`), shown in the codex, menu and refresher. */
export const TIPS = [
  'reserve',
  'facing',
  'closer',
  'aimedVsSnap',
  'autoClose',
  'blastCover',
  'missesFly',
  'friendlyFire',
  'doors',
  'windows',
  'spottedStop',
  'peek',
  'diagonals',
  'wounded',
  'switchOften',
  'lastSeen',
] as const;
export type TipId = (typeof TIPS)[number];

export function randomTip(seed = Date.now()): TipId {
  return TIPS[Math.abs(Math.floor(seed / 86_400_000)) % TIPS.length]!;
}

export interface CoachTip {
  id: string;
  /** Fires at most once per profile, the first time `when` matches. */
  when: (s: UiSignal, c: GameController) => boolean;
}

/** Contextual coach tips (`coach.<id>`), shown as dismissible toasts outside of tutorials. */
export const COACH_TIPS: CoachTip[] = [
  {
    id: 'lowChance',
    when: (s) => s.type === 'previewed' && s.preview.kind === 'fire' && s.preview.chance < 30,
  },
  {
    id: 'tooFar',
    when: (s, c) => s.type === 'previewed' && s.preview.kind === 'move' && s.preview.total > (c.selected?.ap ?? 0),
  },
  {
    id: 'spotted',
    when: (s, c) =>
      s.type === 'events' &&
      s.events.some((e) => e.type === 'movementInterrupted' && e.reason === 'spotted' && c.ownUnits.some((u) => u.id === e.unitId)),
  },
  {
    id: 'enemyReaction',
    when: (s, c) =>
      s.type === 'events' && s.events.some((e) => e.type === 'shotFired' && e.reaction && !c.ownUnits.some((u) => u.id === e.unitId)),
  },
  {
    id: 'ownReaction',
    when: (s, c) => s.type === 'events' && s.events.some((e) => e.type === 'shotFired' && e.reaction && c.ownUnits.some((u) => u.id === e.unitId)),
  },
  {
    id: 'coverHit',
    when: (s, c) =>
      s.type === 'events' &&
      s.events.some((e) => e.type === 'shotFired' && !e.hit && c.ownUnits.some((u) => u.id === e.unitId)) &&
      s.events.some((e) => e.type === 'featureDamaged' || e.type === 'featureDestroyed'),
  },
  {
    id: 'noReserve',
    when: (s, c) =>
      s.type === 'command' &&
      s.command.type === 'endTurn' &&
      c.ownUnits.length > 0 &&
      c.ownUnits.every((u) => u.ap < (c.view.weapons[u.weaponId]?.ap.snap ?? 0)),
  },
  {
    id: 'wounded',
    when: (s, c) =>
      s.type === 'events' &&
      s.events.some((e) => e.type === 'unitDamaged' && e.hp > 0 && c.ownUnits.some((u) => u.id === e.unitId && e.hp < u.maxHp * 0.4)),
  },
  {
    id: 'unitLost',
    when: (s, c) => s.type === 'events' && s.events.some((e) => e.type === 'unitKilled' && c.view.units.some((u) => u.id === e.unitId && u.side === c.view.side)),
  },
];
