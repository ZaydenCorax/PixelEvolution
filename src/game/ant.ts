import {
  ANT_STATE,
  TERRAIN,
  ANT_MOVE_DIRECTIONS,
  ANT_ENERGY_COST,
  ANT_INITIAL_ENERGY,
  ANT_LIFESPAN,
  ANT_POP_CAP,
  ANT_REFUEL_INTERVAL_TICKS,
  ANT_REFUEL_FOOD_COST,
  ANT_REFUEL_ENERGY_PER_FOOD,
  ANT_CARRY_CAPACITY,
  ANT_LOW_ENERGY_FRACTION,
  NEST_RADIUS,
  WEIGHT_BASE,
  WEIGHT_TARGET_CELL,
  WEIGHT_TRAIL_ON,
  WEIGHT_TRAIL_AGE,
  WEIGHT_HOMING,
  WEIGHT_FOOD_SENSE,
  FOOD_SENSE_OFFSETS,
} from './constants';
import type { Ants, World as WorldType } from './types';
import {
  inBounds,
  getCellIndex,
  pickupFood,
  dropFood,
  depositPheromone,
  nestCenter,
} from './world';
import { randomInt, random } from './rng';

export function createAnts(count: number, world: WorldType): Ants {
  // Allocate to POP_CAP so the arrays have room for ants born later via spawnAnt
  // (reproduction, DESIGN.md §8.1). `count` tracks the live prefix [0, count).
  const capacity = Math.max(count, ANT_POP_CAP);
  const x = new Int16Array(capacity);
  const y = new Int16Array(capacity);
  const dir = new Uint8Array(capacity);
  const state = new Uint8Array(capacity);
  const energy = new Float32Array(capacity);
  const age = new Uint32Array(capacity);
  const carried = new Uint8Array(capacity);

  const ants: Ants = { count: 0, capacity, x, y, dir, state, energy, age, carried };

  for (let i = 0; i < count; i++) {
    spawnAnt(ants, world);
  }

  return ants;
}

// Append a fresh ant on a random nest cell, if there is capacity. Returns false
// when the arrays are full (count === capacity). Used at startup and for births.
export function spawnAnt(ants: Ants, world: WorldType): boolean {
  if (ants.count >= ants.capacity) return false;

  const { cx, cy } = nestCenter(world);
  const i = ants.count;
  const span = NEST_RADIUS * 2 + 1;

  // Scatter across the nest block: randomInt(span) - NEST_RADIUS gives an offset of
  // -NEST_RADIUS..NEST_RADIUS on each axis, keeping every ant on a NEST cell.
  ants.x[i] = cx + randomInt(span) - NEST_RADIUS;
  ants.y[i] = cy + randomInt(span) - NEST_RADIUS;
  ants.dir[i] = randomInt(4);
  ants.state[i] = ANT_STATE.SEARCHING;
  ants.energy[i] = ANT_INITIAL_ENERGY;
  ants.age[i] = 0;
  ants.carried[i] = 0;

  ants.count++;
  return true;
}

