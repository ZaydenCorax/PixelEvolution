import { describe, it, expect, afterEach } from 'vitest';
import {
  random,
  randomInt,
  setRandomSource,
  resetRandomSource,
  createSeededRandom,
} from '../src/game/rng';

afterEach(() => {
  resetRandomSource();
});

describe('rng', () => {
  it('randomInt returns integers in [0, max)', () => {
    setRandomSource(() => 0);
    expect(randomInt(5)).toBe(0);
    setRandomSource(() => 0.999999);
    expect(randomInt(5)).toBe(4);
  });

  it('random() reflects the injected source', () => {
    setRandomSource(() => 0.42);
    expect(random()).toBe(0.42);
  });

  it('createSeededRandom is deterministic for a given seed', () => {
    const a = createSeededRandom(12345);
    const b = createSeededRandom(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
    // Values are valid probabilities.
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds produce different streams', () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    expect(a()).not.toBe(b());
  });
});
