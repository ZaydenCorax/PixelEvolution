import { GameState } from './types';
import { createWorld, tickPheromones, spawnFoodTick } from './world';
import { createAnts, stepAnts } from './ant';
import { STARTING_ANTS, TICK_INTERVAL_MS, TERRAIN } from './constants';

export function createInitialState(): GameState {
  const world = createWorld();
  const ants = createAnts(STARTING_ANTS, world);

  return {
    tick: 0,
    resources: { food: 0 },
    world,
    ants,
    paused: false,
    gameOver: false,
    gameOverReason: undefined,
  };
}

export function tick(state: GameState): void {
  if (state.paused) return;
  if (state.gameOver) return;

  const rng = Math.random;

  stepAnts(state.ants, state.world);
  tickPheromones(state.world, state.tick);
  spawnFoodTick(state.world, rng);

  state.tick++;

  if (state.tick % 10 === 0) {
    const foodProduced = collectFoodAtNest(state);
    state.resources.food += foodProduced;
  }

  if (state.ants.count === 0) {
    state.gameOver = true;
    state.gameOverReason = 'Colony collapsed';
  }
}

function collectFoodAtNest(state: GameState): number {
  const cx = 16;
  const cy = 16;
  let collected = 0;

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= state.world.w || ny < 0 || ny >= state.world.h) continue;
      const nIdx = ny * state.world.w + nx;
      if (state.world.terrain[nIdx] !== TERRAIN.NEST) continue;
      if (state.world.food[nIdx] > 0) {
        collected += state.world.food[nIdx];
        state.world.food[nIdx] = 0;
      }
    }
  }

  return collected;
}

export interface SimLoop {
  start(): void;
  stop(): void;
  step(): void;
}

export function createSimLoop(onTick: () => void): SimLoop {
  let lastTime = 0;
  let accumulator = 0;
  let running = false;
  let rafId = 0;

  function loop(timestamp: number): void {
    if (!running) return;

    const delta = lastTime ? timestamp - lastTime : TICK_INTERVAL_MS;
    lastTime = timestamp;

    accumulator += delta;

    const tickMs = TICK_INTERVAL_MS;
    while (accumulator >= tickMs) {
      onTick();
      accumulator -= tickMs;
    }

    rafId = requestAnimationFrame(loop);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      lastTime = 0;
      accumulator = 0;
      rafId = requestAnimationFrame(loop);
    },
    stop(): void {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    },
    step(): void {
      onTick();
    },
  };
}
