# PixelEvolution - Implementation Plan

An incremental/idle browser game inspired by Game of Life where players manage a pixel ant colony, upgrading stats to evolve behaviors that improve colony growth and resource management.

---

## 1. Goals & Constraints

- **Runs in all modern browsers** (Chrome, Firefox, Safari, Edge - last 2 years).
- **Lightweight**: small bundle (target < 100 KB gzipped total), no heavy runtime.
- **TypeScript** strict mode throughout.
- **Idle-game feel**: auto-save, offline catch-up, number-go-up loop driven by a visible simulation.
- **Game-of-Life aesthetic**: crisp pixel grid rendered on Canvas 2D.
- **Agent-based simulation**: ants walk a grid, leave pheromones, forage food, return it to the nest. Upgrades change ant stats/behaviors.

---

## 2. Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | **Svelte 5** (runes) | ~2 KB runtime, compile-time reactivity fits idle-game counters; no virtual DOM. |
| Build tool | **Vite 5** | Fast dev server, minimal config, tree-shaking, ES modules. |
| Language | **TypeScript (strict)** | Required by user. |
| Rendering | **HTML5 Canvas 2D** via `ImageData` pixel writes | Fastest path for drawing a large grid of single-pixel cells. |
| State | Svelte 5 runes (`$state`, `$derived`) + plain TS store modules | No extra state library needed. |
| Persistence | `localStorage` (JSON, versioned schema) | Simple, synchronous, sufficient capacity. |
| Sim loop | `requestAnimationFrame` for render, fixed-timestep accumulator for logic ticks; `Web Worker` optional later | Decouples rendering from simulation rate. |
| Testing | **Vitest** (unit) + **Playwright** (E2E) | Native Vite integration; Playwright for browser-level smoke tests. |
| Lint/Format | **ESLint + Prettier** (minimal configs) | Standard tooling. |
| Deploy | Static build -> any static host (GitHub Pages / Netlify / Vercel) | No backend. |

**Runtime dependencies:** `svelte` only. Everything else is devDependencies. No UI kit - hand-rolled CSS with CSS variables for theming.

---

## 3. Project Structure

```
PixelEvolution/
├── index.html
├── package.json
├── tsconfig.json
├── svelte.config.js
├── vite.config.ts
├── public/
│   └── favicon.svg
├── src/
│   ├── main.ts                  # Bootstrap
│   ├── App.svelte               # Root layout (canvas + HUD + panels)
│   ├── app.css                  # Global styles / CSS variables
│   ├── game/
│   │   ├── constants.ts         # Grid size, tick rate, caps, tuning numbers
│   │   ├── types.ts             # Shared types (Ant, Cell, GameState, Upgrade)
│   │   ├── rng.ts               # Seeded PRNG (mulberry32) for determinism
│   │   ├── world.ts             # Grid: terrain, food, pheromones, nests
│   │   ├── ant.ts               # Ant agent state + step() behavior
│   │   ├── behaviors.ts         # Pluggable behavior modules unlocked by upgrades
│   │   ├── simulation.ts        # Fixed-timestep tick loop, orchestrates world+ants
│   │   ├── upgrades.ts          # Upgrade tree definition + effects
│   │   ├── economy.ts           # Resource production/consumption formulas
│   │   ├── offline.ts           # Offline catch-up computation
│   │   └── save.ts              # Serialize/deserialize + schema migrations
│   ├── render/
│   │   ├── renderer.ts          # Canvas setup, ImageData buffer, draw pipeline
│   │   ├── palette.ts           # Color constants for cells/ants/pheromones
│   │   └── camera.ts            # Optional zoom/pan (can be v2)
│   ├── stores/
│   │   ├── gameStore.svelte.ts  # Svelte 5 runes store wrapping GameState
│   │   └── uiStore.svelte.ts    # Selected tab, tooltips, modals
│   ├── ui/
│   │   ├── Hud.svelte           # Top bar: food, population, evolution points
│   │   ├── WorldCanvas.svelte   # Hosts the canvas + interaction
│   │   ├── UpgradePanel.svelte  # Upgrade tree UI
│   │   ├── StatsPanel.svelte    # Ant stats, colony metrics
│   │   ├── BehaviorsPanel.svelte# Toggle/equip unlocked behaviors
│   │   └── SettingsPanel.svelte # Save/load/export/import, speed slider
│   └── utils/
│       ├── format.ts            # Number formatting (1.23K, 4.56M)
│       └── schedule.ts          # Throttle/debounce helpers
└── tests/
    ├── world.test.ts
    ├── ant.test.ts
    ├── simulation.test.ts
    └── save.test.ts
```

---

## 4. Simulation Design

### 4.1 World

