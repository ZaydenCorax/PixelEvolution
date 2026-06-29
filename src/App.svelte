<script lang="ts">
  import { onMount } from 'svelte';
  import { createGameStore } from './stores/gameStore';

  let canvas: HTMLCanvasElement | null = null;
  let store = $state<ReturnType<typeof createGameStore> | null>(null);

  onMount(() => {
    const s = createGameStore(canvas!);
    store = s;
    s.start();
    return () => s.stop();
  });

  let paused = $derived(store?.paused ?? false);
  let food = $derived(store?.state.resources.food ?? 0);
  let population = $derived(store?.state.ants.count ?? 0);
  let tick = $derived(store?.state.tick ?? 0);

  onMount(() => {
    store!.start();
    return () => store!.stop();
  });

  function togglePause() {
    store!.togglePause();
  }

  function setSpeed1() { store!.setSpeed(0.5); }
  function setSpeed2() { store!.setSpeed(1); }
  function setSpeed3() { store!.setSpeed(2); }
  function setSpeed4() { store!.setSpeed(4); }
  function expand() {
    store!.expand();
  }
  function reset() {
    store!.reset();
  }
</script>

<div class="app">
  <header class="hud">
    <div class="hud-left">
      <h1 class="title">PixelEvolution</h1>
    </div>
    <div class="hud-center">
      <span class="stat">Food: {Math.floor(food)}</span>
      <span class="stat">Ants: {population}</span>
      <span class="stat">Tick: {tick}</span>
    </div>
    <div class="hud-right">
      <button class="btn" onclick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
      <button class="btn" onclick={setSpeed1}>0.5x</button>
      <button class="btn" onclick={setSpeed2}>1x</button>
      <button class="btn" onclick={setSpeed3}>2x</button>
      <button class="btn" onclick={setSpeed4}>4x</button>
      <button class="btn accent" onclick={expand}>Expand</button>
      <button class="btn danger" onclick={reset}>Reset</button>
    </div>
  </header>
  <main class="main">
    <canvas bind:this={canvas} class="world-canvas"></canvas>
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, sans-serif;
    color: #e0e0e0;
    background: #111;
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

  .btn.danger {
    background: #a22;
    border-color: #c33;
  }

  .btn.danger:hover {
    background: #c33;
  }

  .main {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #111;
    overflow: hidden;
  }

  .world-canvas {
    image-rendering: pixelated;
    background: #222;
    max-width: 100%;
    max-height: 100%;
  }
</style>
