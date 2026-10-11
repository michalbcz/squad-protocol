export type SideId = string;
export type UnitId = string;

export interface Vec {
  x: number;
  y: number;
}

/** 0 = north, clockwise in 45° steps. */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DIRS: readonly Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

export type Terrain = 'floor' | 'grass' | 'rubble' | 'water' | 'void';
export type Feature = 'wall' | 'door' | 'crate' | 'window';

export interface Tile {
  terrain: Terrain;
  feature?: Feature;
  /** Remaining structural points for destructible features. */
  featureHp?: number;
  doorOpen?: boolean;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[];
}

export type FireMode = 'snap' | 'aimed' | 'auto';

export interface WeaponDef {
  id: string;
  nameKey: string;
  range: number;
  damage: [number, number];
  ap: Record<FireMode, number | null>;
  /** Accuracy multiplier per mode (applied to unit accuracy). */
  accuracy: Record<FireMode, number>;
  /** Shots per trigger pull in auto mode. */
  autoShots: number;
}

export interface Unit {
  id: UnitId;
  side: SideId;
  nameKey: string;
  pos: Vec;
  facing: Facing;
  ap: number;
  maxAp: number;
  hp: number;
  maxHp: number;
  armor: number;
  /** 0..100 base hit chance. */
  accuracy: number;
  weaponId: string;
  alive: boolean;
}

export interface SideState {
  id: SideId;
  nameKey: string;
  controller: 'human' | 'ai';
}

export type VictoryCondition =
  | { type: 'eliminate' }
  | { type: 'turnLimit'; turns: number; winner: SideId };

export interface GameState {
  version: 1;
  rng: number;
  turn: number;
  activeSide: SideId;
  sides: SideState[];
  map: GameMap;
  units: Unit[];
  weapons: Record<string, WeaponDef>;
  victory: VictoryCondition[];
  winner: SideId | null;
  over: boolean;
}
