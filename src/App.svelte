<script lang="ts">
  // Main application layout: contains HUD (header), world canvas, and side panels
</script>

<div class="app">
  <header class="hud">
    <h1>PixelEvolution</h1>
  </header>
  <main class="main">
    <canvas class="world-canvas" width="300" height="200"></canvas>
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, sans-serif;
  }

  .hud {
    padding: 0.5rem 1rem;
    background: #1a1a1a;
    color: #fff;
  }

  .main {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #111;
  }

  .world-canvas {
    image-rendering: pixelated;
    background: #222;
  }
</style>
