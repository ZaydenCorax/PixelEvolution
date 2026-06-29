import {
  GRID_TIERS,
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

export function createWorld(tier: number, seed: number): World {
  const { w, h } = GRID_TIERS[tier];
  const terrain = new Uint8Array(w * h);
  const food = new Uint8Array(w * h);
  const pheromoneHome = new Float32Array(w * h);
  const pheromoneFood = new Float32Array(w * h);

  worldFillNest(terrain, food, w, h, Math.floor(w / 2), Math.floor(h / 2));

  const rng = mulberry32(seed);
  seedFood(food, w, h, STARTING_FOOD, rng);

  return { w, h, terrain, food, pheromoneHome, pheromoneFood };
}

function worldFillNest(
  terrain: Uint8Array,
  food: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) {
        terrain[y * w + x] = TERRAIN.NEST;
        food[y * w + x] = 0;
      }
    }
  }
}

function seedFood(food: Uint8Array, w: number, h: number, total: number, rng: () => number): void {
  let remaining = total;
  while (remaining > 0) {
    const x = randInt(rng, w);
    const y = randInt(rng, h);
    const idx = y * w + x;
    if (food[idx] < MAX_FOOD_PER_CELL) {
      const add = Math.min(remaining, MAX_FOOD_PER_CELL - food[idx]);
      food[idx] += add;
      remaining -= add;
    }
  }
}

export function expandWorld(world: World, newTier: number, seed: number): World {
  const { w: oldW, h: oldH } = world;
  const { w, h } = GRID_TIERS[newTier];

  const terrain = new Uint8Array(w * h);
  const food = new Uint8Array(w * h);
  const pheromoneHome = new Float32Array(w * h);
  const pheromoneFood = new Float32Array(w * h);

  const offX = Math.floor((w - oldW) / 2);
  const offY = Math.floor((h - oldH) / 2);

  for (let y = 0; y < oldH; y++) {
    for (let x = 0; x < oldW; x++) {
      const src = y * oldW + x;
      const dst = (y + offY) * w + (x + offX);
      terrain[dst] = world.terrain[src];
      food[dst] = world.food[src];
      pheromoneHome[dst] = world.pheromoneHome[src];
      pheromoneFood[dst] = world.pheromoneFood[src];
    }
  }

  worldFillNest(
    terrain,
    food,
    w,
    h,
    offX + Math.floor(oldW / 2),
    offY + Math.floor(oldH / 2),
  );

  const rng = mulberry32(seed);
  seedFood(food, w, h, STARTING_FOOD * 3, rng);

  return { w, h, terrain, food, pheromoneHome, pheromoneFood };
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

export function worldToBase64(arr: Uint8Array | Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64ToFloat32(b64: string): Float32Array {
  return new Float32Array(base64ToUint8(b64).buffer);
}
