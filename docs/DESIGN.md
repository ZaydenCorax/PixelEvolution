# PixelEvolution — Design & Architecture

**Audience:** developers new to this codebase (onboarding reference).
**Status of the game:** early, playable **prototype** — the core simulation loop is
**self-sustaining** (ants refuel and the colony reproduces) and the main screen now implements the
**"Instrument" dashboard layout** from `DESIGN_TEMPLATE.dc.html`, but the idle/economy layer behind
that UI's scaffolded slots is still unbuilt.
**Status of this document:** describes the code **as it actually exists today**, with a clearly
separated roadmap for what is planned but not yet built, and an honest list of known gaps.

> How to read this doc: sections 1–6 explain what is really in the repo right now and *why* it is
> built that way. Section 7 is the future vision. Section 8 is a candid list of rough edges — read
> it before you trust any single subsystem to "just work" — and a log of what was recently resolved.
> Section 9 is a glossary; if a term looks unfamiliar, jump there first.

---

## 1. Project Overview

PixelEvolution is a browser game about a colony of pixel "ants" living on a small grid. Ants wander
the grid looking for food, pick it up, carry it back to a central **nest**, and drop **pheromone**
trails that bias where other ants walk. Food collected at the nest is banked as a colony resource
that keeps ants alive (refuelling) and spawns new ones (reproduction). The visual style is
deliberately Conway's-Game-of-Life-like: a crisp square grid of coloured cells drawn on an HTML5
canvas. On top of that base, ants render as **bright haloed discs** (white searching / lime carrying
/ orange returning) and pheromones as **shrinking, fading breadcrumb squares** in two hues (blue =
home trail, pink = food trail), so agents never blur into their trails; a hover tooltip inspects
individual cells.

The long-term intent (see [`.kilo/plans/game-design.md`](../.kilo/plans/game-design.md)) is an
**idle / incremental** game — gather resources, buy upgrades, expand territory, and "prestige" for
permanent bonuses. **None of that economy layer exists yet.** What is implemented today is the
foundational simulation: a world, ants, pheromones, food, a self-sustaining energy/reproduction
loop, a fixed-rate tick loop with a **1×/2×/4× speed multiplier**, canvas rendering with a
responsive resize + hover overlay, and a Svelte UI in the "Instrument" dashboard layout — a top
resource bar, a playback/seed/legend rail on the left, the grid dominant in the middle, and a
colony-readout rail on the right (menu → playing → game over). The dashboard already **reserves
space for the economy**: disabled EVO/GT currency chips and a locked Upgrades shelf are scaffolded
in place, clearly marked with `TODO(economy)` comments.

### The three plan documents (and how they relate to reality)

The repo carries three historical design docs under [`.kilo/plans/`](../.kilo/plans/). They were
written at different times and **disagree with each other and with the code**. Treat them as
history, not as the source of truth — this document is the current reference.

| Plan file | What it is | Relationship to the code |
|---|---|---|
| `initial-game-design.md` | The MVP scope ("ants walk, find food, bring it home") | **Closest to reality.** The current code is roughly this, plus a self-sustaining energy/reproduction loop. |
| `game-design.md` | The grand vision (economy, upgrades, prestige, grid tiers, save/load) | **Mostly unbuilt** — aspirational roadmap. |
| `grid-design.md` | A generic, framework-agnostic spec for a reusable canvas grid + interaction overlay | **Partly built** — canvas rendering, a `ResizeObserver`, and a hover/tooltip overlay exist; click/selection actions do not. |

Where the code deliberately diverges from those plans (for example 4-directional movement and a 3×3
nest), this document treats the code as correct and explains the reasoning.

One further reference lives at the repo root: [`DESIGN_TEMPLATE.dc.html`](../DESIGN_TEMPLATE.dc.html),
the **visual mockup of the main simulation screen** (option 1A, "Instrument"). Unlike the three plan
documents, this one **is implemented**: the current UI layout, colours, typography, and rendering
style follow it precisely, so treat it as the visual source of truth for the main screen.

---

