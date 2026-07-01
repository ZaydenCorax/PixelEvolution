# PixelEvolution — Design & Architecture

**Audience:** developers new to this codebase (onboarding reference).
**Status of the game:** early, playable **prototype** (MVP core loop only).
**Status of this document:** describes the code **as it actually exists today**, with a clearly
separated roadmap for what is planned but not yet built, and an honest list of known gaps.

> How to read this doc: sections 1–6 explain what is really in the repo right now and *why* it is
> built that way. Section 7 is the future vision. Section 8 is a candid list of rough edges — read
> it before you trust any single subsystem to "just work." Section 9 is a glossary; if a term looks
> unfamiliar, jump there first.

---

## 1. Project Overview

PixelEvolution is a browser game about a colony of pixel "ants" living on a small grid. Ants wander
the grid looking for food, pick it up, carry it back to a central **nest**, and drop **pheromone**
trails that bias where other ants walk. The visual style is deliberately Conway's-Game-of-Life-like:
a crisp square grid of coloured cells drawn on an HTML5 canvas.

The long-term intent (see [`.kilo/plans/game-design.md`](../.kilo/plans/game-design.md)) is an
**idle / incremental** game — gather resources, buy upgrades, expand territory, and "prestige" for
permanent bonuses. **None of that economy layer exists yet.** What is implemented today is the
foundational simulation: a world, ants, pheromones, food, a fixed-rate tick loop, canvas rendering,
and a minimal Svelte UI (menu → playing → game over).

### The three plan documents (and how they relate to reality)

The repo carries three historical design docs under [`.kilo/plans/`](../.kilo/plans/). They were
written at different times and **disagree with each other and with the code**. Treat them as
history, not as the source of truth — this document is the current reference.

| Plan file | What it is | Relationship to the code |
|---|---|---|
| `initial-game-design.md` | The MVP scope ("ants walk, find food, bring it home") | **Closest to reality.** The current code is roughly this. |
| `game-design.md` | The grand vision (economy, upgrades, prestige, grid tiers, save/load) | **Mostly unbuilt** — aspirational roadmap. |
| `grid-design.md` | A generic, framework-agnostic spec for a reusable canvas grid + interaction overlay | **Partly built** — the canvas rendering exists; the interaction overlay does not. |

Where the code deliberately diverges from those plans (for example 4-directional movement and a 3×3
nest), this document treats the code as correct and explains the reasoning.

---