- Grid: `W x H` cells, **upgradable in-game**. Tiers (initial design, tunable):
  | Tier | Dimensions | Cells | Theme |
  |---|---|---|---|
  | 1 (start) | 32 x 32 | 1024 | Cozy nest |
  | 2 | 64 x 64 | 4096 | Small territory |
  | 3 | 96 x 96 | ~9k | Expanded |
  | 4 | 128 x 128 | ~16k | Large |
  | 5 | 160 x 160 | ~26k | Epic (Worker recommended) |
  - Also see `grid-design.md` for grid design
- Upgrading grid is a dedicated upgrade line ("Expand Territory") with high food + EVO cost. Each expansion:
  - Allocates new typed arrays and copies old world into center.
  - Scales resource spawn rates and hazard/enemy density (post-MVP) proportionally.
  - Enables access to richer food sources the further from nest.
- Each cell holds:
  - `terrain`: `empty | wall | nest | food | hazard` (hazard reserved for later)
  - `foodAmount`: 0..255
  - `pheromoneHome`: float 0..1 (decays each tick)
  - `pheromoneFood`: float 0..1 (decays each tick)
  - `danger`: 0..255 (post-MVP, used by threat mechanics)
- Stored as parallel `Uint8Array` / `Float32Array` for cache-friendly iteration and cheap serialization.
- Pheromone decay and diffusion run every N ticks (configurable) over the flat arrays.
- Canvas dynamically resizes when grid is expanded; camera (pan/zoom) becomes more valuable at higher tiers and is promoted from optional to MVP-required for tier 3+.

### 4.2 Ants

- Each ant is a small struct in Structure-of-Arrays form:
  - `x, y` (Int16Array)
  - `dir` (Uint8Array, 0-7)
  - `state` (Uint8Array: SEARCHING | CARRYING | RETURNING | IDLE)
  - `energy` (Float32Array)
  - `age` (Uint32Array)
- Per tick each ant:
  1. Reads local 3x3 pheromone neighborhood.
  2. Picks a direction based on current behavior module (weighted by stats).
  3. Moves, interacts with cell (pick up food, drop at nest, lay pheromone).
  4. Consumes energy; if 0 -> dies.
- Population cap scales with grid tier and nest upgrades. Starts at **~50 ants** (tier 1) and grows to **~3000 ants** at tier 5. SoA + typed arrays keeps it fast.

### 4.3 Tick loop

- **Logic tick**: fixed 10 Hz by default. Accumulator pattern inside `requestAnimationFrame` to catch up if a frame is long.
- **Render**: every animation frame, redraw only dirty regions (or full frame if cheap).
- **Speed control**: 0.5x / 1x / 2x / 4x multipliers by changing tick rate.

### 4.4 Offline catch-up (`game/offline.ts`)

- On load: compute `elapsed = now - lastSaveTime`.
- Cap at e.g. 8 hours (configurable).
- Two-phase approach:
  1. **Analytical fast-forward** using average food/minute yield from last session snapshot (cheap).
  2. Optional short "warm-up" of real sim (e.g. 200 ticks) so the visible world isn't stale.
- Show a "Welcome back" modal with gains summary.

---

## 5. Game Mechanics

### 5.1 Resources

- **Food** - primary currency; gathered by ants.
- **Evolution Points (EVO)** - earned slowly from food conversion and milestones; spent on upgrades.
- **Genome Tokens (GT)** - prestige currency, earned on colony reset (see 5.6). Spent on a separate permanent tree.

### 5.2 Ant stats (upgradeable)

| Stat | Effect |
|---|---|
| Speed | Cells moved per tick. |
| Vision | Radius of pheromone/food sampling. |
| Carry capacity | Food units carried per trip. |
| Energy pool | How long before needing to return. |
| Lifespan | Ticks before natural death. |
| Pheromone strength | Trail persistence/strength. |
| Memory | Chance to remember last good direction. |

### 5.3 Behaviors (unlocked via upgrade tree)

- **Random walk** (starter)
- **Follow food pheromone**
- **Lay pheromone on return**
- **Flocking / formation**
- **Scout vs worker roles**
- **Queen / brood chamber** (multiplies spawn rate)
- **Farming** (cultivate food tiles)
- **Raiding** (attack wild insects, post-MVP)

Each behavior is a small function; the active set is composed into the ant's decision step.

### 5.4 Upgrade tree

- Tree defined declaratively in `upgrades.ts` with cost curves (exponential).
- Each node: id, name, description, cost fn, prerequisites, effect (stat delta or behavior unlock).
- UI shows locked/available/purchased states with tooltips.
- Dedicated branches:
  - **Stats** (speed, vision, carry, etc.)
  - **Behaviors** (unlock modules)
  - **Colony** (population cap, spawn rate, queens)
  - **Territory** (grid expansion tiers)

