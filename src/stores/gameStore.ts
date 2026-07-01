import type { GameState } from '../game/types';
import { createInitialState, tick, createSimLoop } from '../game/simulation';
import { createRenderer } from '../render/renderer';

export interface GameStore {
  get state(): GameState;
  get paused(): boolean;
  get gameOver(): boolean;
  get gameOverReason(): string | undefined;
  togglePause(): void;
  start(): void;
  stop(): void;
  startNewGame(): void;
  subscribe(fn: () => void): () => void;
  /** Map a viewport point to the grid cell under it (for hover/tooltips), or null. */
  cellAt(clientX: number, clientY: number): { x: number; y: number } | null;
  destroy(): void;
}

export function createGameStore(container: HTMLDivElement): GameStore {
  let state = createInitialState();
  const renderer = createRenderer(container);
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

  // Keep the canvas fitted to its container. The observer fires once immediately
  // (initial size) and on every subsequent container/window resize.
  const resizeObserver = new ResizeObserver(() => {
    renderer.resize(state.world.w, state.world.h);
    renderer.draw(state.world, state.ants);
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
    togglePause(): void {
      state.paused = !state.paused;
      if (state.paused) {
        simLoop.stop();
      } else {
        simLoop.start();
      }
      notify();
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
    cellAt(clientX: number, clientY: number) {
      return renderer.clientToCell(clientX, clientY);
    },
    destroy(): void {
      simLoop.stop();
      resizeObserver.disconnect();
      renderer.destroy();
      listeners.clear();
    },
  };
}
