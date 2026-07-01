import { describe, it, expect, afterEach } from 'vitest';
import { createWorld, nestCenter, getCellIndex } from '../src/game/world';
import { createAnts, spawnAnt, stepAnts } from '../src/game/ant';
import { resetRandomSource, setRandomSource, createSeededRandom } from '../src/game/rng';
import {
  ANT_STATE,
  TERRAIN,
  ANT_POP_CAP,
  ANT_INITIAL_ENERGY,
  ANT_REFUEL_ENERGY_PER_FOOD,
  ANT_REFUEL_FOOD_COST,
  ANT_CARRY_CAPACITY,
} from '../src/game/constants';

afterEach(() => {
  resetRandomSource();
});

describe('createAnts / spawnAnt', () => {
  it('allocates capacity to POP_CAP and starts every ant on a nest cell', () => {
    const world = createWorld();
    const ants = createAnts(5, world);
    const { cx, cy } = nestCenter(world);

    expect(ants.count).toBe(5);
    expect(ants.capacity).toBe(ANT_POP_CAP);
    for (let i = 0; i < ants.count; i++) {
      expect(Math.abs(ants.x[i] - cx)).toBeLessThanOrEqual(1);
      expect(Math.abs(ants.y[i] - cy)).toBeLessThanOrEqual(1);
      expect(ants.energy[i]).toBe(ANT_INITIAL_ENERGY);
    }
  });

  it('spawnAnt appends until capacity, then refuses (§8.1)', () => {
    const world = createWorld();
    const ants = createAnts(ANT_POP_CAP, world);
    expect(ants.count).toBe(ANT_POP_CAP);
    expect(spawnAnt(ants, world)).toBe(false);
    expect(ants.count).toBe(ANT_POP_CAP);
  });
});

