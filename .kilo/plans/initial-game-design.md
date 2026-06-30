# Initial Game Design - Minimal Working Setup

This document defines the smallest viable implementation of PixelEvolution. The goal is a playable prototype demonstrating the core ant colony simulation with minimal features.

---

## 1. Scope

Only implement what is necessary to have ants walking a grid, finding food, and bringing it back to the nest. No upgrades, no grid expansion, no economy, no prestige.

---

## 2. Grid

- **Size**: 32 x 32 cells (small, cozy nest).
- **Cell types**: `empty`, `nest`, `food`. No walls or hazards.
- **Nest**: 5x5 block at center of grid (cells 14-18 in both axes).
- **Food**: Randomly scattered across non-nest cells at startup (200 total units). Can also spawn naturally over time.

---

## 3. Ants

### 3.1 Count

- Start with **5 ants**.
- No population cap in initial setup (will add later).

### 3.2 Ant State

Each ant has:
- Position (x, y) - integer grid coordinates.
- Direction (0-7) - 8 directions (N, NE, E, SE, S, SW, W, NW).
- State: `SEARCHING`, `CARRYING`, or `RETURNING`.
- Energy (starts at 100, costs 0.5 per step). When energy <= 0, ant dies.
- Age (in ticks). Max lifespan: 2000 ticks.

### 3.3 Behavior per Tick

1. Decrease energy by 0.5.
2. Choose next move based on state:
   - **SEARCHING**: Random walk, but prefer food cells and food pheromones.
   - **CARRYING**: Prefer home pheromone (heading toward nest).
   - **RETURNING**: Prefer home pheromone (energy < 20, heading toward nest).
3. Move to chosen cell.
4. If new cell has food and ant is SEARCHING: pick up food, switch to CARRYING, drop food pheromone.
5. If new cell is nest and ant is CARRYING/RETURNING: deposit food, switch to SEARCHING, drop home pheromone.
6. If energy <= 20 and SEARCHING: switch to RETURNING.
7. If energy <= 0 or age > 2000: ant dies.

### 3.4 Pheromones

- Each cell has `pheromoneHome` (0..1) and `pheromoneFood` (0..1).
- Decay every 2 ticks: multiply by 0.995.
- Diffuse to neighbors each decay tick (simple averaging).
- Ants sense pheromones in 3x3 neighborhood to bias movement.

---

## 4. Simulation Loop

- **Tick rate**: 1 Hz (1 tick per second).
- **Loop**: `requestAnimationFrame` with fixed-timestep accumulator.
- Each tick:
  1. Step all ants.
  2. Decay and diffuse pheromones (every 2 ticks).
  3. Spawn food randomly (2% chance per tick, 20 units).
  4. Collect food at nest (every 10 ticks) into colony food total.

---

## 5. Rendering

- **32x32 grid** rendered on a single HTML5 `<canvas>` element using the 2D Context API.
- An invisible CSS Grid overlay on top of the canvas handles hover and click interactions.
- Each cell is drawn with a 1px inset, letting the canvas background color serve as grid lines.
- Cell size is calculated from the container, floored to an integer to avoid subpixel artifacts.
- Ants are drawn as colored pixels on top of the terrain.
- Colors:
  - Empty: dark grey
  - Nest: amber
  - Food: green shades (darker when less food, lighter when more)
  - Ants: white (searching), yellow (carrying), light blue (returning)
- Render loop uses `requestAnimationFrame` with a dirty flag for efficiency.

---

## 6. Game Over

- If all ants die (`count === 0`), game ends with "Colony collapsed".
- Player can restart.

---

## 7. Controls

- **Start**: Begin simulation with new random seed.
- **Pause/Resume**: Toggle simulation.
- **Restart**: Available on game over screen.

---

## 8. Technical Notes

- Uses typed arrays (Uint8Array, Float32Array) for grid state.
- Ants stored as Structure-of-Arrays for cache efficiency.
- Seeded PRNG (mulberry32) for deterministic simulation.
- Svelte 5 runes for UI reactivity.
- Game store manages state and simulation loop.

---

## 9. File Structure (Current)

```
src/
├── main.ts                  # Bootstrap
├── App.svelte               # Root UI (menu, HUD, game over)
├── game/
│   ├── constants.ts         # Grid size, tick rate, tuning numbers
│   ├── types.ts             # World, Ants, GameState interfaces
│   ├── rng.ts               # Seeded PRNG
│   ├── world.ts             # Grid state, food spawning, pheromone decay/diffusion
│   ├── ant.ts               # Ant state + step behavior
│   └── simulation.ts        # Fixed-timestep tick loop, orchestrates world+ants
├── render/
│   └── renderer.ts          # Canvas setup, ImageData buffer, draw pipeline
└── stores/
    └── gameStore.ts         # Game state store
```

---

## 10. What to Add Next (Post-Initial)

After the core loop is working:
- Economy system (food, EVO).
- Upgrade tree.
- Grid expansion (Territory tiers).
- Prestige system.
- Save/load with localStorage.
- Canvas rendering for larger grids.
