const KEY = 'sp.settings';

interface Persisted {
  locale: string | null;
  coach: boolean;
  lastPlayed: number | null;
  tutorialDone: boolean;
  speed: number;
}

const DEFAULTS: Persisted = { locale: null, coach: true, lastPlayed: null, tutorialDone: false, speed: 1 };

function load(): Persisted {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Persisted>) };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Small persisted settings store; storage backend can be swapped per platform later. */
class Settings {
  private data = $state<Persisted>(load());

  private save(): void {
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }

  get locale() { return this.data.locale; }
  set locale(v) { this.data.locale = v; this.save(); }
  get coach() { return this.data.coach; }
  set coach(v) { this.data.coach = v; this.save(); }
  get tutorialDone() { return this.data.tutorialDone; }
  set tutorialDone(v) { this.data.tutorialDone = v; this.save(); }
  get speed() { return this.data.speed; }
  set speed(v) { this.data.speed = v; this.save(); }
  get lastPlayed() { return this.data.lastPlayed; }

  /** Days since the last session, read before `touch()` updates it. */
  readonly daysAway: number | null = (() => {
    const lp = load().lastPlayed;
    return lp === null ? null : Math.floor((Date.now() - lp) / 86_400_000);
  })();

  touch(): void {
    this.data.lastPlayed = Date.now();
    this.save();
  }
}

export const settings = new Settings();
export const REFRESHER_AFTER_DAYS = 14;
