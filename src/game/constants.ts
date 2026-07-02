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
// Keep the duration SHORT: long-lived trails proved actively harmful in headless
// balance runs — stale crumbs from old wandering corrupt the age gradient ants
// navigate by, and dense persistent trails choke the anti-backtracking candidate
// set. Future in-game upgrades may extend it carefully. Pheromones deliberately do
// NOT diffuse/spread outward — spreading is reserved for a later upgrade.
export const PHEROMONE_DURATION_TICKS = 20;
export const PHEROMONE_DECREMENT = 1 / PHEROMONE_DURATION_TICKS;

// Movement weights for the ants' direction choice (see ant.ts). Selection is
// ε-greedy: ants normally take the best-weighted step (argmax) and only roll the
// weighted roulette on a rare "mutation" — so deviation from the optimal path is
// an occasional event, not the norm. Kept as named constants so future gene
// upgrades can tune them per-colony (the mutation rate ε is the prime candidate).
export const WEIGHT_BASE = 1; // every valid neighbour starts here (keeps exploration alive)
export const WEIGHT_TARGET_CELL = 50; // adjacent goal cell (food when searching, nest when homing)
export const WEIGHT_TRAIL_ON = 10; // bonus for stepping onto the relevant trail at all
export const WEIGHT_TRAIL_AGE = 20; // extra weight scaled by crumb age → bias toward the trail's origin
export const WEIGHT_HOMING = 25; // fallback nudge toward the nest when no home trail is nearby
export const WEIGHT_FOOD_SENSE = 25; // nudge a searching ant toward its locked food target
// Bonus for continuing straight — persistent walks cover more ground. FORAGERS ONLY:
// homing ants beeline and get no momentum (it only argued for overshooting turns).
export const WEIGHT_MOMENTUM = 3;

// Mutation rates for ε-greedy movement. With probability ε the ant deviates
// (weighted roulette); otherwise it takes the best-weighted step. FOCUSED applies
// when the ant has any signal to follow (goal cell, trail, homing bias, locked food
// target); WANDER applies to signal-less exploration, where variety is desirable.
export const EPSILON_FOCUSED = 0.05;
export const EPSILON_WANDER = 0.45;

// A searching ant's smell footprint: every cell within Manhattan distance
// FOOD_SENSE_RADIUS (a diamond, 24 cells at radius 3). Sized for clustered food —
// with a smaller footprint, wandering ants starved within smelling distance of
// whole clusters (verified by headless balance runs). Also lets an ant re-lock
// onto nearby food after its food trail has decayed (see ant.ts).
export const FOOD_SENSE_RADIUS = 3;
export const FOOD_SENSE_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = (() => {
  const offsets: { dx: number; dy: number }[] = [];
  for (let dy = -FOOD_SENSE_RADIUS; dy <= FOOD_SENSE_RADIUS; dy++) {
    for (let dx = -FOOD_SENSE_RADIUS; dx <= FOOD_SENSE_RADIUS; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 0 && dist <= FOOD_SENSE_RADIUS) offsets.push({ dx, dy });
    }
  }
  return offsets;
})();

