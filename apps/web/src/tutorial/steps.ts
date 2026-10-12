import type { Command, GameEvent, Vec } from '@sp/engine';
import type { Device } from '@sp/input';
import type { GameController, UiSignal } from '../lib/controller.svelte';

export interface TutorialStep {
  id: string;
  /** Base message key; `${key}.${device}` is used when present so prompts match the input method. */
  textKey: string;
  /** `data-tut` attribute of the UI element to spotlight. */
  highlight?: string;
  /** Map tile to pulse. */
  tile?: Vec;
  /** Without `until`, the step shows a Continue button. */
  until?: (s: UiSignal, c: GameController) => boolean;
}

export interface TutorialMission {
  id: string;
  scenarioId: string;
  /** Short description for the Boot Camp menu. */
  summaryKey: string;
  steps: TutorialStep[];
  /** Scripted opponent commands: side -> turn -> commands. */
  script?: Record<string, Record<number, Command[]>>;
}

export function deviceKey(base: string, device: Device, has: (k: string) => boolean): string {
  const k = `${base}.${device}`;
  return has(k) ? k : base;
}

// ---- reusable conditions -------------------------------------------------------

const commanded = (type: Command['type']) => (s: UiSignal) => s.type === 'command' && s.command.type === type;
const sawEvent = (pred: (e: GameEvent, c: GameController) => boolean) => (s: UiSignal, c: GameController) =>
  s.type === 'events' && s.events.some((e) => pred(e, c));
const enemyInSight = (_s: UiSignal, c: GameController) => c.view.units.some((u) => u.side !== c.view.side && u.alive);
const gameOver = (_s: UiSignal, c: GameController) => c.view.over;

// ---- 1. First steps: camera, selection, AP, movement, doors, fog, facing, firing ----

const FIRST_STEPS: TutorialStep[] = [
  { id: 'welcome', textKey: 'tut.welcome' },
  { id: 'camera', textKey: 'tut.camera', until: (s) => s.type === 'camera' },
  { id: 'select', textKey: 'tut.select', tile: { x: 3, y: 7 }, until: (s) => s.type === 'selected' },
  { id: 'ap', textKey: 'tut.ap', highlight: 'unit-panel' },
  { id: 'move', textKey: 'tut.move', tile: { x: 7, y: 6 }, until: commanded('move') },
  { id: 'door', textKey: 'tut.door', tile: { x: 7, y: 5 }, until: (_s, c) => (c.selected?.pos.y ?? 99) <= 5 },
  { id: 'fog', textKey: 'tut.fog' },
  { id: 'facing', textKey: 'tut.facing', highlight: 'turn-buttons', until: commanded('turn') },
  { id: 'mode', textKey: 'tut.mode', highlight: 'fire-modes', until: (s) => s.type === 'mode' && s.mode !== 'move' },
  { id: 'fire', textKey: 'tut.fire', tile: { x: 12, y: 2 }, until: commanded('fire') },
  { id: 'finish', textKey: 'tut.finish', highlight: 'end-turn', until: gameOver },
];

// ---- 2. Cover & fire: physical shots, destroying cover, range, modes ---------------

const COVER_AND_FIRE: TutorialStep[] = [
  { id: 'intro', textKey: 'tut.b2.intro' },
  { id: 'blocked', textKey: 'tut.b2.blocked', tile: { x: 7, y: 4 }, highlight: 'fire-modes', until: enemyInSight },
  { id: 'rubble', textKey: 'tut.b2.rubble' },
  {
    id: 'odds',
    textKey: 'tut.b2.odds',
    tile: { x: 11, y: 4 },
    until: (s) => s.type === 'previewed' && s.preview.kind === 'fire' && s.preview.target.x === 11 && s.preview.target.y === 4,
  },
  { id: 'aimed', textKey: 'tut.b2.aimed', highlight: 'fire-modes', until: (s) => s.type === 'mode' && s.mode === 'aimed' },
  { id: 'closer', textKey: 'tut.b2.closer', until: commanded('move') },
  { id: 'auto', textKey: 'tut.b2.auto' },
  { id: 'finish', textKey: 'tut.b2.finish', until: gameOver },
];

// ---- 3. Reaction fire: ambush with saved AP, and the enemy's reserve ----------------

const REACTION_FIRE: TutorialStep[] = [
  { id: 'intro', textKey: 'tut.b3.intro' },
  { id: 'face', textKey: 'tut.b3.face', tile: { x: 7, y: 4 }, highlight: 'turn-buttons', until: (_s, c) => c.selected?.facing === 2 },
  { id: 'wait', textKey: 'tut.b3.wait', highlight: 'end-turn', until: commanded('endTurn') },
  { id: 'watch', textKey: 'tut.b3.watch', until: sawEvent((e, c) => e.type === 'turnStarted' && e.side === c.view.side) },
  { id: 'debrief', textKey: 'tut.b3.debrief' },
  { id: 'enemyReserve', textKey: 'tut.b3.enemyReserve' },
  { id: 'interrupt', textKey: 'tut.b3.interrupt' },
  { id: 'finish', textKey: 'tut.b3.finish', until: gameOver },
];

// Drone r1 strolls across the doorway on turn 1 so the player's saved AP triggers reaction fire.
// Drone r2 does nothing, keeping its full AP as a reserve for the player's next turn.
const REACTION_SCRIPT: TutorialMission['script'] = {
  red: {
    1: [
      { type: 'move', side: 'red', unitId: 'r1', path: [{ x: 13, y: 2 }, { x: 12, y: 3 }, { x: 11, y: 4 }, { x: 10, y: 4 }, { x: 9, y: 4 }] },
      { type: 'turn', side: 'red', unitId: 'r2', facing: 7 },
      { type: 'endTurn', side: 'red' },
    ],
  },
};

// ---- 4. Squad tactics: switching soldiers, roles, overwatch, focus fire -------------

const SQUAD_TACTICS: TutorialStep[] = [
  { id: 'intro', textKey: 'tut.b4.intro' },
  { id: 'switch', textKey: 'tut.b4.switch', until: (s) => s.type === 'selected' && s.unitId !== 'b1' },
  { id: 'roles', textKey: 'tut.b4.roles', highlight: 'unit-panel' },
  { id: 'overwatch', textKey: 'tut.b4.overwatch', until: commanded('move') },
  { id: 'flank', textKey: 'tut.b4.flank' },
  { id: 'focus', textKey: 'tut.b4.focus' },
  { id: 'finish', textKey: 'tut.b4.finish', until: gameOver },
];

export const BOOT_CAMP: TutorialMission[] = [
  { id: 'firstSteps', scenarioId: 'bootcamp1', summaryKey: 'bootcamp.firstSteps', steps: FIRST_STEPS },
  { id: 'coverFire', scenarioId: 'bootcamp2', summaryKey: 'bootcamp.coverFire', steps: COVER_AND_FIRE },
  { id: 'reaction', scenarioId: 'bootcamp3', summaryKey: 'bootcamp.reaction', steps: REACTION_FIRE, script: REACTION_SCRIPT },
  { id: 'squad', scenarioId: 'bootcamp4', summaryKey: 'bootcamp.squad', steps: SQUAD_TACTICS },
];