describe('stepAnts', () => {
  it('moves an ant at most one cell per tick (§8.3 single move)', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.state[0] = ANT_STATE.CARRYING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    stepAnts(ants, world, { food: 0 }, 0);

    const dist = Math.abs(ants.x[0] - 5) + Math.abs(ants.y[0] - 5);
    expect(dist).toBeLessThanOrEqual(1);
  });

  it('refuels a depleted (RETURNING) ant on the nest by spending colony food (§8.1)', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    ants.x[0] = cx;
    ants.y[0] = cy;
    // Only a depleted, RETURNING ant recovers on the nest.
    ants.state[0] = ANT_STATE.RETURNING;
    ants.energy[0] = 5;
    const resources = { food: 50 };

    // A recovering ant on the nest stays still (no movement, no energy cost) and, on a
    // refuel tick (tick 0), converts ANT_REFUEL_FOOD_COST food into energy.
    stepAnts(ants, world, resources, 0);

    expect(ants.energy[0]).toBe(5 + ANT_REFUEL_ENERGY_PER_FOOD);
    expect(resources.food).toBe(50 - ANT_REFUEL_FOOD_COST);
  });

  it('caps refuel at max energy, discarding the surplus but still spending food (§8.1)', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    ants.x[0] = cx;
    ants.y[0] = cy;
    ants.state[0] = ANT_STATE.RETURNING;
    ants.energy[0] = ANT_INITIAL_ENERGY - 1; // 99 + 10 would overshoot the cap
    const resources = { food: 50 };

    stepAnts(ants, world, resources, 0);

    expect(ants.energy[0]).toBe(ANT_INITIAL_ENERGY);
    expect(resources.food).toBe(50 - ANT_REFUEL_FOOD_COST);
    // Reaching full flips it back to SEARCHING to forage again.
    expect(ants.state[0]).toBe(ANT_STATE.SEARCHING);
  });

  it('does not recover a healthy (above 20%) ant on the nest — it forages instead', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    ants.x[0] = cx;
    ants.y[0] = cy;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = 50; // above the 20% low-energy threshold → should not rest
    const resources = { food: 50 };

    stepAnts(ants, world, resources, 0);

    // It did not park: it burned a move's worth of energy and spent no colony food.
    expect(ants.energy[0]).toBe(50 - 1);
    expect(resources.food).toBe(50);
  });

  it('a carrying ant lays a food-trail breadcrumb along its route', () => {
    const world = createWorld();
    world.food.fill(0); // no pickups: keep the ant CARRYING so it lays the food trail
    const ants = createAnts(1, world);
    ants.x[0] = 5;
    ants.y[0] = 5; // far from the nest, so it won't reach it in one step
    ants.state[0] = ANT_STATE.CARRYING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    stepAnts(ants, world, { food: 0 }, 1);

    const idx = getCellIndex(world, ants.x[0], ants.y[0]);
    expect(world.pheromoneFood[idx]).toBeGreaterThan(0);
  });

  it('a searching ant lays a home-trail breadcrumb along its route', () => {
    const world = createWorld();
    world.food.fill(0); // no pickups: the ant stays SEARCHING and lays the home trail
    const ants = createAnts(1, world);
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    stepAnts(ants, world, { food: 0 }, 1);

    const idx = getCellIndex(world, ants.x[0], ants.y[0]);
    expect(world.pheromoneHome[idx]).toBeGreaterThan(0);
  });

  it('lays no trail on arriving at the nest (food trail stops, no home trail on the nest)', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    // Start on the nest centre: every neighbour is also a nest cell, so wherever it
    // steps it lands on the nest, drops food, and flips to SEARCHING.
    ants.x[0] = cx;
    ants.y[0] = cy;
    ants.state[0] = ANT_STATE.CARRYING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    stepAnts(ants, world, { food: 0 }, 1);

    const idx = getCellIndex(world, ants.x[0], ants.y[0]);
    expect(ants.state[0]).toBe(ANT_STATE.SEARCHING);
    // The food trail stops at the nest, and no home crumb is laid on a nest cell — keeping
    // the nest block clear of home pheromone so searchers aren't swept away from nearby food.
    expect(world.pheromoneFood[idx]).toBe(0);
    expect(world.pheromoneHome[idx]).toBe(0);
  });

  it('does not step back onto a cell already carrying the trail it is laying', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    // Clear the 4 neighbours to plain empty ground so nothing but the home pheromone
    // differentiates them, then mark three with home pheromone; only West (4,5) is clear.
    // A searching ant lays home, so it must avoid the marked cells and step onto (4,5).
    for (const [nx, ny] of [
      [5, 4],
      [6, 5],
      [5, 6],
      [4, 5],
    ]) {
      const ni = getCellIndex(world, nx, ny);
      world.terrain[ni] = TERRAIN.EMPTY;
      world.food[ni] = 0;
    }
    world.pheromoneHome[getCellIndex(world, 5, 4)] = 0.5; // North
    world.pheromoneHome[getCellIndex(world, 6, 5)] = 0.5; // East
    world.pheromoneHome[getCellIndex(world, 5, 6)] = 0.5; // South

    stepAnts(ants, world, { food: 0 }, 1);

    expect(ants.x[0]).toBe(4);
    expect(ants.y[0]).toBe(5);
  });

  it('follows the goal trail through an overlap instead of avoiding it', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.state[0] = ANT_STATE.SEARCHING; // lays home, follows the food trail
    ants.energy[0] = ANT_INITIAL_ENERGY;

    for (const [nx, ny] of [
      [5, 4],
      [6, 5],
      [5, 6],
      [4, 5],
    ]) {
      const ni = getCellIndex(world, nx, ny);
      world.terrain[ni] = TERRAIN.EMPTY;
      world.food[ni] = 0;
      world.pheromoneHome[ni] = 0.5; // its own laid-trail is everywhere → would avoid all
    }
    // West also has the food (goal) trail: the overlap must win, so it heads West.
    world.pheromoneFood[getCellIndex(world, 4, 5)] = 0.6;

    stepAnts(ants, world, { food: 0 }, 1);

    expect(ants.x[0]).toBe(4);
    expect(ants.y[0]).toBe(5);
  });

  it('a searching ant steers toward food it smells two cells away (food sensing)', () => {
    // Seed the roulette so the strong (26:1) eastward bias resolves deterministically.
    setRandomSource(createSeededRandom(2));
    const world = createWorld();
    world.food.fill(0);
    for (let i = 0; i < world.terrain.length; i++) {
      if (world.terrain[i] === TERRAIN.FOOD) world.terrain[i] = TERRAIN.EMPTY;
    }
    const ants = createAnts(1, world);
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    // Food two cells east — out of pickup range and off any trail, but inside the sensing
    // footprint. The only step that reduces the distance to it is East, so the ant must
    // pick East even though every direction is otherwise flat.
    const fidx = getCellIndex(world, 7, 5);
    world.terrain[fidx] = TERRAIN.FOOD;
    world.food[fidx] = 10;

    stepAnts(ants, world, { food: 0 }, 1);

    expect(ants.x[0]).toBe(6);
    expect(ants.y[0]).toBe(5);
  });

  it('a searching ant avoids stepping onto a nest cell', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    // Stand just outside the nest block (two cells east of centre → one east of the edge).
    // West is a nest cell and must be avoided; the other three are open ground, so the ant
    // must step to one of them, never West onto the nest.
    ants.x[0] = cx + 2;
    ants.y[0] = cy;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = ANT_INITIAL_ENERGY;
    // Clear any food that createWorld may have scattered on the candidate cells.
    for (const [nx, ny] of [
      [cx + 2, cy - 1],
      [cx + 3, cy],
      [cx + 2, cy + 1],
      [cx + 1, cy],
    ]) {
      const ni = getCellIndex(world, nx, ny);
      if (world.terrain[ni] === TERRAIN.FOOD) world.terrain[ni] = TERRAIN.EMPTY;
      world.food[ni] = 0;
    }

    stepAnts(ants, world, { food: 0 }, 1);

    // It never stepped West onto the nest cell (cx+1, cy).
    expect(world.terrain[getCellIndex(world, ants.x[0], ants.y[0])]).not.toBe(TERRAIN.NEST);
  });

  it('collects food up to capacity, even while carrying, and flips to CARRYING', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    // Surround with food so wherever it steps it lands on a rich food cell.
    for (const [nx, ny] of [
      [5, 4],
      [6, 5],
      [5, 6],
      [4, 5],
    ]) {
      const ni = getCellIndex(world, nx, ny);
      world.terrain[ni] = TERRAIN.FOOD;
      world.food[ni] = 10;
    }

    stepAnts(ants, world, { food: 0 }, 1);

    expect(ants.carried[0]).toBe(ANT_CARRY_CAPACITY);
    expect(ants.state[0]).toBe(ANT_STATE.CARRYING);
  });

  it('drops its whole load at the nest and resumes searching', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    ants.x[0] = cx;
    ants.y[0] = cy;
    ants.state[0] = ANT_STATE.CARRYING;
    ants.carried[0] = ANT_CARRY_CAPACITY;
    ants.energy[0] = ANT_INITIAL_ENERGY; // full → won't park, will move onto a nest cell

    stepAnts(ants, world, { food: 0 }, 1);

    let nestFood = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        nestFood += world.food[getCellIndex(world, cx + dx, cy + dy)];
      }
    }

    expect(ants.carried[0]).toBe(0);
    expect(ants.state[0]).toBe(ANT_STATE.SEARCHING);
    expect(nestFood).toBe(ANT_CARRY_CAPACITY);
  });

  it('a recovering (RETURNING) ant on the nest stays still and burns no energy (even off refuel ticks)', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    ants.x[0] = cx;
    ants.y[0] = cy;
    // A depleted ant mid-recovery (still below full) parks even between refuel ticks.
    ants.state[0] = ANT_STATE.RETURNING;
    ants.energy[0] = 50;
    const resources = { food: 50 };

    // tick 1 is NOT a refuel tick, but the ant should still park (no move, no energy cost).
    stepAnts(ants, world, resources, 1);

    expect(ants.x[0]).toBe(cx);
    expect(ants.y[0]).toBe(cy);
    expect(ants.energy[0]).toBe(50);
    expect(resources.food).toBe(50);
  });

  it('removes ants that run out of energy and compacts the arrays', () => {
    const world = createWorld();
    const ants = createAnts(2, world);
    ants.energy[0] = 0; // will be marked dead on the death check
    ants.energy[1] = ANT_INITIAL_ENERGY;

    stepAnts(ants, world, { food: 0 }, 0);

    expect(ants.count).toBe(1);
    expect(ants.state[0]).not.toBe(ANT_STATE.DEAD);
  });
});
