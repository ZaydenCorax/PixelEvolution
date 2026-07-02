<script lang="ts">
  // Right rail (DESIGN_TEMPLATE 1A): colony readout, population meter, upgrades shelf.
  import type { StateStat } from './types';

  let {
    stats,
    maxEnergy,
    population,
    popCap,
  }: {
    stats: StateStat[];
    maxEnergy: number;
    population: number;
    popCap: number;
  } = $props();
</script>

<div class="rail">
  <div>
    <div class="colony-header">
      <div class="section-label mono">COLONY</div>
      <div class="alive mono">{population} alive</div>
    </div>
    <div class="stat-rows">
      {#each stats as row (row.name)}
        <div>
          <div class="stat-head">
            <span class="stat-name"
              ><span class="stat-dot" style="background: {row.dot}"></span>{row.name}</span
            >
            <span class="mono">{row.count}</span>
          </div>
          <div class="bar">
            <div
              class="bar-fill"
              style="width: {Math.min(100, (row.avgEnergy / maxEnergy) * 100)}%; background: {row.bar}"
            ></div>
          </div>
          <div class="stat-foot mono">
            <span>e {Math.round(row.avgEnergy)}</span>
            <span>age {Math.round(row.avgAge)}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div>
    <div class="pop-head">
      <span>Population</span>
      <span class="mono">{population} / {popCap}</span>
    </div>
    <div class="pop-bar">
      <div class="pop-fill" style="width: {Math.min(100, (population / popCap) * 100)}%"></div>
    </div>
  </div>

  <div class="spacer"></div>

  <!-- TODO(economy): locked scaffold — swap the placeholder rows for purchasable
       upgrades (spending EVO) once the economy update lands. -->
  <div class="upgrades">
    <div class="upgrades-header">
      <span class="section-label-inline mono">UPGRADES</span>
      <span class="lock">🔒</span>
    </div>
    <div class="upgrade-rows">
      <div class="upgrade-row"><span>Move speed</span><span class="mono cost">— EVO</span></div>
      <div class="upgrade-row"><span>Carry +1</span><span class="mono cost">— EVO</span></div>
      <div class="upgrade-row"><span>Lifespan</span><span class="mono cost">— EVO</span></div>
    </div>
    <div class="upgrades-note">Reserved for the economy update.</div>
  </div>
</div>

<style>
  .rail {
    width: 256px;
    flex: none;
    border-left: 1px solid #1b1f26;
    background: #0e1116;
    padding: 16px 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .mono {
    font-family: 'JetBrains Mono', monospace;
  }

  .colony-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
  }

  .section-label,
  .section-label-inline {
    font-size: 10px;
    letter-spacing: 2px;
    color: #6b727b;
  }

  .alive {
    font-size: 11px;
    color: #8b939d;
  }

  .stat-rows {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stat-head {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    margin-bottom: 5px;
  }

  .stat-name {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .stat-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .bar {
    height: 5px;
    background: #1a1e24;
    border-radius: 3px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
  }

  .stat-foot {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #6b727b;
    margin-top: 3px;
  }

  .pop-head {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #9aa3ad;
    margin-bottom: 6px;
  }

  .pop-bar {
    height: 7px;
    background: #1a1e24;
    border-radius: 4px;
    overflow: hidden;
  }

  .pop-fill {
    height: 100%;
    background: linear-gradient(90deg, #e0a13a, #f0c060);
  }

  .spacer {
    flex: 1;
  }

  .upgrades {
    border: 1px dashed #262c33;
    border-radius: 11px;
    padding: 13px;
    background: #0d1015;
  }

  .upgrades-header {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 11px;
  }

  .lock {
    font-size: 12px;
    color: #4c525b;
  }

  .upgrade-rows {
    display: flex;
    flex-direction: column;
    gap: 9px;
    opacity: 0.5;
  }

  .upgrade-row {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
  }

  .cost {
    color: #8b939d;
  }

  .upgrades-note {
    font-size: 10.5px;
    color: #5c636c;
    margin-top: 11px;
    line-height: 1.5;
  }
</style>
