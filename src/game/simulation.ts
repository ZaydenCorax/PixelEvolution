import { GameState } from './types';
import { createWorld, expandWorld, tickPheromones, spawnFoodTick } from './world';
import { createAnts, stepAnts } from './ant';
import { mulberry32 } from './rng';
import { GRID_TIERS, STARTING_ANTS, TICK_INTERVAL_MS } from './constants';

export function createInitialState(seed: number = Date.now()): GameState {
  const world = createWorld(0, seed);
  const rng = mulberry32(seed);
  const ants = createAnts(STARTING_ANTS, world, rng);

  return {
    seed,
    tick: 0,
    resources: { food: 0, evo: 0 },
    world,
    ants,
    stats: {
      totalFood: 0,
      totalAnts: ants.count,
      totalTicks: 0,
    },
    gridTier: 0,
    paused: false,
    gameOver: false,
    gameOverReason: undefined,
  };
}

export function tick(state: GameState): void {
  if (state.paused) return;
  if (state.gameOver) return;

  const rng = mulberry32(state.seed + state.tick * 1000);

  stepAnts(state.ants, state.world, rng);
  tickPheromones(state.world, state.tick);
  spawnFoodTick(state.world, rng);

  state.tick++;
  state.stats.totalTicks = state.tick;
  state.stats.totalAnts = state.ants.count;

  if (state.tick % 10 === 0) {
    const foodProduced = collectFoodAtNest(state);
    state.resources.food += foodProduced;
    state.stats.totalFood += foodProduced;
  }

  if (state.ants.count === 0 && state.stats.totalAnts > 0) {
    state.gameOver = true;
    state.gameOverReason = 'Colony collapsed';
  }
}

function collectFoodAtNest(state: GameState): number {
  const cx = Math.floor(state.world.w / 2);
  const cy = Math.floor(state.world.h / 2);
  let collected = 0;

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= state.world.w || ny < 0 || ny >= state.world.h) continue;
      const nIdx = ny * state.world.w + nx;
      if (state.world.terrain[nIdx] === 2 && state.world.food[nIdx] > 0) {
        collected += state.world.food[nIdx];
        state.world.food[nIdx] = 0;
      }
    }
  }

  return collected;
}

export function expandGrid(state: GameState): boolean {
  const nextTier = state.gridTier + 1;
  if (nextTier >= GRID_TIERS.length) return false;

  state.world = expandWorld(state.world, nextTier, state.seed + state.tick);
  state.gridTier = nextTier;
  return true;
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
