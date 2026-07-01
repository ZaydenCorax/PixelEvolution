export const TICK_RATE_HZ = 1;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;
export const MAX_FOOD_PER_CELL = 255;

export const TERRAIN = {
  EMPTY: 0,
  NEST: 1,
  FOOD: 2,
} as const;

export const ANT_STATE = {
  SEARCHING: 0,
  CARRYING: 1,
  RETURNING: 2,
} as const;

// Ants move in 4 cardinal directions (von Neumann neighbourhood): N, E, S, W.
// This is deliberately simpler than 8-way (Moore) movement — fewer choices per
// step keeps ant wandering less noisy and the weighted-direction logic cheaper.
// `dir` values stored on each ant index into this array.
export const ANT_MOVE_DIRECTIONS = [
  { dx: 0, dy: -1 }, // 0: North
  { dx: 1, dy: 0 },  // 1: East
  { dx: 0, dy: 1 },  // 2: South
  { dx: -1, dy: 0 }, // 3: West
] as const;

export const PHEROMONE_DECAY = 0.995;
export const PHEROMONE_DECAY_INTERVAL_TICKS = 2;
export const PHEROMONE_DIFFUSE_AMOUNT = 0.1;
export const FOOD_SPAWN_RATE = 0.02;
export const FOOD_SPAWN_AMOUNT = 20;
export const STARTING_ANTS = 5;
export const STARTING_FOOD = 200;
export const ANT_ENERGY_COST = 0.5;
export const ANT_INITIAL_ENERGY = 100;
export const ANT_LIFESPAN = 2000;
