export type AntState = 0 | 1 | 2;
export const AntState = {
  SEARCHING: 0 as AntState,
  CARRYING: 1 as AntState,
  RETURNING: 2 as AntState,
};

export type Terrain = 0 | 1 | 2;
export const Terrain = {
  EMPTY: 0 as Terrain,
  NEST: 1 as Terrain,
  FOOD: 2 as Terrain,
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
  };
  world: World;
  ants: Ants;
  gameOver: boolean;
  gameOverReason?: string;
}
