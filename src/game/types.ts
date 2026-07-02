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
  carried: Uint8Array; // units of food this ant is currently carrying (0..ANT_CARRY_CAPACITY)
  // Locked food target of a SEARCHING ant (-1 = none). Once an ant smells food it
  // commits to that cell and beelines until it is reached or depleted (see ant.ts).
  targetX: Int16Array;
  targetY: Int16Array;
}

export interface GameState {
  tick: number;
  resources: {
    food: number;
  };
  // Lifetime run counters that only ever grow (unlike resources, which are spent).
  // lifetimeFoodBanked feeds the EVO formula (see simulation.ts calcEvoPoints).
  stats: {
    lifetimeFoodBanked: number;
  };
  world: World;
  ants: Ants;
  gameOver: boolean;
  gameOverReason?: string;
  paused: boolean;
}
