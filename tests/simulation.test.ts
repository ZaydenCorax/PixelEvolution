import { describe, it, expect, afterEach } from 'vitest';
import { createInitialState, tick, calcEvoPoints } from '../src/game/simulation';
import { nestCenter, getCellIndex } from '../src/game/world';
import {
  setRandomSource,
  resetRandomSource,
  createSeededRandom,
} from '../src/game/rng';
import { STARTING_ANTS, EVO_FOOD_DIVISOR } from '../src/game/constants';

afterEach(() => {
  resetRandomSource();
});

describe('createInitialState', () => {
  it('builds a 32x32 world seeded with the starting ants', () => {
    const state = createInitialState();
    expect(state.tick).toBe(0);
    expect(state.world.w).toBe(32);
    expect(state.world.h).toBe(32);
    expect(state.ants.count).toBe(STARTING_ANTS);
    expect(state.resources.food).toBe(0);
    expect(state.stats.lifetimeFoodBanked).toBe(0);
  });
});

describe('tick', () => {
  it('advances the tick counter', () => {
    const state = createInitialState();
    tick(state);
    expect(state.tick).toBe(1);
  });

  it('does nothing while paused or game over', () => {
    const state = createInitialState();
    state.paused = true;
    tick(state);
    expect(state.tick).toBe(0);
    state.paused = false;
    state.gameOver = true;
    tick(state);
    expect(state.tick).toBe(0);
  });

  it('spends colony food to grow the population (§8.1 reproduction)', () => {
    setRandomSource(createSeededRandom(7));
    const state = createInitialState();
    state.resources.food = 1000;
    // Run past one reproduction interval; at least one ant should be born.
    for (let i = 0; i < 20; i++) tick(state);
    expect(state.ants.count).toBeGreaterThan(STARTING_ANTS);
    expect(state.resources.food).toBeLessThan(1000);
  });

  it('banks nest food into the lifetime counter (spending never reduces it)', () => {
    setRandomSource(createSeededRandom(7));
    const state = createInitialState();
    // Plant food on a nest cell; the every-10-ticks sweep must count it.
    const { cx, cy } = nestCenter(state.world);
    state.world.food[getCellIndex(state.world, cx, cy)] = 7;

    for (let i = 0; i < 10; i++) tick(state);

    expect(state.stats.lifetimeFoodBanked).toBeGreaterThanOrEqual(7);
    const banked = state.stats.lifetimeFoodBanked;

    // Lifetime counter only ever grows, even as resources are spent on refuelling.
    for (let i = 0; i < 10; i++) tick(state);
    expect(state.stats.lifetimeFoodBanked).toBeGreaterThanOrEqual(banked);
  });
});

describe('calcEvoPoints', () => {
  it('is the floored square root of lifetime banked food over the divisor', () => {
    const state = createInitialState();
    state.stats.lifetimeFoodBanked = 0;
    expect(calcEvoPoints(state)).toBe(0);
    state.stats.lifetimeFoodBanked = EVO_FOOD_DIVISOR - 1; // just under 1 EVO
    expect(calcEvoPoints(state)).toBe(0);
    state.stats.lifetimeFoodBanked = 9 * EVO_FOOD_DIVISOR; // √9 = 3
    expect(calcEvoPoints(state)).toBe(3);
    state.stats.lifetimeFoodBanked = 100 * EVO_FOOD_DIVISOR; // √100 = 10
    expect(calcEvoPoints(state)).toBe(10);
  });
});

describe('determinism (§8.8 injectable RNG)', () => {
  function run(seed: number) {
    setRandomSource(createSeededRandom(seed));
    const state = createInitialState();
    for (let i = 0; i < 30; i++) tick(state);
    return {
      tick: state.tick,
      food: state.resources.food,
      count: state.ants.count,
      positions: Array.from(state.ants.x.slice(0, state.ants.count)),
    };
  }

  it('same seed yields identical runs', () => {
    expect(run(999)).toEqual(run(999));
  });
});
