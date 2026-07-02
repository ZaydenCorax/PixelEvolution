<script lang="ts">
  // Resource bar (DESIGN_TEMPLATE 1A): brand + generation, currency chips, tick/pop.
  let {
    generation,
    food,
    evoPoints,
    pendingEvo,
    tick,
    population,
    popCap,
  }: {
    generation: number;
    food: number;
    evoPoints: number;
    pendingEvo: number;
    tick: number;
    population: number;
    popCap: number;
  } = $props();
</script>

<div class="topbar">
  <div class="brand">
    <span class="brand-dot"></span>
    <span class="brand-name">PixelEvolution</span>
    <span class="brand-sub mono">colony · gen {generation}</span>
  </div>
  <div class="divider"></div>

  <div class="chip">
    <span class="chip-swatch"></span>
    <span class="chip-value mono">{Math.floor(food).toLocaleString('en-US')}</span>
    <span class="chip-label">food</span>
  </div>

  <!-- EVO is live: banked Evolution Points plus what the current run would add on
       death/Ascend. Watching the pending value grow is the run's visible goal. -->
  <div class="chip">
    <span class="chip-swatch evo-swatch"></span>
    <span class="chip-value mono">
      {evoPoints.toLocaleString('en-US')}{#if pendingEvo > 0}<span class="evo-pending">
          (+{pendingEvo})</span
        >{/if}
    </span>
    <span class="chip-label">EVO</span>
  </div>
  <!-- TODO(economy): GT is a scaffold currency for the prestige-tokens update. -->
  <div class="chip chip-soon">
    <span class="chip-value mono soon-value">GT —</span>
    <span class="soon-badge">SOON</span>
  </div>

  <div class="spacer"></div>

  <div class="readouts mono">
    <span class="readout">Tick <span class="readout-value">{tick}</span></span>
    <span class="readout"
      >Pop <span class="readout-value">{population}</span><span class="readout-cap">/{popCap}</span
      ></span
    >
  </div>
</div>

<style>
  .topbar {
    height: 54px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 0 20px;
    background: #101318;
    border-bottom: 1px solid #1b1f26;
  }

  .mono {
    font-family: 'JetBrains Mono', monospace;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .brand-dot {
    width: 10px;
    height: 10px;
    background: #e0a13a;
    border-radius: 2px;
    box-shadow: 0 0 10px #e0a13a99;
  }

  .brand-name {
    font-weight: 600;
    font-size: 15px;
    letter-spacing: -0.01em;
  }

  .brand-sub {
    font-size: 11px;
    color: #6b727b;
    margin-left: 4px;
  }

  .divider {
    width: 1px;
    height: 22px;
    background: #23282f;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 11px;
    background: #14181e;
    border: 1px solid #232a31;
    border-radius: 8px;
  }

  .chip-swatch {
    width: 11px;
    height: 11px;
    background: linear-gradient(135deg, #7ed37e, #2f6b3a);
    border-radius: 2px;
  }

  .evo-swatch {
    background: linear-gradient(135deg, #c084fc, #6d28d9);
  }

  .evo-pending {
    color: #c084fc;
    font-weight: 500;
  }

  .chip-value {
    font-size: 14px;
    font-weight: 600;
  }

  .chip-label {
    font-size: 11px;
    color: #7c848d;
  }

  .chip-soon {
    background: #101318;
    border: 1px dashed #262c33;
    opacity: 0.55;
  }

  .soon-value {
    color: #b9c0c8;
  }

  .soon-badge {
    font-size: 9px;
    letter-spacing: 1px;
    color: #e0a13a;
    background: #e0a13a1f;
    padding: 2px 5px;
    border-radius: 4px;
  }

  .spacer {
    flex: 1;
  }

  .readouts {
    display: flex;
    align-items: center;
    gap: 18px;
    font-size: 13px;
  }

  .readout {
    color: #8b939d;
  }

  .readout-value {
    color: #e7ebf0;
    font-weight: 600;
  }

  .readout-cap {
    color: #5c636c;
  }
</style>
