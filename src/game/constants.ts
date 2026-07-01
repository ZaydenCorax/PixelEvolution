export const TICK_RATE_HZ = 1;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;
// Cap how many ticks the sim loop will catch up in a single frame after a pause
// (e.g. a backgrounded tab), so it can't run thousands of ticks at once — the
// classic fixed-timestep "spiral of death". Backlog beyond this is dropped.
export const MAX_CATCHUP_TICKS = 5;
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
  // Sentinel for a dead ant awaiting compaction (stored in the state array).
  DEAD: 255,
} as const;

// Nest half-extent in cells: radius 1 gives a 3x3 nest around the derived centre.
// Widen to grow the nest; the centre itself is computed from the grid size.
export const NEST_RADIUS = 1;

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

// Pheromones are breadcrumb trails with a bounded lifetime. A freshly-laid marker
// is 1.0 and loses PHEROMONE_DECREMENT each tick (linear decay), reaching 0 after
// PHEROMONE_DURATION_TICKS. A marker's remaining value is therefore proportional to
// its remaining life, so its age is readable and the renderer scales its size to it.
// Baseline is 20 ticks; future in-game upgrades may extend the duration. Pheromones
// deliberately do NOT diffuse/spread outward — spreading is reserved for a later upgrade.
export const PHEROMONE_DURATION_TICKS = 20;
export const PHEROMONE_DECREMENT = 1 / PHEROMONE_DURATION_TICKS;

// Movement weights for the ants' weighted-roulette direction choice (see ant.ts).
// Kept as named constants so future gene upgrades can tune them per-colony.
export const WEIGHT_BASE = 1; // every valid neighbour starts here (keeps exploration alive)
export const WEIGHT_TARGET_CELL = 50; // adjacent goal cell (food when searching, nest when homing)
export const WEIGHT_TRAIL_ON = 10; // bonus for stepping onto the relevant trail at all
export const WEIGHT_TRAIL_AGE = 20; // extra weight scaled by crumb age → bias toward the trail's origin
export const WEIGHT_HOMING = 25; // fallback nudge toward the nest when no home trail is nearby

export const FOOD_SPAWN_RATE = 0.02;
export const FOOD_SPAWN_AMOUNT = 20;
export const STARTING_ANTS = 3;
export const STARTING_FOOD = 200;
export const ANT_ENERGY_COST = 1;
export const ANT_INITIAL_ENERGY = 100;
// How much food a single ant can carry at once. Ants keep picking up food (even on the
// way home) until they hit this cap, then drop the whole load at the nest.
export const ANT_CARRY_CAPACITY = 5;
export const ANT_LIFESPAN = 2000;

// Colony self-sustain (see DESIGN.md §8.1). Ants that sit on the nest refuel by
// spending colony food: every REFUEL_INTERVAL_TICKS an ant converts REFUEL_FOOD_COST
// food into REFUEL_ENERGY_PER_FOOD energy, clamped to ANT_INITIAL_ENERGY (energy that
// would exceed the cap is lost, but the food is still spent). Colony food also funds
// reproduction: every REPRODUCE_INTERVAL_TICKS, if the colony has at least
// REPRODUCE_FOOD_COST food and is under POP_CAP, one ant is born.
export const ANT_POP_CAP = 15;
export const ANT_REFUEL_INTERVAL_TICKS = 2;
export const ANT_REFUEL_FOOD_COST = 1;
export const ANT_REFUEL_ENERGY_PER_FOOD = 10;
export const ANT_REPRODUCE_INTERVAL_TICKS = 20;
export const ANT_REPRODUCE_FOOD_COST = 20;
