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
  NEST_RADIUS,
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

  const ants: Ants = { count: 0, capacity, x, y, dir, state, energy, age };

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

    ants.energy[i] -= ANT_ENERGY_COST;

    const prevX = ants.x[i];
    const prevY = ants.y[i];

    // Choose a single move weighted by state (DESIGN.md §8.3): searching ants
    // steer toward food, carrying/returning ants steer home. Then interact once.
    const preferHome =
      ants.state[i] === ANT_STATE.CARRYING || ants.state[i] === ANT_STATE.RETURNING;
    moveAnt(ants, world, i, preferHome);

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

    if (ants.state[i] === ANT_STATE.SEARCHING) {
      if (terrain === TERRAIN.FOOD && world.food[idx] > 0) {
        const taken = pickupFood(world, cx, cy, 1);
        if (taken > 0) {
          ants.state[i] = ANT_STATE.CARRYING;
          depositPheromone(world, cx, cy, 0, 0.3);
        }
      }
    } else if (ants.state[i] === ANT_STATE.CARRYING) {
      if (terrain === TERRAIN.NEST) {
        dropFood(world, cx, cy, 1);
        ants.state[i] = ANT_STATE.SEARCHING;
        depositPheromone(world, cx, cy, 0.2, 0);
      }
    } else if (ants.state[i] === ANT_STATE.RETURNING) {
      if (terrain === TERRAIN.NEST) {
        ants.state[i] = ANT_STATE.SEARCHING;
        depositPheromone(world, cx, cy, 0.2, 0);
      }
    }

    // Sitting on the nest refuels the ant by spending colony food (DESIGN.md §8.1):
    // every REFUEL_INTERVAL_TICKS, convert REFUEL_FOOD_COST food into energy, clamped
    // to the cap (surplus energy is lost, but the food is still consumed).
    if (
      terrain === TERRAIN.NEST &&
      canRefuel &&
      resources.food >= ANT_REFUEL_FOOD_COST &&
      ants.energy[i] < ANT_INITIAL_ENERGY
    ) {
      resources.food -= ANT_REFUEL_FOOD_COST;
      ants.energy[i] = Math.min(
        ANT_INITIAL_ENERGY,
        ants.energy[i] + ANT_REFUEL_ENERGY_PER_FOOD,
      );
    }

    if (
      ants.energy[i] < ANT_INITIAL_ENERGY * 0.2 &&
      ants.state[i] === ANT_STATE.SEARCHING
    ) {
      ants.state[i] = ANT_STATE.RETURNING;
    }

    alive++;
  }

  compactAnts(ants, alive);
}

function moveAnt(ants: Ants, world: WorldType, i: number, preferHome: boolean): void {
  const cx = ants.x[i];
  const cy = ants.y[i];

  const dirs = getWeightedDirs(world, cx, cy, preferHome);
  const chosen = dirs[randomInt(dirs.length)];
  ants.dir[i] = chosen;
  const d = ANT_MOVE_DIRECTIONS[chosen];
  ants.x[i] = cx + d.dx;
  ants.y[i] = cy + d.dy;
}

function getWeightedDirs(
  world: WorldType,
  x: number,
  y: number,
  preferHome = false,
): number[] {
  const weights = new Array(4).fill(0);
  const valid: number[] = [];

  for (let d = 0; d < 4; d++) {
    const nx = x + ANT_MOVE_DIRECTIONS[d].dx;
    const ny = y + ANT_MOVE_DIRECTIONS[d].dy;
    if (!inBounds(world, nx, ny)) {
      weights[d] = -1;
      continue;
    }

    valid.push(d);

    const idx = getCellIndex(world, nx, ny);
    let w = 1;
    if (world.terrain[idx] === TERRAIN.FOOD) w += 50;
    w += world.pheromoneFood[idx] * 20;
    if (preferHome) w += world.pheromoneHome[idx] * 30;
    weights[d] = w;
  }

  if (valid.length === 0) return [randomInt(4)];

  const total = valid.reduce((sum, d) => sum + weights[d], 0);
  if (total <= 0) {
    return valid;
  }

  let roll = random() * total;
  for (const d of valid) {
    roll -= weights[d];
    if (roll <= 0) return [d];
  }

  return [valid[valid.length - 1]];
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
    }
    write++;
  }
  ants.count = alive;
}
