import type { Command, CommandResult, GameEvent } from './commands';
import { applyCommand } from './rules';
import { createGame, type Scenario } from './scenario';
import type { GameState, SideId, WeaponDef } from './types';
import { eventsFor, viewFor, type PlayerView } from './view';

export interface Replay {
  format: 'squad-protocol/replay';
  version: 1;
  scenario: Scenario;
  weapons: Record<string, WeaponDef>;
  seed: number;
  commands: Command[];
}

type Listener = (side: SideId, view: PlayerView, events: GameEvent[]) => void;

/**
 * The single authority for a game. Hotseat, AI and network hosts all drive a Match;
 * consumers only ever receive per-side views and filtered events.
 */
export class Match {
  private stateValue: GameState;
  readonly commands: Command[] = [];
  private listeners = new Set<Listener>();

  constructor(
    readonly scenario: Scenario,
    readonly weapons: Record<string, WeaponDef>,
    readonly seed: number,
  ) {
    this.stateValue = createGame(scenario, weapons, seed);
  }

  static fromReplay(replay: Replay): Match {
    const m = new Match(replay.scenario, replay.weapons, replay.seed);
    for (const c of replay.commands) {
      const r = m.submit(c);
      if (!r.ok) throw new Error(`Replay diverged at command ${m.commands.length}: ${r.error}`);
    }
    return m;
  }

  /** Full state: host-side only. Never send this to a client. */
  get state(): GameState {
    return this.stateValue;
  }

  view(side: SideId): PlayerView {
    return viewFor(this.stateValue, side);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  submit(cmd: Command): CommandResult {
    const { state, result } = applyCommand(this.stateValue, cmd);
    if (!result.ok) return result;
    this.stateValue = state;
    this.commands.push(cmd);
    for (const fn of this.listeners) {
      for (const side of state.sides) fn(side.id, viewFor(state, side.id), eventsFor(result.events, side.id, state));
    }
    return result;
  }

  toReplay(): Replay {
    return {
      format: 'squad-protocol/replay',
      version: 1,
      scenario: this.scenario,
      weapons: this.weapons,
      seed: this.seed,
      commands: structuredClone(this.commands),
    };
  }
}
