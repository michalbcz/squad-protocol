const KEY = 'sp.settings';

interface Persisted {
  locale: string | null;
  coach: boolean;
  lastPlayed: number | null;
  /** Completed Boot Camp mission ids. */
  bootCamp: string[];
  /** Coach tips already shown. */
  seenTips: string[];
  speed: number;
}

const DEFAULTS: Persisted = { locale: null, coach: true, lastPlayed: null, bootCamp: [], seenTips: [], speed: 1 };

function load(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Persisted> & { tutorialDone?: boolean };
    // Migrate the old single-mission flag.
    if (raw.tutorialDone && !raw.bootCamp) raw.bootCamp = ['firstSteps'];
    delete raw.tutorialDone;
    return { ...DEFAULTS, ...raw };
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
  get bootCamp(): readonly string[] { return this.data.bootCamp; }
  completeMission(id: string): void {
    if (!this.data.bootCamp.includes(id)) this.data.bootCamp = [...this.data.bootCamp, id];
    this.save();
  }
  resetBootCamp(): void { this.data.bootCamp = []; this.save(); }
  hasSeenTip(id: string): boolean { return this.data.seenTips.includes(id); }
  markTipSeen(id: string): void {
    if (!this.hasSeenTip(id)) this.data.seenTips = [...this.data.seenTips, id];
    this.save();
  }
  resetTips(): void { this.data.seenTips = []; this.save(); }
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
