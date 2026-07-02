import {
  TERRAIN,
  MAX_FOOD_PER_CELL,
  FOOD_SPAWN_RATE,
  FOOD_CELL_MIN,
  FOOD_CELL_RANGE,
  FOOD_CELL_EXP,
  FOOD_CLUSTER_MIN,
  FOOD_CLUSTER_RANGE,
  FOOD_CLUSTER_EXP,
  WORLD_FOOD_CAP,
  FOOD_SPAWN_MIN_NEST_DIST,
  STARTING_CLUSTERS,
  FOUNDER_CACHE_MIN_DIST,
  FOUNDER_CACHE_MAX_DIST,
  FOUNDER_CACHE_MIN_FOOD,
  FOUNDER_CACHE_MAX_FOOD,
  PHEROMONE_DECREMENT,
  NEST_RADIUS,
} from './constants';
import { World } from './types';
import { randomInt, random } from './rng';

// Orthogonal step deltas for growing food blobs (matches ant movement directions).
const BLOB_DELTAS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
] as const;

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

  const world: World = { w, h, terrain, food, pheromoneHome, pheromoneFood };

  // Starting food: a handful of clusters instead of a uniform scatter. The first is
  // the founder cache — a guaranteed modest cluster near the nest so the lone
  // starting ant's first forage is reliable rather than a matter of luck.
  const founderSeed = pickFounderCacheSeed(world);
  const founderTotal =
    FOUNDER_CACHE_MIN_FOOD + randomInt(FOUNDER_CACHE_MAX_FOOD - FOUNDER_CACHE_MIN_FOOD + 1);
  spawnFoodCluster(world, founderTotal, founderSeed.x, founderSeed.y);

  for (let c = 1; c < STARTING_CLUSTERS; c++) {
    const seed = pickClusterSeed(world);
    if (seed) spawnFoodCluster(world, rollClusterTotal(), seed.x, seed.y);
  }

  return world;
}

// A cell's food amount within a cluster: a low-weighted power roll — small amounts
// are common, rich cells rare. Exported for tests.
export function rollFoodCellAmount(): number {
  return FOOD_CELL_MIN + Math.floor(FOOD_CELL_RANGE * Math.pow(random(), FOOD_CELL_EXP));
}

// A cluster's total food: same low-weighted shape with a heavier tail — most
// clusters are snacks, ~10% are 150+ jackpots. Exported for tests.
export function rollClusterTotal(): number {
  return FOOD_CLUSTER_MIN + Math.floor(FOOD_CLUSTER_RANGE * Math.pow(random(), FOOD_CLUSTER_EXP));
}

// A random seed cell for a natural cluster: non-nest and clear of the nest's
// surroundings, so food logistics always involve some travel. Null if unlucky.
function pickClusterSeed(world: World): { x: number; y: number } | null {
  const { cx, cy } = nestCenter(world);
  for (let tries = 0; tries < 20; tries++) {
    const x = randomInt(world.w);
    const y = randomInt(world.h);
    if (Math.abs(x - cx) + Math.abs(y - cy) >= FOOD_SPAWN_MIN_NEST_DIST) {
      return { x, y };
    }
  }
  return null;
}

// A seed cell on the Manhattan ring FOUNDER_CACHE_MIN_DIST..MAX_DIST around the
// nest. Rejection-sampled (the ring is ~7% of the grid, so 100 tries virtually
// never miss); falls back to a fixed ring cell rather than failing.
function pickFounderCacheSeed(world: World): { x: number; y: number } {
  const { cx, cy } = nestCenter(world);
  for (let tries = 0; tries < 100; tries++) {
    const x = randomInt(world.w);
    const y = randomInt(world.h);
    const d = Math.abs(x - cx) + Math.abs(y - cy);
    if (d >= FOUNDER_CACHE_MIN_DIST && d <= FOUNDER_CACHE_MAX_DIST) {
      return { x, y };
    }
  }
  return { x: cx + FOUNDER_CACHE_MIN_DIST, y: cy };
}

// Grow a contiguous food blob from a seed cell: fill the current cell with a rolled
// amount, then hop to a random orthogonal neighbour of a random cluster cell, until
// the total is spent. Bounded attempts so a boxed-in blob (nest/full/edge cells all
// around) can't loop forever — any unplaced remainder is simply not spawned.
export function spawnFoodCluster(world: World, total: number, seedX: number, seedY: number): void {
  const visited = new Set<number>();
  const cells: number[] = [];
  let remaining = total;
  let x = seedX;
  let y = seedY;

  for (let attempts = 0; remaining > 0 && attempts < total + 64; attempts++) {
    if (inBounds(world, x, y)) {
      const idx = getCellIndex(world, x, y);
      if (
        !visited.has(idx) &&
        world.terrain[idx] !== TERRAIN.NEST &&
        world.food[idx] < MAX_FOOD_PER_CELL
      ) {
        visited.add(idx);
        const space = MAX_FOOD_PER_CELL - world.food[idx];
        const amount = Math.min(rollFoodCellAmount(), remaining, space);
        if (world.food[idx] === 0) {
          world.terrain[idx] = TERRAIN.FOOD;
        }
        world.food[idx] += amount;
        remaining -= amount;
        cells.push(idx);
      }
    }
    if (remaining <= 0) break;
    // Next candidate: a neighbour of a random already-placed cell (keeps the blob
    // contiguous); before any cell is placed, retry around the seed itself.
    const base = cells.length > 0 ? cells[randomInt(cells.length)] : getCellIndex(world, seedX, seedY);
    const d = BLOB_DELTAS[randomInt(4)];
    x = (base % world.w) + d.dx;
    y = Math.floor(base / world.w) + d.dy;
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

// Natural food spawn: each tick has a FOOD_SPAWN_RATE chance of one cluster spawn
// event, gated by the world food cap (the check gates the roll, not the amount, so
// a jackpot cluster may overshoot the cap — deliberate feast/famine).
export function spawnFoodTick(world: World): void {
  if (random() > FOOD_SPAWN_RATE) return;

  let totalFood = 0;
  for (let i = 0; i < world.food.length; i++) {
    totalFood += world.food[i];
  }
  if (totalFood >= WORLD_FOOD_CAP) return;

  const seed = pickClusterSeed(world);
  if (!seed) return;
  spawnFoodCluster(world, rollClusterTotal(), seed.x, seed.y);
}
