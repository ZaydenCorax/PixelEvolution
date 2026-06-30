# PixelEvolution - Game Design Document

**Version:** 1.0  
**Status:** Active Development  
**Genre:** Incremental / Idle / Agent-based Simulation  

---

## 1. Overview

PixelEvolution is a browser-based idle game inspired by Conway's Game of Life, where players manage a pixel ant colony. The visible game world is a grid of cells rendered on an HTML5 Canvas. Ants walk the grid, leave pheromone trails, forage for food, and return it to the nest. The player upgrades colony stats and unlocks new behaviors to improve efficiency, eventually expanding territory and triggering prestige resets for permanent bonuses.

---

## 2. Goals & Constraints

- Runs in all modern browsers (Chrome, Firefox, Safari, Edge - last 2 years).
- Lightweight: target < 100 KB gzipped total.
- TypeScript strict mode throughout.
- Idle-game feel: auto-save, offline catch-up, number-go-up loop driven by visible simulation.
- Game-of-Life aesthetic: crisp pixel grid.
- Agent-based simulation: ants walk a grid, leave pheromones, forage food, return it to the nest.

---

## 3. Tech Stack

| Concern | Choice |
|---|---|
| Framework | Svelte 5 (runes) |
| Build tool | Vite 5 |
| Language | TypeScript (strict) |
| Rendering | HTML5 Canvas 2D + invisible CSS Grid overlay |
| State | Svelte 5 runes + plain TS store modules |
| Persistence | localStorage (JSON, versioned schema) |
| Sim loop | requestAnimationFrame + fixed-timestep accumulator |
| Testing | Vitest (unit) + Playwright (E2E) |
| Lint/Format | ESLint + Prettier |

**Runtime dependencies:** `svelte` only. Everything else is devDependencies. No UI kit - hand-rolled CSS.

---

## 4. World & Grid

### 4.1 Grid System

The game world is a 2D grid of cells. Each cell can hold terrain type, food amount, and pheromone levels.

### 4.2 Grid Tiers

The world is upgradable in-game:

| Tier | Dimensions | Cells | Theme |
|---|---|---|---|
| 1 (start) | 32 x 32 | 1024 | Cozy nest |
| 2 | 64 x 64 | 4096 | Small territory |
| 3 | 96 x 96 | ~9k | Expanded |
| 4 | 128 x 128 | ~16k | Large |
| 5 | 160 x 160 | ~26k | Epic |

Upgrading grid is a dedicated upgrade line ("Expand Territory") with high food + EVO cost. Each expansion allocates new typed arrays and copies the old world into the center.

### 4.3 Cell Data

Each cell holds:

- `terrain`: `empty | wall | nest | food` (hazard reserved for later)
- `foodAmount`: 0..255
- `pheromoneHome`: float 0..1 (decays each tick)
- `pheromoneFood`: float 0..1 (decays each tick)

Stored as parallel `Uint8Array` / `Float32Array` for cache-friendly iteration.

---

## 5. Ants

### 5.1 Ant State

Ants are stored in Structure-of-Arrays form for performance:

- `x, y` (Int16Array)
- `dir` (Uint8Array, 0-7)
- `state` (Uint8Array: SEARCHING | CARRYING | RETURNING | dead(255))
- `energy` (Float32Array)
- `age` (Uint32Array)

### 5.2 Ant States

| State | Value | Behavior |
|---|---|---|
| SEARCHING | 0 | Random walk, looking for food |
| CARRYING | 1 | Has food, heading back to nest |
| RETURNING | 2 | Low energy, heading back to nest |
| DEAD | 255 | Removed from simulation |

### 5.3 Ant Movement

Per tick each ant:
1. Reads local 3x3 pheromone neighborhood.
2. Picks a direction based on weighted random choice (food, pheromones, home pheromone if returning).
3. Moves, interacts with cell (pick up food, drop at nest, lay pheromone).
4. Consumes energy; if 0 or exceeds lifespan -> dies.

### 5.4 Population

- Starts at ~5 ants (tier 1).
- Population cap scales with grid tier.
- Ants spawn at nest location.

---

## 6. Simulation

### 6.1 Tick Loop

- **Logic tick**: fixed rate (default 1 Hz). Fixed-timestep accumulator pattern inside `requestAnimationFrame`.
- **Render**: every animation frame, redraw all cells.
- **Speed control**: configurable tick rate.

### 6.2 Pheromone System

- Pheromones decay every N ticks (`PHEROMONE_DECAY_INTERVAL_TICKS`).
- Pheromones diffuse to neighbors each decay tick.
- Home pheromone: laid when ant returns to nest or drops food.
- Food pheromone: laid when ant picks up food.
- Ants prefer moving toward stronger home pheromone when returning.

### 6.3 Food System

- Food spawns randomly on non-nest cells each tick (probability `FOOD_SPAWN_RATE`).
- Ants pick up food when on a food cell.
- Food is deposited at nest cells.
- Food is collected as colony resource every 10 ticks.

### 6.4 Game Over

- Colony collapses when all ants die.
- Triggered when `ants.count === 0` and ants have existed.

---

## 7. Economy & Progression

### 7.1 Resources

- **Food** - primary currency; gathered by ants and collected at nest.
- **Evolution Points (EVO)** - earned slowly; spent on upgrades.
- **Genome Tokens (GT)** - prestige currency (post-MVP).

### 7.2 Upgrade Tree (MVP)

Branches:
- **Stats** - improve ant speed, energy, lifespan, carry capacity.
- **Behaviors** - unlock new ant decision logic.
- **Colony** - population cap, spawn rate.
- **Territory** - grid expansion tiers.

