import type { GameState } from '../game/types';
import { createInitialState, tick, expandGrid, createSimLoop } from '../game/simulation';
import { createRenderer } from '../render/renderer';

export interface GameStore {
  state: GameState;
  paused: boolean;
  speedMultiplier: number;
  gameOver: boolean;
  gameOverReason: string | undefined;
  togglePause(): void;
  setSpeed(multiplier: number): void;
  expand(): void;
  start(): void;
  stop(): void;
  startNewGame(): void;
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
    get gameOver() {
      return state.gameOver;
    },
    get gameOverReason() {
      return state.gameOverReason;
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
    startNewGame(): void {
      simLoop.stop();
      state = createInitialState();
      renderer.resize(state.world.w, state.world.h);
      renderer.draw(state.world, state.ants);
      notify();
      simLoop.start();
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
