import {
  ANT_STATE,
  TERRAIN,
  DIRS,
  ANT_ENERGY_COST,
  ANT_INITIAL_ENERGY,
  ANT_LIFESPAN,
  MAX_POPULATION,
} from './constants';
import type { Ants, World as WorldType } from './types';
import {
  inBounds,
  getCellIndex,
  pickupFood,
  dropFood,
  depositPheromone,
} from './world';
import { randInt, randChoice, mulberry32 } from './rng';

export function createAnts(count: number, world: WorldType, rng: () => number): Ants {
  const capacity = MAX_POPULATION;
  const x = new Int16Array(capacity);
  const y = new Int16Array(capacity);
  const dir = new Uint8Array(capacity);
  const state = new Uint8Array(capacity);
  const energy = new Float32Array(capacity);
  const age = new Uint32Array(capacity);

  const cx = Math.floor(world.w / 2);
  const cy = Math.floor(world.h / 2);

  for (let i = 0; i < count; i++) {
    x[i] = cx + randInt(rng, 5) - 2;
    y[i] = cy + randInt(rng, 5) - 2;
    dir[i] = randInt(rng, 8);
    state[i] = ANT_STATE.SEARCHING;
    energy[i] = ANT_INITIAL_ENERGY;
    age[i] = 0;
  }

  return { count, capacity, x, y, dir, state, energy, age };
}

export function stepAnts(
  ants: Ants,
  world: WorldType,
  rng: () => number,
): void {
  let alive = 0;

  for (let i = 0; i < ants.count; i++) {
    if (ants.state[i] === 255) continue;

    ants.age[i]++;

    if (ants.energy[i] <= 0 || ants.age[i] > ANT_LIFESPAN) {
      ants.state[i] = 255;
      continue;
    }

    ants.energy[i] -= ANT_ENERGY_COST;

    const prevX = ants.x[i];
    const prevY = ants.y[i];

    moveAnt(ants, world, rng, i);

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
      } else {
        followPheromoneHome(ants, world, i);
      }
    } else if (ants.state[i] === ANT_STATE.RETURNING) {
      if (terrain === TERRAIN.NEST) {
        ants.state[i] = ANT_STATE.SEARCHING;
        depositPheromone(world, cx, cy, 0.2, 0);
      } else {
        followPheromoneHome(ants, world, i);
      }
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

function moveAnt(ants: Ants, world: WorldType, rng: () => number, i: number): void {
  const cx = ants.x[i];
  const cy = ants.y[i];

  const dirs = getWeightedDirs(world, cx, cy, rng);
  const chosen = randChoice(rng, dirs);
  ants.dir[i] = chosen;
  const d = DIRS[chosen];
  ants.x[i] = cx + d.dx;
  ants.y[i] = cy + d.dy;
}

function followPheromoneHome(ants: Ants, world: WorldType, i: number): void {
  const cx = ants.x[i];
  const cy = ants.y[i];
  const rng = mulberry32(ants.age[i] + ants.x[i] * 997 + ants.y[i] * 1013);
  const dirs = getWeightedDirs(world, cx, cy, rng, true);
  const chosen = randChoice(rng, dirs);
  ants.dir[i] = chosen;
  const d = DIRS[chosen];
  ants.x[i] = cx + d.dx;
  ants.y[i] = cy + d.dy;
}

function getWeightedDirs(
  world: WorldType,
  x: number,
  y: number,
  rng: () => number,
  preferHome = false,
): number[] {
  const weights = new Array(8).fill(0);
  const valid: number[] = [];

  for (let d = 0; d < 8; d++) {
    const nx = x + DIRS[d].dx;
    const ny = y + DIRS[d].dy;
    if (!inBounds(world, nx, ny)) {
      weights[d] = -1;
      continue;
    }
    const idx = getCellIndex(world, nx, ny);
    const terrain = world.terrain[idx];

    if (terrain === TERRAIN.WALL) {
      weights[d] = -1;
      continue;
    }

    valid.push(d);

    let w = 1;
    if (terrain === TERRAIN.FOOD) w += 50;
    w += world.pheromoneFood[idx] * 20;
    if (preferHome) w += world.pheromoneHome[idx] * 30;
    weights[d] = w;
  }

  if (valid.length === 0) return [randInt(rng, 8)];

  const total = valid.reduce((sum, d) => sum + weights[d], 0);
  if (total <= 0) {
    return valid;
  }

  let roll = rng() * total;
  for (const d of valid) {
    roll -= weights[d];
    if (roll <= 0) return [d];
  }

  return [valid[valid.length - 1]];
}

function compactAnts(ants: Ants, alive: number): void {
  let write = 0;
  for (let read = 0; read < ants.count; read++) {
    if (ants.state[read] === 255) continue;
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
