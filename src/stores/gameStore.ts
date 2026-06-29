import type { GameState } from '../game/types';
import { createInitialState, tick, expandGrid, createSimLoop } from '../game/simulation';
import { createRenderer } from '../render/renderer';

export interface GameStore {
  state: GameState;
  paused: boolean;
  speedMultiplier: number;
  togglePause(): void;
  setSpeed(multiplier: number): void;
  expand(): void;
  start(): void;
  stop(): void;
  reset(): void;
  subscribe(fn: () => void): () => void;
}

export function createGameStore(canvas: HTMLCanvasElement): GameStore {
  let state = createInitialState();
  const renderer = createRenderer(canvas);
  renderer.resize(state.world.w, state.world.h);

  const listeners = new Set<() => void>();

  function notify(): void {
    for (const fn of listeners) fn();
  }

  function onTick(): void {
    tick(state);
    renderer.draw(state.world, state.ants);
    notify();
  }

  const simLoop = createSimLoop(onTick);

  return {
    get state() {
      return state;
    },
    get paused() {
      return state.paused;
    },
    get speedMultiplier() {
      return state.speedMultiplier;
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
    setSpeed(multiplier: number): void {
      state.speedMultiplier = multiplier;
      notify();
    },
    expand(): void {
      if (expandGrid(state)) {
        renderer.resize(state.world.w, state.world.h);
        notify();
      }
    },
    start(): void {
      simLoop.start();
    },
    stop(): void {
      simLoop.stop();
    },
    reset(): void {
      simLoop.stop();
      state = createInitialState();
      renderer.resize(state.world.w, state.world.h);
      renderer.draw(state.world, state.ants);
      notify();
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