Each node: id, name, description, cost function, prerequisites, effect.

### 7.3 Prestige (Minimal MVP)

- Unlocks after reaching Territory tier 3 + first queen.
- "Ascend Colony" resets run state, keeps Genome Tokens.
- Permanent upgrade tree with 3 starter nodes.
- Confirmation modal required.

---

## 8. Rendering

### 8.1 Architecture

All visual output is rendered onto a single `<canvas>` element using the HTML5 Canvas 2D Context API. An invisible CSS Grid overlay positioned on top of the canvas handles all pointer events (hover, click, tooltips). Both layers are children of a shared `position: relative` container and are kept in sync in size and cell count.

```
┌──────────────────────────────────────┐
│  Container (position: relative)      │
│  ┌────────────────────────────────┐  │
│  │  Overlay <div>                 │  │  ← pointer-events, hover, click, tooltips
│  │  (position: absolute, z: 1)    │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  <canvas>                      │  │  ← all rendering
│  │  (position: absolute, z: 0)    │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 8.2 Canvas Rendering

- All cells, grid lines, and animations are drawn on the canvas.
- Grid lines are produced by rendering each cell with a uniform inset (1px on all sides). The canvas background color shows through the gaps, acting as the grid line color.
- Cell size is derived at runtime from container dimensions and grid dimensions, floored to an integer to prevent subpixel rendering artifacts.
- For high-DPI screens, canvas pixel dimensions are multiplied by `window.devicePixelRatio` and the drawing context is scaled down accordingly.
- Render loop is driven by `requestAnimationFrame` with a dirty flag to avoid unnecessary redraws.

### 8.3 Interaction Layer

- The overlay `<div>` uses CSS Grid matching the logical grid dimensions.
- Each grid cell `<div>` corresponds 1:1 to a canvas cell and carries `data-row` and `data-col` attributes.
- Event listeners are attached via event delegation on the overlay container for performance.
- Hover highlights are applied by redrawing only the hovered cell on the canvas with a highlight color.

### 8.4 Color Palette

| Element | Color |
|---|---|
| Empty | Dark grey [30, 30, 30] |
| Wall | Near-black [10, 10, 10] |
| Nest | Amber [200, 150, 50] |
| Food (low) | Dark green [50, 120, 50] |
| Food (high) | Light green [150, 255, 100] |
| Ant (searching) | White [220, 220, 220] |
| Ant (carrying) | Yellow [255, 255, 100] |
| Ant (returning) | Light blue [100, 200, 255] |

---

## 9. Persistence

### 9.1 Save Schema (V1)

```ts
interface SaveV1 {
  version: 1;
  savedAt: number;
  tick: number;
  resources: { food: number; evo: number };
  world: { w, h, terrain, food, pheromoneHome, pheromoneFood };
  ants: { count, capacity, x, y, dir, state, energy, age };
  stats: { totalFood, totalAnts, totalTicks };
  gridTier: number;
}
```

### 9.2 Auto-save

- Every 10 seconds.
- On `visibilitychange` and `beforeunload`.
- Manual export/import (JSON string or .json file).

---

## 10. UI / UX

### 10.1 Screens

- **Menu**: Title, subtitle, instructions, Start button.
- **Playing**: HUD (resources, population, tick), world grid, controls (pause, expand).
- **Game Over**: Reason, final stats, Play Again button.

### 10.2 Layout

- Full-screen canvas/grid container.
- HUD overlay at top.
- Controls integrated into HUD.

---

## 11. Performance Budget

- Target 60fps rendering.
- 1 Hz simulation tick by default.
- Typed arrays + Structure-of-Arrays for ants and world.
- Avoid per-tick allocations in hot loops.
- Canvas 2D rendering with dirty-flag redraws.

---

## 12. Project Structure

```
PixelEvolution/
├── index.html
├── package.json
├── tsconfig.json
├── svelte.config.js (if needed)
├── vite.config.ts
├── public/
│   └── favicon.svg
├── src/
│   ├── main.ts
│   ├── App.svelte
│   ├── app.css
│   ├── game/
│   │   ├── constants.ts
│   │   ├── types.ts
│   │   ├── rng.ts
│   │   ├── world.ts
│   │   ├── ant.ts
│   │   ├── simulation.ts
│   │   └── save.ts (planned)
│   ├── render/
│   │   ├── renderer.ts
│   │   └── palette.ts
│   └── stores/
│       └── gameStore.ts
└── tests/ (planned)
```

---

## 13. Implementation Phases

### Phase 1 - Core Loop (Current)
- World grid with typed arrays.
- Ant agents with basic movement and food collection.
- Canvas rendering with invisible CSS Grid overlay for interaction.
- Fixed-timestep simulation loop.

### Phase 2 - Economy & UI
- Resource tracking (food, EVO).
- HUD updates.
- Menu, playing, game-over screens.

### Phase 3 - Progression
- Upgrade system.
- Grid expansion.
- Offline catch-up.

### Phase 4 - Polish
- Save/load.
- Better UI panels.

---

## 14. Locked Decisions

1. Svelte 5 with runes for reactivity.
2. TypeScript strict mode.
3. Typed arrays + SoA for simulation data.
4. HTML5 Canvas 2D with invisible CSS Grid overlay for interaction.
5. Grid tiers: 32x32 start, expanding to 160x160.
6. 8-directional ant movement (Moore neighborhood).

---

## 15. Non-Goals (MVP)

- No multiplayer.
- No WebGL rendering.
- No enemies/hazards.
- No sound/music.
- No PWA features.
