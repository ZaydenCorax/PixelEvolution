import { GameState } from './types';
import { createWorld, tickPheromones, spawnFoodTick, nestCenter } from './world';
import { createAnts, stepAnts, spawnAnt } from './ant';
import {
  STARTING_ANTS,
  TICK_INTERVAL_MS,
  MAX_CATCHUP_TICKS,
  TERRAIN,
  NEST_RADIUS,
  ANT_POP_CAP,
  ANT_REPRODUCE_INTERVAL_TICKS,
  ANT_REPRODUCE_FOOD_COST,
} from './constants';

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

  stepAnts(state.ants, state.world, state.resources, state.tick);
  tickPheromones(state.world);
  spawnFoodTick(state.world);

  state.tick++;

  if (state.tick % 10 === 0) {
    const foodProduced = collectFoodAtNest(state);
    state.resources.food += foodProduced;
  }

  // Reproduction (DESIGN.md §8.1): spend colony food to grow the population,
  // one birth per interval so growth stays gradual.
  if (
    state.tick % ANT_REPRODUCE_INTERVAL_TICKS === 0 &&
    state.resources.food >= ANT_REPRODUCE_FOOD_COST &&
    state.ants.count < ANT_POP_CAP &&
    spawnAnt(state.ants, state.world)
  ) {
    state.resources.food -= ANT_REPRODUCE_FOOD_COST;
  }

  if (state.ants.count === 0) {
    state.gameOver = true;
    state.gameOverReason = 'Colony collapsed';
  }
}

function collectFoodAtNest(state: GameState): number {
  // Scan the nest block (derived from the grid centre, matching createWorld) and
  // sweep any food ants have deposited there into the colony's food resource.
  const { cx, cy } = nestCenter(state.world);
  let collected = 0;

  for (let dy = -NEST_RADIUS; dy <= NEST_RADIUS; dy++) {
    for (let dx = -NEST_RADIUS; dx <= NEST_RADIUS; dx++) {
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
  /** Playback speed multiplier (1 = TICK_RATE_HZ, 2 = double, …). */
  setSpeed(multiplier: number): void;
}

export function createSimLoop(onTick: () => void): SimLoop {
  let lastTime = 0;
  let accumulator = 0;
  let running = false;
  let rafId = 0;
  let speed = 1;

  function loop(timestamp: number): void {
    if (!running) return;

    const tickMs = TICK_INTERVAL_MS / speed;
    // Seed the first frame with exactly one tick's worth of time so the sim
    // starts immediately without bursting `speed` ticks at once.
    const delta = lastTime ? timestamp - lastTime : tickMs;
    lastTime = timestamp;

    accumulator += delta;
    // Drop any backlog beyond MAX_CATCHUP_TICKS so a long pause can't trigger a
    // burst of thousands of ticks in one frame (spiral of death, DESIGN.md §8.10).
    const maxAccumulated = tickMs * MAX_CATCHUP_TICKS;
    if (accumulator > maxAccumulated) {
      accumulator = maxAccumulated;
    }

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
    setSpeed(multiplier: number): void {
      speed = multiplier;
    },
  };
}
