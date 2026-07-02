import { describe, it, expect, afterEach } from 'vitest';
import {
  createWorld,
  nestCenter,
  getCellIndex,
  pickupFood,
  dropFood,
  depositPheromone,
  tickPheromones,
  spawnFoodTick,
  spawnFoodCluster,
  rollFoodCellAmount,
  rollClusterTotal,
} from '../src/game/world';
import { setRandomSource, resetRandomSource, createSeededRandom } from '../src/game/rng';
import {
  TERRAIN,
  MAX_FOOD_PER_CELL,
  PHEROMONE_DURATION_TICKS,
  FOOD_CELL_MIN,
  FOOD_CELL_RANGE,
  FOOD_CLUSTER_MIN,
  FOOD_CLUSTER_RANGE,
  WORLD_FOOD_CAP,
  FOUNDER_CACHE_MIN_DIST,
  FOUNDER_CACHE_MAX_DIST,
  FOUNDER_CACHE_MIN_FOOD,
  FOUNDER_CACHE_MAX_FOOD,
  STARTING_CLUSTERS,
} from '../src/game/constants';
import type { World } from '../src/game/types';

afterEach(() => {
  resetRandomSource();
});

// Reset every food cell (and its FOOD terrain tag) for tests that need a bare grid.
function clearFood(world: World): void {
  world.food.fill(0);
  for (let i = 0; i < world.terrain.length; i++) {
    if (world.terrain[i] === TERRAIN.FOOD) world.terrain[i] = TERRAIN.EMPTY;
  }
}

describe('createWorld', () => {
  it('stamps a 3x3 nest at the derived grid centre', () => {
    const world = createWorld();
    const { cx, cy } = nestCenter(world);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(world.terrain[getCellIndex(world, cx + dx, cy + dy)]).toBe(TERRAIN.NEST);
      }
    }
  });

  it('seeds starting clusters: every food cell is tagged FOOD, total within roll bounds', () => {
    setRandomSource(createSeededRandom(42));
    const world = createWorld();
    let total = 0;
    for (let i = 0; i < world.food.length; i++) {
      if (world.food[i] > 0) {
        total += world.food[i];
        expect(world.terrain[i]).toBe(TERRAIN.FOOD);
      }
    }
    // Founder cache 30..60 plus (STARTING_CLUSTERS - 1) natural clusters of 5..200.
    const naturalMax = FOOD_CLUSTER_MIN + FOOD_CLUSTER_RANGE - 1;
    expect(total).toBeGreaterThanOrEqual(FOUNDER_CACHE_MIN_FOOD);
    expect(total).toBeLessThanOrEqual(
      FOUNDER_CACHE_MAX_FOOD + (STARTING_CLUSTERS - 1) * naturalMax,
    );
  });

  it('guarantees a founder cache: food on the founder ring around the nest', () => {
    setRandomSource(createSeededRandom(42));
    const world = createWorld();
    const { cx, cy } = nestCenter(world);
    let foundInRing = false;
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const d = Math.abs(x - cx) + Math.abs(y - cy);
        if (
          d >= FOUNDER_CACHE_MIN_DIST &&
          d <= FOUNDER_CACHE_MAX_DIST &&
          world.food[getCellIndex(world, x, y)] > 0
        ) {
          foundInRing = true;
        }
      }
    }
    expect(foundInRing).toBe(true);
  });
});

describe('cluster rolls', () => {
  it('rollFoodCellAmount spans its low-weighted range (min at r=0, max as r→1)', () => {
    setRandomSource(() => 0);
    expect(rollFoodCellAmount()).toBe(FOOD_CELL_MIN);
    setRandomSource(() => 0.999999);
    expect(rollFoodCellAmount()).toBe(FOOD_CELL_MIN + FOOD_CELL_RANGE - 1);
  });

  it('rollClusterTotal spans its low-weighted range (min at r=0, max as r→1)', () => {
    setRandomSource(() => 0);
    expect(rollClusterTotal()).toBe(FOOD_CLUSTER_MIN);
    setRandomSource(() => 0.999999);
    expect(rollClusterTotal()).toBe(FOOD_CLUSTER_MIN + FOOD_CLUSTER_RANGE - 1);
  });
});

describe('spawnFoodCluster', () => {
  it('deposits the full total as one contiguous FOOD blob', () => {
    setRandomSource(createSeededRandom(7));
    const world = createWorld();
    clearFood(world);

    spawnFoodCluster(world, 100, 5, 5);

    // Full total placed, every cell tagged FOOD.
    const foodCells: number[] = [];
    let total = 0;
    for (let i = 0; i < world.food.length; i++) {
      if (world.food[i] > 0) {
        total += world.food[i];
        foodCells.push(i);
        expect(world.terrain[i]).toBe(TERRAIN.FOOD);
      }
    }
    expect(total).toBe(100);

    // Contiguity: flood-fill from the seed reaches every food cell.
    const seen = new Set<number>([getCellIndex(world, 5, 5)]);
    const queue = [getCellIndex(world, 5, 5)];
    while (queue.length > 0) {
      const idx = queue.pop()!;
      const x = idx % world.w;
      const y = Math.floor(idx / world.w);
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= world.w || ny < 0 || ny >= world.h) continue;
        const ni = getCellIndex(world, nx, ny);
        if (world.food[ni] > 0 && !seen.has(ni)) {
          seen.add(ni);
          queue.push(ni);
        }
      }
    }
    for (const idx of foodCells) {
      expect(seen.has(idx)).toBe(true);
    }
  });
});

