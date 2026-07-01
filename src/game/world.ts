import {
  TERRAIN,
  MAX_FOOD_PER_CELL,
  FOOD_SPAWN_RATE,
  FOOD_SPAWN_AMOUNT,
  STARTING_FOOD,
  PHEROMONE_DECREMENT,
  NEST_RADIUS,
} from './constants';
import { World } from './types';
import { randomInt, random } from './rng';

// The nest sits at the grid centre, derived from the world size rather than
// hardcoded, so it stays correct if the grid is ever resized (grid tiers).
export function nestCenter(world: Pick<World, 'w' | 'h'>): { cx: number; cy: number } {
  return { cx: Math.floor(world.w / 2), cy: Math.floor(world.h / 2) };
}

export function createWorld(): World {
  const w = 32;
  const h = 32;
  const terrain = new Uint8Array(w * h);
  const food = new Uint8Array(w * h);
  const pheromoneHome = new Float32Array(w * h);
  const pheromoneFood = new Float32Array(w * h);

  // Stamp a NEST block of NEST cells centred on the grid. NEST_RADIUS controls the
  // half-extent (radius 1 → 3x3); widen the constant to grow the nest.
  const { cx, cy } = nestCenter({ w, h });
  for (let dy = -NEST_RADIUS; dy <= NEST_RADIUS; dy++) {
    for (let dx = -NEST_RADIUS; dx <= NEST_RADIUS; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) {
        terrain[y * w + x] = TERRAIN.NEST;
      }
    }
  }

  spawnFood(food, terrain, w, h, STARTING_FOOD);

  return { w, h, terrain, food, pheromoneHome, pheromoneFood };
}

function spawnFood(food: Uint8Array, terrain: Uint8Array, w: number, h: number, total: number): void {
  let remaining = total;
  while (remaining > 0) {
    const x = randomInt(w);
    const y = randomInt(h);
    const idx = y * w + x;
    if (terrain[idx] === TERRAIN.NEST) continue;
    if (food[idx] === 0) {
      terrain[idx] = TERRAIN.FOOD;
    }
    if (food[idx] < MAX_FOOD_PER_CELL) {
      const add = Math.min(remaining, MAX_FOOD_PER_CELL - food[idx]);
      food[idx] += add;
      remaining -= add;
    }
  }
}

export function getCellIndex(world: World, x: number, y: number): number {
  return y * world.w + x;
}

export function inBounds(world: World, x: number, y: number): boolean {
  return x >= 0 && x < world.w && y >= 0 && y < world.h;
}

export function pickupFood(world: World, x: number, y: number, amount: number): number {
  if (!inBounds(world, x, y)) return 0;
  const idx = getCellIndex(world, x, y);
  const available = Math.min(amount, world.food[idx]);
  world.food[idx] -= available;
  // Once a food cell is emptied, revert it to EMPTY terrain so it stops being
  // drawn/treated as food (keeps terrain in sync with food; DESIGN.md §8.2).
  if (world.food[idx] === 0 && world.terrain[idx] === TERRAIN.FOOD) {
    world.terrain[idx] = TERRAIN.EMPTY;
  }
  return available;
}

export function dropFood(world: World, x: number, y: number, amount: number): void {
  if (!inBounds(world, x, y)) return;
  const idx = getCellIndex(world, x, y);
  const space = MAX_FOOD_PER_CELL - world.food[idx];
  const deposited = Math.min(amount, space);
  world.food[idx] += deposited;
}

export function depositPheromone(
  world: World,
  x: number,
  y: number,
  home: number,
  food: number,
): void {
  if (!inBounds(world, x, y)) return;
  const idx = getCellIndex(world, x, y);
  world.pheromoneHome[idx] = Math.min(1, world.pheromoneHome[idx] + home);
  world.pheromoneFood[idx] = Math.min(1, world.pheromoneFood[idx] + food);
}

// Linear decay every tick: each marker loses PHEROMONE_DECREMENT (1/duration) and is
// floored at 0, so a freshly-laid crumb (1.0) fully fades after PHEROMONE_DURATION_TICKS.
// Pheromones do NOT diffuse/spread — the trail stays exactly where it was laid.
export function tickPheromones(world: World): void {
  const len = world.w * world.h;
  for (let i = 0; i < len; i++) {
    const home = world.pheromoneHome[i];
    if (home > 0) world.pheromoneHome[i] = Math.max(0, home - PHEROMONE_DECREMENT);
    const food = world.pheromoneFood[i];
    if (food > 0) world.pheromoneFood[i] = Math.max(0, food - PHEROMONE_DECREMENT);
  }
}

export function spawnFoodTick(world: World): void {
  if (random() > FOOD_SPAWN_RATE) return;

  const x = randomInt(world.w);
  const y = randomInt(world.h);
  const idx = getCellIndex(world, x, y);
  if (world.food[idx] < MAX_FOOD_PER_CELL && world.terrain[idx] !== TERRAIN.NEST) {
    // Mark the cell as FOOD terrain (like spawnFood does) so the renderer draws it
    // and ants can pick it up — both key off terrain === FOOD (DESIGN.md §8.2).
    if (world.food[idx] === 0) {
      world.terrain[idx] = TERRAIN.FOOD;
    }
    const add = Math.min(FOOD_SPAWN_AMOUNT, MAX_FOOD_PER_CELL - world.food[idx]);
    world.food[idx] += add;
  }
}
