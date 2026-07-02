<script lang="ts">
  import { onMount } from 'svelte';
  import { createGameStore } from './stores/gameStore';
  import { ANT_STATE, TERRAIN, ANT_POP_CAP, ANT_INITIAL_ENERGY } from './game/constants';
  import TopBar from './ui/TopBar.svelte';
  import LeftRail from './ui/LeftRail.svelte';
  import RightRail from './ui/RightRail.svelte';
  import type { StateStat } from './ui/types';

  let container: HTMLDivElement;
  let store = $state<ReturnType<typeof createGameStore> | null>(null);

  let screen = $state<'menu' | 'playing' | 'gameover'>('menu');

  // The store mutates its GameState in place, so we can't rely on Svelte proxying
  // those mutations. Instead we subscribe to the store and bump `version` on every
  // notify; the derived values below read `version` to recompute each tick
  // (explicit reactive contract, DESIGN.md §8.9).
  let version = $state(0);
  let unsubscribe: (() => void) | undefined;

  // Hovered cell + cursor position for the inspection tooltip (see DESIGN.md §8.7).
  let hover = $state<{ x: number; y: number; px: number; py: number } | null>(null);

  onMount(() => {
    if (container) {
      // The store seeds and draws an initial world on creation; it stays frozen
      // behind the menu until Start begins the first run.
      store = createGameStore(container);
      unsubscribe = store.subscribe(() => version++);
    }
    return () => {
      unsubscribe?.();
      store?.destroy();
    };
  });

  $effect(() => {
    void version;
    if (store?.gameOver && screen === 'playing') {
      screen = 'gameover';
    }
  });

  let food = $derived.by(() => (void version, store?.state.resources.food ?? 0));
  let population = $derived.by(() => (void version, store?.state.ants.count ?? 0));
  let tick = $derived.by(() => (void version, store?.state.tick ?? 0));
  let gameOverReason = $derived.by(() => (void version, store?.gameOverReason ?? ''));
  let paused = $derived.by(() => (void version, store?.paused ?? false));
  let speed = $derived.by(() => (void version, store?.speed ?? 1));
  let seed = $derived.by(() => (void version, store?.seed ?? 0));
  let generation = $derived.by(() => (void version, store ? Math.max(1, store.generation) : 1));
  let ants = $derived.by(() => (void version, store?.state.ants));
  let evoPoints = $derived.by(() => (void version, store?.evoPoints ?? 0));
  let pendingEvo = $derived.by(() => (void version, store?.pendingEvo ?? 0));
  let lastRunEvo = $derived.by(() => (void version, store?.lastRunEvo ?? 0));
  let ascendUnlocked = $derived.by(() => (void version, store?.ascendUnlocked ?? false));

  // Dot colour mirrors the ant disc on the grid; the searching bar is blue per the
  // design template (a white bar would wash out on the dark rail).
  const STAT_META = [
    { key: ANT_STATE.SEARCHING, name: 'Searching', dot: '#eef2ff', bar: '#4aa3ff' },
    { key: ANT_STATE.CARRYING, name: 'Carrying', dot: '#b6f36a', bar: '#b6f36a' },
    { key: ANT_STATE.RETURNING, name: 'Returning', dot: '#ff9d4d', bar: '#ff9d4d' },
  ] as const;

  let antStats = $derived.by<StateStat[]>(() => {
    void version;
    const source = ants;
    return STAT_META.map((meta) => {
      let count = 0;
      let totalEnergy = 0;
      let totalAge = 0;
      if (source) {
        for (let i = 0; i < source.count; i++) {
          if (source.state[i] !== meta.key) continue;
          count++;
          totalEnergy += source.energy[i];
          totalAge += source.age[i];
        }
      }
      return {
        name: meta.name,
        dot: meta.dot,
        bar: meta.bar,
        count,
        avgEnergy: count ? totalEnergy / count : 0,
        avgAge: count ? totalAge / count : 0,
      };
    });
  });

  let hoverInfo = $derived.by(() => {
    void version;
    if (!hover || !store) return null;
    const world = store.state.world;
    const idx = hover.y * world.w + hover.x;
    const t = world.terrain[idx];
    const terrainName = t === TERRAIN.NEST ? 'nest' : t === TERRAIN.FOOD ? 'food' : 'empty';
    const worldAnts = store.state.ants;
    let antsHere = 0;
    for (let i = 0; i < worldAnts.count; i++) {
      if (
        worldAnts.state[i] <= ANT_STATE.RETURNING &&
        worldAnts.x[i] === hover.x &&
        worldAnts.y[i] === hover.y
      ) {
        antsHere++;
      }
    }
    return {
      terrainName,
      food: world.food[idx],
      pheromoneHome: world.pheromoneHome[idx],
      pheromoneFood: world.pheromoneFood[idx],
      antsHere,
    };
  });

  function onWorldMouseMove(e: MouseEvent) {
    if (!store) return;
    const cell = store.cellAt(e.clientX, e.clientY);
    hover = cell ? { x: cell.x, y: cell.y, px: e.clientX, py: e.clientY } : null;
    store.setHover(cell);
  }

  function onWorldMouseLeave() {
    hover = null;
    store?.setHover(null);
  }

  function startGame() {
    if (!store) return;
    store.startNewGame();
    screen = 'playing';
  }

  function restartColony() {
    // Restart replays the current seed (reproducible run); reroll draws a new one.
    store?.startNewGame(seed);
  }
