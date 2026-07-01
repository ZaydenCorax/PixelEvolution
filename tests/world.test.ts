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
} from '../src/game/world';
import { setRandomSource, resetRandomSource } from '../src/game/rng';
import {
  TERRAIN,
  MAX_FOOD_PER_CELL,
  STARTING_FOOD,
  PHEROMONE_DURATION_TICKS,
} from '../src/game/constants';

afterEach(() => {
  resetRandomSource();
});

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

  it('scatters exactly STARTING_FOOD units, all tagged as FOOD terrain', () => {
    const world = createWorld();
    let total = 0;
    for (let i = 0; i < world.food.length; i++) {
      if (world.food[i] > 0) {
        total += world.food[i];
        expect(world.terrain[i]).toBe(TERRAIN.FOOD);
      }
    }
    expect(total).toBe(STARTING_FOOD);
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

  it('spawnFoodTick tags the cell as FOOD terrain (§8.2)', () => {
    const world = createWorld();
    // Clear cell (0,0) then force the spawn to land there: random()=0 passes the
    // spawn-chance gate and randomInt(w/h) both resolve to 0.
    world.food[0] = 0;
    world.terrain[0] = TERRAIN.EMPTY;
    setRandomSource(() => 0);
    spawnFoodTick(world);
    expect(world.terrain[0]).toBe(TERRAIN.FOOD);
    expect(world.food[0]).toBeGreaterThan(0);
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
