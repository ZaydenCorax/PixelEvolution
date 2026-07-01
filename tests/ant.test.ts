import { describe, it, expect, afterEach } from 'vitest';
import { createWorld, nestCenter } from '../src/game/world';
import { createAnts, spawnAnt, stepAnts } from '../src/game/ant';
import { resetRandomSource } from '../src/game/rng';
import {
  ANT_STATE,
  ANT_POP_CAP,
  ANT_INITIAL_ENERGY,
  ANT_REFUEL_ENERGY_PER_FOOD,
  ANT_REFUEL_FOOD_COST,
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

  it('refuels an ant on the nest by spending colony food (§8.1)', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    ants.x[0] = cx;
    ants.y[0] = cy;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = 5;
    const resources = { food: 50 };

    // tick 0 is a refuel tick. Energy is spent first (-ANT_ENERGY_COST = 4), then
    // refuelled by ANT_REFUEL_ENERGY_PER_FOOD, costing ANT_REFUEL_FOOD_COST food.
    stepAnts(ants, world, resources, 0);

    expect(ants.energy[0]).toBe(4 + ANT_REFUEL_ENERGY_PER_FOOD);
    expect(resources.food).toBe(50 - ANT_REFUEL_FOOD_COST);
  });

  it('caps refuel at max energy, discarding the surplus but still spending food (§8.1)', () => {
    const world = createWorld();
    const ants = createAnts(1, world);
    const { cx, cy } = nestCenter(world);
    ants.x[0] = cx;
    ants.y[0] = cy;
    ants.state[0] = ANT_STATE.SEARCHING;
    ants.energy[0] = ANT_INITIAL_ENERGY - 1; // 99 → 98 after cost, +10 would overshoot
    const resources = { food: 50 };

    stepAnts(ants, world, resources, 0);

    expect(ants.energy[0]).toBe(ANT_INITIAL_ENERGY);
    expect(resources.food).toBe(50 - ANT_REFUEL_FOOD_COST);
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
