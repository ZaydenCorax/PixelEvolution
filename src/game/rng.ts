// Centralised randomness for the simulation (DESIGN.md §8.8). All game code draws
// from `random()` / `randomInt()` here rather than calling Math.random() directly,
// so a deterministic source can be injected for reproducible saves/replays/tests.

export type RandomSource = () => number; // returns a float in [0, 1)

// The default source is a mulberry32 PRNG seeded from the clock: deterministic
// engine, fresh stream each load. Call setRandomSource() with a fixed seed to make
// a run fully reproducible.
function createDefaultSource(): RandomSource {
  return createSeededRandom(Date.now() >>> 0);
}

let source: RandomSource = createDefaultSource();

/** Replace the active random source (e.g. inject a seeded PRNG). */
export function setRandomSource(fn: RandomSource): void {
  source = fn;
}

/** Restore the default source (a freshly seeded mulberry32 PRNG). */
export function resetRandomSource(): void {
  source = createDefaultSource();
}

/** A float in [0, 1) from the active source. */
export function random(): number {
  return source();
}

/** An integer in [0, max) from the active source. */
export function randomInt(max: number): number {
  return Math.floor(source() * max);
}

/**
 * Deterministic PRNG (mulberry32) — same seed yields the same stream. Pass the
 * result to setRandomSource() to make a run reproducible.
 */
export function createSeededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