// Food spawns as contiguous CLUSTERS (blobs), not single cells, so foragers can
// actually find it and the map reads organically. Each spawn event rolls a cluster
// total and fills adjacent cells with rolled per-cell amounts. Both rolls are
// low-weighted power curves: values near the minimum are common, values near the
// maximum are rare (r is a uniform [0,1) draw raised to the exponent).
export const FOOD_SPAWN_RATE = 0.02; // chance per tick of one cluster spawn event
export const FOOD_CELL_MIN = 5; // per-cell roll: 5 + ⌊21·r²⌋ → 5..25, mean ≈ 12
export const FOOD_CELL_RANGE = 21;
export const FOOD_CELL_EXP = 2;
export const FOOD_CLUSTER_MIN = 5; // cluster-total roll: 5 + ⌊196·r^2.5⌋ → 5..200, mean ≈ 60
export const FOOD_CLUSTER_RANGE = 196;
export const FOOD_CLUSTER_EXP = 2.5;
// Natural spawning pauses while the map holds this much food. While the colony is
// small the map fills toward the cap (gentler founder phase); a big colony eats into
// the stock and scarcity returns — a difficulty rubber-band. A jackpot cluster may
// overshoot the cap (the check gates the roll, not the amount): feast, then famine.
export const WORLD_FOOD_CAP = 150;
export const FOOD_SPAWN_MIN_NEST_DIST = 4; // natural clusters keep clear of the nest block
// World-creation food: a few clusters instead of the old uniform scatter. The first
// is the FOUNDER CACHE — guaranteed close to the nest with a modest total, so the
// lone starting ant's first forage is reliable, not luck. The ring must overlap the
// smell radius from the nest's edge (edge cell dist 1 + FOOD_SENSE_RADIUS 3 reaches
// dist 4): at 5–7 the founder routinely missed its own cache and starved chasing
// distant clusters instead (verified by headless traces).
export const STARTING_CLUSTERS = 3;
export const FOUNDER_CACHE_MIN_DIST = 4;
export const FOUNDER_CACHE_MAX_DIST = 5;
export const FOUNDER_CACHE_MIN_FOOD = 30;
export const FOUNDER_CACHE_MAX_FOOD = 60;

export const STARTING_ANTS = 1; // a lone founder — real colonies start with a single queen
export const ANT_ENERGY_COST = 1;
export const ANT_INITIAL_ENERGY = 100;
// How much food a single ant can carry at once. Ants keep picking up food (even on the
// way home) until they hit this cap, then drop the whole load at the nest.
export const ANT_CARRY_CAPACITY = 5;
export const ANT_LIFESPAN = 2000;
// Distance-aware retreat: a SEARCHING ant flips to RETURNING when its energy no longer
// comfortably covers the walk home (Manhattan distance to the nest + this buffer).
// A distant ant turns back early; one next to the nest forages almost to empty.
export const RETREAT_ENERGY_BUFFER = 8;

// Colony self-sustain (see DESIGN.md §8.1). Ants that sit on the nest refuel by
// spending colony food: every REFUEL_INTERVAL_TICKS an ant converts REFUEL_FOOD_COST
// food into REFUEL_ENERGY_PER_FOOD energy, clamped to ANT_INITIAL_ENERGY (energy that
// would exceed the cap is lost, but the food is still spent). Colony food also funds
// reproduction: every REPRODUCE_INTERVAL_TICKS, if the colony has at least
// REPRODUCE_FOOD_COST food and is under POP_CAP, one ant is born.
//
// ANT_POP_CAP is the SOFT population limit (reproduction stops there; reaching it
// once permanently unlocks manual Ascension). ANT_ARRAY_CAPACITY is the HARD SoA
// allocation ceiling — kept well above the cap so future +population upgrades can
// raise the soft cap without reallocating the ant arrays.
export const ANT_POP_CAP = 5;
export const ANT_ARRAY_CAPACITY = 32;
export const ANT_REFUEL_INTERVAL_TICKS = 2;
export const ANT_REFUEL_FOOD_COST = 1;
// 1 food = 20 energy sets the metabolic price of distance: a round trip to a cluster
// d cells away costs ~2d energy = d/10 food against the ~5 food it delivers, so even
// far clusters stay profitable. At 10 energy/food, distant trips were energy-neutral
// and colonies starved with a full map (verified by headless balance runs).
export const ANT_REFUEL_ENERGY_PER_FOOD = 20;
export const ANT_REPRODUCE_INTERVAL_TICKS = 20;
export const ANT_REPRODUCE_FOOD_COST = 20;
// A birth only fires while the bank would keep this much food AFTER paying for it.
// Without the reserve, reproduction drained the pool to zero and depleted ants
// arriving to refuel found nothing and died — a death spiral where every starved
// ant then cost a 20-food replacement (verified by headless balance runs).
export const ANT_REPRODUCE_FOOD_RESERVE = 15;

// Prestige core: Evolution Points (EVO) are earned when a colony dies or the player
// manually Ascends. Sub-linear in the run's lifetime banked food, so longer runs keep
// rewarding but early resets stay viable: EVO = ⌊√(lifetimeFoodBanked / divisor)⌋.
export const EVO_FOOD_DIVISOR = 10;
