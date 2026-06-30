import {
  TERRAIN,
  MAX_FOOD_PER_CELL,
  FOOD_SPAWN_RATE,
  FOOD_SPAWN_AMOUNT,
  STARTING_FOOD,
  PHEROMONE_DECAY,
  PHEROMONE_DECAY_INTERVAL_TICKS,
  PHEROMONE_DIFFUSE_AMOUNT,
} from './constants';
import { World } from './types';
import { randInt, mulberry32 } from './rng';

export function createWorld(seed: number): World {
  const w = 32;
  const h = 32;
  const terrain = new Uint8Array(w * h);
  const food = new Uint8Array(w * h);
  const pheromoneHome = new Float32Array(w * h);
  const pheromoneFood = new Float32Array(w * h);

  const cx = 16;
  const cy = 16;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) {
        terrain[y * w + x] = TERRAIN.NEST;
      }
    }
  }

  const rng = mulberry32(seed);
  seedFood(food, terrain, w, h, STARTING_FOOD, rng);

  return { w, h, terrain, food, pheromoneHome, pheromoneFood };
}

function seedFood(food: Uint8Array, terrain: Uint8Array, w: number, h: number, total: number, rng: () => number): void {
  let remaining = total;
  while (remaining > 0) {
    const x = randInt(rng, w);
    const y = randInt(rng, h);
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

export function tickPheromones(world: World, tick: number): void {
  if (tick % PHEROMONE_DECAY_INTERVAL_TICKS !== 0) return;

  const len = world.w * world.h;
  for (let i = 0; i < len; i++) {
    world.pheromoneHome[i] *= PHEROMONE_DECAY;
    world.pheromoneFood[i] *= PHEROMONE_DECAY;
  }

  diffusePheromones(world, world.pheromoneHome);
  diffusePheromones(world, world.pheromoneFood);
}

function diffusePheromones(world: World, arr: Float32Array): void {
  const w = world.w;
  const h = world.h;
  const next = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      let sum = arr[idx] * 4;
      let count = 4;

      if (x > 0) {
        sum += arr[idx - 1];
        count++;
      }
      if (x < w - 1) {
        sum += arr[idx + 1];
        count++;
      }
      if (y > 0) {
        sum += arr[idx - w];
        count++;
      }
      if (y < h - 1) {
        sum += arr[idx + w];
        count++;
      }

      next[idx] = arr[idx] + (sum / count - arr[idx]) * PHEROMONE_DIFFUSE_AMOUNT;
    }
  }

  for (let i = 0; i < arr.length; i++) {
    arr[i] = next[i];
  }
}

export function spawnFoodTick(world: World, rng: () => number): void {
  if (rng() > FOOD_SPAWN_RATE) return;

  const x = randInt(rng, world.w);
  const y = randInt(rng, world.h);
  const idx = getCellIndex(world, x, y);
  if (world.food[idx] < MAX_FOOD_PER_CELL && world.terrain[idx] !== TERRAIN.NEST) {
    const add = Math.min(FOOD_SPAWN_AMOUNT, MAX_FOOD_PER_CELL - world.food[idx]);
    world.food[idx] += add;
  }
}
