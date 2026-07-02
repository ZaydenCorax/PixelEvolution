import type { GameState } from '../game/types';
import { createInitialState, tick, createSimLoop } from '../game/simulation';
import { createSeededRandom, setRandomSource } from '../game/rng';
import { createRenderer } from '../render/renderer';

export interface GameStore {
  get state(): GameState;
  get paused(): boolean;
  get gameOver(): boolean;
  get gameOverReason(): string | undefined;
  /** The mulberry32 seed of the current run (shown/editable in the seed panel). */
  get seed(): number;
  /** Playback speed multiplier (1, 2, 4, …). */
  get speed(): number;
  /** Colony generation — counts runs this session. TODO: tie to the evolution layer. */
  get generation(): number;
  togglePause(): void;
  /** Advance exactly one tick and leave the sim paused (transport single-step). */
  step(): void;
  setSpeed(multiplier: number): void;
  start(): void;
  stop(): void;
  /** Start a fresh run. Pass a seed to reproduce a world; omit for a fresh roll. */
  startNewGame(seed?: number): void;
  subscribe(fn: () => void): () => void;
  /** Map a viewport point to the grid cell under it (for hover/tooltips), or null. */
  cellAt(clientX: number, clientY: number): { x: number; y: number } | null;
  /** Set (or clear) the inspected cell — drawn as an amber outline on the grid. */
  setHover(cell: { x: number; y: number } | null): void;
  destroy(): void;
}

/** A fresh 6-digit seed, drawn outside the sim's RNG so it can't self-influence. */
function rollSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function createGameStore(container: HTMLDivElement): GameStore {
  let seed = rollSeed();
  setRandomSource(createSeededRandom(seed));
  let state = createInitialState();
  let speed = 1;
  let generation = 0;
  let hover: { x: number; y: number } | null = null;

  const renderer = createRenderer(container);
  renderer.resize(state.world.w, state.world.h);

  const listeners = new Set<() => void>();

  function notify(): void {
    for (const fn of listeners) fn();
  }

  function draw(): void {
    renderer.draw(state.world, state.ants, hover);
  }

  function onTick(): void {
    tick(state);
    draw();
    notify();
  }

  const simLoop = createSimLoop(onTick);

  // Keep the canvas fitted to its container. The observer fires once immediately
  // (initial size) and on every subsequent container/window resize.
  const resizeObserver = new ResizeObserver(() => {
    renderer.resize(state.world.w, state.world.h);
    draw();
  });
  resizeObserver.observe(container);

  return {
    get state() {
      return state;
    },
    get paused() {
      return state.paused;
    },
    get gameOver() {
      return state.gameOver;
    },
    get gameOverReason() {
      return state.gameOverReason;
    },
    get seed() {
      return seed;
    },
    get speed() {
      return speed;
    },
    get generation() {
      return generation;
    },
    togglePause(): void {
      state.paused = !state.paused;
      if (state.paused) {
        simLoop.stop();
      } else {
        simLoop.start();
      }
      notify();
    },
    step(): void {
      // Single-step implies paused: halt the loop, run one tick past the pause
      // guard in tick(), then stay paused so each press advances exactly one tick.
      if (!state.paused) {
        simLoop.stop();
      }
      state.paused = false;
      tick(state);
      state.paused = true;
      draw();
      notify();
    },
    setSpeed(multiplier: number): void {
      speed = multiplier;
      simLoop.setSpeed(multiplier);
      notify();
    },
    start(): void {
      simLoop.start();
    },
    stop(): void {
      simLoop.stop();
    },
    startNewGame(newSeed?: number): void {
      simLoop.stop();
      seed = newSeed ?? rollSeed();
      // Re-seed before building the world so a given seed reproduces the exact
      // same run (DESIGN.md §8.8).
      setRandomSource(createSeededRandom(seed));
      state = createInitialState();
      generation++;
      renderer.resize(state.world.w, state.world.h);
      draw();
      notify();
      simLoop.start();
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    cellAt(clientX: number, clientY: number) {
      return renderer.clientToCell(clientX, clientY);
    },
    setHover(cell: { x: number; y: number } | null): void {
      hover = cell;
      draw();
    },
    destroy(): void {
      simLoop.stop();
      resizeObserver.disconnect();
      renderer.destroy();
      listeners.clear();
    },
  };
}
