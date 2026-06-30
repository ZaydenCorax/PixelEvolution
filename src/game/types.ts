export type AntState = 0 | 1 | 2;
export const AntState = {
  SEARCHING: 0 as AntState,
  CARRYING: 1 as AntState,
  RETURNING: 2 as AntState,
};

export type Terrain = 0 | 1 | 2 | 3;
export const Terrain = {
  EMPTY: 0 as Terrain,
  WALL: 1 as Terrain,
  NEST: 2 as Terrain,
  FOOD: 3 as Terrain,
};

export interface World {
  w: number;
  h: number;
  terrain: Uint8Array;
  food: Uint8Array;
  pheromoneHome: Float32Array;
  pheromoneFood: Float32Array;
}

export interface Ants {
  count: number;
  capacity: number;
  x: Int16Array;
  y: Int16Array;
  dir: Uint8Array;
  state: Uint8Array;
  energy: Float32Array;
  age: Uint32Array;
}

export interface GameState {
  seed: number;
  tick: number;
  resources: {
    food: number;
    evo: number;
  };
  world: World;
  ants: Ants;
  stats: {
    totalFood: number;
    totalAnts: number;
    totalTicks: number;
  };
  gridTier: number;
  paused: boolean;
  gameOver: boolean;
  gameOverReason?: string;
}

export interface SaveV1 {
  version: 1;
  savedAt: number;
  seed: number;
  tick: number;
  resources: { food: number; evo: number };
  world: {
    w: number;
    h: number;
    terrain: string;
    food: string;
    pheromoneHome: string;
    pheromoneFood: string;
  };
  ants: {
    count: number;
    capacity: number;
    x: string;
    y: string;
    dir: string;
    state: string;
    energy: string;
    age: string;
  };
  stats: { totalFood: number; totalAnts: number; totalTicks: number };
  gridTier: number;
}

export type SaveData = SaveV1;