export function stepAnts(
  ants: Ants,
  world: WorldType,
  resources: { food: number },
  tick: number,
): void {
  let alive = 0;
  const canRefuel = tick % ANT_REFUEL_INTERVAL_TICKS === 0;

  for (let i = 0; i < ants.count; i++) {
    if (ants.state[i] === ANT_STATE.DEAD) continue;

    ants.age[i]++;

    if (ants.energy[i] <= 0 || ants.age[i] > ANT_LIFESPAN) {
      ants.state[i] = ANT_STATE.DEAD;
      continue;
    }

    // Recovering on the nest: only a *depleted* ant recovers. An ant becomes RETURNING
    // when its energy drops below ANT_LOW_ENERGY_FRACTION (20%) of full; a healthier ant
    // never rests — it keeps foraging. Once a RETURNING ant is home on the nest it parks
    // (no movement, no energy burn) and refuels from colony food (every
    // REFUEL_INTERVAL_TICKS), topping up to full before it leaves as a SEARCHING forager.
    const restIdx = getCellIndex(world, ants.x[i], ants.y[i]);
    if (
      world.terrain[restIdx] === TERRAIN.NEST &&
      ants.state[i] === ANT_STATE.RETURNING &&
      ants.energy[i] < ANT_INITIAL_ENERGY
    ) {
      if (resources.food >= ANT_REFUEL_FOOD_COST) {
        if (canRefuel) {
          resources.food -= ANT_REFUEL_FOOD_COST;
          ants.energy[i] = Math.min(
            ANT_INITIAL_ENERGY,
            ants.energy[i] + ANT_REFUEL_ENERGY_PER_FOOD,
          );
        }
        // Fully recovered → resume foraging; otherwise stay parked and keep refuelling.
        if (ants.energy[i] >= ANT_INITIAL_ENERGY) {
          ants.state[i] = ANT_STATE.SEARCHING;
        }
        alive++;
        continue;
      }
      // Colony has no food to spare: don't sit idle waiting to starve — resume foraging
      // (fall through to normal movement) so the ant can go find food itself.
      ants.state[i] = ANT_STATE.SEARCHING;
    }

    ants.energy[i] -= ANT_ENERGY_COST;

    const prevX = ants.x[i];
    const prevY = ants.y[i];

    // Choose a single move weighted by state (DESIGN.md §4.5): searching ants
    // steer toward food, carrying/returning ants steer home, and every ant avoids
    // re-treading the trail it is currently laying. Then interact once.
    moveAnt(ants, world, i, ants.state[i]);

    const cx = ants.x[i];
    const cy = ants.y[i];

    if (!inBounds(world, cx, cy)) {
      ants.x[i] = prevX;
      ants.y[i] = prevY;
      alive++;
      continue;
    }

    const idx = getCellIndex(world, cx, cy);
    const terrain = world.terrain[idx];

    // Collecting food takes priority over returning: any ant that steps onto food with
    // spare capacity picks some up — even a carrying/returning ant heading home. A
    // searching ant that grabs its first food flips to CARRYING (heads home).
    if (
      terrain === TERRAIN.FOOD &&
      world.food[idx] > 0 &&
      ants.carried[i] < ANT_CARRY_CAPACITY
    ) {
      const taken = pickupFood(world, cx, cy, ANT_CARRY_CAPACITY - ants.carried[i]);
      ants.carried[i] += taken;
      if (taken > 0 && ants.state[i] === ANT_STATE.SEARCHING) {
        ants.state[i] = ANT_STATE.CARRYING;
      }
    }

    // Reaching the nest drops the whole load and ends the trip. A CARRYING ant flips
    // straight back to SEARCHING; a RETURNING (depleted) ant stays RETURNING so the
    // recovery block above parks it to refuel first, flipping it to SEARCHING once full.
    if (terrain === TERRAIN.NEST) {
      if (ants.carried[i] > 0) {
        dropFood(world, cx, cy, ants.carried[i]);
        ants.carried[i] = 0;
      }
      if (ants.state[i] === ANT_STATE.CARRYING) {
        ants.state[i] = ANT_STATE.SEARCHING;
      }
    }

    // Lay a breadcrumb along the whole route (not a single drop). Based on the ant's
    // state *after* interacting: a carrying ant lays a food trail (origin = the food
    // cell where it flipped to CARRYING); everyone else lays a home trail (origin =
    // the nest). Because reaching the nest flips CARRYING → SEARCHING above, an ant
    // stops laying its food trail the moment it gets home (spec requirement).
    //
    // A home trail is NOT laid while standing on the nest: otherwise the whole nest
    // block saturates with home pheromone, and anti-backtracking (getWeightedDirs)
    // then sweeps searching ants outward, away from food sitting next to the nest.
    if (ants.state[i] === ANT_STATE.CARRYING) {
      depositPheromone(world, cx, cy, 0, 1);
    } else if (terrain !== TERRAIN.NEST) {
      depositPheromone(world, cx, cy, 1, 0);
    }

    if (
      ants.energy[i] < ANT_INITIAL_ENERGY * ANT_LOW_ENERGY_FRACTION &&
      ants.state[i] === ANT_STATE.SEARCHING
    ) {
      ants.state[i] = ANT_STATE.RETURNING;
    }

    alive++;
  }

  compactAnts(ants, alive);
}

