import { describe, it, expect, afterEach } from 'vitest';
import { createWorld, nestCenter, getCellIndex } from '../src/game/world';
import { createAnts, spawnAnt, stepAnts } from '../src/game/ant';
import { resetRandomSource, setRandomSource, createSeededRandom } from '../src/game/rng';
import {
  ANT_STATE,
  TERRAIN,
  ANT_ARRAY_CAPACITY,
  ANT_INITIAL_ENERGY,
  ANT_REFUEL_ENERGY_PER_FOOD,
  ANT_REFUEL_FOOD_COST,
  ANT_CARRY_CAPACITY,
  RETREAT_ENERGY_BUFFER,
} from '../src/game/constants';
import type { World } from '../src/game/types';

afterEach(() => {
  resetRandomSource();
});

// Reset every food cell (and its FOOD terrain tag). Movement tests need a bare grid:
// stray cluster food would give the ant a target lock and change its choice.
function clearFood(world: World): void {
  world.food.fill(0);
  for (let i = 0; i < world.terrain.length; i++) {
    if (world.terrain[i] === TERRAIN.FOOD) world.terrain[i] = TERRAIN.EMPTY;
  }
}

// A constant RNG above both ε thresholds: every move takes the argmax path (no
// mutation), making movement assertions deterministic.
const noMutation = () => 0.5;