### 5.5 Progression arc (first session)

1. Start: 1 nest (tier 1 grid), ~5 ants, random walk, scattered food. Passive food trickle.
2. Unlock pheromone trails -> big efficiency jump.
3. Unlock specialist roles -> scouts find far food.
4. Unlock queen -> population scales.
5. Unlock **Territory tier 2** -> larger world, more food, new upgrade tiers visible.
6. Unlock farming -> renewable food, idle-friendly.
7. First prestige available once specific milestone hit (see 5.6).

### 5.6 Prestige (Minimal MVP version)

- Unlocks after reaching **Territory tier 3** + first queen (guaranteed ~first long session).
- Action: **"Ascend Colony"** -> wipes run state (resources, ants, upgrades, grid tier, behaviors), keeps:
  - Genome Tokens earned (formula: `floor(sqrt(lifetimeFood / 1e5))`).
  - A tiny permanent upgrade tree (initial 3 nodes):
    1. **Ancestral Memory**: +X% food gain per GT spent.
    2. **Hardy Lineage**: +X% starting ants and energy.
    3. **Territorial Instinct**: start at tier 2 grid immediately.
- One reset layer only for MVP. Tree can expand post-MVP.
- Confirmation modal with clear gain/loss summary to avoid accidental resets.

---

## 6. Rendering

- Canvas sized to grid times pixel scale (e.g. 6x). Use CSS `image-rendering: pixelated`.
- Primary draw path: single `ImageData` buffer (`Uint8ClampedArray`) updated from world arrays, then `putImageData`. Overlay ants on top as 1-pixel writes.
- Color palette:
  - Empty: dark grey
  - Wall: near-black
  - Nest: amber
  - Food: green shades by amount
  - Pheromone home: faint blue tint
  - Pheromone food: faint magenta tint
  - Ant searching: white
  - Ant carrying: yellow
- Optional overlay toggles (show pheromones on/off) in SettingsPanel.

---

## 7. Persistence & Saves

- Schema:
  ```ts
  interface SaveV1 {
    version: 1;
    savedAt: number;
    rngSeed: number;
    resources: { food: number; evo: number };
    upgrades: Record<string, number>; // id -> level
    world: { w: number; h: number; terrain: string; food: string; /* base64 */ };
    ants: { count: number; data: string; /* base64 typed arrays */ };
    stats: { totalFood: number; totalAnts: number; ticks: number };
  }
  ```
- Auto-save every 10 s and on `visibilitychange`/`beforeunload`.
- Manual **Export** (copy JSON string / download .json) and **Import**.
- Schema-versioned; migration functions for future versions.
- Compression: typed arrays serialized to base64; optional `pako` only if needed (keep out of MVP to stay lightweight).

---

## 8. UI / UX

- Layout (desktop-first, responsive):
  - **Left column**: Canvas (world view), below it a speed control + log ticker.
  - **Right column**: Tabbed panels (Upgrades / Stats / Behaviors / Settings).
  - **Top**: HUD with resources, population, tick rate.
- Styling: CSS variables, dark theme default, small font stack (system-ui). No CSS framework.
- Accessibility: keyboard shortcuts (1-4 for tabs, space for pause, + / - for speed), ARIA labels on buttons, focus states.
- Tooltips: lightweight custom component (no library).

---

## 9. Performance Budget

- MVP target: 60 fps rendering, 10 Hz sim with up to 3000 ants on a tier-5 (256x160) grid on a mid-range laptop.
- Techniques:
  - Typed arrays + SoA for ants and world.
  - Avoid per-tick allocations in hot loops.
  - `ImageData` bulk writes instead of `fillRect` per cell.
  - Diffuse/decay pheromones every 2-4 ticks, not every tick.
  - Pause sim when tab hidden (`document.hidden`) - offline catch-up handles the gap.
- **Stretch**: move simulation into a Web Worker with `SharedArrayBuffer` fallback to `postMessage` transferables (post-MVP; keeps main thread free for UI).

---

## 10. Testing Strategy

- **Unit tests (Vitest)**:
  - `world`: food placement, pheromone decay math, boundary conditions, grid expansion copy.
  - `ant`: movement rules, state transitions, energy/lifespan.
  - `simulation`: deterministic ticks with fixed seed produce identical state.
  - `save`: round-trip serialize/deserialize, version migration.
  - `economy`: cost curves, offline catch-up math, prestige formula.
- **E2E tests (Playwright)** - headless Chromium + Firefox + WebKit:
  - New-game flow renders canvas and shows starting ants.
  - Buying a cheap upgrade deducts resources and updates UI.
  - Save persists across page reload (localStorage).
  - Export/import round-trips a save string.
  - Offline-catch-up modal appears after simulated time skip (mock `Date.now`).
  - Prestige confirmation flow (non-destructive until confirmed).