function moveAnt(ants: Ants, world: WorldType, i: number, state: number): void {
  const cx = ants.x[i];
  const cy = ants.y[i];

  const dirs = getWeightedDirs(world, cx, cy, state);
  const chosen = dirs[randomInt(dirs.length)];
  ants.dir[i] = chosen;
  const d = ANT_MOVE_DIRECTIONS[chosen];
  ants.x[i] = cx + d.dx;
  ants.y[i] = cy + d.dy;
}

// The movement brain. Builds a weight per neighbour and returns either the single
// roulette-picked direction, or the list of valid directions to pick uniformly from
// when all weights are flat. A homing ant (CARRYING/RETURNING) is steered toward the
// nest via the home trail; a forager (SEARCHING) toward food.
//
// "Toward the trail's origin" (spec): the origin end of a trail is the OLDEST /
// lowest-value end (laid first, so most decayed). Biasing toward older on-trail crumbs
// — WEIGHT_TRAIL_AGE * (1 - p) — walks the ant back down the gradient to that origin
// (the food cell for a food trail; the nest for a home trail), while WEIGHT_TRAIL_ON
// keeps it on the trail. Off-trail cells keep only WEIGHT_BASE, preserving exploration.
//
// Anti-backtracking: an ant never steps onto a cell that already carries the trail it
// is *currently laying* (home for SEARCHING/RETURNING, food for CARRYING) — those cells
// are excluded from the candidate set, so it keeps moving onto fresh ground instead of
// re-walking its own trail. Goal cells (food/nest) are never excluded, and if avoidance
// would leave it boxed in with no move, it falls back to the full set of neighbours.
function getWeightedDirs(
  world: WorldType,
  x: number,
  y: number,
  state = ANT_STATE.SEARCHING as number,
): number[] {
  const toNest = state === ANT_STATE.CARRYING || state === ANT_STATE.RETURNING;
  // Which trail is being laid this tick (see the breadcrumb logic in stepAnts).
  const layingFood = state === ANT_STATE.CARRYING;
  // Navigate by the home trail only when homing AND not avoiding it. Only a CARRYING ant
  // qualifies: it homes but lays the *food* trail. A RETURNING ant both lays and follows
  // the home trail, so it can't ride it — it falls back to geometric homing.
  const navByHome = toNest && layingFood;

  const weights = new Array(4).fill(0);
  const avoided: boolean[] = new Array(4).fill(false);
  const valid: number[] = [];

  // Homing fallback: when there is no home trail to follow (either none nearby, or the
  // ant is avoiding its own home trail) a homing ant steers geometrically toward the
  // nest centre instead (keeps roulette, just biased).
  let homeTrailNearby = false;
  if (navByHome) {
    for (let d = 0; d < 4; d++) {
      const nx = x + ANT_MOVE_DIRECTIONS[d].dx;
      const ny = y + ANT_MOVE_DIRECTIONS[d].dy;
      if (inBounds(world, nx, ny) && world.pheromoneHome[getCellIndex(world, nx, ny)] > 0) {
        homeTrailNearby = true;
        break;
      }
    }
  }
  const nest = toNest && !homeTrailNearby ? nestCenter(world) : null;
  const curDist = nest ? Math.abs(x - nest.cx) + Math.abs(y - nest.cy) : 0;

  // Food sensing: a searching ant smells the nearest food within its footprint (see
  // FOOD_SENSE_OFFSETS) and is nudged toward it. This is the forager's analogue of the
  // homing fallback — it lets an ant re-lock onto nearby food after the food trail has
  // decayed, so food next to the nest keeps being exploited instead of abandoned.
  const foodTarget = !toNest ? nearestSensedFood(world, x, y) : null;
  const curFoodDist = foodTarget
    ? Math.abs(x - foodTarget.fx) + Math.abs(y - foodTarget.fy)
    : 0;

  for (let d = 0; d < 4; d++) {
    const nx = x + ANT_MOVE_DIRECTIONS[d].dx;
    const ny = y + ANT_MOVE_DIRECTIONS[d].dy;
    if (!inBounds(world, nx, ny)) {
      weights[d] = -1;
      continue;
    }

    valid.push(d);

    const idx = getCellIndex(world, nx, ny);
    const isGoal = world.terrain[idx] === (toNest ? TERRAIN.NEST : TERRAIN.FOOD);
    let w = WEIGHT_BASE;
    // A step that carries the ant closer to food it can smell (see foodTarget above).
    let towardFood = false;

    if (isGoal) w += WEIGHT_TARGET_CELL;

    if (navByHome) {
      const p = world.pheromoneHome[idx];
      if (p > 0) {
        w += WEIGHT_TRAIL_ON + WEIGHT_TRAIL_AGE * (1 - p);
      } else if (nest) {
        const nd = Math.abs(nx - nest.cx) + Math.abs(ny - nest.cy);
        if (nd < curDist) w += WEIGHT_HOMING;
      }
    } else if (!toNest) {
      const p = world.pheromoneFood[idx];
      if (p > 0) {
        w += WEIGHT_TRAIL_ON + WEIGHT_TRAIL_AGE * (1 - p);
      }
      if (foodTarget) {
        const fd = Math.abs(nx - foodTarget.fx) + Math.abs(ny - foodTarget.fy);
        if (fd < curFoodDist) {
          w += WEIGHT_FOOD_SENSE;
          towardFood = true;
        }
      }
    } else if (nest) {
      // RETURNING with no followable home trail → pure geometric homing.
      const nd = Math.abs(nx - nest.cx) + Math.abs(ny - nest.cy);
      if (nd < curDist) w += WEIGHT_HOMING;
    }

    weights[d] = w;

    // Anti-backtracking: exclude cells already carrying the trail this ant is laying —
    // BUT never a goal cell, never a cell that also carries the ant's *goal* trail (an
    // overlap), and never a step toward smelled food. When trails overlap, following the
    // goal trail wins over avoiding the laid one, so the ant stays on the trail leading
    // to its current objective; sensed food likewise pulls the ant back through its own
    // home trail instead of letting the avoidance sweep it away.
    const onLaidTrail = layingFood ? world.pheromoneFood[idx] > 0 : world.pheromoneHome[idx] > 0;
    const onGoalTrail = toNest ? world.pheromoneHome[idx] > 0 : world.pheromoneFood[idx] > 0;
    const backtracking = onLaidTrail && !isGoal && !onGoalTrail && !towardFood;
    // A searching ant also steers away from the nest — it has no business there while
    // foraging, so nest cells are excluded (it routes around, or leaves if parked on one).
    // A homing ant is unaffected: for it the nest is the goal.
    const avoidNest = !toNest && world.terrain[idx] === TERRAIN.NEST;
    avoided[d] = backtracking || avoidNest;
  }

  if (valid.length === 0) return [randomInt(4)];

  // Prefer cells that aren't on the ant's own fresh trail; only if that would leave no
  // move at all do we allow stepping back onto it.
  const preferred = valid.filter((d) => !avoided[d]);
  const candidates = preferred.length > 0 ? preferred : valid;

  const total = candidates.reduce((sum, d) => sum + weights[d], 0);
  if (total <= 0) {
    return candidates;
  }

  let roll = random() * total;
  for (const d of candidates) {
    roll -= weights[d];
    if (roll <= 0) return [d];
  }

  return [candidates[candidates.length - 1]];
}