describe('createAnts / spawnAnt', () => {
  it('allocates the hard ARRAY_CAPACITY and starts every ant on a nest cell', () => {
    const world = createWorld();
    const ants = createAnts(5, world);
    const { cx, cy } = nestCenter(world);

    expect(ants.count).toBe(5);
    expect(ants.capacity).toBe(ANT_ARRAY_CAPACITY);
    for (let i = 0; i < ants.count; i++) {
      expect(Math.abs(ants.x[i] - cx)).toBeLessThanOrEqual(1);
      expect(Math.abs(ants.y[i] - cy)).toBeLessThanOrEqual(1);
      expect(ants.energy[i]).toBe(ANT_INITIAL_ENERGY);
      expect(ants.targetX[i]).toBe(-1);
      expect(ants.targetY[i]).toBe(-1);
    }
  });

  it('spawnAnt appends until the array capacity, then refuses (§8.1)', () => {
    const world = createWorld();
    const ants = createAnts(ANT_ARRAY_CAPACITY, world);
    expect(ants.count).toBe(ANT_ARRAY_CAPACITY);
    expect(spawnAnt(ants, world)).toBe(false);
    expect(ants.count).toBe(ANT_ARRAY_CAPACITY);
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

  it('does not recover a healthy ant on the nest — it forages instead', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    ants.x[0] = cx;
    ants.y[0] = cy;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = 50; // plenty to cover the walk home → should not rest
    const resources = { food: 50 };

    stepAnts(ants, world, resources, 0);

    // It did not park: it burned a move's worth of energy and spent no colony food.
    expect(ants.energy[0]).toBe(50 - 1);
    expect(resources.food).toBe(50);
  });

  it('a carrying ant lays a food-trail breadcrumb along its route', () => {
    const world = createWorld();
    clearFood(world); // no pickups: keep the ant CARRYING so it lays the food trail
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
    clearFood(world); // no pickups: the ant stays SEARCHING and lays the home trail
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
    clearFood(world); // no food targets: nothing but the pheromones may steer the choice
    const ants = createAnts(1, world);
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    // Mark three neighbours with home pheromone; only West (4,5) is clear. A searching
    // ant lays home, so it must avoid the marked cells and step onto (4,5).
    world.pheromoneHome[getCellIndex(world, 5, 4)] = 0.5; // North
    world.pheromoneHome[getCellIndex(world, 6, 5)] = 0.5; // East
    world.pheromoneHome[getCellIndex(world, 5, 6)] = 0.5; // South

    stepAnts(ants, world, { food: 0 }, 1);

    expect(ants.x[0]).toBe(4);
    expect(ants.y[0]).toBe(5);
  });

  it('follows the goal trail through an overlap instead of avoiding it', () => {
    const world = createWorld();
    clearFood(world);
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
      world.pheromoneHome[getCellIndex(world, nx, ny)] = 0.5; // own trail everywhere → would avoid all
    }
    // West also has the food (goal) trail: the overlap must win, so it heads West.
    world.pheromoneFood[getCellIndex(world, 4, 5)] = 0.6;

    stepAnts(ants, world, { food: 0 }, 1);

    expect(ants.x[0]).toBe(4);
    expect(ants.y[0]).toBe(5);
  });

  it('a searching ant locks onto smelled food and steps toward it (target lock)', () => {
    const world = createWorld();
    clearFood(world);
    const ants = createAnts(1, world);
    setRandomSource(noMutation); // argmax path: the locked target decides the step
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    // Food two cells east — out of pickup range and off any trail, but inside the
    // sensing footprint. The ant must lock it as its target and step East.
    const fidx = getCellIndex(world, 7, 5);
    world.terrain[fidx] = TERRAIN.FOOD;
    world.food[fidx] = 10;

    stepAnts(ants, world, { food: 0 }, 1);

    expect(ants.targetX[0]).toBe(7);
    expect(ants.targetY[0]).toBe(5);
    expect(ants.x[0]).toBe(6);
    expect(ants.y[0]).toBe(5);
  });

  it('a locked ant beelines to its target across ticks and collects it', () => {
    const world = createWorld();
    clearFood(world);
    const ants = createAnts(1, world);
    setRandomSource(noMutation);
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    const fidx = getCellIndex(world, 7, 5);
    world.terrain[fidx] = TERRAIN.FOOD;
    world.food[fidx] = 10;

    // Two argmax steps: (5,5) → (6,5) → (7,5), where it picks up to carry capacity.
    stepAnts(ants, world, { food: 0 }, 1);
    stepAnts(ants, world, { food: 0 }, 3);

    expect(ants.x[0]).toBe(7);
    expect(ants.y[0]).toBe(5);
    expect(ants.carried[0]).toBe(ANT_CARRY_CAPACITY);
    expect(ants.state[0]).toBe(ANT_STATE.CARRYING);
  });

  it('a rare mutation roll makes the ant deviate from the locked path', () => {
    const world = createWorld();
    clearFood(world);
    const ants = createAnts(1, world);
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.dir[0] = 0; // North momentum, so East's pull comes only from the target
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    const fidx = getCellIndex(world, 7, 5);
    world.terrain[fidx] = TERRAIN.FOOD;
    world.food[fidx] = 10;

    // First draw (ε roll) = 0 → mutation fires; second (roulette roll) lands near the
    // end of the wheel, picking a low-weighted direction instead of the eastward best.
    const draws = [0, 0.99];
    let i = 0;
    setRandomSource(() => (i < draws.length ? draws[i++] : 0.5));

    stepAnts(ants, world, { food: 0 }, 1);

    expect(ants.x[0]).not.toBe(6); // deviated: did not take the optimal eastward step
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

  it('compaction preserves the surviving ant’s locked target', () => {
    const world = createWorld();
    clearFood(world);
    const ants = createAnts(2, world);
    setRandomSource(noMutation);
    ants.energy[0] = 0; // dies and is compacted away
    ants.x[1] = 5;
    ants.y[1] = 5;
    ants.state[1] = ANT_STATE.SEARCHING;
    ants.energy[1] = ANT_INITIAL_ENERGY;

    const fidx = getCellIndex(world, 7, 5);
    world.terrain[fidx] = TERRAIN.FOOD;
    world.food[fidx] = 10;

    stepAnts(ants, world, { food: 0 }, 1);

    // The survivor shifted down to slot 0 with its target intact.
    expect(ants.count).toBe(1);
    expect(ants.targetX[0]).toBe(7);
    expect(ants.targetY[0]).toBe(5);
  });

  it('a homing ant beelines: no momentum overshoot, every argmax step heads nestward', () => {
    const world = createWorld();
    clearFood(world);
    const ants = createAnts(1, world);
    setRandomSource(noMutation);
    const { cx, cy } = nestCenter(world);
    ants.x[0] = 5;
    ants.y[0] = 5;
    ants.dir[0] = 3; // West — momentum would argue for walking AWAY from the nest
    ants.state[0] = ANT_STATE.CARRYING;
    ants.carried[0] = ANT_CARRY_CAPACITY;
    ants.energy[0] = ANT_INITIAL_ENERGY;

    let dist = Math.abs(5 - cx) + Math.abs(5 - cy);
    for (let t = 1; t <= 5; t++) {
      stepAnts(ants, world, { food: 0 }, t);
      const now = Math.abs(ants.x[0] - cx) + Math.abs(ants.y[0] - cy);
      expect(now).toBeLessThan(dist);
      dist = now;
    }
  });

  it('retreats when energy no longer covers the walk home plus the buffer', () => {
    const world = createWorld();
    clearFood(world); // no pickups: the ant must stay SEARCHING until the retreat check
    const ants = createAnts(1, world);
    ants.x[0] = 5;
    ants.y[0] = 5; // Manhattan distance ~22 from the nest centre (16,16)
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = 25; // after the move (24) it can no longer cover dist + buffer

    stepAnts(ants, world, { food: 0 }, 1);

    expect(ants.state[0]).toBe(ANT_STATE.RETURNING);
  });

  it('keeps foraging near the nest down to the buffer, then retreats', () => {
    const world = createWorld();
    clearFood(world);
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    ants.x[0] = cx + 2;
    ants.y[0] = cy; // right beside the nest: retreat only when energy nears the buffer
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = 50;

    stepAnts(ants, world, { food: 0 }, 1);
    expect(ants.state[0]).toBe(ANT_STATE.SEARCHING);

    // Well under distance + buffer → must turn back now.
    ants.energy[0] = RETREAT_ENERGY_BUFFER;
    stepAnts(ants, world, { food: 0 }, 2);
    expect(ants.state[0]).toBe(ANT_STATE.RETURNING);
  });
});
