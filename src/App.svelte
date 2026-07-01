<script lang="ts">
  import { onMount } from 'svelte';
  import { createGameStore } from './stores/gameStore';
  import { ANT_STATE, TERRAIN } from './game/constants';

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
      store = createGameStore(container);
      unsubscribe = store.subscribe(() => version++);
      store.startNewGame();
      store.stop();
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
  let ants = $derived.by(() => (void version, store?.state.ants));

  let antStats = $derived.by(() => {
    void version;
    if (!ants) return [];
    const stats: Record<number, { count: number; totalEnergy: number; totalAge: number }> = {
      [ANT_STATE.SEARCHING]: { count: 0, totalEnergy: 0, totalAge: 0 },
      [ANT_STATE.CARRYING]: { count: 0, totalEnergy: 0, totalAge: 0 },
      [ANT_STATE.RETURNING]: { count: 0, totalEnergy: 0, totalAge: 0 },
    };
    for (let i = 0; i < ants.count; i++) {
      const s = ants.state[i];
      if (s > 2) continue;
      stats[s].count++;
      stats[s].totalEnergy += ants.energy[i];
      stats[s].totalAge += ants.age[i];
    }
    return [
      {
        state: 'Searching',
        count: stats[ANT_STATE.SEARCHING].count,
        avgEnergy: stats[ANT_STATE.SEARCHING].count
          ? stats[ANT_STATE.SEARCHING].totalEnergy / stats[ANT_STATE.SEARCHING].count
          : 0,
        avgAge: stats[ANT_STATE.SEARCHING].count
          ? stats[ANT_STATE.SEARCHING].totalAge / stats[ANT_STATE.SEARCHING].count
          : 0,
      },
      {
        state: 'Carrying',
        count: stats[ANT_STATE.CARRYING].count,
        avgEnergy: stats[ANT_STATE.CARRYING].count
          ? stats[ANT_STATE.CARRYING].totalEnergy / stats[ANT_STATE.CARRYING].count
          : 0,
        avgAge: stats[ANT_STATE.CARRYING].count
          ? stats[ANT_STATE.CARRYING].totalAge / stats[ANT_STATE.CARRYING].count
          : 0,
      },
      {
        state: 'Returning',
        count: stats[ANT_STATE.RETURNING].count,
        avgEnergy: stats[ANT_STATE.RETURNING].count
          ? stats[ANT_STATE.RETURNING].totalEnergy / stats[ANT_STATE.RETURNING].count
          : 0,
        avgAge: stats[ANT_STATE.RETURNING].count
          ? stats[ANT_STATE.RETURNING].totalAge / stats[ANT_STATE.RETURNING].count
          : 0,
      },
    ];
  });

  let hoverInfo = $derived.by(() => {
    void version;
    if (!hover || !store) return null;
    const world = store.state.world;
    const idx = hover.y * world.w + hover.x;
    const t = world.terrain[idx];
    const terrainName = t === TERRAIN.NEST ? 'Nest' : t === TERRAIN.FOOD ? 'Food' : 'Empty';
    const ants = store.state.ants;
    let antsHere = 0;
    for (let i = 0; i < ants.count; i++) {
      if (ants.state[i] <= ANT_STATE.RETURNING && ants.x[i] === hover.x && ants.y[i] === hover.y) {
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
  }

  function onWorldMouseLeave() {
    hover = null;
  }

  function startGame() {
    if (!store) return;
    store.startNewGame();
    screen = 'playing';
  }

  function togglePause() {
    store?.togglePause();
  }
</script>

<div class="app" class:playing={screen === 'playing'}>
  <div class="game-layout">
    <div class="world-wrap">
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
    {#if screen === 'playing'}
      <aside class="stats-panel">
        <h3>Colony Stats</h3>
        <table class="stats-table">
          <thead>
            <tr>
              <th>State</th>
              <th>Count</th>
              <th>Avg Energy</th>
              <th>Avg Age</th>
            </tr>
          </thead>
          <tbody>
            {#each antStats as row}
              <tr>
                <td class="state-{row.state.toLowerCase()}">{row.state}</td>
                <td>{row.count}</td>
                <td>{row.avgEnergy.toFixed(1)}</td>
                <td>{row.avgAge.toFixed(1)}</td>
              </tr>
            {/each}
            {#if antStats.every((r) => r.count === 0)}
              <tr>
                <td colspan="4" class="no-data">No living ants</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </aside>
    {/if}
  </div>

  {#if screen === 'playing' && hover && hoverInfo}
    <div class="tooltip" style="left: {hover.px + 14}px; top: {hover.py + 14}px">
      <div class="tt-title">Cell ({hover.x}, {hover.y})</div>
      <div class="tt-row">{hoverInfo.terrainName}{hoverInfo.food > 0 ? ` · ${hoverInfo.food} food` : ''}</div>
      <div class="tt-row">Home pheromone: {hoverInfo.pheromoneHome.toFixed(2)}</div>
      <div class="tt-row">Food pheromone: {hoverInfo.pheromoneFood.toFixed(2)}</div>
      {#if hoverInfo.antsHere > 0}
        <div class="tt-row">Ants here: {hoverInfo.antsHere}</div>
      {/if}
    </div>
  {/if}

  {#if screen === 'menu'}
    <div class="overlay menu">
      <div class="menu-content">
        <h1 class="game-title">PixelEvolution</h1>
        <p class="game-subtitle">Manage your pixel ant colony</p>
        <div class="instructions">
          <p>Gather food, grow your colony, and survive.</p>
          <p>Watch your ants forage, leave pheromone trails, and bring food back to the nest.</p>
        </div>
        <button class="btn start-btn" onclick={startGame}>Start</button>
      </div>
    </div>
  {:else if screen === 'playing'}
    <header class="hud">
      <div class="hud-left">
        <h1 class="title">PixelEvolution</h1>
      </div>
      <div class="hud-center">
        <span class="stat">Food: {Math.floor(food)}</span>
        <span class="stat">Population: {population}</span>
        <span class="stat">Tick: {tick}</span>
      </div>
      <div class="hud-right">
        <button class="btn" onclick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
      </div>
    </header>
  {:else}
    <div class="overlay game-over">
      <div class="game-over-content">
        <h1 class="game-over-title">Game Over</h1>
        <p class="game-over-reason">{gameOverReason}</p>
        <div class="final-stats">
          <div class="stat-row">
            <span>Final Food:</span>
            <span class="stat-value">{Math.floor(food)}</span>
          </div>
          <div class="stat-row">
            <span>Colony Survived:</span>
            <span class="stat-value">{tick} ticks</span>
          </div>
        </div>
        <button class="btn start-btn" onclick={startGame}>Play Again</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, sans-serif;
    color: #e0e0e0;
    background: #111;
    position: relative;
  }

  .game-layout {
    display: flex;
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .world-wrap {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .world-container {
    width: 100%;
    height: 100%;
    position: relative;
    background: #2a2a2a;
    overflow: hidden;
  }

  .hover-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    cursor: crosshair;
  }

  .tooltip {
    position: fixed;
    z-index: 20;
    pointer-events: none;
    background: rgba(10, 10, 14, 0.92);
    border: 1px solid #444;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 0.75rem;
    line-height: 1.35;
    color: #ddd;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .tt-title {
    color: #fff;
    font-weight: 600;
    margin-bottom: 0.15rem;
  }

  .tt-row {
    color: #bbb;
  }

  .stats-panel {
    width: 260px;
    background: #1a1a1a;
    border-left: 1px solid #333;
    padding: 1rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .stats-panel h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1rem;
    color: #fff;
    border-bottom: 1px solid #333;
    padding-bottom: 0.5rem;
  }

  .stats-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .stats-table th,
  .stats-table td {
    padding: 0.5rem;
    text-align: left;
    border-bottom: 1px solid #2a2a2a;
  }

  .stats-table th {
    color: #888;
    font-weight: 500;
  }

  .stats-table td {
    color: #ddd;
  }

  .state-searching {
    color: #aaddff;
  }

  .state-carrying {
    color: #ffff88;
  }

  .state-returning {
    color: #88ccff;
  }

  .no-data {
    text-align: center;
    color: #666;
    font-style: italic;
  }

  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10;
  }

  .menu {
    background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
  }

  .menu-content {
    text-align: center;
    padding: 2rem;
  }

  .game-title {
    font-size: 3rem;
    margin: 0 0 0.5rem 0;
    color: #fff;
    text-shadow: 0 0 20px rgba(0, 170, 255, 0.5);
  }

  .game-subtitle {
    font-size: 1.2rem;
    color: #aaa;
    margin: 0 0 2rem 0;
  }

  .instructions {
    margin-bottom: 2rem;
    color: #ccc;
    line-height: 1.6;
  }

  .instructions p {
    margin: 0.5rem 0;
  }

  .start-btn {
    padding: 0.8rem 2.5rem;
    font-size: 1.2rem;
    background: #2a6;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .start-btn:hover {
    background: #3b7;
  }

  .hud {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: #1a1a1a;
    border-bottom: 1px solid #333;
    flex-wrap: wrap;
    gap: 0.5rem;
    position: relative;
    z-index: 5;
  }

  .hud-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .title {
    font-size: 1.1rem;
    margin: 0;
    color: #fff;
  }

  .hud-center {
    display: flex;
    gap: 1rem;
  }

  .stat {
    font-size: 0.9rem;
    color: #ccc;
  }

  .hud-right {
    display: flex;
    gap: 0.4rem;
  }

  .btn {
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    background: #333;
    color: #fff;
    border: 1px solid #555;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn:hover {
    background: #444;
  }

  .game-over {
    background: rgba(0, 0, 0, 0.85);
  }

  .game-over-content {
    text-align: center;
    padding: 2rem;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    max-width: 400px;
  }

  .game-over-title {
    font-size: 2.5rem;
    margin: 0 0 1rem 0;
    color: #ff4444;
  }

  .game-over-reason {
    color: #aaa;
    margin-bottom: 1.5rem;
  }

  .final-stats {
    margin-bottom: 2rem;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #333;
  }

  .stat-value {
    color: #fff;
    font-weight: bold;
  }
</style>