describe('food handling', () => {
  it('pickupFood reverts an emptied cell to EMPTY terrain (§8.2)', () => {
    const world = createWorld();
    const idx = world.food.findIndex((v) => v > 0);
    const x = idx % world.w;
    const y = Math.floor(idx / world.w);
    const amount = world.food[idx];

    const taken = pickupFood(world, x, y, amount);
    expect(taken).toBe(amount);
    expect(world.food[idx]).toBe(0);
    expect(world.terrain[idx]).toBe(TERRAIN.EMPTY);
  });

  it('dropFood clamps to MAX_FOOD_PER_CELL', () => {
    const world = createWorld();
    world.food[0] = MAX_FOOD_PER_CELL - 5;
    dropFood(world, 0, 0, 100);
    expect(world.food[0]).toBe(MAX_FOOD_PER_CELL);
  });

  it('spawnFoodTick spawns a cluster tagged as FOOD terrain (§8.2)', () => {
    const world = createWorld();
    // Empty the map (so the world food cap can't gate the spawn), then force the
    // cluster seed onto (0,0): random()=0 passes the spawn-chance gate and
    // randomInt(w/h) both resolve to 0.
    world.food.fill(0);
    for (let i = 0; i < world.terrain.length; i++) {
      if (world.terrain[i] === TERRAIN.FOOD) world.terrain[i] = TERRAIN.EMPTY;
    }
    setRandomSource(() => 0);
    spawnFoodTick(world);
    expect(world.terrain[0]).toBe(TERRAIN.FOOD);
    expect(world.food[0]).toBeGreaterThan(0);
  });

  it('spawnFoodTick skips spawning while the map holds WORLD_FOOD_CAP food', () => {
    const world = createWorld();
    world.food.fill(0);
    for (let i = 0; i < world.terrain.length; i++) {
      if (world.terrain[i] === TERRAIN.FOOD) world.terrain[i] = TERRAIN.EMPTY;
    }
    // Saturate the map with exactly the cap, away from the forced (0,0) seed.
    world.food[getCellIndex(world, 10, 10)] = WORLD_FOOD_CAP;
    setRandomSource(() => 0);
    spawnFoodTick(world);
    expect(world.food[0]).toBe(0);
    expect(world.terrain[0]).not.toBe(TERRAIN.FOOD);
  });
});

describe('pheromones', () => {
  it('depositPheromone clamps to 1', () => {
    const world = createWorld();
    depositPheromone(world, 5, 5, 0.8, 0.9);
    depositPheromone(world, 5, 5, 0.8, 0.9);
    const idx = getCellIndex(world, 5, 5);
    expect(world.pheromoneHome[idx]).toBe(1);
    expect(world.pheromoneFood[idx]).toBe(1);
  });

  it('tickPheromones decays a marker linearly toward zero', () => {
    const world = createWorld();
    depositPheromone(world, 5, 5, 1, 0);
    const idx = getCellIndex(world, 5, 5);
    // Linear decay: a freshly-laid marker (1.0) loses 1/PHEROMONE_DURATION_TICKS per tick.
    tickPheromones(world);
    expect(world.pheromoneHome[idx]).toBeCloseTo(1 - 1 / PHEROMONE_DURATION_TICKS);
    expect(world.pheromoneHome[idx]).toBeGreaterThan(0);
  });

  it('tickPheromones fully clears a marker after its duration (floored at 0)', () => {
    const world = createWorld();
    depositPheromone(world, 5, 5, 1, 0);
    const idx = getCellIndex(world, 5, 5);
    for (let t = 0; t < PHEROMONE_DURATION_TICKS; t++) {
      tickPheromones(world);
    }
    expect(world.pheromoneHome[idx]).toBe(0);
  });

  it('tickPheromones does NOT diffuse/spread to neighbours', () => {
    const world = createWorld();
    depositPheromone(world, 5, 5, 1, 0);
    tickPheromones(world);
    // Every orthogonal neighbour of (5,5) must stay exactly 0 — no outward spread.
    for (const [nx, ny] of [
      [4, 5],
      [6, 5],
      [5, 4],
      [5, 6],
    ]) {
      expect(world.pheromoneHome[getCellIndex(world, nx, ny)]).toBe(0);
    }
  });
});
