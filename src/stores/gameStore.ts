import type { GameState } from '../game/types';
import { createInitialState, tick, createSimLoop, calcEvoPoints } from '../game/simulation';
import { createSeededRandom, setRandomSource } from '../game/rng';
import { ANT_POP_CAP } from '../game/constants';
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
  /** Banked Evolution Points across runs (persisted in localStorage). */
  get evoPoints(): number;
  /** EVO the current run would bank on death/Ascend (0 once this run has banked). */
  get pendingEvo(): number;
  /** EVO banked by the most recently ended run (for the game-over card). */
  get lastRunEvo(): number;
  /** Whether manual Ascension is unlocked (reach the population cap once, ever). */
  get ascendUnlocked(): boolean;
  togglePause(): void;
  /** Advance exactly one tick and leave the sim paused (transport single-step). */
  step(): void;
  setSpeed(multiplier: number): void;
  start(): void;
  stop(): void;
  /** Start a fresh run. Pass a seed to reproduce a world; omit for a fresh roll. */
  startNewGame(seed?: number): void;
  /** Manual prestige: bank the run's EVO and start a fresh run. No-op until unlocked. */
  ascend(): void;
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

// Meta progression that outlives a run (and the tab): banked EVO and the Ascension
// unlock. Versioned key so a future schema change can migrate cleanly.
const META_STORAGE_KEY = 'pixelevolution.meta.v1';

interface MetaState {
  evoPoints: number;
  ascendUnlocked: boolean;
}

// localStorage can be unavailable (private mode, storage policies) or hold corrupt
// data — degrade to a fresh meta rather than crashing; the game still plays, the
// progression just won't persist.
function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MetaState>;
      return {
        evoPoints: Number(parsed.evoPoints) || 0,
        ascendUnlocked: parsed.ascendUnlocked === true,
      };
    }
  } catch {
    // fall through to a fresh meta
  }
  return { evoPoints: 0, ascendUnlocked: false };
}

function saveMeta(meta: MetaState): void {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // storage unavailable — progression is session-only
  }
}

export function createGameStore(container: HTMLDivElement): GameStore {
  let seed = rollSeed();
  setRandomSource(createSeededRandom(seed));
  let state = createInitialState();
  let speed = 1;
  let generation = 0;
  let hover: { x: number; y: number } | null = null;

  const meta = loadMeta();
  // Each run banks its EVO exactly once — on death or on Ascend, whichever first.
  let evoBankedThisRun = false;
  let lastRunEvo = 0;

  const renderer = createRenderer(container);
  renderer.resize(state.world.w, state.world.h);

  const listeners = new Set<() => void>();

  function notify(): void {
    for (const fn of listeners) fn();
  }

  function draw(): void {
    renderer.draw(state.world, state.ants, hover);
  }

  function bankPendingEvo(): void {
    if (evoBankedThisRun) return;
    lastRunEvo = calcEvoPoints(state);
    meta.evoPoints += lastRunEvo;
    evoBankedThisRun = true;
    saveMeta(meta);
  }

  // Meta checks that follow every advanced tick (loop or single-step): the one-time
  // Ascension unlock, and banking the run's EVO the moment the colony dies.
  function afterTick(): void {
    if (!meta.ascendUnlocked && state.ants.count >= ANT_POP_CAP) {
      meta.ascendUnlocked = true;
      saveMeta(meta);
    }
    if (state.gameOver) {
      bankPendingEvo();
    }
  }

  function onTick(): void {
    tick(state);
    afterTick();
    draw();
    notify();
  }

  const simLoop = createSimLoop(onTick);

  function startNewGame(newSeed?: number): void {
    simLoop.stop();
    seed = newSeed ?? rollSeed();
    // Re-seed before building the world so a given seed reproduces the exact
    // same run (DESIGN.md §8.8).
    setRandomSource(createSeededRandom(seed));
    state = createInitialState();
    generation++;
    evoBankedThisRun = false;
    renderer.resize(state.world.w, state.world.h);
    draw();
    notify();
    simLoop.start();
  }

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
    get evoPoints() {
      return meta.evoPoints;
    },
    get pendingEvo() {
      return evoBankedThisRun ? 0 : calcEvoPoints(state);
    },
    get lastRunEvo() {
      return lastRunEvo;
    },
    get ascendUnlocked() {
      return meta.ascendUnlocked;
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
      afterTick();
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
    startNewGame,
    ascend(): void {
      // Manual prestige: only once unlocked, and pointless on a dead run (death
      // already banked). Banks the pending EVO, then rolls a fresh colony.
      if (!meta.ascendUnlocked || state.gameOver) return;
      bankPendingEvo();
      startNewGame();
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