## 2. Tech Stack & Build

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | [`tsconfig.json`](../tsconfig.json) — `strict: true`, `noEmit` (Vite/Svelte handle transpiling). |
| UI framework | Svelte 5 (runes mode) | [`svelte.config.js`](../svelte.config.js) sets `runes: true`. Only used for the shell UI. |
| Build tool | Vite 6 | [`vite.config.ts`](../vite.config.ts). Dev server auto-opens the browser. |
| Rendering | HTML5 Canvas 2D | Via 2D draw calls (`fillRect`/`arc`/shadow glow) — see [§5.4](#54-rendering). |
| State | Plain-TS store module | [`src/stores/gameStore.ts`](../src/stores/gameStore.ts) — *not* a Svelte store. |
| Tests | Vitest (unit) + Playwright (E2E) | Real unit tests cover the pure `game/` layer ([`tests/`](../tests/)); the Playwright E2E test is still a placeholder. |

**Runtime dependencies: only Svelte.** Everything else (Vite, TypeScript, ESLint, Playwright, etc.)
is a dev dependency. There is no UI component library; all CSS is hand-written. This keeps the
shipped bundle tiny, which matches the plan's "< 100 KB gzipped" goal. The two UI typefaces
(**Space Grotesk** for interface text, **JetBrains Mono** for numeric readouts) are loaded from the
Google Fonts CDN in `index.html`, with system-font fallbacks if the CDN is unreachable.

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
                                                  │  composes src/ui/ (TopBar,
                                                  │           LeftRail, RightRail)
                                                  │  creates
                                                  ▼
                                         src/stores/gameStore.ts   (glue / lifecycle)
                                          │                    │
                                 owns the │                    │ owns the
                            simulation ▼                       ▼ renderer
                   ┌──────────────────────────────┐   ┌───────────────────────────┐
                   │        game/ (pure TS)        │   │        render/            │
                   │  simulation.ts  (tick loop)   │   │  renderer.ts  (canvas)    │
                   │  world.ts       (grid state)  │   │  palette.ts   (colours)   │
                   │  ant.ts         (agents)      │   └───────────────────────────┘
                   │  constants.ts   (tuning)      │
                   │  types.ts       (data shapes) │
                   │  rng.ts         (randomness)  │
                   └──────────────────────────────┘
```

**Why this split?**

- **`game/` is pure and framework-free.** It has no imports from Svelte or the DOM. That means the
  entire simulation can be unit-tested in isolation (see [`tests/`](../tests/)), reused with a
  different renderer, or run head-less. It also keeps the per-tick hot loop free of any framework
  reactivity overhead.
- **The renderer reads state; it does not own it.** Every frame it is handed the current `World` and
  `Ants` and paints them. It is a "dumb" projection of state onto pixels.
- **Svelte owns only the shell.** Which screen is showing, the top resource bar, the playback and
  colony rails, the hover tooltip — the reactive, human-facing parts, split into presentational
  components under `src/ui/` ([§4.11](#411-ui--the-dashboard-components)). The high-frequency
  simulation deliberately lives *outside* Svelte's reactivity system, and the UI observes it via an
  explicit subscription ([§4.9](#49-storesgamestorets--lifecycle-glue)).

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
carried[   0   ,   5   ,   2   , ... ]   Uint8Array   (food carried, 0..ANT_CARRY_CAPACITY)
```

The `Ants` struct additionally carries two scalars: **`count`** (the number of live ants, always the
dense prefix `[0, count)`) and **`capacity`** (the allocated length of every array). The arrays are
allocated once to `capacity` (= `ANT_POP_CAP`) so that ants born later via reproduction have room
without reallocating — see [§4.5](#45-gameantts--the-agents).

**Why SoA and typed arrays?**

- **Cache efficiency.** Iterating one field over all ants walks contiguous memory, which is friendly
  to the CPU cache. The plan sets a performance budget (60 fps rendering, thousands of cells), and
  this layout is the standard way to hit it.
- **No per-tick allocation.** The arrays are allocated once. The hot loop mutates them in place
  rather than creating objects every tick, avoiding garbage-collection pauses.
- **Compact.** `Uint8Array`/`Float32Array` are far smaller than JS objects, which matters when the
  planned grid tiers reach 160×160 (~26k cells).

The trade-off is ergonomics: there is no `ant.x`, only `ants.x[i]`, and "deleting" an ant means
compacting the arrays (see [§4.5](#45-gameantts--the-agents)).

---

## 4. Key Components & Responsibilities

Each subsection covers one file: what it owns, its notable functions, and a *why* note.

### 4.1 `game/constants.ts` — tuning knobs

All simulation numbers live in one place: tick rate, catch-up cap, pheromone duration, movement
weights, food spawn, ant energy/lifespan, colony self-sustain (refuel + reproduction), nest geometry,
and the `TERRAIN`, `ANT_STATE`, and `ANT_MOVE_DIRECTIONS` enums.

**Notable constants (current values):**

| Constant | Value | Meaning |
|---|---|---|
| `TICK_RATE_HZ` / `TICK_INTERVAL_MS` | `1` / `1000` | One logical tick per second. |
| `MAX_CATCHUP_TICKS` | `5` | Max ticks the sim loop will replay in one frame after a pause ([§4.6](#46-gamesimulationts--the-orchestrator-and-clock)). |
| `MAX_FOOD_PER_CELL` | `255` | Per-cell food clamp (matches `Uint8Array`). |
| `NEST_RADIUS` | `1` | Nest half-extent → a 3×3 block around the derived centre. |
| `PHEROMONE_DURATION_TICKS` | `20` | Baseline lifetime of a pheromone marker; may grow via future upgrades. |
| `PHEROMONE_DECREMENT` | `1/20` | Linear decay subtracted from each marker per tick (no diffusion). |
| `WEIGHT_BASE` / `WEIGHT_TARGET_CELL` | `1` / `50` | Roulette weight floor; bonus for an adjacent goal (food/nest) cell. |
| `WEIGHT_TRAIL_ON` / `WEIGHT_TRAIL_AGE` | `10` / `20` | On-trail bonus; extra weight scaled by crumb age (bias toward origin). |
| `WEIGHT_HOMING` | `25` | Fallback nudge toward the nest when no home trail is nearby. |
| `WEIGHT_FOOD_SENSE` | `25` | Nudge a searching ant toward the nearest food within its sensing footprint. |
| `FOOD_SENSE_OFFSETS` | 12 cells | A searching ant's smell footprint: the 8 surrounding cells + the 4 cardinal cells two steps out. |
| `ANT_CARRY_CAPACITY` | `5` | Max food an ant carries before it must drop the load at the nest. |
| `ANT_STATE` | `SEARCHING 0, CARRYING 1, RETURNING 2, DEAD 255` | Ant state enum, including the named dead sentinel. |
| `ANT_MOVE_DIRECTIONS` | N,E,S,W | 4-direction (von Neumann) movement set. |
| `STARTING_ANTS` | `3` | Ants at colony start. |
| `STARTING_FOOD` | `200` | Food scattered on the grid at start. |
| `ANT_ENERGY_COST` | `1` | Energy spent per ant per tick. |
| `ANT_INITIAL_ENERGY` | `100` | Starting/`max` energy (also the refuel cap). |
| `ANT_LIFESPAN` | `2000` | Age (ticks) after which an ant dies of old age. |
| `ANT_LOW_ENERGY_FRACTION` | `0.2` | Fraction of full energy below which an ant heads home (RETURNING) and recovers. |
| `ANT_POP_CAP` | `15` | Population cap; also the ant-array `capacity`. |
| `ANT_REFUEL_INTERVAL_TICKS` | `2` | Refuel cadence for an ant sitting on the nest. |
| `ANT_REFUEL_FOOD_COST` | `1` | Colony food spent per refuel event. |
| `ANT_REFUEL_ENERGY_PER_FOOD` | `10` | Energy gained per refuel event (clamped to the cap). |
| `ANT_REPRODUCE_INTERVAL_TICKS` | `20` | How often the colony may spawn a new ant. |
| `ANT_REPRODUCE_FOOD_COST` | `20` | Colony food spent per birth. |

*Why 4 directions and not 8?* Fewer choices per step make ant paths less jittery and keep the
weighted-direction maths cheaper; this superseded an earlier "8-directional (Moore)" decision from
the plans.

### 4.2 `game/types.ts` — data shapes

Defines the `World`, `Ants`, and `GameState` interfaces (the typed-array layouts from
[§3.2](#32-data-oriented-design-typed-arrays--structure-of-arrays)). `Ants` includes both `count`
(live ants) and `capacity` (allocated length), and a per-ant `carried` array (food in hand,
`0..ANT_CARRY_CAPACITY`). `GameState` bundles everything the simulation needs:
`tick`, `resources.food`, the `world`, the `ants`, and the `gameOver` / `gameOverReason` / `paused`
flags.

This file defines **only data shapes** — the `ANT_STATE` and `TERRAIN` enums live solely in
`constants.ts` (the single source of truth). The previously duplicated `AntState` / `Terrain`
declarations have been removed.

### 4.3 `game/rng.ts` — centralised, injectable randomness

All simulation randomness flows through this module rather than calling `Math.random()` directly.

- **`random()`** — a float in `[0, 1)` from the active source.
- **`randomInt(max)`** — an integer in `[0, max)` from the active source.
- **`setRandomSource(fn)` / `resetRandomSource()`** — swap the active source, or restore the default.
- **`createSeededRandom(seed)`** — a deterministic **mulberry32** PRNG: the same seed yields the same
  stream. Pass its result to `setRandomSource` for a fully reproducible run.

The **default** source is a mulberry32 generator seeded from the clock (`Date.now()`): a
deterministic engine with a fresh stream each load. *Why centralise?* So reproducible saves,
replays, and deterministic tests are possible by injecting a fixed seed — `world.ts` and `ant.ts`
now draw exclusively from `random()` / `randomInt()`.

### 4.4 `game/world.ts` — the grid

Owns the grid and everything that happens to cells. Key functions:

- **`nestCenter(world)`** — derives the nest centre from the grid size (`⌊w/2⌋, ⌊h/2⌋`) rather than
  hardcoding it, so the nest stays correct if the grid is ever resized. Used by `createWorld`,
  `ant.ts`, and `simulation.ts` so they can't drift out of sync.
- **`createWorld()`** — allocates the four typed arrays for a **32×32** grid, stamps a nest of
  `NEST_RADIUS`-extent (3×3) at the derived centre, and scatters `STARTING_FOOD` (200) units of food
  across non-nest cells.
- **`spawnFood(...)`** (internal, used at startup) — randomly deposits food, setting a cell's
  `terrain` to `FOOD` when it first drops food there.
- **`spawnFoodTick(world)`** — the per-tick natural food spawn (2% chance). Like `spawnFood`, it
  sets **`terrain = FOOD`** on a newly-seeded cell, so naturally-spawned food is both drawn and
  harvestable. Draws its randomness from the centralised RNG.
- **`pickupFood` / `dropFood`** — move food between an ant and a cell, clamped to `[0, 255]`.
  `pickupFood` also reverts an emptied cell to **`EMPTY`** terrain, so depleted food stops being
  drawn/treated as food.
- **`depositPheromone`** — adds to a cell's home/food pheromone, clamped to `1`. Ants lay at full
  strength (`1`), so every fresh crumb starts at `1.0` and its later value reflects only its age.
- **`tickPheromones(world)`** — **every tick**, subtracts `PHEROMONE_DECREMENT` (`1/20`) from every
  pheromone cell, floored at `0`. This is a **linear** decay: a marker laid at `1.0` fully fades after
  `PHEROMONE_DURATION_TICKS` (20) ticks, so its remaining value is proportional to its remaining life.
  There is **no diffusion** — a marker stays exactly on the cell where it was laid.

*Why linear decay and no diffusion?* Pheromones are **breadcrumb trails**: an ant lays one crumb per
step along its whole route ([§4.5](#45-gameantts--the-agents)). Linear decay makes a crumb's **age
readable from its value** — crumbs laid earlier (near the trail's origin) have decayed more than
crumbs laid later — which is exactly the gradient other ants follow back to the origin, and which the
renderer maps to a **shrinking marker**. Outward spreading is deliberately *not* modelled (it would
blur that gradient); it is reserved for a future in-game upgrade ([§7](#7-planned--future-roadmap-not-yet-built)).

*Why keep `terrain` and `food` in sync?* Both the renderer and the ant pickup logic key off
`terrain === FOOD`. Setting the terrain when food appears and clearing it when food is exhausted
keeps that single flag authoritative.

### 4.5 `game/ant.ts` — the agents

Owns ant creation, births, and per-tick behaviour.

- **`createAnts(count, world)`** — allocates the SoA arrays to `capacity = max(count, ANT_POP_CAP)`
  and seeds `count` ants via `spawnAnt`. `count` tracks the live prefix.
- **`spawnAnt(ants, world)`** — appends one fresh ant on a random nest cell (scattered across the
  nest block, each `SEARCHING`, full energy, age 0, carrying 0) if there is capacity; returns `false`
  when full. Used both at startup and for reproduction.
- **`stepAnts(ants, world, resources, tick)`** — the per-tick update for every ant. In order, for
  each live ant it:
  1. Ages it; if `energy <= 0` **or** `age > ANT_LIFESPAN` (2000), marks it `DEAD`.
  2. **Recover in place (depleted ants only):** only a **`RETURNING`** ant recovers — a state entered
     just when energy falls below `ANT_LOW_ENERGY_FRACTION` (20%) of full (step 6). A healthier ant
     never rests; it keeps foraging. A `RETURNING` ant that is home on the nest and below full energy
     **stays put** — no move, **no energy cost** — and, on a refuel tick (every
     `ANT_REFUEL_INTERVAL_TICKS`), converts `ANT_REFUEL_FOOD_COST` (1) colony food into
     `ANT_REFUEL_ENERGY_PER_FOOD` (10) energy (clamped to the cap). It parks like this until **full**,
     then flips back to `SEARCHING` and leaves. If the colony has no food to spare it doesn't sit idle
     — it flips to `SEARCHING` and forages so it can go find food itself. Recovering costs no upkeep,
     so energy isn't wasted while topping up.
  3. Otherwise subtracts `ANT_ENERGY_COST` (1) energy and makes **one** state-weighted move
     (`moveAnt`): searching ants steer toward food, carrying/returning ants steer home. Reverts the
     move if it would leave the grid (ants "bounce" off edges).
  4. Interacts with the destination cell:
     - **On food** (any state) with spare capacity → picks up food up to `ANT_CARRY_CAPACITY` (5).
       Collecting takes priority over returning, so even a carrying/returning ant tops up en route. A
       `SEARCHING` ant that grabs its first food flips to **CARRYING**.
     - **On the nest** → drops its **whole load** (up to 5). A **CARRYING** ant becomes **SEARCHING**;
       a **RETURNING** (depleted) ant stays `RETURNING` so it recovers (step 2) before foraging again.
  5. **Lays one breadcrumb** at the destination cell, based on its state *after* the interaction: a
     **CARRYING** ant lays a **food** trail (origin = the food cell where it flipped to CARRYING);
     anyone else (**SEARCHING**/**RETURNING**) lays a **home** trail (origin = the nest). Because
     reaching the nest flips CARRYING → SEARCHING first, an ant **stops laying its food trail the
     moment it gets home**. This continuous laying — one crumb per step — is what builds the trail.
     **No trail is laid while standing on a nest cell** (home included): otherwise the nest block
     saturates with home pheromone and the anti-backtracking rule sweeps searching ants outward, away
     from food sitting next to the nest.
  6. If a SEARCHING ant's energy is below `ANT_LOW_ENERGY_FRACTION` (20%) of full, switch it to
     **RETURNING** — this is the sole trigger for heading home to recover (step 2).
  - Finally, **`compactAnts`** removes dead ants by shifting live entries down and updating `count`.
- **`getWeightedDirs(world, x, y, toNest?)`** — the movement brain. For each of the 4 neighbours it
  computes a weight from named constants, then does **roulette-wheel selection** (via the central RNG)
  — pick a direction with probability proportional to its weight. A **forager** (`toNest = false`,
  i.e. SEARCHING) is steered toward food; a **homing** ant (`toNest = true`, i.e. CARRYING/RETURNING)
  toward the nest. Each neighbour's weight is `WEIGHT_BASE` (1), plus `WEIGHT_TARGET_CELL` (50) if it
  is the goal cell (food when foraging, nest when homing), plus a **trail term** for the relevant
  trail (`pheromoneFood` when foraging, `pheromoneHome` when homing): if the crumb value `p > 0`,
  `WEIGHT_TRAIL_ON` (10) `+ WEIGHT_TRAIL_AGE` (20) `* (1 - p)`.
  - *Following a trail to its origin.* The origin end of a trail is the **oldest / lowest-value** end
    (laid first, decayed most). The `(1 - p)` factor makes **older crumbs weigh more**, so the ant is
    biased down the freshness gradient toward the origin — the food cell for a food trail, the nest
    for a home trail — while `WEIGHT_TRAIL_ON` keeps it on the trail. Off-trail cells keep only the
    base weight, preserving exploration.
  - *Homing fallback.* If a homing ant has **no home pheromone** on any neighbour, it adds
    `WEIGHT_HOMING` (25) to whichever neighbours reduce its Manhattan distance to the nest centre — so
    it still converges home without a trail. This is a bias, not an override: roulette still applies.
    A `RETURNING` ant both lays *and* would follow the home trail, so it can't ride its own trail —
    it always uses this geometric homing instead.
  - *Food sensing.* The forager's analogue of the homing fallback. A SEARCHING ant smells the nearest
    food cell within a small footprint — the 8 surrounding cells plus the 4 cardinal cells two steps
    out (`FOOD_SENSE_OFFSETS`, 12 cells) — and adds `WEIGHT_FOOD_SENSE` (25) to whichever neighbours
    reduce its Manhattan distance to it. This lets an ant **re-lock onto nearby food after the food
    trail has decayed**, so food next to the nest keeps being harvested instead of being abandoned the
    first time an ant strays off it. A sensed-food step also overrides anti-backtracking (below).
  - *Anti-backtracking.* An ant **never steps onto a cell that already carries the trail it is
    currently laying** (home for SEARCHING/RETURNING, food for CARRYING): such cells are dropped from
    the candidate set, so the ant moves onto fresh ground instead of re-walking its own trail. Two
    overrides: a goal cell (food/nest) is never excluded, a cell that **also** carries the ant's
    *goal* trail (an overlap of both pheromones) is never excluded, and (for a searching ant) a step
    toward **sensed food** is never excluded — following the trail or scent toward the current
    objective wins over avoiding the laid one. If avoidance would leave no legal move at all, the full
    neighbour set is restored (an ant boxed in by its own trail can still move).
  - *Nest avoidance (searching only).* A SEARCHING ant also excludes **nest cells** — it has no
    business on the nest while foraging, so it routes around the nest block (and promptly walks off it
    if it was parked there refuelling). A homing ant is unaffected, since for it the nest is the goal.

*Why weighted-random instead of "always go to the best cell"?* Randomness keeps ants exploring and
prevents them all funnelling into a single path, which is what makes emergent trail-following look
organic. The weights are named constants so future gene upgrades can tune them per-colony.

*Ants move exactly once per tick.* Movement weighting is chosen up front from the ant's state, so a
single `moveAnt` call both steers correctly and interacts with the right cell — carrying/returning
ants no longer take a hidden second, un-bounds-checked step.

### 4.6 `game/simulation.ts` — the orchestrator and clock

Ties the world and ants together and drives time.

- **`createInitialState()`** — builds a fresh `GameState` (world + `STARTING_ANTS` (3) ants + zeroed
  resources).
- **`tick(state)`** — one logical step (no-op while `paused` or `gameOver`):
  1. `stepAnts(ants, world, resources, tick)` — move/interact/lay a breadcrumb/refuel every ant.
  2. `tickPheromones(world)` — linear decay of every marker (each tick; no diffusion).
  3. `spawnFoodTick(world)` — 2% chance to seed food.
  4. `tick++`.
  5. Every 10 ticks: sweep food out of the nest into `resources.food` (`collectFoodAtNest`, which
     scans the nest block derived from `nestCenter`).
  6. **Reproduction:** every `ANT_REPRODUCE_INTERVAL_TICKS` (20) ticks, if `resources.food >=`
     `ANT_REPRODUCE_FOOD_COST` (20) and `ants.count < ANT_POP_CAP` (15), spawn one ant and spend the
     food.
  7. If `ants.count === 0`, set `gameOver` with reason `"Colony collapsed"`.
- **`createSimLoop(onTick)`** — the **fixed-timestep accumulator** loop on `requestAnimationFrame`.
  It banks real elapsed milliseconds and calls `onTick` once per whole tick interval. That interval
  is `TICK_INTERVAL_MS / speed`, where `speed` is a **playback multiplier** set via the loop's
  **`setSpeed(multiplier)`** (1× = 1000 ms; the UI offers 1×/2×/4×). Before draining the accumulator
  it **clamps the backlog to `MAX_CATCHUP_TICKS` (5)** worth of time, so a long pause (e.g. a
  backgrounded tab) can't trigger a burst of thousands of ticks in one frame (the classic "spiral of
  death"). The very first frame after `start()` is seeded with exactly **one** tick's worth of time
  at the current speed, so the sim starts immediately without bursting `speed` ticks at once. *Why
  fixed-timestep?* It decouples simulation speed from the display's frame rate, so the game runs the
  same on a 60 Hz or 144 Hz monitor and can catch up after a delayed frame. *Why scale the interval
  rather than tick multiple times?* One knob changes pacing while every per-tick rule (decay,
  refuel cadence, reproduction interval) keeps its meaning — 2× is simply the same colony living
  twice as fast in wall-clock terms.

### 4.7 `render/renderer.ts` — canvas painter

Turns `World` + `Ants` into pixels, in the visual style of `DESIGN_TEMPLATE.dc.html`. Exposes
`resize`, `draw`, `clientToCell`, and `destroy`.

- **`resize(w, h)`** — computes an integer `cellSize` from the container's smaller dimension divided
  by the grid size (minimum 6 px), and (re)sizes a **reused** `<canvas>` element. High-DPI screens
  are handled correctly: the backing store is the CSS size × `devicePixelRatio` and every draw call
  goes through a `setTransform(dpr, …)` scale, so rendering is crisp at any DPR. Reusing the canvas
  across calls makes it cheap for the `ResizeObserver` to invoke on every container resize.
- **`draw(world, ants, hover?)`** — paints the frame with 2D draw calls, back to front:
  1. **Background + empty cells** — the canvas is filled `PALETTE.bg`, then each cell is inset-filled
     `PALETTE.cellEmpty`, leaving 1-px grid lines (see below).
  2. **Pheromone breadcrumbs** — each marker is a **centred square that shrinks and fades with its
     remaining value** (`side = cellSize × (0.2 + 0.55·v)`, `alpha = 0.22 + 0.55·v`), tinted blue
     (home) or pink (food), with a soft same-hue glow (`shadowBlur` scaled by `v`). Nest and food
     cells own their look, so crumbs are skipped there; when both trails share a cell, the larger
     square is drawn first so the smaller stays visible on top.
  3. **Solid terrain** — food cells as a green gradient by amount; the nest block amber, with a
     lighter core at its centre cell.
  4. **Ants as bright discs** — a dark halo ring, a state-coloured body (white searching / lime
     carrying / orange returning), and a small specular glint. Discs + halo are what keep ants
     legible above the crumb squares (the design template's "ants read as bright dots" rule).
  5. **Hover outline** — if a `hover` cell is passed, it is stroked with an amber outline, marking
     the cell the tooltip is inspecting.

  All colours come from `PALETTE` ([§4.8](#48-renderpalettets--colour-constants)).
- **`clientToCell(clientX, clientY)`** — maps a viewport (pointer) coordinate to a grid cell, or
  `null` if outside the canvas. This is what powers the hover tooltip.

**Two techniques worth understanding:**

- **Grid lines for free.** Each cell is painted from pixel `1` to `cellSize-1`, leaving a 1-px border
  of the canvas background showing through. Those uncovered borders *are* the grid lines — no
  line-drawing loop needed, and the lines stay exactly 1 px at any zoom.
- **2D draw calls over `ImageData`.** The renderer previously wrote raw RGBA into an `ImageData`
  buffer and blitted once. That was cheap but limited to hard-edged squares; the redesign's
  anti-aliased discs, alpha-blended crumbs, and glows are natural `arc`/`shadowBlur` operations, so
  the renderer switched to plain draw calls. At 32×32 (~1k cells + ≤15 ants) the per-frame call count
  is trivial; if the planned grid tiers (up to 160×160) make it a bottleneck, batching or a hybrid
  `ImageData` base layer can be reintroduced under the same `Renderer` interface.

### 4.8 `render/palette.ts` — colour constants

Defines a `PALETTE` object of named colour tokens taken from `DESIGN_TEMPLATE.dc.html`: background,
empty cell, nest (+ lighter core), food low/high, pheromone hues, ant states, ant halo/specular, and
the hover outline. **`renderer.ts` imports and uses `PALETTE`** as its single source of truth for
colour. Because the renderer now draws with the 2D API, most entries are CSS colour strings; the two
exceptions match how they're consumed — `foodLow`/`foodHigh` are RGB tuples (the food gradient is a
per-channel `lerp` between them) and the pheromone hues are raw `"r,g,b"` strings so the renderer
can compose a per-crumb alpha into an `rgba(…)` value.

### 4.9 `stores/gameStore.ts` — lifecycle glue

The bridge between the pure simulation and the UI. `createGameStore(container)` wires up:

- the `GameState`, a `Renderer`, a set of subscriber callbacks, and the run's **seed**: on creation
  (and on every `startNewGame`) the store rolls a 6-digit seed — or accepts one — and injects
  `createSeededRandom(seed)` into `rng.ts` **before** building the world, so a given seed reproduces
  the exact same run;
- a **`ResizeObserver`** on the container that re-fits and redraws the canvas whenever the container/
  window changes size (it also fires once on observe to fit the initial size);
- an **`onTick`** callback that advances the simulation, redraws the canvas, and notifies subscribers;
- a public API:
  - getters — `state`, `paused`, `gameOver`, `gameOverReason`, **`seed`** (the current run's seed),
    **`speed`** (the playback multiplier), and **`generation`** (a per-session run counter shown in
    the top bar; a placeholder until the evolution layer gives "generation" real meaning);
  - transport — `togglePause`, **`step()`** (advances exactly one tick past `tick()`'s pause guard
    and leaves the sim paused, so each press moves time by one tick), **`setSpeed(multiplier)`**
    (forwards to the sim loop), `start`, `stop`;
  - runs — **`startNewGame(seed?)`**: stops the loop, re-seeds the RNG (fresh roll if no seed is
    given), rebuilds the state, bumps `generation`, redraws, and restarts the loop. The UI uses this
    for **Start**, **restart** (passing the current seed to replay the same world), **reroll**
    (no seed), and **seed editing** (passing the typed seed);
  - inspection — **`cellAt(clientX, clientY)`** (delegates to the renderer's `clientToCell`, for
    hover) and **`setHover(cell | null)`** (stores the inspected cell and redraws, so the renderer
    can outline it);
  - `subscribe`, and **`destroy()`** (stops the loop, disconnects the observer, tears down the
    renderer, clears listeners).

*Why a plain-TS store instead of a Svelte store?* The simulation ticks at 1–4 Hz (depending on the
speed multiplier) and mutates big typed arrays in place; funnelling that through Svelte's reactivity
would be wasteful. The store keeps the imperative loop plain and exposes an explicit `subscribe` API
for the UI to observe.

### 4.10 `App.svelte` — the UI shell

The root Svelte component. It owns the screens and the dashboard **frame** — a bordered, rounded
1200×760 panel (shrinking responsively) centred on a radial-gradient page — and composes the three
`src/ui/` rails around the grid ([§4.11](#411-ui--the-dashboard-components)). It:

- holds a `screen` state (`'menu' | 'playing' | 'gameover'`) and the `store`;
- on mount, creates the store and **subscribes** to it (each notify bumps a reactive `version`
  counter); the store draws its freshly-seeded world once on creation, so the menu shows a static
  frame without the loop running. On teardown it unsubscribes and calls `store.destroy()`;
- drives all live values off `version` — `food`, `population`, `tick`, `paused`, `speed`, `seed`,
  `generation`, the per-state colony stats (count + average energy/age per `SEARCHING` / `CARRYING`
  / `RETURNING`), the game-over transition, and the hover tooltip all recompute each tick without
  relying on Svelte proxying the in-place array mutations;
- passes those values *down* to the `ui/` components as plain props and receives user intent *up* as
  callbacks (`onTogglePause`, `onStep`, `onSetSpeed`, `onSeedCommit`, `onReroll`, `onRestart` —
  restart replays the current seed; reroll draws a fresh one), keeping the rails purely
  presentational;
- renders a **hover overlay** over the grid area: `mousemove` maps the cursor to a cell via
  `store.cellAt`, feeds it to `store.setHover` (which makes the renderer outline the cell), and a
  floating **cell-inspector tooltip** — monospace, amber-titled `cell (x, y)`, per the design
  template — shows the cell's terrain, food amount, both pheromone levels (`home φ` / `food φ`),
  and how many ants are on it;
- renders the menu and game-over overlays as dark, blurred backdrops with a centred card in the same
  design language (mono kicker, amber primary button); the game-over card also shows the run's seed
  so a notable colony can be replayed.

`main.ts` is a three-line bootstrap that mounts `App` into `#app` from `index.html`.

### 4.11 `ui/` — the dashboard components

Three presentational Svelte components (plus `ui/types.ts` for the shared `StateStat` shape)
implement the "Instrument" layout. They hold no game state — everything arrives as props, and every
control fires a callback — so they can be restyled or rearranged without touching the store or
simulation.

- **`TopBar.svelte`** — the 54-px resource bar: brand mark + `colony · gen N` label, the **food**
  currency chip, and `Tick` / `Pop n/cap` readouts on the right. It also renders two **disabled
  EVO / GT currency chips with "SOON" badges** — scaffolds (marked `TODO(economy)`) that reserve the
  top-bar slots for the planned currencies ([§7](#7-planned--future-roadmap-not-yet-built)).
- **`LeftRail.svelte`** (214 px) — the **playback transport** (Pause/Play primary button,
  single-step, restart-colony), the **1×/2×/4× speed segment**, the **seed panel** (the current seed
  shown in mono, click-to-edit with Enter/blur commit and Escape cancel — invalid input is rejected
  and keeps the old seed — plus a "reroll for a fresh world" action), and the **legend** mapping
  every on-grid mark (nest, food, the three ant states, both trail hues) to its colour.
- **`RightRail.svelte`** (256 px) — the **colony readout**: one row per ant state with a dot in the
  ant's disc colour, a live count, an **average-energy bar** (the searching row's bar is blue per
  the template — its white dot colour would wash out on the dark rail), and `e`/`age` micro-stats;
  a **population meter** (`n / cap` with an amber fill); and the **locked Upgrades shelf** — a
  dashed, dimmed panel listing placeholder upgrades (Move speed, Carry +1, Lifespan) priced in
  "— EVO", marked `TODO(economy)` and reserved for the economy update.

---

## 5. Data Flow & Lifecycle

### 5.1 Startup

```
index.html loads /src/main.ts
   └─ mount(App)
        └─ App onMount:
             ├─ createGameStore(container)
             │    ├─ rollSeed() → setRandomSource(mulberry32(seed))   (seed the run up front)
             │    ├─ createInitialState()  → 32×32 world, 3×3 nest @ centre, 200 food, 3 ants
             │    ├─ createRenderer(container) → resize()   (canvas fitted, reused thereafter)
             │    └─ ResizeObserver.observe(container) → resize() + draw()   (static first frame)
             └─ store.subscribe(() => version++)   (explicit reactive bridge)
```

The player sees the menu overlaid on a static initial frame — the loop is never started at mount.
Clicking **Start** calls `startNewGame()` (fresh seed, fresh world, loop running) and sets
`screen = 'playing'`.

### 5.2 One tick, end to end

Once running, `createSimLoop` calls `onTick` once per `TICK_INTERVAL_MS / speed` of accumulated time
(1 s at 1×, 250 ms at 4×; bounded by `MAX_CATCHUP_TICKS`). `onTick` → `tick(state)` →
`renderer.draw(...)` → `notify()` (→ `version++`). The transport can also drive time by hand: the
step button calls `store.step()`, which advances exactly one tick and leaves the sim paused. The
`tick(state)` pipeline:

```
tick(state):
  1. stepAnts(ants, world, resources, tick)   // recover-in-place on the nest, else move once,
                                               //   pick up food (≤5) / drop the load, lay a breadcrumb,
                                               //   age & energy, mark deaths, compact the arrays
  2. tickPheromones(world)                     // every tick: linear decay (−1/20), no diffusion
  3. spawnFoodTick(world)                       // 2% chance: seed 20 food (sets FOOD terrain)
  4. tick++                                      // advance the clock
  5. if tick % 10 == 0:                         // every 10 ticks:
        resources.food += collectFoodAtNest(state)   // sweep food out of the nest
  6. if tick % 20 == 0 and food >= 20 and count < 15:  // reproduction:
        spawnAnt(); resources.food -= 20              //   one birth per interval
  7. if ants.count == 0:                        // extinction check
        gameOver = true, reason = "Colony collapsed"
```

**The self-sustaining loop:** foragers carry food to the nest → `collectFoodAtNest` banks it in
`resources.food` → that pool both **refuels** ants that sit on the nest (keeping them alive) and
**funds reproduction** (growing the colony toward the population cap). Refuel and reproduction draw
from the *same* pool, so a colony that can't forage enough will shrink and eventually collapse.

### 5.3 The ant state machine

```
                 pick up food (on food cell)
   ┌──────────┐ ─────────────────────────────► ┌──────────┐
   │SEARCHING │                                │ CARRYING │
   │   (0)    │ ◄───────────────────────────── │   (1)    │
   └──────────┘   drop food (reached nest)     └──────────┘
        │  ▲                                          │
 energy │  │ reached nest                             │ (both CARRYING and RETURNING
 < 20%  │  │ (become SEARCHING)                       │  head home via home pheromone)
        ▼  │                                          │
   ┌──────────┐                                       │
   │RETURNING │ ◄─────────────────────────────────────┘
   │   (2)    │
   └──────────┘

   A below-full ant on the nest recovers in place: it stays still (no move, no energy cost) and
   refuels (spends colony food for energy, every 2 ticks) until full, then resumes.
   Any state → DEAD (255) when energy <= 0 or age > 2000; removed by compaction.
```

### 5.4 Rendering

Rendering is **imperative and outside Svelte**: `onTick` calls `renderer.draw()` directly every tick,
so the canvas animates regardless of framework reactivity. The frame is painted back-to-front with 2D
draw calls — empty cells, glowing breadcrumb crumbs, food/nest terrain, ant discs, hover outline
([§4.7](#47-renderrendererts--canvas-painter)). Two other paths trigger a redraw between ticks: the
`ResizeObserver` re-fits and redraws on container/window resize, and `store.setHover` redraws
immediately when the inspected cell changes (so the amber outline tracks the cursor without waiting
for the next tick). Svelte only re-renders the rail/top-bar/tooltip text when the `version` counter
(bumped on each store notify) changes.

---

## 6. Notable Design Decisions & Trade-offs

| Decision | Why | Trade-off / cost |
|---|---|---|
| **Pure `game/` layer, no framework imports** | Testable, reusable, fast hot loop | UI must bridge to it manually (the store + `version` counter). |
| **Typed arrays + Structure-of-Arrays** | Cache-friendly, no per-tick allocation, compact | Clunky ergonomics; deletion needs array compaction. |
| **Fixed capacity = `ANT_POP_CAP`** | Births don't reallocate the SoA arrays | Population is hard-capped; growing the cap means re-allocating. |
| **Fixed-timestep accumulator + catch-up cap** | Frame-rate-independent pacing; a paused tab can't spiral | Ticks beyond the cap are dropped (simulated time is lost after a long pause). |
| **Food-gated refuel + reproduction (shared pool)** | Closes the core loop; food finally *matters* | Balance is delicate and currently un-tuned (§8). |
| **Canvas (not DOM cells)** | Scales past the ~10k-element DOM wall | Hit-testing is done via `clientToCell`, not DOM. |
| **2D draw calls (not `ImageData` pixel writes)** | The template's discs, alpha crumbs, and glows are natural `arc`/`shadowBlur` ops; trivial cost at 32×32 | Per-frame draw calls grow with grid area; may need batching/hybrid at large grid tiers. |
| **Speed = scaled tick interval (`setSpeed`)** | One knob; every per-tick rule keeps its meaning at any speed | Higher speeds burn wall-clock food/energy faster; balance is only considered at 1×. |
| **Seed owned by the store, applied before world creation** | A displayed 6-digit seed fully reproduces a run from the UI (restart/reroll/edit) | Reproducibility is from run start only; mid-run state needs the future save system. |
| **Scaffolded economy UI (EVO/GT chips, locked Upgrades shelf)** | The layout won't need reflowing when the economy lands; slots are visibly reserved | Dead UI in the meantime; must be kept in sync with the eventual design (`TODO(economy)`). |
| **Single transparent hover overlay (not a CSS grid)** | One element + a coordinate→cell map instead of ~1k divs | No per-cell DOM hooks (fine for a tooltip; revisit if we need per-cell widgets). |
| **1-px inset for grid lines** | Crisp 1-px lines at any cell size, no extra draw calls | Grid-line colour is fixed to the canvas background. |
| **Plain-TS store + explicit `subscribe`** | Keeps the 1 Hz mutation loop out of Svelte's reactivity; reactivity is explicit, not proxy-luck | A `version` counter must be threaded through the derived UI values. |
| **Centralised, injectable, seeded RNG** | Reproducible saves/replays and deterministic tests | A shared module-level source (one active stream at a time). |
| **4-directional (von Neumann) movement** | Less jittery paths, cheaper weighting | Ants can't move diagonally. |
| **3×3 nest at the derived centre** | Small, cosy colony; geometry survives grid resizing | Little room; assumes a centred nest. |
| **Weighted-random (roulette) movement** | Emergent, organic trail-following | Non-deterministic (unless seeded); harder to unit-test exactly. |

---

## 7. Planned / Future Roadmap (not yet built)

These come from [`game-design.md`](../.kilo/plans/game-design.md) and are **not implemented**. Listed
so you know where the architecture is heading.

- **Economy:** Evolution Points (EVO) and prestige **Genome Tokens (GT)** alongside food. Today only
  `resources.food` exists (feeding refuel + reproduction) — but the UI already reserves the slots:
  the top bar carries disabled **EVO / GT chips** ("SOON"), and the `colony · gen N` label awaits a
  real generation mechanic (today `generation` just counts runs per session). Look for
  `TODO(economy)` in `src/ui/` for the exact hook points.
- **Upgrade tree:** stats (speed, energy, lifespan, carry capacity), behaviours, colony (population
  cap, spawn rate), territory. The right rail's **locked Upgrades shelf** scaffolds the first three
  rows (Move speed, Carry +1, Lifespan) priced in "— EVO". **Pheromone upgrades** are anticipated by
  the current design: longer trail duration (`PHEROMONE_DURATION_TICKS`), tunable movement weights
  (the `WEIGHT_*` constants), and re-introducing **pheromone spreading/diffusion** (deliberately
  removed for now).
- **Grid tiers:** expand 32×32 → 64 → 96 → 128 → 160, reallocating typed arrays and copying the old
  world into the centre. Nest geometry is already derived from the grid size, which eases this.
- **Prestige:** "Ascend Colony" reset that keeps Genome Tokens and a permanent upgrade tree.
- **Persistence:** versioned `localStorage` save schema (`SaveV1`), auto-save, offline catch-up,
  export/import. The seeded RNG makes reproducible saves feasible, and the run's seed is already
  surfaced (and editable) in the UI — a save would bank the seed plus the elapsed state.
- **Richer interaction overlay:** the hover tooltip + `ResizeObserver` exist; still planned are
  click/selection actions, per-cell affordances, and any placement/interaction tools from
  [`grid-design.md`](../.kilo/plans/grid-design.md).

---

## 8. Known Issues, Gaps & Inconsistencies

The long list of subsystem bugs and inconsistencies that this document previously carried has been
**resolved** (see [§8.2](#82-recently-resolved)). What remains are higher-level gaps.

### 8.1 Remaining gaps

1. **Colony balance is un-tuned.** The self-sustain loop works mechanically, but the numbers
   (`ANT_POP_CAP` 15, `STARTING_ANTS` 3, refuel 10 energy per 1 food per 2 ticks, reproduction 20
   food per birth every 20 ticks, and the up-to-`ANT_CARRY_CAPACITY` (5) forage yield per trip) have
   not been playtested for a satisfying difficulty curve. Refuel and reproduction share one food pool,
   so the economy can be fragile. Balance has only been considered at 1× — the 2×/4× speeds change
   wall-clock pacing, not the rules, but they haven't been playtested either. *Expect to iterate on
   `constants.ts`.*

2. **Playwright E2E test is still a placeholder.** `tests/e2e/example.spec.ts` asserts trivialities.
   The unit layer (`tests/rng|world|ant|simulation.test.ts`) covers the pure `game/` logic — including
   a seeded-determinism check — but there is no real end-to-end coverage of the app, even though the
   new transport/seed/tooltip surfaces are natural E2E targets (they have been exercised only by
   ad-hoc scripted runs during development).

3. **Catch-up cap and speed pacing are not unit-tested.** The `MAX_CATCHUP_TICKS` clamp and the
   `setSpeed` interval scaling both live inside the `requestAnimationFrame`-driven `createSimLoop`
   and aren't exercised by a test (they need a mocked RAF clock). The logic is simple, but it's
   currently verified only by inspection and manual runs.

4. **`generation` is cosmetic.** The top bar's `colony · gen N` counts `startNewGame` calls in the
   current session (and resets on reload); it is a placeholder until the evolution layer gives
   "generation" a real meaning ([§7](#7-planned--future-roadmap-not-yet-built)).

5. **Seed reproducibility covers run start only.** A seed replays a whole run deterministically from
   tick 0, but there is no way to capture/restore a run mid-flight — that's the future save system's
   job. (The seed *is* now surfaced and editable in the UI; see [§8.2](#82-recently-resolved).)

6. **UI fonts come from a CDN.** Space Grotesk / JetBrains Mono load from Google Fonts at runtime;
   offline (or CDN-blocked) sessions fall back to system fonts and lose the intended look. *Fix if it
   matters: self-host the two families.*

7. **Renderer draw-call count grows with grid area.** The 2D-draw-call approach is comfortably cheap
   at 32×32, but a 160×160 grid tier (~26k cells) would issue orders of magnitude more calls per
   frame. The `Renderer` interface hides the strategy, so a batched or hybrid `ImageData` base layer
   can be swapped in when grid tiers land.

8. **No interaction actions beyond hover.** The overlay reports the hovered cell, outlines it, and
   shows a tooltip, but there are no click/selection behaviours yet
   (see [§7](#7-planned--future-roadmap-not-yet-built)).

### 8.2 Recently resolved

For traceability, the following gaps from earlier revisions of this document have been fixed:

- **Colony no longer starves out.** Ants refuel from colony food while on the nest, and the colony
  reproduces from banked food — the core loop is self-sustaining (energy cost is now `1`/tick).
- **Naturally-spawned food is drawn and harvestable.** `spawnFoodTick` sets `terrain = FOOD`; emptied
  food cells revert to `EMPTY`.
- **Ants move once per tick.** The carrying/returning "double move" is gone; a single state-weighted
  move is followed by one interaction.
- **Pheromones are breadcrumb trails.** Ants lay one crumb per step along their whole route (not a
  single drop on discovery); markers decay **linearly** (readable age) and no longer **diffuse**;
  carrying ants stop laying the food trail on reaching the nest; ants navigate a trail toward its
  origin; the renderer shrinks each marker in proportion to its remaining value.
- **`palette.ts` is used.** The renderer imports `PALETTE` instead of hardcoding RGB.
- **Duplicate constants removed.** `AntState` / `Terrain` no longer shadow `ANT_STATE` / `TERRAIN`.
- **Magic numbers named/derived.** Nest centre comes from `nestCenter()`; the dead sentinel is
  `ANT_STATE.DEAD`; nest size is `NEST_RADIUS`.
- **Responsive canvas + hover overlay.** A `ResizeObserver` refits the (reused) canvas; a tooltip
  overlay inspects cells.
- **RNG is centralised and seedable.** All randomness flows through `rng.ts`'s injectable source.
- **The store's `subscribe` API is used.** `App.svelte` subscribes and drives its reactive values off
  an explicit `version` counter.
- **Sim-loop catch-up is bounded.** The accumulator is clamped to `MAX_CATCHUP_TICKS`.
- **Real unit tests exist.** The pure `game/` layer is covered by Vitest specs.
- **High-DPI canvas sizing is fixed.** The renderer no longer divides the available size by
  `devicePixelRatio`; the backing store is CSS size × DPR with a `setTransform` scale, so the world
  fills its container crisply at any DPR (this fell out of the `ImageData` → 2D-draw-call rewrite).
- **The seed is surfaced in the UI.** The left rail shows the current run's mulberry32 seed,
  lets the player edit it (reproducing a world) or reroll it, and restart replays it; the game-over
  card shows it too. The old "no UI to set/inspect the seed" gap is closed (mid-run restore still
  isn't — see §8.1).
- **A real transport bar exists.** Play/Pause, single-step (`store.step()` advances exactly one tick
  and stays paused), 1×/2×/4× speed, and restart replaced the lone Pause button. Resuming at higher
  speeds no longer bursts several ticks at once (the loop's first frame is seeded with exactly one
  tick's worth of time at the current speed).
- **The main screen matches its design template.** The UI was rebuilt to `DESIGN_TEMPLATE.dc.html`
  (option 1A "Instrument"): docked rails instead of floating panels, integrated per-state colony
  stats with energy bars and a population meter, a legend, a redesigned mono cell-inspector tooltip
  with an on-grid hover outline, and ants drawn as haloed discs above two-hue breadcrumb trails so
  agents and trails are no longer confusable.

---

## 9. Glossary

- **Tick** — one logical simulation step. Here the game targets **1 tick per second** (`TICK_RATE_HZ`)
  at 1× speed; the speed multiplier shortens the interval, not the step.
- **Fixed-timestep accumulator** — a loop that advances the simulation in equal-sized steps regardless
  of the display frame rate, by banking real elapsed time and spending it one fixed step at a time.
- **Catch-up cap** — an upper bound (`MAX_CATCHUP_TICKS`) on how many banked ticks the loop will replay
  in a single frame, so a long pause can't cause a "spiral of death."
- **`requestAnimationFrame` (RAF)** — the browser's "call me before the next repaint" hook; drives the
  loop.
- **Speed multiplier** — the playback rate set from the transport bar (1×/2×/4×); it divides the tick
  interval (`TICK_INTERVAL_MS / speed`) rather than changing any simulation rule.
- **Transport bar** — the playback controls in the left rail: Play/Pause, single-step (advance one
  tick and stay paused), the speed segment, and restart-colony.
- **Pheromone** — a scent value stored per cell, laid one crumb per step as a **breadcrumb trail**.
  A **home trail** (laid while not carrying) leads back to the nest; a **food trail** (laid while
  carrying) leads back to the food. A crumb starts at `1.0` and decays linearly, so its value encodes
  its **age**; ants follow the age gradient back to the trail's **origin**.
- **Decay** — subtracting a fixed amount (`1/PHEROMONE_DURATION_TICKS`) from every pheromone each
  tick so a marker fades **linearly** to zero over its duration; its remaining value is proportional
  to its remaining life (and to its rendered size).
- **Origin (of a trail)** — the point where the trail was first laid (a food cell for a food trail,
  the nest for a home trail). It is the **oldest / lowest-value** end, so following the trail toward
  weaker crumbs leads to it.
- **Diffusion** — spreading a cell's pheromone toward its neighbours. **Not used** — it would blur the
  age gradient; reserved for a future in-game upgrade ([§7](#7-planned--future-roadmap-not-yet-built)).
- **Refuel** — an ant on the nest converting colony food into energy (capped at max energy).
- **Reproduction** — the colony spending banked food to spawn a new ant (up to the population cap).
- **Structure-of-Arrays (SoA)** — storing each field of many entities in its own array (parallel
  arrays indexed by entity number), rather than an array of per-entity objects. Cache-friendly.
- **Capacity vs count** — the ant arrays are allocated to `capacity` (= `ANT_POP_CAP`); `count` is the
  number of live ants in the dense prefix `[0, count)`.
- **Typed array** — a fixed-type, fixed-size numeric buffer (`Uint8Array`, `Float32Array`, …). Compact
  and fast; no per-element object overhead.
- **von Neumann neighbourhood** — the 4 orthogonal neighbours (N/E/S/W). *This game uses this for
  movement.*
- **Moore neighbourhood** — the 8 surrounding neighbours (orthogonal + diagonal). *Not used for
  movement.*
- **Roulette-wheel selection** — pick an option at random with probability proportional to its weight
  (like a wheel whose slice sizes are the weights).
- **Compaction** — after some ants die, shifting the surviving entries down to keep the SoA arrays
  densely packed `[0 .. count-1]`.
- **Nest** — the 3×3 home block at the (derived) grid centre where ants deposit food, refuel, and are
  born, and where food is collected into the colony resource.
- **Forage** — an ant's search-for-and-retrieve-food behaviour.
- **Seeded PRNG / mulberry32** — a deterministic pseudo-random generator: the same seed produces the
  same stream, enabling reproducible runs and deterministic tests.
- **DPR (device pixel ratio)** — how many physical pixels map to one CSS pixel; multiplied into the
  canvas backing-store size (with a matching `setTransform` scale) so rendering stays crisp on
  high-DPI screens.
- **`ImageData`** — a raw RGBA pixel buffer for a canvas. The renderer *used* to write pixels into
  one and blit it; it now uses 2D draw calls instead ([§4.7](#47-renderrendererts--canvas-painter)),
  though `ImageData` may return as a batched base layer at large grid tiers.
- **`ResizeObserver`** — a browser API that fires a callback when an observed element's size changes;
  used to keep the canvas fitted to its container.
- **`version` counter** — a Svelte `$state` integer bumped on every store notify; the UI's derived
  values depend on it so they recompute each tick without relying on proxying in-place mutations.
- **Idle / incremental game** — a genre built around numbers steadily growing, upgrades, and progress
  that continues (or accrues) while the player is away.
- **Prestige** — an idle-game reset that trades current progress for a permanent multiplier/currency
  (here, **Genome Tokens**). *Planned, not built.*
- **EVO (Evolution Points)** — a planned upgrade currency. **GT (Genome Tokens)** — a planned prestige
  currency. Only **food** exists today; the top bar carries disabled EVO/GT chips as placeholders.
- **Generation** — the `colony · gen N` label in the top bar. Currently a cosmetic per-session run
  counter; intended to gain real meaning with the evolution layer.
- **Seed** — the 6-digit number feeding the mulberry32 PRNG for a run. Shown, editable, and
  rerollable in the left rail; the same seed replays the same world and run from tick 0.
- **Grid tier** — a planned world-size upgrade level (32×32 up to 160×160).

---

*This document reflects the code at the time of writing. When you change a subsystem, update the
matching section — especially [§8](#8-known-issues-gaps--inconsistencies), which should track the
real state of the prototype as it matures.*