// The nearest food cell a searching ant can smell from (x, y): scans the sensing
// footprint (FOOD_SENSE_OFFSETS) and returns the closest cell that is still FOOD with
// food left, or null if none is in range. Ties resolve to the first offset scanned.
function nearestSensedFood(
  world: WorldType,
  x: number,
  y: number,
): { fx: number; fy: number } | null {
  let best: { fx: number; fy: number } | null = null;
  let bestDist = Infinity;
  for (const { dx, dy } of FOOD_SENSE_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(world, nx, ny)) continue;
    const idx = getCellIndex(world, nx, ny);
    if (world.terrain[idx] === TERRAIN.FOOD && world.food[idx] > 0) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { fx: nx, fy: ny };
      }
    }
  }
  return best;
}

function compactAnts(ants: Ants, alive: number): void {
  let write = 0;
  for (let read = 0; read < ants.count; read++) {
    if (ants.state[read] === ANT_STATE.DEAD) continue;
    if (read !== write) {
      ants.x[write] = ants.x[read];
      ants.y[write] = ants.y[read];
      ants.dir[write] = ants.dir[read];
      ants.state[write] = ants.state[read];
      ants.energy[write] = ants.energy[read];
      ants.age[write] = ants.age[read];
      ants.carried[write] = ants.carried[read];
    }
    write++;
  }
  ants.count = alive;
}