</script>

<div class="page">
  <div class="frame">
    <TopBar {generation} {food} {evoPoints} {pendingEvo} {tick} {population} popCap={ANT_POP_CAP} />

    <div class="body">
      <LeftRail
        {paused}
        {speed}
        {seed}
        onTogglePause={() => store?.togglePause()}
        onStep={() => store?.step()}
        onRestart={restartColony}
        onSetSpeed={(m) => store?.setSpeed(m)}
        onSeedCommit={(s) => store?.startNewGame(s)}
        onReroll={() => store?.startNewGame()}
      />

      <div class="grid-area">
        <div bind:this={container} class="world-container"></div>
        {#if screen === 'playing'}
          <div
            class="hover-overlay"
            role="presentation"
            onmousemove={onWorldMouseMove}
            onmouseleave={onWorldMouseLeave}
          ></div>
        {/if}
      </div>

      <RightRail
        stats={antStats}
        maxEnergy={ANT_INITIAL_ENERGY}
        {population}
        popCap={ANT_POP_CAP}
        {ascendUnlocked}
        {pendingEvo}
        onAscend={() => store?.ascend()}
      />
    </div>
  </div>

  {#if screen === 'playing' && hover && hoverInfo}
    <div class="tooltip" style="left: {hover.px + 14}px; top: {hover.py + 14}px">
      <div class="tt-title">cell ({hover.x}, {hover.y})</div>
      <div class="tt-rows">
        <div class="tt-row">
          <span class="tt-label">terrain</span>
          <span class="tt-terrain-{hoverInfo.terrainName}">{hoverInfo.terrainName}</span>
        </div>
        <div class="tt-row"><span class="tt-label">food</span><span>{hoverInfo.food}</span></div>
        <div class="tt-row">
          <span class="tt-label">home φ</span>
          <span class="tt-home">{hoverInfo.pheromoneHome.toFixed(2)}</span>
        </div>
        <div class="tt-row">
          <span class="tt-label">food φ</span>
          <span class="tt-food">{hoverInfo.pheromoneFood.toFixed(2)}</span>
        </div>
        <div class="tt-row"><span class="tt-label">ants</span><span>{hoverInfo.antsHere}</span></div>
      </div>
    </div>
  {/if}

  {#if screen === 'menu'}
    <div class="overlay">
      <div class="card">
        <div class="card-kicker">colony simulation</div>
        <h1 class="card-title">PixelEvolution</h1>
        <p class="card-subtitle">Manage your pixel ant colony</p>
        <div class="card-body">
          <p>Gather food, grow your colony, and survive.</p>
          <p>Watch your ants forage, leave pheromone trails, and bring food back to the nest.</p>
        </div>
        <button class="btn-start" onclick={startGame}>▶ Start</button>
      </div>
    </div>
  {:else if screen === 'gameover'}
    <div class="overlay">
      <div class="card">
        <div class="card-kicker gameover-kicker">simulation ended</div>
        <h1 class="card-title">Game Over</h1>
        <p class="card-subtitle">{gameOverReason}</p>
        <div class="final-stats">
          <div class="stat-row"><span>Final food</span><span class="stat-value">{Math.floor(food)}</span></div>
          <div class="stat-row"><span>Colony survived</span><span class="stat-value">{tick} ticks</span></div>
          <div class="stat-row"><span>EVO earned</span><span class="stat-value evo-earned">+{lastRunEvo}</span></div>
          <div class="stat-row"><span>Seed</span><span class="stat-value">{seed}</span></div>
        </div>
        <button class="btn-start" onclick={startGame}>↻ Play Again</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: radial-gradient(1200px 800px at 30% -5%, #1e2127 0%, #131519 55%, #101216 100%);
    font-family: 'Space Grotesk', system-ui, sans-serif;
    color: #e7ebf0;
  }

  .frame {
    position: relative;
    width: 1200px;
    height: 760px;
    max-width: 100%;
    max-height: calc(100vh - 48px);
    background: #0b0d10;
    border: 1px solid #24282f;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 30px 80px -30px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
  }

  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .grid-area {
    flex: 1;
    position: relative;
    background: #0b0d10;
    min-width: 0;
  }

  .world-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hover-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    cursor: crosshair;
  }

  /* Cell inspector tooltip (design template: mono, amber title, φ rows). */
  .tooltip {
    position: fixed;
    z-index: 20;
    width: 186px;
    pointer-events: none;
    background: rgba(16, 19, 24, 0.94);
    border: 1px solid #2c333c;
    border-radius: 10px;
    padding: 12px 13px;
    backdrop-filter: blur(6px);
    box-shadow: 0 12px 30px -8px #000;
    font-family: 'JetBrains Mono', monospace;
  }

  .tt-title {
    font-size: 12px;
    color: #e0a13a;
    margin-bottom: 8px;
  }

  .tt-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11.5px;
    color: #b6bec7;
  }

  .tt-row {
    display: flex;
    justify-content: space-between;
  }

  .tt-label {
    color: #7c848d;
  }

  .tt-terrain-food {
    color: #7ed37e;
  }

  .tt-terrain-nest {
    color: #e0a13a;
  }

  .tt-home {
    color: #77b6ff;
  }

  .tt-food {
    color: #ff8ac6;
  }

  /* Menu / game-over overlays, restyled to the Instrument design language. */
  .overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    background: rgba(11, 13, 16, 0.78);
    backdrop-filter: blur(6px);
  }

  .card {
    text-align: center;
    padding: 36px 44px;
    background: #101318;
    border: 1px solid #222831;
    border-radius: 14px;
    box-shadow: 0 30px 80px -30px rgba(0, 0, 0, 0.7);
    max-width: 460px;
  }

  .card-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #e0a13a;
    margin-bottom: 12px;
  }

  .gameover-kicker {
    color: #ff6d6d;
  }

  .card-title {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0 0 8px;
    color: #e7ebf0;
  }

  .card-subtitle {
    font-size: 15px;
    color: #9aa3ad;
    margin: 0 0 20px;
  }

  .card-body {
    color: #a7afb8;
    font-size: 13.5px;
    line-height: 1.75;
    margin-bottom: 26px;
  }

  .card-body p {
    margin: 0.4em 0;
  }

  .btn-start {
    padding: 12px 38px;
    font-family: inherit;
    font-size: 15px;
    font-weight: 700;
    background: #e0a13a;
    color: #14100a;
    border: none;
    border-radius: 9px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-start:hover {
    background: #efb156;
  }

  .final-stats {
    margin-bottom: 26px;
    font-size: 13.5px;
    color: #9aa3ad;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    gap: 40px;
    padding: 8px 0;
    border-bottom: 1px solid #1b1f26;
  }

  .stat-value {
    font-family: 'JetBrains Mono', monospace;
    color: #e7ebf0;
    font-weight: 600;
  }

  .evo-earned {
    color: #c084fc;
  }
</style>
