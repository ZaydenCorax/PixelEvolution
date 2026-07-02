<script lang="ts">
  // Left rail (DESIGN_TEMPLATE 1A): playback transport, seed panel, legend.
  let {
    paused,
    speed,
    seed,
    onTogglePause,
    onStep,
    onRestart,
    onSetSpeed,
    onSeedCommit,
    onReroll,
  }: {
    paused: boolean;
    speed: number;
    seed: number;
    onTogglePause: () => void;
    onStep: () => void;
    onRestart: () => void;
    onSetSpeed: (multiplier: number) => void;
    onSeedCommit: (seed: number) => void;
    onReroll: () => void;
  } = $props();

  const SPEEDS = [1, 2, 4];

  let editingSeed = $state(false);
  let seedDraft = $state('');

  function beginSeedEdit() {
    seedDraft = String(seed);
    editingSeed = true;
  }

  function commitSeed() {
    editingSeed = false;
    const parsed = Number.parseInt(seedDraft, 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed !== seed) {
      onSeedCommit(parsed);
    }
  }

  function onSeedKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commitSeed();
    else if (e.key === 'Escape') editingSeed = false;
  }

  // Autofocus the seed input the moment editing starts.
  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<div class="rail">
  <div>
    <div class="section-label mono">PLAYBACK</div>
    <div class="transport">
      <button class="btn-primary" onclick={onTogglePause}>
        {paused ? '▶ Play' : '❚❚ Pause'}
      </button>
      <button class="btn-square" title="Step one tick" onclick={onStep}>▶❘</button>
      <button class="btn-square btn-restart" title="Restart colony" onclick={onRestart}>⟲</button>
    </div>
    <div class="speed-seg">
      {#each SPEEDS as s}
        <button class="speed mono" class:active={speed === s} onclick={() => onSetSpeed(s)}>
          {s}×
        </button>
      {/each}
    </div>
  </div>

  <div>
    <div class="section-label mono">SEED</div>
    <div class="seed-box">
      {#if editingSeed}
        <input
          class="seed-input mono"
          type="text"
          inputmode="numeric"
          bind:value={seedDraft}
          onkeydown={onSeedKeydown}
          onblur={commitSeed}
          use:focusOnMount
        />
      {:else}
        <span class="seed-value mono">{seed}</span>
        <button class="seed-edit" title="Edit seed" onclick={beginSeedEdit}>✎</button>
      {/if}
    </div>
    <button class="seed-reroll" onclick={onReroll}>↻ reroll for a fresh world</button>
  </div>

  <div class="spacer"></div>

  <div>
    <div class="section-label mono">LEGEND</div>
    <div class="legend">
      <div class="legend-row"><span class="sw sw-nest"></span>Nest</div>
      <div class="legend-row"><span class="sw sw-food"></span>Food</div>
      <div class="legend-row"><span class="sw sw-ant ant-searching"></span>Ant · searching</div>
      <div class="legend-row"><span class="sw sw-ant ant-carrying"></span>Ant · carrying</div>
      <div class="legend-row"><span class="sw sw-ant ant-returning"></span>Ant · returning</div>
      <div class="legend-row"><span class="sw sw-trail trail-home"></span>Home trail</div>
      <div class="legend-row"><span class="sw sw-trail trail-food"></span>Food trail</div>
    </div>
  </div>
</div>

<style>
  .rail {
    width: 214px;
    flex: none;
    border-right: 1px solid #1b1f26;
    background: #0e1116;
    padding: 16px 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .mono {
    font-family: 'JetBrains Mono', monospace;
  }

  .section-label {
    font-size: 10px;
    letter-spacing: 2px;
    color: #6b727b;
    margin-bottom: 11px;
  }

  .transport {
    display: flex;
    gap: 9px;
    margin-bottom: 11px;
  }

  .btn-primary {
    flex: 1;
    height: 42px;
    border: none;
    border-radius: 9px;
    background: #e0a13a;
    color: #14100a;
    font-family: inherit;
    font-weight: 700;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
  }

  .btn-primary:hover {
    background: #efb156;
  }

  .btn-square {
    width: 42px;
    height: 42px;
    border: 1px solid #2a3038;
    border-radius: 9px;
    background: #181c22;
    color: #cfd6df;
    font-size: 15px;
    cursor: pointer;
  }

  .btn-square:hover {
    background: #212730;
  }

  .btn-restart {
    font-size: 16px;
  }

  .speed-seg {
    display: flex;
    background: #12161b;
    border: 1px solid #21272e;
    border-radius: 9px;
    padding: 3px;
    gap: 3px;
  }

  .speed {
    flex: 1;
    text-align: center;
    padding: 6px 0;
    font-size: 12px;
    color: #8b939d;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .speed.active {
    color: #fff;
    background: #2a3038;
    font-weight: 600;
  }

  .seed-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #12161b;
    border: 1px solid #21272e;
    border-radius: 9px;
    padding: 9px 11px;
  }

  .seed-value {
    font-size: 14px;
    letter-spacing: 1px;
    color: #e7ebf0;
    flex: 1;
  }

  .seed-input {
    flex: 1;
    width: 100%;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    font-size: 14px;
    letter-spacing: 1px;
    color: #e7ebf0;
    padding: 0;
  }

  .seed-edit {
    background: none;
    border: none;
    padding: 0;
    color: #6b727b;
    font-size: 13px;
    cursor: pointer;
  }

  .seed-edit:hover {
    color: #e0a13a;
  }

  .seed-reroll {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    font-size: 11px;
    color: #6b727b;
    margin-top: 7px;
    cursor: pointer;
  }

  .seed-reroll:hover {
    color: #e0a13a;
  }

  .spacer {
    flex: 1;
  }

  .legend {
    display: flex;
    flex-direction: column;
    gap: 9px;
    font-size: 12.5px;
    color: #c3cad2;
  }

  .legend-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .sw {
    width: 14px;
    height: 14px;
    flex: none;
  }

  .sw-nest {
    background: #e0a13a;
    border-radius: 3px;
  }

  .sw-food {
    background: linear-gradient(135deg, #7ed37e, #2f6b3a);
    border-radius: 3px;
  }

  .sw-ant {
    border-radius: 50%;
    border: 1px solid #0006;
  }

  .ant-searching {
    background: #eef2ff;
  }

  .ant-carrying {
    background: #b6f36a;
  }

  .ant-returning {
    background: #ff9d4d;
  }

  .sw-trail {
    border-radius: 2px;
    transform: scale(0.72);
  }

  .trail-home {
    background: rgba(74, 163, 255, 0.55);
  }

  .trail-food {
    background: rgba(255, 93, 176, 0.55);
  }
</style>
