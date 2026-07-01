// Simulation enums (ANT_STATE / TERRAIN) live in constants.ts — the single source
// of truth. This file only defines the data shapes.

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
  tick: number;
  resources: {
    food: number;
  };
  world: World;
  ants: Ants;
  gameOver: boolean;
  gameOverReason?: string;
  paused: boolean;
}