- Keep E2E tests few (5-8) and fast (<30 s total) to avoid CI bloat.
- `npm run test` (Vitest) and `npm run test:e2e` (Playwright) scripts.

---

## 11. Build & Deploy

- `npm run dev` - Vite dev server.
- `npm run build` - static output in `dist/`.
- `npm run preview` - local preview of build.
- `npm run test` - Vitest unit tests.
- `npm run test:e2e` - Playwright E2E.
- Verify final `dist/` size: HTML + JS + CSS gzipped target < 100 KB (Playwright is dev-only and does not ship).
- **Deploy: GitHub Pages** under `/PixelEvolution/`.
  - `vite.config.ts` sets `base: '/PixelEvolution/'`.
  - GitHub Actions workflow (`.github/workflows/deploy.yml`): on push to `main`, run tests, build, publish `dist/` to `gh-pages` via `actions/deploy-pages`.
  - Playwright runs against the built preview in CI before deploy.

---

## 12. Implementation Phases

### Phase 0 - Scaffolding
1. `npm create vite@latest` with Svelte-TS template (or manual setup).
2. Add ESLint, Prettier, Vitest, Playwright configs.
3. Configure `tsconfig.json` strict mode.
4. Set `vite.config.ts` `base: '/PixelEvolution/'`.
5. Basic `App.svelte` shell with HUD + canvas placeholder.
6. Add GitHub Actions workflow (build + test + deploy to Pages).

### Phase 1 - World & rendering
1. Implement `world.ts` with typed-array grid (start at tier 1: 48x32).
2. Implement `renderer.ts` using `ImageData` + multi-color palette.
3. Seed a demo world (nest + scattered food). Verify rendering at target size.
4. Implement camera (pan/zoom) early so grid expansion works.

### Phase 2 - Ants walking
1. Implement ant SoA and `step()` with random walk.
2. Pick up food at food cells, drop at nest.
3. Integrate into fixed-timestep tick loop.

### Phase 3 - Pheromones & behaviors
1. Pheromone deposit + decay + diffusion.
2. Food-trail following behavior.
3. Return-home behavior using home pheromone.

### Phase 4 - Economy & upgrades
1. Resource store (food, evo).
2. Upgrade tree with 4 branches (Stats, Behaviors, Colony, Territory), ~15 nodes total for MVP.
3. Upgrade panel UI with tooltips.
4. Grid-expansion upgrade effect (resizes world, scales spawn rates).

### Phase 5 - Persistence & idle
1. Save/load with versioned schema, auto-save every 10 s + on visibility change.
2. Offline catch-up + welcome-back modal.
3. Export/import (JSON string + optional file download).

### Phase 6 - Prestige
1. Genome Tokens formula + lifetime stats tracking.
2. "Ascend Colony" flow with confirmation modal.
3. Permanent upgrade tree (3 starter nodes).
4. Apply permanent effects on new run.

### Phase 7 - Polish & ship
1. Settings panel (speed, overlays, hard reset).
2. Keyboard shortcuts, responsive layout, tooltips.
3. Balance pass, tutorial hints, first-run onboarding.
4. Vitest + Playwright suites green, lint clean, build size check.
5. GitHub Actions deploy to Pages.

### Post-MVP (not in first build)
- Web Worker simulation (SharedArrayBuffer).
- Enemies and hazards (attack AI, colony defense).
- Expanded prestige tree + multiple prestige layers.
- More biomes, raids, weather.
- Sound effects / music.
- PWA / installable offline.

---

## 13. Locked Decisions

1. **Art direction**: multi-color palette.
2. **Grid size**: upgradable tiered system (48x32 start -> 256x160). Bigger = more resources + more danger (hazards/enemies post-MVP).
3. **Prestige**: minimal version in MVP (Genome Tokens + 3-node permanent tree).
4. **Deployment**: GitHub Pages under `/PixelEvolution/` via GitHub Actions.
5. **Tests**: Vitest unit + Playwright E2E (small focused suite).

---

## 14. Risks & Mitigations

- **Perf regressions with many ants** -> SoA + typed arrays from day one; measure with a simple FPS counter; ready to move to Web Worker.
- **Save bloat from larger grids** -> base64 typed arrays, only persist what can't be recomputed; cap auto-save frequency; run-length encode the sparse food/pheromone layers if needed.
- **Balance/fun** -> defer tuning until after Phase 4; playtest loop before polish; prestige formula calibrated from first full run.
- **Grid expansion complexity** -> typed-array re-allocation + copy is straightforward; verify with unit test that world state is preserved.
- **Scope creep** -> enemies/hazards/biomes/expanded prestige listed explicitly as post-MVP.
