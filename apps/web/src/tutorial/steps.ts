import type { Device } from '@sp/input';
import type { GameController, UiSignal } from '../lib/controller.svelte';

export interface TutorialStep {
  id: string;
  /** Base message key; `${key}.${device}` is used when present so prompts match the input method. */
  textKey: string;
  /** `data-tut` attribute of the UI element to spotlight. */
  highlight?: string;
  /** Map tile to pulse. */
  tile?: { x: number; y: number };
  /** Without `until`, the step shows a Continue button. */
  until?: (s: UiSignal, c: GameController) => boolean;
}

export function deviceKey(base: string, device: Device, has: (k: string) => boolean): string {
  const k = `${base}.${device}`;
  return has(k) ? k : base;
}

/** Boot Camp 1: movement, doors, AP, firing modes, end turn. Runs on the real engine. */
export const BOOTCAMP1: TutorialStep[] = [
  { id: 'welcome', textKey: 'tut.welcome' },
  { id: 'select', textKey: 'tut.select', tile: { x: 3, y: 7 }, until: (s) => s.type === 'selected' },
  { id: 'ap', textKey: 'tut.ap', highlight: 'unit-panel' },
  {
    id: 'move',
    textKey: 'tut.move',
    tile: { x: 7, y: 6 },
    until: (s) => s.type === 'command' && s.command.type === 'move',
  },
  {
    id: 'door',
    textKey: 'tut.door',
    tile: { x: 7, y: 5 },
    until: (_s, c) => (c.selected?.pos.y ?? 99) <= 5,
  },
  { id: 'fog', textKey: 'tut.fog' },
  { id: 'mode', textKey: 'tut.mode', highlight: 'fire-modes', until: (s) => s.type === 'mode' && s.mode !== 'move' },
  {
    id: 'fire',
    textKey: 'tut.fire',
    tile: { x: 12, y: 2 },
    until: (s) => s.type === 'command' && s.command.type === 'fire',
  },
  { id: 'reaction', textKey: 'tut.reaction', highlight: 'end-turn' },
  { id: 'finish', textKey: 'tut.finish', until: (_s, c) => c.view.over },
];
