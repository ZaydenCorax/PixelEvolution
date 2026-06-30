<script lang="ts">
  import { onMount } from 'svelte';
  import { createGameStore } from './stores/gameStore';

  let container: HTMLDivElement;
  let store = $state<ReturnType<typeof createGameStore> | null>(null);

  let screen = $state<'menu' | 'playing' | 'gameover'>('menu');

  onMount(() => {
    if (container) {
      store = createGameStore(container);
      store.startNewGame();
      store.stop();
    }
    return () => store?.stop();
  });

  $effect(() => {
    if (store?.gameOver && screen === 'playing') {
      screen = 'gameover';
    }
  });

  let food = $derived(store?.state.resources.food ?? 0);
  let population = $derived(store?.state.ants.count ?? 0);
  let tick = $derived(store?.state.tick ?? 0);
  let score = $derived(store?.state.stats.totalFood ?? 0);
  let gameOverReason = $derived(store?.gameOverReason ?? '');
  let paused = $derived(store?.paused ?? false);

  function startGame() {
    if (!store) return;
    store.startNewGame();
    screen = 'playing';
  }

  function togglePause() {
    store?.togglePause();
  }

  function expand() {
    store?.expand();
  }
</script>

<div class="app" class:playing={screen === 'playing'}>
  <div bind:this={container} class="world-container"></div>

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
        <span class="stat">Score: {Math.floor(score)}</span>
        <span class="stat">Colony Health: {population}</span>
        <span class="stat">Food: {Math.floor(food)}</span>
        <span class="stat">Tick: {tick}</span>
      </div>
      <div class="hud-right">
        <button class="btn" onclick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
        <button class="btn accent" onclick={expand}>Expand</button>
      </div>
    </header>
  {:else}
    <div class="overlay game-over">
      <div class="game-over-content">
        <h1 class="game-over-title">Game Over</h1>
        <p class="game-over-reason">{gameOverReason}</p>
        <div class="final-stats">
          <div class="stat-row">
            <span>Final Score:</span>
            <span class="stat-value">{Math.floor(score)}</span>
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

  .world-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: calc(100vh - 48px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
    background: #2a2a2a;
    overflow: hidden;
  }

  .playing .world-container {
    opacity: 1;
    pointer-events: auto;
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

  .btn.accent {
    background: #2a6;
    border-color: #3b7;
  }

  .btn.accent:hover {
    background: #3b7;
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