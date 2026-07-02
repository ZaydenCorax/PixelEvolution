# PixelEvolution — Design & Architecture

**Audience:** developers new to this codebase (onboarding reference).
**Status of the game:** early, playable **prototype** — the core simulation loop is
**self-sustaining** (ants refuel and the colony reproduces), the main screen implements the
**"Instrument" dashboard layout** from `DESIGN_TEMPLATE.dc.html`, and the **prestige core is live**:
runs earn Evolution Points (EVO) on death or manual Ascension, persisted in `localStorage`. The
EVO-**spending** layer (the upgrade tree) is still unbuilt — see §7.
**Status of this document:** describes the code **as it actually exists today**, with a clearly
separated roadmap for what is planned but not yet built, and an honest list of known gaps.

> How to read this doc: sections 1–6 explain what is really in the repo right now and *why* it is
> built that way. Section 7 is the future vision. Section 8 is a candid list of rough edges — read
> it before you trust any single subsystem to "just work" — and a log of what was recently resolved.
> Section 9 is a glossary; if a term looks unfamiliar, jump there first.

---

## 1. Project Overview

PixelEvolution is a browser game about a colony of pixel "ants" living on a small grid. A run
starts with a **single founder ant** (real colonies start with one queen). Ants seek out food —
which grows in organic, contiguous **clusters** — pick it up, carry it back to a central **nest**,
and drop **pheromone** trails that bias where other ants walk. Food collected at the nest is banked
as a colony resource that keeps ants alive (refuelling) and spawns new ones (reproduction, up to a
cap of 5). Reaching that cap once permanently unlocks **Ascension** — the manual prestige reset that
banks the run's **Evolution Points (EVO)**; a colony's death banks them too. The visual style is
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
| `WEIGHT_BASE` / `WEIGHT_TARGET_CELL` | `1` / `50` | Weight floor per neighbour; bonus for an adjacent goal (food/nest) cell. |
| `WEIGHT_TRAIL_ON` / `WEIGHT_TRAIL_AGE` | `10` / `20` | On-trail bonus; extra weight scaled by crumb age (bias toward origin). |
| `WEIGHT_HOMING` | `25` | Fallback nudge toward the nest when no home trail is nearby. |
| `WEIGHT_FOOD_SENSE` | `25` | Nudge a searching ant toward its locked food target. |
| `WEIGHT_MOMENTUM` | `3` | Bonus for continuing straight, **searching ants only** — persistent walks cover ground while exploring; homing ants beeline and get none. |
| `EPSILON_FOCUSED` / `EPSILON_WANDER` | `0.05` / `0.45` | Mutation rates for ε-greedy movement: chance of a roulette deviation when the ant has a signal / when it is wandering blind. |
| `FOOD_SENSE_RADIUS` / `FOOD_SENSE_OFFSETS` | `3` / 24 cells | An ant's smell footprint: every cell within Manhattan distance 3 (a diamond). Sized for clustered food — smaller footprints starved colonies within smelling distance of whole clusters. |
| `ANT_CARRY_CAPACITY` | `5` | Max food an ant carries before it must drop the load at the nest. |
| `ANT_STATE` | `SEARCHING 0, CARRYING 1, RETURNING 2, DEAD 255` | Ant state enum, including the named dead sentinel. |
| `ANT_MOVE_DIRECTIONS` | N,E,S,W | 4-direction (von Neumann) movement set. |
| `FOOD_SPAWN_RATE` | `0.02` | Chance per tick of one natural cluster spawn event. |
| `FOOD_CELL_MIN/RANGE/EXP` | `5` / `21` / `2` | Per-cell food roll `5 + ⌊21·r²⌋` → 5..25, mean ≈ 12 (low values common). |
| `FOOD_CLUSTER_MIN/RANGE/EXP` | `5` / `196` / `2.5` | Cluster-total roll `5 + ⌊196·r^2.5⌋` → 5..200, mean ≈ 60, ~10% are 150+ jackpots. |
| `WORLD_FOOD_CAP` | `150` | Natural spawning pauses while the map holds this much food (jackpots may overshoot — feast/famine). |
| `FOOD_SPAWN_MIN_NEST_DIST` | `4` | Natural cluster seeds keep this Manhattan distance from the nest centre. |
| `STARTING_CLUSTERS` | `3` | Food clusters at world creation (the first is the founder cache). |
| `FOUNDER_CACHE_MIN/MAX_DIST` | `4` / `5` | The founder cache seeds on this Manhattan ring — chosen to overlap the smell radius from the nest edge, so the founder reliably finds it (at 5–7 it routinely didn't). |
| `FOUNDER_CACHE_MIN/MAX_FOOD` | `30` / `60` | The founder cache's total food roll (uniform). |
| `STARTING_ANTS` | `1` | A lone founder ant starts the colony. |
| `ANT_ENERGY_COST` | `1` | Energy spent per ant per tick. |
| `ANT_INITIAL_ENERGY` | `100` | Starting/`max` energy (also the refuel cap). |
| `ANT_LIFESPAN` | `2000` | Age (ticks) after which an ant dies of old age. |
| `RETREAT_ENERGY_BUFFER` | `8` | A searching ant turns home when `energy < distToNest + buffer` (distance-aware retreat). |
| `ANT_POP_CAP` | `5` | Soft population cap (reproduction stops; reaching it once unlocks Ascension). |
| `ANT_ARRAY_CAPACITY` | `32` | Hard SoA allocation ceiling, decoupled from the soft cap for future +pop upgrades. |
| `ANT_REFUEL_INTERVAL_TICKS` | `2` | Refuel cadence for an ant sitting on the nest. |
| `ANT_REFUEL_FOOD_COST` | `1` | Colony food spent per refuel event. |
| `ANT_REFUEL_ENERGY_PER_FOOD` | `20` | Energy gained per refuel event (clamped to the cap). Sets the metabolic price of distance — at 10, far clusters were energy-neutral and colonies starved with a full map. |
| `ANT_REPRODUCE_INTERVAL_TICKS` | `20` | How often the colony may spawn a new ant. |
| `ANT_REPRODUCE_FOOD_COST` | `20` | Colony food spent per birth. |
| `ANT_REPRODUCE_FOOD_RESERVE` | `15` | A birth only fires if the bank keeps this much after paying — reproduction never takes the colony's last food (refuel funds), which previously caused a death spiral. |
| `EVO_FOOD_DIVISOR` | `10` | EVO earned per run = `⌊√(lifetimeFoodBanked / 10)⌋` (sub-linear). |

*Why 4 directions and not 8?* Fewer choices per step make ant paths less jittery and keep the
weighted-direction maths cheaper; this superseded an earlier "8-directional (Moore)" decision from
the plans.

*Balance sanity check (keep this in mind when tuning):* colony upkeep is roughly
`population / 20` food per tick (1 energy/tick per ant, refuelled at 20 energy per food), i.e.
**0.25/tick at the cap of 5**, and a round trip to a cluster `d` cells away costs about `d/10`
food against the ~5 it delivers — distance is the price of food. Nominal spawn inflow is
2% × ~60 ≈ 1.2/tick gated by `WORLD_FOOD_CAP`, so the map fills while the colony is small and
tightens as it grows. These numbers were converged by **headless balance runs** (30 seeds × 3000
ticks, `scratchpad` harness): median first birth ~t60, ~60% of runs reach the Ascension unlock,
~40% survive the full horizon, the median run banks ~6 EVO, and colonies decline naturally as
nearby clusters exhaust. Any upgrade touching carry, cap, refuel, or cluster size shifts this
balance.

### 4.2 `game/types.ts` — data shapes

Defines the `World`, `Ants`, and `GameState` interfaces (the typed-array layouts from
[§3.2](#32-data-oriented-design-typed-arrays--structure-of-arrays)). `Ants` includes both `count`
(live ants) and `capacity` (allocated length = `ANT_ARRAY_CAPACITY`), a per-ant `carried` array
(food in hand, `0..ANT_CARRY_CAPACITY`), and per-ant `targetX` / `targetY` arrays (the locked food
target of a SEARCHING ant; `-1` = none). `GameState` bundles everything the simulation needs:
`tick`, `resources.food`, `stats.lifetimeFoodBanked` (a grow-only counter feeding the EVO formula),
the `world`, the `ants`, and the `gameOver` / `gameOverReason` / `paused` flags.

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
  `NEST_RADIUS`-extent (3×3) at the derived centre, and seeds `STARTING_CLUSTERS` (3) food clusters:
  the first is the **founder cache** (seeded on the Manhattan ring 4–5 around the nest with a
  uniform 30–60 total — the ring overlaps the smell radius from the nest edge, so the lone
  founder's first forage is genuinely reliable, not luck), the rest are normal rolls.
- **`rollFoodCellAmount()` / `rollClusterTotal()`** — the low-weighted power rolls behind cluster
  sizes: per-cell `5 + ⌊21·r²⌋` (5..25, mean ≈ 12) and per-cluster `5 + ⌊196·r^2.5⌋` (5..200,
  mean ≈ 60). Small values are common; ~10% of clusters are 150+ jackpots.
- **`spawnFoodCluster(world, total, seedX, seedY)`** — grows a **contiguous blob** from the seed:
  fills the current cell with a rolled amount (tagging `terrain = FOOD`), then hops to a random
  orthogonal neighbour of a random cluster cell. Attempts are bounded, so a boxed-in blob simply
  drops its remainder instead of looping.
- **`spawnFoodTick(world)`** — the per-tick natural spawn (2% chance of one cluster). Gated by
  **`WORLD_FOOD_CAP`** (150): while the map holds that much food no new cluster spawns. The check
  gates the roll, not the amount, so a jackpot may overshoot the cap — deliberate feast/famine
  texture. Cluster seeds keep `FOOD_SPAWN_MIN_NEST_DIST` (4) away from the nest centre. All
  randomness comes from the centralised RNG.
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
  2. **Recover in place (depleted ants only):** only a **`RETURNING`** ant recovers — a state
     entered just when its energy stops covering the walk home (step 6). A healthier ant never
     rests; it keeps foraging. A `RETURNING` ant that is home on the nest and below full energy
     **stays put** — no move, **no energy cost** — and, on a refuel tick (every
     `ANT_REFUEL_INTERVAL_TICKS`), converts `ANT_REFUEL_FOOD_COST` (1) colony food into
     `ANT_REFUEL_ENERGY_PER_FOOD` (20) energy (clamped to the cap). It parks like this until **full**,
     then flips back to `SEARCHING` and leaves. If the colony has no food to spare it doesn't sit idle
     — it flips to `SEARCHING` and forages so it can go find food itself. Recovering costs no upkeep,
     so energy isn't wasted while topping up.
  3. **Maintains its food-site memory (`targetX/Y`):** the remembered cell is validated (cleared
     only when it runs dry) and **kept across the whole forage cycle** — a carrying/returning ant
     remembers where it found food and, back at the nest, beelines straight back (forager
     shuttling). Any memory-less ant re-smells immediately, so the carrier that just emptied a
     cell re-targets a neighbouring cluster cell on the spot and whole clusters get extracted; a
     searching ant also trades a far memory for strictly closer food it smells en route. This is
     what makes "ant spots food → goes and gets it → comes back for more" visibly purposeful.
  4. Subtracts `ANT_ENERGY_COST` (1) energy and makes **one** state-weighted move (`moveAnt`):
     searching ants steer toward their locked target, carrying/returning ants steer home. Reverts
     the move if it would leave the grid (ants "bounce" off edges).
  5. Interacts with the destination cell:
     - **On food** (any state) with spare capacity → picks up food up to `ANT_CARRY_CAPACITY` (5).
       Collecting takes priority over returning, so even a carrying/returning ant tops up en route. A
       `SEARCHING` ant that grabs its first food flips to **CARRYING**.
     - **On the nest** → drops its **whole load** (up to 5). A **CARRYING** ant becomes **SEARCHING**;
       a **RETURNING** (depleted) ant stays `RETURNING` so it recovers (step 2) before foraging again.
  6. **Lays one breadcrumb** at the destination cell, based on its state *after* the interaction: a
     **CARRYING** ant lays a **food** trail (origin = the food cell where it flipped to CARRYING);
     anyone else (**SEARCHING**/**RETURNING**) lays a **home** trail (origin = the nest). Because
     reaching the nest flips CARRYING → SEARCHING first, an ant **stops laying its food trail the
     moment it gets home**. This continuous laying — one crumb per step — is what builds the trail.
     **No trail is laid while standing on a nest cell** (home included): otherwise the nest block
     saturates with home pheromone and the anti-backtracking rule sweeps searching ants outward, away
     from food sitting next to the nest.
  7. **Distance-aware retreat:** if a SEARCHING ant's energy falls below its Manhattan distance to
     the nest plus `RETREAT_ENERGY_BUFFER` (8), switch it to **RETURNING** — this is the sole
     trigger for heading home to recover (step 2). A distant ant turns back early; one beside the
     nest forages almost to empty. (This replaced a flat 20%-of-full threshold, under which distant
     ants died mid-walk home even when navigating perfectly.)
  - Finally, **`compactAnts`** removes dead ants by shifting live entries down (including the
    target arrays) and updating `count`.
- **`chooseDirection(world, x, y, state, curDir, targetX, targetY)`** — the movement brain. For
  each of the 4 neighbours it computes a weight from named constants, then selects **ε-greedily**:
  with probability ε the ant "mutates" (**roulette-wheel selection**, probability proportional to
  weight — the rare deviation that keeps exploration alive); otherwise it takes the
  **best-weighted step** (argmax). ε is `EPSILON_FOCUSED` (0.05) when any signal weighted in (goal
  cell, trail, homing bias, locked target) and `EPSILON_WANDER` (0.45) when the ant has nothing to
  go on — so purposeful ants are near-deterministic while wandering stays varied. Argmax ties
  resolve to the current direction, else randomly among the tied (a first-index tie-break would
  give ants a systematic directional bias along walls). A **forager** (SEARCHING) is steered toward
  its locked food target; a **homing** ant (CARRYING/RETURNING) toward the nest. Each neighbour's
  weight is `WEIGHT_BASE` (1), plus `WEIGHT_TARGET_CELL` (50) if it is the goal cell (food when
  foraging, nest when homing). A **forager** additionally gets `WEIGHT_MOMENTUM` (3) for continuing
  straight and a **food-trail term**: if the crumb value `p > 0`, `WEIGHT_TRAIL_ON` (10)
  `+ WEIGHT_TRAIL_AGE` (20) `* (1 - p)`. A **homing** ant gets neither — no momentum, no trail
  term — it navigates by pure geometry (below), so trips home are beelines.
  - *Following a trail to its origin.* The origin end of a trail is the **oldest / lowest-value** end
    (laid first, decayed most). The `(1 - p)` factor makes **older crumbs weigh more**, so the ant is
    biased down the freshness gradient toward the origin — the food cell for a food trail, the nest
    for a home trail — while `WEIGHT_TRAIL_ON` keeps it on the trail. Off-trail cells keep only the
    base weight, preserving exploration.
  - *Geometric homing.* Every homing ant (CARRYING/RETURNING) adds `WEIGHT_HOMING` (25) to
    whichever neighbours reduce its Manhattan distance to the nest centre — the nest is the
    colony's home; its location is colony knowledge, not something to rediscover. This is a bias,
    not an override: ε-greedy selection still applies (and under argmax it makes homing
    near-deterministic, which is what lets depleted ants actually survive the walk home).
    Home pheromone plays **no** part in homing navigation. Both alternatives were tried and
    dropped after measurement: navigating by the home-trail age gradient starved colonies in
    headless runs, and even keeping the trail term as a mere *bonus* let stale off-path crumbs
    (scoring up to ~30 vs the homeward 26) drag carriers into multi-tick detours — ~14% of homing
    moves walked *away* from the nest; pure geometry cut that to ~1.5% (just the ε-mutations).
  - *Food memory.* A SEARCHING ant smells the nearest food cell within its footprint — every cell
    within Manhattan distance `FOOD_SENSE_RADIUS` (3), a 24-cell diamond scanned by
    `nearestSensedFood` — and **remembers it** (stored per-ant in `targetX/Y` by `stepAnts`, kept
    across the whole forage cycle — see step 3 above). Steps that reduce the Manhattan distance to
    the remembered cell gain `WEIGHT_FOOD_SENSE` (25) — but **only when the round trip is
    affordable** (`energy ≥ dist(ant→target) + dist(target→nest) + RETREAT_ENERGY_BUFFER`);
    an unaffordable memory is kept but doesn't steer until after a full refuel, or the ant would
    burn its energy on a treadmill of half-finished marches. A step toward the target also
    overrides anti-backtracking (below).
  - *Anti-backtracking.* An ant **never steps onto a cell that already carries the trail it is
    currently laying** (home for SEARCHING/RETURNING, food for CARRYING): such cells are dropped from
    the candidate set, so the ant moves onto fresh ground instead of re-walking its own trail. Two
    overrides: a goal cell (food/nest) is never excluded, a cell that **also** carries the ant's
    *goal* trail (an overlap of both pheromones) is never excluded, and (for a searching ant) a step
    toward the **locked target** is never excluded — following the trail or target toward the current
    objective wins over avoiding the laid one. If avoidance would leave no legal move at all, the full
    neighbour set is restored (an ant boxed in by its own trail can still move).
  - *Nest avoidance (searching only).* A SEARCHING ant also excludes **nest cells** — it has no
    business on the nest while foraging, so it routes around the nest block (and promptly walks off it
    if it was parked there refuelling). A homing ant is unaffected, since for it the nest is the goal.

*Why ε-greedy instead of pure weighted-random?* Under pure roulette even a heavily-weighted correct
step is only ~90% likely, and that error compounds every step — ants visibly meandered off known
food. ε-greedy inverts the model: the best step is the default and deviation is a rare,
**mutation-like event** (ε is literally the colony's mutation rate, a prime candidate for a future
gene upgrade with a floor of 2–3% — deviation is how new clusters get discovered). The wander rate
stays high because variety only helps when there is no signal to exploit. The weights are named
constants so future gene upgrades can tune them per-colony.

*Ants move exactly once per tick.* Movement weighting is chosen up front from the ant's state, so a
single `moveAnt` call both steers correctly and interacts with the right cell — carrying/returning
ants no longer take a hidden second, un-bounds-checked step.

### 4.6 `game/simulation.ts` — the orchestrator and clock

Ties the world and ants together and drives time.

- **`createInitialState()`** — builds a fresh `GameState` (world + `STARTING_ANTS` (1) founder +
  zeroed resources and lifetime stats).
- **`tick(state)`** — one logical step (no-op while `paused` or `gameOver`):
  1. `stepAnts(ants, world, resources, tick)` — move/interact/lay a breadcrumb/refuel every ant.
  2. `tickPheromones(world)` — linear decay of every marker (each tick; no diffusion).
  3. `spawnFoodTick(world)` — 2% chance to seed one food cluster (gated by `WORLD_FOOD_CAP`).
  4. `tick++`.
  5. Every 10 ticks: sweep food out of the nest into `resources.food` (`collectFoodAtNest`, which
     scans the nest block derived from `nestCenter`) and add the same amount to
     `stats.lifetimeFoodBanked` (grow-only; spending never reduces it).
  6. **Reproduction:** every `ANT_REPRODUCE_INTERVAL_TICKS` (20) ticks, if `resources.food >=`
     `ANT_REPRODUCE_FOOD_COST + ANT_REPRODUCE_FOOD_RESERVE` (20 + 15) and `ants.count <
     ANT_POP_CAP` (5), spawn one ant and spend 20 food. The reserve keeps refuel funds in the
     bank — a birth never takes the colony's last food.
  7. If `ants.count === 0`, set `gameOver` with reason `"Colony collapsed"`.
- **`calcEvoPoints(state)`** — the run's current EVO value:
  `⌊√(stats.lifetimeFoodBanked / EVO_FOOD_DIVISOR)⌋`. Sub-linear, so longer runs keep rewarding but
  early prestige resets stay viable. The **store** banks it (on death or Ascend, [§4.9](#49-storesgamestorets--lifecycle-glue));
  the pure layer only computes it.
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
- the **prestige meta** that outlives a run: banked `evoPoints` and the one-time `ascendUnlocked`
  flag are loaded from / saved to `localStorage` (key `pixelevolution.meta.v1`, `try/catch`-guarded
  so private-mode sessions still play, just without persistence). After every advanced tick the
  store checks the **unlock** (`ants.count >= ANT_POP_CAP`, once ever) and, on the game-over
  transition, **banks the run's EVO exactly once** (`calcEvoPoints`); a manual **`ascend()`** banks
  the same way and immediately starts a fresh run. Manual restart/reroll banks **nothing** — only
  death or Ascension pay out;
- a public API:
  - getters — `state`, `paused`, `gameOver`, `gameOverReason`, **`seed`** (the current run's seed),
    **`speed`** (the playback multiplier), **`generation`** (a per-session run counter shown in
    the top bar; a placeholder until the evolution layer gives "generation" real meaning),
    **`evoPoints`** (banked, persisted), **`pendingEvo`** (what the run would bank now; `0` once
    banked), **`lastRunEvo`** (what the last ended run banked — shown on the game-over card), and
    **`ascendUnlocked`**;
  - transport — `togglePause`, **`step()`** (advances exactly one tick past `tick()`'s pause guard
    and leaves the sim paused, so each press moves time by one tick), **`setSpeed(multiplier)`**
    (forwards to the sim loop), `start`, `stop`;
  - runs — **`startNewGame(seed?)`**: stops the loop, re-seeds the RNG (fresh roll if no seed is
    given), rebuilds the state, bumps `generation`, redraws, and restarts the loop. The UI uses this
    for **Start**, **restart** (passing the current seed to replay the same world), **reroll**
    (no seed), and **seed editing** (passing the typed seed). **`ascend()`** — manual prestige:
    no-op until unlocked (or on a dead run); banks pending EVO, then `startNewGame()`;
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
  `generation`, `evoPoints` / `pendingEvo` / `lastRunEvo` / `ascendUnlocked`, the per-state colony
  stats (count + average energy/age per `SEARCHING` / `CARRYING` / `RETURNING`), the game-over
  transition, and the hover tooltip all recompute each tick without relying on Svelte proxying the
  in-place array mutations;
- passes those values *down* to the `ui/` components as plain props and receives user intent *up* as
  callbacks (`onTogglePause`, `onStep`, `onSetSpeed`, `onSeedCommit`, `onReroll`, `onRestart`,
  `onAscend` — restart replays the current seed; reroll draws a fresh one), keeping the rails purely
  presentational;
- renders a **hover overlay** over the grid area: `mousemove` maps the cursor to a cell via
  `store.cellAt`, feeds it to `store.setHover` (which makes the renderer outline the cell), and a
  floating **cell-inspector tooltip** — monospace, amber-titled `cell (x, y)`, per the design
  template — shows the cell's terrain, food amount, both pheromone levels (`home φ` / `food φ`),
  and how many ants are on it;
- renders the menu and game-over overlays as dark, blurred backdrops with a centred card in the same
  design language (mono kicker, amber primary button); the game-over card also shows the **EVO the
  run banked** and its seed so a notable colony can be replayed.

`main.ts` is a three-line bootstrap that mounts `App` into `#app` from `index.html`.

### 4.11 `ui/` — the dashboard components

Three presentational Svelte components (plus `ui/types.ts` for the shared `StateStat` shape)
implement the "Instrument" layout. They hold no game state — everything arrives as props, and every
control fires a callback — so they can be restyled or rearranged without touching the store or
simulation.

- **`TopBar.svelte`** — the 54-px resource bar: brand mark + `colony · gen N` label, the **food**
  currency chip, the **live EVO chip** (violet swatch; banked total plus a `(+N)` pending suffix —
  watching that number grow is the run's visible goal), and `Tick` / `Pop n/cap` readouts on the
  right. A **disabled GT chip with a "SOON" badge** still scaffolds the prestige-token slot
  (marked `TODO(economy)`, [§7](#7-planned--future-roadmap-not-yet-built)).
- **`LeftRail.svelte`** (214 px) — the **playback transport** (Pause/Play primary button,
  single-step, restart-colony), the **1×/2×/4× speed segment**, the **seed panel** (the current seed
  shown in mono, click-to-edit with Enter/blur commit and Escape cancel — invalid input is rejected
  and keeps the old seed — plus a "reroll for a fresh world" action), and the **legend** mapping
  every on-grid mark (nest, food, the three ant states, both trail hues) to its colour.
- **`RightRail.svelte`** (256 px) — the **colony readout**: one row per ant state with a dot in the
  ant's disc colour, a live count, an **average-energy bar** (the searching row's bar is blue per
  the template — its white dot colour would wash out on the dark rail), and `e`/`age` micro-stats;
  a **population meter** (`n / cap` with an amber fill); the **Ascension panel** — locked ("Reach 5
  ants to unlock") until the colony first hits the population cap, then a violet **Ascend
  (+N EVO)** button with a **two-click confirm** (a stray click must not wipe the run; the only
  UI-local state in the rails is this `confirming` flag); and the **locked Upgrades shelf** — a
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
             │    ├─ loadMeta()   (banked EVO + Ascension unlock from localStorage)
             │    ├─ rollSeed() → setRandomSource(mulberry32(seed))   (seed the run up front)
             │    ├─ createInitialState()  → 32×32 world, 3×3 nest @ centre,
             │    │     3 food clusters (founder cache on the 5–7 ring), 1 founder ant
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
  1. stepAnts(ants, world, resources, tick)   // recover-in-place on the nest, else lock/validate
                                               //   a food target, move once (ε-greedy), pick up
                                               //   food (≤5) / drop the load, lay a breadcrumb,
                                               //   age & energy, distance-aware retreat, mark
                                               //   deaths, compact the arrays
  2. tickPheromones(world)                     // every tick: linear decay (−1/20), no diffusion
  3. spawnFoodTick(world)                       // 2% chance: one cluster (5..200 food, blob-grown),
                                                //   skipped while the map holds ≥ 150 food
  4. tick++                                      // advance the clock
  5. if tick % 10 == 0:                         // every 10 ticks: sweep food out of the nest
        resources.food += collectFoodAtNest(state)
        stats.lifetimeFoodBanked += same        //   grow-only counter → EVO
  6. if tick % 20 == 0 and food >= 35 and count < 5:   // reproduction (20 cost + 15 reserve):
        spawnAnt(); resources.food -= 20              //   one birth per interval
  7. if ants.count == 0:                        // extinction check
        gameOver = true, reason = "Colony collapsed"
                                                // (the store then banks calcEvoPoints once)
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
 < dist │  │ (become SEARCHING)                       │  head home via home pheromone)
 home+8 ▼  │                                          │
   ┌──────────┐                                       │
   │RETURNING │ ◄─────────────────────────────────────┘
   │   (2)    │
   └──────────┘

   The retreat trigger is distance-aware: energy < Manhattan distance to the nest + 8
   (RETREAT_ENERGY_BUFFER), so distant ants turn back early and near ones forage longer.
   A below-full RETURNING ant on the nest recovers in place: it stays still (no move, no energy
   cost) and refuels (spends colony food for energy, every 2 ticks) until full, then resumes.
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
| **ε-greedy movement (argmax + rare roulette "mutation")** | Purposeful, legible ant behaviour; deviation is a rare event, thematically a mutation rate | Trails funnel harder; exploration rests on the ε floor and the wander rate. |
| **Per-ant food-site memory (kept across the forage cycle)** | Forager shuttling: ants beeline back to known food and extract whole clusters | Two more SoA arrays; needs the affordability gate or ants death-march to far memories. |
| **Distance-aware retreat (`dist + 8`)** | No more navigational deaths on the walk home; near-nest ants forage deeper | Retreat point varies by position — less predictable than a flat % threshold. |
| **Geometric homing for all homing ants** | Reliable trips home (the nest is colony knowledge); home-trail gradients proved too noisy to navigate by | Home trails demoted to exploration-spreading duty (via anti-backtracking). |
| **Food clusters via blob growth + power-curve rolls** | Discoverable, organic food; rare jackpots create stories | More spawn code; totals can under-fill when a blob is boxed in (accepted). |
| **World food cap gates spawning (150)** | Self-balancing difficulty: map fills while the colony is small, tightens as it grows | Post-jackpot droughts (deliberate feast/famine). |
| **Founder cache on the 4–5 ring (inside smell range of the nest edge)** | A 1-ant start survives on skill, not luck | Slightly scripted opening; the ring is always stocked. |
| **Soft pop cap (5) split from array capacity (32)** | Future +population upgrades won't overflow the SoA arrays | Two constants to keep straight. |
| **EVO banked on death *or* manual Ascend, same formula** | Failure is the prestige tutorial, not a punishment; no incentive to AFK-die | Ascend needs its own unlock gate (reach the cap once) to stay meaningful. |
| **Prestige meta in `localStorage` (guarded)** | Progression survives reloads; private mode degrades gracefully | Meta is per-browser; no cloud/export yet ([§7](#7-planned--future-roadmap-not-yet-built)). |

---

## 7. Planned / Future Roadmap (not yet built)

These come from [`game-design.md`](../.kilo/plans/game-design.md) and the prestige design rounds,
and are **not implemented**. Listed so you know where the architecture is heading — and so the
agreed upgrade-tree design isn't lost.

- **EVO spending — the upgrade tree.** EVO is now *earned* (death/Ascend, [§4.9](#49-storesgamestorets--lifecycle-glue))
  but nothing spends it yet; the right rail's **locked Upgrades shelf** scaffolds the slot. The
  agreed design (record of the 2026-07 design discussion):
  - **Branches**, roughly in intended unlock order:
    - *Physiology* — Carry +1 (`ANT_CARRY_CAPACITY`), max energy (`ANT_INITIAL_ENERGY`), lifespan
      (`ANT_LIFESPAN`), cheaper movement (`ANT_ENERGY_COST`).
    - *Neurology* — lower mutation rate (`EPSILON_FOCUSED`, **floored at 2–3%** — deviation is how
      new clusters get discovered, never remove it), +1 sense radius (`FOOD_SENSE_OFFSETS`),
      pheromone duration (`PHEROMONE_DURATION_TICKS`), and eventually re-introducing **pheromone
      diffusion** (deliberately removed from the base game).
    - *Colony* — +1 population cap (**price steeply, ×2–2.5 per level** — at a cap of 5 each +1 is
      +20% workforce; the SoA arrays already allocate `ANT_ARRAY_CAPACITY` 32 for this), cheaper /
      faster births (`ANT_REPRODUCE_*`), +1 starting ant.
    - *Ecology* — bigger clusters (`FOOD_CLUSTER_*`), higher world food cap (`WORLD_FOOD_CAP`),
      spawn rate (carefully — it bypasses the harvest bottleneck).
  - **Cost scaling:** ~×1.7 per level baseline (steeper for pop cap, above). First purchases should
    be affordable from run one or two (~3–5 EVO; a decent first run banks ~4–6).
  - **In-run purchases** (spent from *food*, reset on prestige — the in-run decision layer that
    gives banking food an opportunity cost): *Brood Chamber* (+2 pop cap this run), *Granary*
    (+food per nest sweep), *Pheromone Glands* (+trail duration this run).
  - **Distribution tuning hook:** if 150+ jackpot clusters feel too routine (~10% today), switch
    the cluster-total roll to two tiers — 90% `5 + ⌊90·r²⌋` (mean ≈ 35), 10% uniform 120–200 —
    which keeps the mean ~57 while making jackpots genuinely rare.
- **Generation & GT:** the `colony · gen N` label awaits a real generation mechanic (today
  `generation` just counts runs per session), and **Genome Tokens (GT)** remain the planned second
  prestige layer above EVO — the top bar's disabled GT chip ("SOON") reserves the slot. Look for
  `TODO(economy)` in `src/ui/` for the exact hook points.
- **Grid tiers:** expand 32×32 → 64 → 96 → 128 → 160, reallocating typed arrays and copying the old
  world into the centre. Nest geometry is already derived from the grid size, which eases this.
- **Prestige:** "Ascend Colony" reset that keeps Genome Tokens and a permanent upgrade tree.
- **Persistence:** the prestige meta (banked EVO + Ascension unlock) already persists under
  `pixelevolution.meta.v1`. Still planned: a versioned **run** save schema (`SaveV1`), auto-save,
  offline catch-up, export/import. The seeded RNG makes reproducible saves feasible, and the run's
  seed is already surfaced (and editable) in the UI — a save would bank the seed plus the elapsed
  state.
- **Richer interaction overlay:** the hover tooltip + `ResizeObserver` exist; still planned are
  click/selection actions, per-cell affordances, and any placement/interaction tools from
  [`grid-design.md`](../.kilo/plans/grid-design.md).

---

## 8. Known Issues, Gaps & Inconsistencies

The long list of subsystem bugs and inconsistencies that this document previously carried has been
**resolved** (see [§8.2](#82-recently-resolved)). What remains are higher-level gaps.

### 8.1 Remaining gaps

1. **Colony balance is simulation-validated, not playtested.** The 2026-07 rebalance (founder
   start, cap 5, food clusters, world cap, ε-greedy movement, food memory, refuel 20, reproduction
   reserve, beeline homing) was converged through **headless balance runs** (30 seeds × 3000
   ticks): median first birth ~t60, ~60% of runs reach the Ascension unlock, ~40% survive the full
   horizon, the median run banks ~6 EVO, and colonies follow a peak-then-decline arc as nearby
   clusters exhaust (death feeds the prestige loop by design). Runs that fail tend to fail *early*
   (an unlucky founder before the first birth) — if that feels too punishing in real play, the
   founder-cache roll is the knob. What it *feels* like at the screen — pacing, legibility,
   whether Ascend timing is an interesting decision — still needs real play sessions, and balance
   has only been considered at 1×. *Expect to iterate on `constants.ts`.*

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

4b. **EVO has nothing to buy yet.** Runs earn and bank EVO (persisted), but the upgrade tree that
   spends it is unbuilt — the currency is currently a score. The agreed tree design is recorded in
   [§7](#7-planned--future-roadmap-not-yet-built) so it isn't lost.

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
- **Prestige** — an idle-game reset that trades current progress for a permanent currency. The first
  layer is **live**: Ascension banks EVO. A second layer (**Genome Tokens**) is planned.
- **EVO (Evolution Points)** — the prestige currency, **earned today**: a run banks
  `⌊√(lifetimeFoodBanked / 10)⌋` EVO on colony death or manual Ascension (persisted in
  `localStorage`). *Spending* EVO (the upgrade tree) is not built yet ([§7](#7-planned--future-roadmap-not-yet-built)).
  **GT (Genome Tokens)** — the planned second prestige currency; its top-bar chip is a disabled
  placeholder.
- **Ascension / Ascend** — the manual prestige reset: banks the run's pending EVO and starts a fresh
  colony. Permanently unlocked the first time a colony reaches the population cap (5).
- **Pending EVO** — what the current run would bank if it ended now; shown as `(+N)` on the top-bar
  EVO chip and zeroed once the run has banked (death or Ascend).
- **Mutation (movement)** — the rare ε-probability event where an ant deviates from its best step
  into a weighted-roulette pick (`EPSILON_FOCUSED` 5% with a signal, `EPSILON_WANDER` 45% while
  wandering blind). The name is deliberate: ε is the colony's evolvable mutation rate.
- **Food memory / target** — an ant's per-ant remembered food cell (`targetX/Y`), kept across the
  whole forage cycle so it shuttles back after each delivery; cleared only when the cell runs dry
  (whereupon any ant re-smells on the spot). Steering toward it requires the round trip to be
  **affordable** (energy covers ant → target → nest + the retreat buffer).
- **Distance-aware retreat** — the trigger for heading home: `energy < distToNest +
  RETREAT_ENERGY_BUFFER (8)`, replacing the old flat 20%-of-full threshold.
- **Food cluster** — a contiguous blob of food cells grown from a seed cell; per-cell amounts
  (5..25) and cluster totals (5..200) come from low-weighted power rolls, so snacks are common and
  150+ **jackpots** rare (~10%).
- **Founder cache** — the guaranteed starting cluster on the Manhattan 4–5 ring around the nest
  (30–60 food), inside smell range of the nest edge so the lone founder's first forage is reliable.
- **World food cap** — natural cluster spawning pauses while the map holds ≥ `WORLD_FOOD_CAP` (150)
  food; the map fills while the colony is small and tightens as it grows (a difficulty rubber-band).
- **Generation** — the `colony · gen N` label in the top bar. Currently a cosmetic per-session run
  counter; intended to gain real meaning with the evolution layer.
- **Seed** — the 6-digit number feeding the mulberry32 PRNG for a run. Shown, editable, and
  rerollable in the left rail; the same seed replays the same world and run from tick 0.
- **Grid tier** — a planned world-size upgrade level (32×32 up to 160×160).

---

*This document reflects the code at the time of writing. When you change a subsystem, update the
matching section — especially [§8](#8-known-issues-gaps--inconsistencies), which should track the
real state of the prototype as it matures.*
