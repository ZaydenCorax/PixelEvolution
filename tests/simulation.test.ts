import { describe, it, expect, afterEach } from 'vitest';
import { createInitialState, tick } from '../src/game/simulation';
import {
  setRandomSource,
  resetRandomSource,
  createSeededRandom,
} from '../src/game/rng';
import { STARTING_ANTS } from '../src/game/constants';

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
