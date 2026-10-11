/** Semantic game actions. UI and tutorial talk in actions, never in raw keys. */
export type Action =
  | 'cursorUp'
  | 'cursorDown'
  | 'cursorLeft'
  | 'cursorRight'
  | 'confirm'
  | 'cancel'
  | 'nextUnit'
  | 'prevUnit'
  | 'endTurn'
  | 'fireSnap'
  | 'fireAimed'
  | 'fireAuto'
  | 'toggleDoor'
  | 'turnLeft'
  | 'turnRight'
  | 'zoomIn'
  | 'zoomOut'
  | 'help';

export type Device = 'mouse' | 'touch' | 'keyboard' | 'gamepad';

export type Bindings = Record<Action, string[]>;

/** Values are KeyboardEvent.code so layouts (QWERTZ, AZERTY) keep physical positions. */
export const DEFAULT_KEYS: Bindings = {
  cursorUp: ['ArrowUp', 'KeyW'],
  cursorDown: ['ArrowDown', 'KeyS'],
  cursorLeft: ['ArrowLeft', 'KeyA'],
  cursorRight: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'Space'],
  cancel: ['Escape', 'Backspace'],
  nextUnit: ['Tab', 'KeyN'],
  prevUnit: ['ShiftLeft+Tab', 'KeyP'],
  endTurn: ['KeyE'],
  fireSnap: ['Digit1'],
  fireAimed: ['Digit2'],
  fireAuto: ['Digit3'],
  toggleDoor: ['KeyO'],
  turnLeft: ['KeyQ'],
  turnRight: ['KeyR'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
  help: ['F1', 'Slash'],
};

/** Standard-mapping gamepad button indices. */
export const DEFAULT_PAD: Partial<Record<Action, number>> = {
  confirm: 0,
  cancel: 1,
  toggleDoor: 2,
  fireSnap: 3,
  prevUnit: 4,
  nextUnit: 5,
  fireAimed: 6,
  fireAuto: 7,
  help: 8,
  endTurn: 9,
  cursorUp: 12,
  cursorDown: 13,
  cursorLeft: 14,
  cursorRight: 15,
};

export function chordOf(e: Pick<KeyboardEvent, 'code' | 'shiftKey'>): string {
  return e.shiftKey && !e.code.startsWith('Shift') ? `ShiftLeft+${e.code}` : e.code;
}

export function actionForKey(bindings: Bindings, e: Pick<KeyboardEvent, 'code' | 'shiftKey'>): Action | null {
  const chord = chordOf(e);
  for (const [action, keys] of Object.entries(bindings) as [Action, string[]][]) {
    if (keys.includes(chord)) return action;
  }
  if (e.shiftKey) {
    for (const [action, keys] of Object.entries(bindings) as [Action, string[]][]) if (keys.includes(e.code)) return action;
  }
  return null;
}

/** Human-readable glyph for the first key bound to an action. */
export function keyLabel(bindings: Bindings, action: Action): string {
  const code = bindings[action]?.[0] ?? '';
  return code
    .replace('ShiftLeft+', '⇧')
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Arrow', '')
    .replace('Escape', 'Esc')
    .replace('Equal', '+')
    .replace('Minus', '−');
}

const PAD_GLYPHS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→'];
export function padLabel(action: Action): string {
  const b = DEFAULT_PAD[action];
  return b === undefined ? '' : (PAD_GLYPHS[b] ?? `#${b}`);
}

export interface InputHub {
  readonly device: Device;
  bindings: Bindings;
  on(fn: (action: Action) => void): () => void;
  onDevice(fn: (d: Device) => void): () => void;
  /** Mark device from a pointer event (renderer forwards these). */
  notePointer(e: PointerEvent): void;
  dispose(): void;
}

const STORAGE_KEY = 'sp.bindings';

export function loadBindings(storage: Pick<Storage, 'getItem'> | undefined): Bindings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_KEYS, ...(JSON.parse(raw) as Partial<Bindings>) };
  } catch {
    /* corrupt bindings fall back to defaults */
  }
  return structuredClone(DEFAULT_KEYS);
}

export function saveBindings(storage: Pick<Storage, 'setItem'>, b: Bindings): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(b));
}

/** Wires keyboard + gamepad to semantic actions and tracks the last-used device for prompt glyphs. */
export function createInputHub(target: Window): InputHub {
  const listeners = new Set<(a: Action) => void>();
  const deviceListeners = new Set<(d: Device) => void>();
  let device: Device = target.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse';
  const setDevice = (d: Device) => {
    if (d === device) return;
    device = d;
    for (const fn of deviceListeners) fn(d);
  };
  const emit = (a: Action) => {
    for (const fn of listeners) fn(a);
  };

  const hub: InputHub = {
    get device() {
      return device;
    },
    bindings: loadBindings(target.localStorage),
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onDevice(fn) {
      deviceListeners.add(fn);
      return () => deviceListeners.delete(fn);
    },
    notePointer(e) {
      setDevice(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse');
    },
    dispose() {
      target.removeEventListener('keydown', onKey);
      target.removeEventListener('pointerdown', onPointerDown, true);
      target.cancelAnimationFrame(raf);
    },
  };

  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) setDevice('keyboard');
    const action = actionForKey(hub.bindings, e);
    if (!action) return;
    // Let Tab/Enter/Space operate DOM controls focused via keyboard. Buttons that merely kept
    // focus after a mouse/touch click must not swallow board input.
    const keyboardFocused = !!el && el !== target.document.body && ['BUTTON', 'A', 'SELECT'].includes(el.tagName) && el !== pointerFocused;
    if (keyboardFocused && ['confirm', 'nextUnit', 'prevUnit'].includes(action)) return;
    if (el && !keyboardFocused && el !== target.document.body) el.blur();
    pointerFocused = null;
    e.preventDefault();
    emit(action);
  };
  let pointerFocused: Element | null = null;
  const onPointerDown = (e: PointerEvent) => {
    pointerFocused = (e.target as Element | null)?.closest?.('button, a, select') ?? null;
  };
  target.addEventListener('pointerdown', onPointerDown, true);
  target.addEventListener('keydown', onKey);

  // Gamepad polling with edge detection; left stick acts as d-pad.
  const prev = new Map<number, boolean[]>();
  let raf = 0;
  const poll = () => {
    for (const pad of target.navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const before = prev.get(pad.index) ?? [];
      const now = pad.buttons.map((b) => b.pressed);
      const [ax = 0, ay = 0] = pad.axes;
      now[12] = now[12] || ay < -0.6;
      now[13] = now[13] || ay > 0.6;
      now[14] = now[14] || ax < -0.6;
      now[15] = now[15] || ax > 0.6;
      for (const [action, idx] of Object.entries(DEFAULT_PAD) as [Action, number][]) {
        if (now[idx] && !before[idx]) {
          setDevice('gamepad');
          emit(action);
        }
      }
      prev.set(pad.index, now);
    }
    raf = target.requestAnimationFrame(poll);
  };
  raf = target.requestAnimationFrame(poll);
  return hub;
}
