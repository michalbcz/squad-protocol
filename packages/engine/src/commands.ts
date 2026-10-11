import type { Facing, FireMode, SideId, UnitId, Vec } from './types';

export type Command =
  | { type: 'move'; side: SideId; unitId: UnitId; path: Vec[] }
  | { type: 'turn'; side: SideId; unitId: UnitId; facing: Facing }
  | { type: 'fire'; side: SideId; unitId: UnitId; target: Vec; mode: FireMode }
  | { type: 'toggleDoor'; side: SideId; unitId: UnitId; at: Vec }
  | { type: 'endTurn'; side: SideId };

type EventBody =
  | { type: 'unitMoved'; unitId: UnitId; from: Vec; to: Vec; facing: Facing; ap: number }
  | { type: 'unitTurned'; unitId: UnitId; facing: Facing; ap: number }
  | { type: 'doorToggled'; at: Vec; open: boolean }
  | { type: 'movementInterrupted'; unitId: UnitId; reason: 'spotted' | 'killed' }
  | { type: 'shotFired'; unitId: UnitId; from: Vec; to: Vec; impact: Vec; mode: FireMode; reaction: boolean; hit: boolean }
  | { type: 'unitDamaged'; unitId: UnitId; amount: number; hp: number }
  | { type: 'unitKilled'; unitId: UnitId }
  | { type: 'featureDamaged'; at: Vec; hp: number }
  | { type: 'featureDestroyed'; at: Vec }
  | { type: 'turnStarted'; side: SideId; turn: number }
  | { type: 'gameOver'; winner: SideId | null };

/**
 * Every event records which sides witnessed it, so views can be filtered without re-simulation.
 * `originSeenBy` (moves/shots) lists sides that saw where the action started; others get it redacted.
 */
export type GameEvent = EventBody & { seenBy: SideId[]; originSeenBy?: SideId[] };
export type GameEventBody = EventBody;

export type CommandResult =
  | { ok: true; events: GameEvent[] }
  | { ok: false; error: CommandError };

export type CommandError =
  | 'notYourTurn'
  | 'gameOver'
  | 'noSuchUnit'
  | 'notYourUnit'
  | 'unitDead'
  | 'notEnoughAp'
  | 'invalidPath'
  | 'invalidTarget'
  | 'modeUnavailable'
  | 'notAdjacent';