## 2. Tech Stack & Build

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | [`tsconfig.json`](../tsconfig.json) — `strict: true`, `noEmit` (Vite/Svelte handle transpiling). |
| UI framework | Svelte 5 (runes mode) | [`svelte.config.js`](../svelte.config.js) sets `runes: true`. Only used for the shell UI. |
| Build tool | Vite 6 | [`vite.config.ts`](../vite.config.ts). Dev server auto-opens the browser. |
| Rendering | HTML5 Canvas 2D | Via `ImageData` pixel writes — see [§5.4](#54-rendering). |
| State | Plain-TS store module | [`src/stores/gameStore.ts`](../src/stores/gameStore.ts) — *not* a Svelte store. |
| Tests | Vitest (unit) + Playwright (E2E) | Only placeholder tests exist today ([`tests/`](../tests/)). |

**Runtime dependencies: only Svelte.** Everything else (Vite, TypeScript, ESLint, Playwright, etc.)
is a dev dependency. There is no UI component library; all CSS is hand-written. This keeps the
shipped bundle tiny, which matches the plan's "< 100 KB gzipped" goal.

### Commands

```bash
npm install        # install dev dependencies (first time only)
npm run dev        # start Vite dev server (opens the browser)
npm run build      # production build into dist/
npm run preview    # serve the production build locally
npm test           # Vitest unit tests
npm run test:e2e   # Playwright end-to-end tests
npm run lint       # ESLint over src/
npm run format     # Prettier
```

One build detail worth knowing: `vite.config.ts` sets `base: '/PixelEvolution/'` in production so the
build works when hosted under a GitHub Pages project path. In dev, `base` is `'/'`.

---

## 3. Architecture & System Design

### 3.1 The big idea: three separated layers

The project is organised around one guiding principle: **keep the simulation independent of the
framework and the renderer.** The game logic is plain TypeScript that knows nothing about Svelte or
canvas; the renderer draws from the simulation's data; Svelte only owns the surrounding UI.

```
 index.html
     │  loads
     ▼
 src/main.ts ─────────── mounts ──────────►  src/App.svelte   (Svelte UI shell)
                                                  │  creates
                                                  ▼
                                         src/stores/gameStore.ts   (glue / lifecycle)
                                          │                    │
                                 owns the │                    │ owns the
                            simulation ▼                       ▼ renderer
                   ┌──────────────────────────────┐   ┌───────────────────────────┐
                   │        game/ (pure TS)        │   │        render/            │
                   │  simulation.ts  (tick loop)   │   │  renderer.ts  (canvas)    │
                   │  world.ts       (grid state)  │   │  palette.ts   (colours*)  │
                   │  ant.ts         (agents)      │   └───────────────────────────┘
                   │  constants.ts   (tuning)      │
                   │  types.ts       (data shapes) │        * palette.ts is currently
                   │  rng.ts         (randomness)  │          unused — see §8.
                   └──────────────────────────────┘
```

**Why this split?**

- **`game/` is pure and framework-free.** It has no imports from Svelte or the DOM. That means the
  entire simulation can be unit-tested in isolation, reused with a different renderer, or run
  head-less. It also keeps the per-tick hot loop free of any framework reactivity overhead.
- **The renderer reads state; it does not own it.** Every frame it is handed the current `World` and
  `Ants` and paints them. It is a "dumb" projection of state onto pixels.
- **Svelte owns only the shell.** Which screen is showing, the HUD numbers, the stats table — the
  reactive, human-facing parts. The high-frequency simulation deliberately lives *outside* Svelte's
  reactivity system.

### 3.2 Data-oriented design: typed arrays + Structure-of-Arrays

Instead of modelling each ant as an object (`{ x, y, energy, ... }`) and the grid as a 2-D array of
cell objects, the code stores everything in **flat typed arrays**.

The world ([`types.ts`](../src/game/types.ts) `World`):

```
terrain        : Uint8Array   (0=empty, 1=nest, 2=food)   ┐
food           : Uint8Array   (0..255 units per cell)     │  one entry per cell,
pheromoneHome  : Float32Array (0..1)                       │  indexed by y * width + x
pheromoneFood  : Float32Array (0..1)                       ┘
```

The ants ([`types.ts`](../src/game/types.ts) `Ants`) use **Structure-of-Arrays (SoA)** — one array
per field, all indexed by the same ant number `i`:

```
        ant 0   ant 1   ant 2   ...
x    [   16   ,  15   ,  17   , ... ]   Int16Array
y    [   16   ,  17   ,  16   , ... ]   Int16Array
dir  [    1   ,   3   ,   0   , ... ]   Uint8Array   (index into ANT_MOVE_DIRECTIONS)
state[    0   ,   1   ,   0   , ... ]   Uint8Array   (0=searching,1=carrying,2=returning,255=dead)
energy[  99.5 , 100.0 ,  42.0 , ... ]   Float32Array
age  [    3   ,   3   ,   3   , ... ]   Uint32Array
```

**Why SoA and typed arrays?**

- **Cache efficiency.** Iterating one field over all ants walks contiguous memory, which is friendly
  to the CPU cache. The plan sets a performance budget (60 fps rendering, thousands of cells), and
  this layout is the standard way to hit it.
- **No per-tick allocation.** The arrays are allocated once. The hot loop mutates them in place
  rather than creating objects every tick, avoiding garbage-collection pauses.
- **Compact.** `Uint8Array`/`Float32Array` are far smaller than JS objects, which matters when the
  planned grid tiers reach 160×160 (~26k cells).

The trade-off is ergonomics: there is no `ant.x`, only `ants.x[i]`, and "deleting" an ant means
compacting the arrays (see [§4.2](#42-the-ant-step-antts)).

---

## 4. Key Components & Responsibilities

Each subsection covers one file: what it owns, its notable functions, and a *why* note.

### 4.1 `game/constants.ts` — tuning knobs

All simulation numbers live in one place: grid tick rate, pheromone decay, food spawn rate, ant
energy/lifespan, the `TERRAIN` and `ANT_STATE` enums, and `ANT_MOVE_DIRECTIONS`.

**Notable:** `ANT_MOVE_DIRECTIONS` is the **4-direction** (N, E, S, W — "von Neumann") movement set.
An ant's `dir` field is an index into this array. *Why 4 and not 8?* Fewer choices per step make ant
paths less jittery and keep the weighted-direction maths cheaper; this superseded an earlier
"8-directional (Moore)" decision from the plans (the unused 8-direction array has been removed).

### 4.2 `game/types.ts` — data shapes

Defines the `World`, `Ants`, and `GameState` interfaces (the typed-array layouts from
[§3.2](#32-data-oriented-design-typed-arrays--structure-of-arrays)). `GameState` bundles everything
the simulation needs: `tick`, `resources.food`, the `world`, the `ants`, and the `gameOver` / `paused`
flags.

> ⚠️ This file *also* re-declares `AntState` and `Terrain` constants that duplicate `ANT_STATE` and
> `TERRAIN` in `constants.ts`. They are effectively unused — the real code imports from
> `constants.ts`. See [§8](#8-known-issues-gaps--inconsistencies).

### 4.3 `game/rng.ts` — randomness

A single helper, `randomInt(max)`, returning `0..max-1` via `Math.random()`. *Why isolate it?* So a
seeded/deterministic RNG could later be swapped in (needed for reproducible saves/replays). Note this
goal isn't fully met today — other files call `Math.random()` directly ([§8](#8-known-issues-gaps--inconsistencies)).

### 4.4 `game/world.ts` — the grid

Owns the grid and everything that happens to cells. Key functions:

- **`createWorld()`** — allocates the four typed arrays for a **32×32** grid, stamps a **3×3 nest**
  centred at cell (16, 16) (so cells 15–17 on each axis), and scatters `STARTING_FOOD` (200) units of
  food across non-nest cells.
- **`spawnFood(...)`** (internal, used at startup) — randomly deposits food; importantly it sets a
  cell's `terrain` to `FOOD` when it first drops food there.
- **`spawnFoodTick(...)`** — the per-tick natural food spawn (2% chance). ⚠️ Unlike `spawnFood`, this
  does **not** set `terrain = FOOD`, which is a real bug — see [§8](#8-known-issues-gaps--inconsistencies).
- **`pickupFood` / `dropFood`** — move food between an ant and a cell, clamped to `[0, 255]`.
- **`depositPheromone`** — adds to a cell's home/food pheromone, clamped to `1`.
- **`tickPheromones(world, tick)`** — every `PHEROMONE_DECAY_INTERVAL_TICKS` (2) ticks, multiplies
  all pheromones by `PHEROMONE_DECAY` (0.995), then diffuses them.
- **`diffusePheromones(...)`** (internal) — spreads each cell's pheromone toward the average of its
  4 orthogonal neighbours, weighted by `PHEROMONE_DIFFUSE_AMOUNT` (0.1). It writes into a scratch
  array and copies back, so a cell's update doesn't corrupt its neighbours' reads mid-pass.

*Why decay + diffusion?* Together they make trails **fade over time** and **blur outward**, which is
what turns individual ant deposits into smooth gradients other ants can follow — the core of
ant-colony-style pathfinding.

### 4.5 `game/ant.ts` — the agents

Owns ant creation and per-tick behaviour.

- **`createAnts(count, world)`** — allocates the SoA arrays and scatters `count` ants across the 3×3
  nest (offset `-1..1` on each axis), each starting `SEARCHING` with full energy (100) and age 0.
- **`stepAnts(ants, world)`** — the per-tick update for every ant. In order, for each live ant it:
  1. Ages it; if `energy <= 0` **or** `age > ANT_LIFESPAN` (2000), marks it dead (`state = 255`).
  2. Subtracts `ANT_ENERGY_COST` (0.5) energy.
  3. Moves it (`moveAnt`), reverting if the move would leave the grid (ants "bounce" off edges).
  4. Interacts with the destination cell based on state:
     - **SEARCHING** on a food cell → pick up 1 food, become **CARRYING**, lay food pheromone (0.3).
     - **CARRYING** on the nest → drop food, become **SEARCHING**, lay home pheromone (0.2); otherwise
       take a second step biased toward home (`followPheromoneHome`).
     - **RETURNING** on the nest → become **SEARCHING**, lay home pheromone; otherwise follow home.
  5. If a SEARCHING ant's energy drops below 20% (20), switches it to **RETURNING**.
  - Finally, **`compactAnts`** removes dead ants by shifting live entries down and updating `count`.
- **`getWeightedDirs(world, x, y, preferHome?)`** — the movement brain. For each of the 4 neighbours
  it computes a weight: base `1`, `+50` if the cell is food, `+ pheromoneFood * 20`, and (when
  returning home) `+ pheromoneHome * 30`. It then does **roulette-wheel selection** — pick a direction
  with probability proportional to its weight. *Why weighted-random instead of "always go to the best
  cell"?* Randomness keeps ants exploring and prevents them all funnelling into a single path, which
  is what makes emergent trail-following look organic.

> ⚠️ Carrying/returning ants effectively move **twice** per tick (once in `moveAnt`, once in
> `followPheromoneHome`), and the cell interaction is only checked after the first move. This is a
> quirk, not intended design — see [§8](#8-known-issues-gaps--inconsistencies).

### 4.6 `game/simulation.ts` — the orchestrator and clock

Ties the world and ants together and drives time.

- **`createInitialState()`** — builds a fresh `GameState` (world + 5 ants + zeroed resources).
- **`tick(state)`** — one logical step: `stepAnts` → `tickPheromones` → `spawnFoodTick` → increment
  `tick` → every 10 ticks sweep food out of the nest into `resources.food` (`collectFoodAtNest`) →
  if `ants.count === 0`, set `gameOver` with reason `"Colony collapsed"`.
- **`createSimLoop(onTick)`** — the **fixed-timestep accumulator** loop. It runs on
  `requestAnimationFrame`, accumulates real elapsed milliseconds, and calls `onTick` once per whole
  `TICK_INTERVAL_MS` (1000 ms) of accumulated time. *Why fixed-timestep?* It decouples simulation
  speed from the display's frame rate, so the game runs the same whether the monitor is 60 Hz or
  144 Hz, and it can "catch up" if a frame is delayed. (Caveat: there's no upper bound on catch-up —
  see [§8](#8-known-issues-gaps--inconsistencies).)

### 4.7 `render/renderer.ts` — canvas painter

Turns `World` + `Ants` into pixels. Exposes `resize`, `draw`, and `destroy`.

- **`resize(w, h)`** — computes an integer `cellSize` from the container's smaller dimension divided
  by the grid size (minimum 8 px), creates a `<canvas>`, handles high-DPI screens via
  `devicePixelRatio`, and allocates an `ImageData` buffer. The canvas background is `#2a2a2a`.
- **`draw(world, ants)`** — writes directly into the `ImageData` pixel buffer: each cell is coloured
  by terrain (empty grey, nest amber, food a green gradient by amount), then tinted by any pheromone
  present, then ants are drawn as small centred squares coloured by state. One `putImageData` blits
  the frame.

**Two techniques worth understanding:**

- **Grid lines for free.** Each cell is painted from pixel `1` to `cellSize-1`, leaving a 1-px border
  of the canvas background showing through. Those uncovered borders *are* the grid lines — no
  line-drawing loop needed, and the lines stay exactly 1 px at any zoom.
- **`ImageData` over per-cell `fillRect`.** Writing raw RGBA into one buffer and blitting once is far
  cheaper than thousands of individual draw calls, which matters as the grid grows.

### 4.8 `render/palette.ts` — colour constants

Defines a `PALETTE` object of named RGBA colours (empty, nest, food, pheromones, ant states).

> ⚠️ **Currently unused.** `renderer.ts` hardcodes its own RGB values inline instead of importing
> `PALETTE`. This is dead code / a second source of truth — see [§8](#8-known-issues-gaps--inconsistencies).

### 4.9 `stores/gameStore.ts` — lifecycle glue

The bridge between the pure simulation and the UI. `createGameStore(container)` wires up:

- the `GameState`, a `Renderer`, and a set of subscriber callbacks;
- an **`onTick`** callback that advances the simulation, redraws the canvas, and notifies subscribers;
- a public API: getters (`state`, `paused`, `gameOver`, `gameOverReason`), `togglePause`, `start`,
  `stop`, `startNewGame`, and `subscribe`.

*Why a plain-TS store instead of a Svelte store?* The simulation ticks ~every second and mutates big
typed arrays in place; funnelling that through Svelte's reactivity would be wasteful. The store keeps
the imperative loop plain and lets Svelte observe only what it needs.

> ⚠️ The `subscribe`/`notify` observer API exists but `App.svelte` doesn't currently call
> `subscribe` — see [§8](#8-known-issues-gaps--inconsistencies).

### 4.10 `App.svelte` — the UI shell

The only Svelte component. It:

- holds a `screen` state (`'menu' | 'playing' | 'gameover'`) and the `store`;
- on mount, creates the store, seeds a game, and stops the loop so the menu shows a static world;
- reacts to `store.gameOver` via `$effect` to flip to the game-over screen;
- exposes derived HUD values (`food`, `population`, `tick`) and a **derived stats table** that, each
  update, tallies living ants by state with average energy and age;
- renders the menu, the in-game HUD + world container + stats panel, or the game-over card.

`main.ts` is a three-line bootstrap that mounts `App` into `#app` from `index.html`.

---

## 5. Data Flow & Lifecycle

### 5.1 Startup

```
index.html loads /src/main.ts
   └─ mount(App)
        └─ App onMount:
             ├─ createGameStore(container)
             │    ├─ createInitialState()  → 32×32 world, 3×3 nest @ (16,16), 200 food, 5 ants
             │    └─ createRenderer(container) → resize() → draw()   (static first frame)
             ├─ store.startNewGame()   (starts the loop…)
             └─ store.stop()           (…then stops it, so the menu is paused)
```

The player sees the menu overlaid on a static initial frame. Clicking **Start** calls
`startNewGame()` again (fresh world, loop running) and sets `screen = 'playing'`.

### 5.2 One tick, end to end

Once running, `createSimLoop` calls `onTick` once per second of accumulated time. `onTick` →
`tick(state)` → `renderer.draw(...)` → `notify()`. The `tick(state)` pipeline:

```
tick(state):
  1. stepAnts(ants, world)          // move every ant, pick up / drop food, lay pheromones,
                                     //   age & energy, mark deaths, compact the arrays
  2. tickPheromones(world, tick)    // every 2 ticks: decay ×0.995, then diffuse
  3. spawnFoodTick(world, rng)      // 2% chance: add 20 food somewhere
  4. tick++                          // advance the clock
  5. if tick % 10 == 0:             // every 10 ticks:
        resources.food += collectFoodAtNest(state)   // sweep food out of the nest
  6. if ants.count == 0:            // extinction check
        gameOver = true, reason = "Colony collapsed"
```

### 5.3 The ant state machine

```
                 pick up food (on food cell)
   ┌──────────┐ ─────────────────────────────► ┌──────────┐
   │SEARCHING │                                 │ CARRYING │
   │   (0)    │ ◄───────────────────────────── │   (1)    │
   └──────────┘   drop food (reached nest)      └──────────┘
        │  ▲                                          │
 energy │  │ reached nest                             │ (both CARRYING and RETURNING
 < 20%  │  │ (become SEARCHING)                       │  head home via home pheromone)
        ▼  │                                          │
   ┌──────────┐                                       │
   │RETURNING │ ◄─────────────────────────────────────┘
   │   (2)    │
   └──────────┘

   Any state → DEAD (255) when energy <= 0 or age > 2000; removed by compaction.
```

### 5.4 Rendering

Rendering is **imperative and outside Svelte**: `onTick` calls `renderer.draw()` directly every tick,
so the canvas animates regardless of framework reactivity. Svelte only re-renders the HUD/stats text
when its derived values change.

---

## 6. Notable Design Decisions & Trade-offs

| Decision | Why | Trade-off / cost |
|---|---|---|
| **Pure `game/` layer, no framework imports** | Testable, reusable, fast hot loop | UI must bridge to it manually (the store). |
| **Typed arrays + Structure-of-Arrays** | Cache-friendly, no per-tick allocation, compact | Clunky ergonomics; deletion needs array compaction. |
| **Fixed-timestep accumulator** | Frame-rate-independent, deterministic pacing, catch-up | No catch-up cap → can over-run after a long pause (§8). |
| **Canvas `ImageData` (not DOM cells)** | Scales past the ~10k-element DOM wall; one blit per frame | Lower-level pixel maths; no free DOM hit-testing (hence the *planned* overlay). |
| **1-px inset for grid lines** | Crisp 1-px lines at any cell size, no extra draw calls | Grid-line colour is fixed to the canvas background. |
| **Plain-TS store, not a Svelte store** | Keeps the 1 Hz mutation loop out of Svelte's reactivity | Reactivity wiring is subtle and partly unused (§8). |
| **4-directional (von Neumann) movement** | Less jittery paths, cheaper weighting; supersedes the plan's "locked" 8-way decision | Ants can't move diagonally. |
| **3×3 nest** | Small, cosy starting colony that reads clearly at 32×32 | Little room; assumes a fixed centre (16,16). |
| **Weighted-random (roulette) movement** | Emergent, organic trail-following; avoids everyone taking one path | Non-deterministic; harder to unit-test exactly. |

---

## 7. Planned / Future Roadmap (not yet built)

These come from [`game-design.md`](../.kilo/plans/game-design.md) and are **not implemented**. Listed
so you know where the architecture is heading.

- **Economy:** Evolution Points (EVO) and prestige **Genome Tokens (GT)** alongside food. Today only
  `resources.food` exists.
- **Upgrade tree:** stats (speed, energy, lifespan, carry capacity), behaviours, colony (population
  cap, spawn rate), territory.
- **Grid tiers:** expand 32×32 → 64 → 96 → 128 → 160, reallocating typed arrays and copying the old
  world into the centre.
- **Prestige:** "Ascend Colony" reset that keeps Genome Tokens and a permanent upgrade tree.
- **Persistence:** versioned `localStorage` save schema (`SaveV1`), auto-save, offline catch-up,
  export/import.
- **Interaction overlay:** the invisible CSS-grid `<div>` over the canvas for hover/click/tooltips
  described in [`grid-design.md`](../.kilo/plans/grid-design.md), plus a `ResizeObserver` to make the
  grid responsive.

---

## 8. Known Issues, Gaps & Inconsistencies

Read this before relying on any subsystem. Each item notes *why it matters*; none is hard to fix.

1. **The colony always collapses (~tick 200).** Ants never reproduce and the nest never refuels their
   energy. Starting energy 100 − 0.5 per tick ⇒ death at ~tick 200, well before the 2000 age cap. So
   every game ends in "Colony collapsed" after a few minutes. *This is the single biggest gap: the
   core loop is not yet self-sustaining.* The obvious next features are ant reproduction at the nest
   and/or energy replenishment when an ant reaches the nest.

2. **Naturally-spawned food is invisible and unharvestable.** `spawnFoodTick` (`world.ts`) increments
   `world.food[idx]` but does **not** set `terrain = FOOD`. Both the renderer and the ant pickup logic
   key off `terrain === FOOD`, so this food is never drawn and never collected. Startup food works
   because `createWorld`'s `spawnFood` *does* set the terrain. *Fix: set `terrain = FOOD` in
   `spawnFoodTick` too.*

3. **Carrying/returning ants move twice per tick.** In `stepAnts`, `moveAnt` always moves the ant
   (food-weighted), and then a carrying/returning ant moves *again* via `followPheromoneHome`
   (home-weighted). The cell interaction (food pickup / nest drop) is only evaluated after the *first*
   move. This diverges from the plan's "choose one move based on state," can skip a nest deposit, and
   the second move isn't bounds-reverted. *Fix: choose a single state-appropriate move, then interact.*

4. **`palette.ts` is dead code.** `renderer.ts` hardcodes RGB values inline instead of importing
   `PALETTE`. Two sources of truth for colours; changing one won't change the other. *Fix: import and
   use `PALETTE` in the renderer.*

5. **Constants are duplicated.** `ANT_STATE`/`TERRAIN` live in `constants.ts` **and** are re-declared
   as `AntState`/`Terrain` in `types.ts`. The `types.ts` copies are effectively unused. *Fix: delete
   the duplicates and import from `constants.ts`.*

6. **Magic numbers for the nest and dead-ant sentinel.** The nest centre `(16, 16)` is hardcoded in
   both `createWorld` and `collectFoodAtNest`, and "dead" is the literal `255` rather than a named
   `DEAD` constant. If the grid size ever changes (grid tiers), these break silently. *Fix: derive the
   centre from `world.w/h` and add a `ANT_STATE.DEAD = 255` constant.*

7. **No interaction overlay or `ResizeObserver`.** `renderer.resize` runs only on init / new game and
   builds a brand-new `<canvas>` each call. There's no hover, click, tooltip, or response to window
   resizing — all of which the plans call for. *Fix: add the CSS-grid overlay and observe the
   container.*

8. **RNG is not actually centralised.** `rng.ts` wraps `Math.random`, but `world.ts` and `ant.ts` also
   call `Math.random()` directly. A seeded RNG (needed for reproducible saves/replays) can't be
   dropped in cleanly. *Fix: route all randomness through a single injectable RNG.*

9. **The store's `subscribe` API is unused.** `gameStore` exposes `subscribe`/`notify`, but
   `App.svelte` never subscribes — it wraps the store in `$state` and reads via `$derived`, relying on
   Svelte proxying the in-place mutations. Live HUD updating hinges on that subtlety, so verify it in
   the browser when touching this area. *Fix: either use `subscribe` explicitly or document the
   reactive contract.*

10. **No catch-up cap in the sim loop.** After a long pause (e.g. a backgrounded tab) the accumulator
    can hold many seconds, and the `while` loop will run every missed tick in one frame ("spiral of
    death" risk). *Fix: clamp the accumulator or the number of catch-up ticks per frame.*

11. **Tests are placeholders.** `tests/example.test.ts` and `tests/e2e/example.spec.ts` assert
    trivialities. There is no real coverage of the simulation. The pure `game/` layer is the ideal
    place to start testing.

---

## 9. Glossary

- **Tick** — one logical simulation step. Here the game targets **1 tick per second** (`TICK_RATE_HZ`).
- **Fixed-timestep accumulator** — a loop that advances the simulation in equal-sized steps regardless
  of the display frame rate, by banking real elapsed time and spending it one fixed step at a time.
- **`requestAnimationFrame` (RAF)** — the browser's "call me before the next repaint" hook; drives the
  loop.
- **Pheromone** — a scent value stored per cell. **Home pheromone** marks the way back to the nest;
  **food pheromone** marks where food was found. Ants bias their movement toward stronger pheromones.
- **Decay** — multiplying all pheromones by a factor < 1 each interval so trails fade over time.
- **Diffusion** — spreading each cell's pheromone toward its neighbours' average, turning point
  deposits into smooth gradients.
- **Structure-of-Arrays (SoA)** — storing each field of many entities in its own array (parallel
  arrays indexed by entity number), rather than an array of per-entity objects. Cache-friendly.
- **Typed array** — a fixed-type, fixed-size numeric buffer (`Uint8Array`, `Float32Array`, …). Compact
  and fast; no per-element object overhead.
- **von Neumann neighbourhood** — the 4 orthogonal neighbours (N/E/S/W). *This game uses this for
  movement.*
- **Moore neighbourhood** — the 8 surrounding neighbours (orthogonal + diagonal). *Not used for
  movement anymore.*
- **Roulette-wheel selection** — pick an option at random with probability proportional to its weight
  (like a wheel whose slice sizes are the weights).
- **Compaction** — after some ants die, shifting the surviving entries down to keep the SoA arrays
  densely packed `[0 .. count-1]`.
- **Nest** — the 3×3 home block at the grid centre where ants deposit food and food is collected into
  the colony resource.
- **Forage** — an ant's search-for-and-retrieve-food behaviour.
- **DPR (device pixel ratio)** — how many physical pixels map to one CSS pixel; multiplied into the
  canvas size so rendering stays crisp on high-DPI screens.
- **`ImageData`** — a raw RGBA pixel buffer for a canvas; the renderer writes pixels into it and blits
  it in one call.
- **Dirty flag** — a "state changed, needs redraw" boolean used to skip redundant repaints (referenced
  in the plans; the current renderer simply redraws every tick).
- **Idle / incremental game** — a genre built around numbers steadily growing, upgrades, and progress
  that continues (or accrues) while the player is away.
- **Prestige** — an idle-game reset that trades current progress for a permanent multiplier/currency
  (here, **Genome Tokens**). *Planned, not built.*
- **EVO (Evolution Points)** — a planned upgrade currency. **GT (Genome Tokens)** — a planned prestige
  currency. Only **food** exists today.
- **Grid tier** — a planned world-size upgrade level (32×32 up to 160×160).

---

*This document reflects the code at the time of writing. When you change a subsystem, update the
matching section — especially [§8](#8-known-issues-gaps--inconsistencies), which should shrink as the
prototype matures.*
