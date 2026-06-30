# Design Document: Interactive Grid System for Browser-Based Simulation Game

**Version:** 1.0  
**Status:** Ready for Implementation  
**Target:** Browser game (vanilla JS + HTML/CSS, no framework required)

---

## 1. Overview

This document describes the architecture and implementation requirements for a responsive, interactive grid system intended for use in a Game of Life-style cellular simulation. The grid must support individual cell state tracking, smooth animation, hover/click interactivity, and visually clean rendering at any screen size.

---

## 2. Requirements

### 2.1 Functional Requirements

- Each cell must be independently addressable and capable of holding arbitrary state (e.g. alive/dead, color, metadata).
- Each cell must be hoverable and clickable, with support for attaching tooltip content to individual cells.
- The grid must support tick-based simulation updates (i.e. all cells update simultaneously each frame or tick).
- The implementation must be extensible for future gameplay mechanics (e.g. multiple cell types, animated transitions, overlays).

### 2.2 Visual Requirements

- Grid lines must be clearly visible and visually distinguished from cell content.
- Cells must be perfectly square (1:1 width-to-height ratio) at all times.
- The grid must be responsive: it scales to fit the available container without distorting cell proportions.
- Cell rendering must be crisp, with no subpixel blurring on grid lines or cell boundaries.

### 2.3 Performance Requirements

- Must sustain smooth animation (targeting 60 fps) for grids up to at least 200×200 cells.
- DOM complexity must not scale with grid size.

---

## 3. Architecture

### 3.1 Rendering Layer: HTML5 Canvas

All visual output (cells, grid lines, animations) is rendered onto a single `<canvas>` element using the 2D Context API (`canvas.getContext('2d')`).

**Rationale:** A DOM-based approach (e.g. CSS Grid with `<div>` cells) hits a hard performance wall at around 10,000 elements. Canvas renders the same grid as a single composited surface, enabling smooth animation at much larger scales. Canvas also provides full control over sub-pixel rendering, color, and visual style.

### 3.2 Interaction Layer: Invisible CSS Grid Overlay

A transparent `<div>` overlay, positioned absolutely on top of the canvas and subdivided into a matching CSS Grid, handles all pointer events. Each grid cell `<div>` corresponds 1:1 to a canvas cell.

**Rationale:** This keeps pointer events in the DOM (with native hover, click, and accessibility support) while keeping rendering entirely on canvas. The two layers are always kept in sync in size and cell count.

### 3.3 Container

Both the canvas and the overlay are children of a shared `position: relative` container `<div>`. Both are `position: absolute; top: 0; left: 0` and share identical computed dimensions.

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

---

## 4. Sizing and Responsiveness

### 4.1 Cell Size Calculation

Cell size is derived at runtime from the container dimensions and the desired grid dimensions. It must always be floored to an integer to prevent subpixel rendering artefacts.

```js
const cellSize = Math.floor(Math.min(container.clientWidth, container.clientHeight) / GRID_COLS);
```

The canvas and overlay are then sized to exactly `cellSize * GRID_COLS` wide and `cellSize * GRID_ROWS` tall. This means the grid may not fill the entire container if the container's aspect ratio differs from the grid's — this is intentional and avoids distortion.

### 4.2 Responsive Updates via ResizeObserver

A `ResizeObserver` watches the container element. Whenever the container is resized (e.g. window resize, panel collapse, orientation change), the grid recalculates `cellSize` and re-renders.

```js
const observer = new ResizeObserver(() => {
  recalculateSizing();
  syncOverlay();
  redraw();
});
observer.observe(container);
```

No CSS transforms or `zoom` tricks are to be used. The canvas dimensions (`canvas.width`, `canvas.height`) are always set in physical pixels.

### 4.3 High-DPI / Retina Support (Optional but Recommended)

To support high-DPI screens without blurry rendering, multiply canvas pixel dimensions by `window.devicePixelRatio` and scale the drawing context down accordingly:

```js
const dpr = window.devicePixelRatio || 1;
canvas.width  = gridPixelWidth  * dpr;
canvas.height = gridPixelHeight * dpr;
canvas.style.width  = gridPixelWidth  + 'px';
canvas.style.height = gridPixelHeight + 'px';
ctx.scale(dpr, dpr);
```

---

## 5. Grid Rendering

### 5.1 Grid Line Strategy

Grid lines are produced by rendering each cell with a uniform inset (e.g. 1px on all sides). The canvas background color shows through the gaps, acting as the grid line color. This avoids explicit line-drawing loops and guarantees consistent 1px lines regardless of cell size.

```js
// Example: draw a single cell with 1px inset
ctx.fillStyle = cellColor;
ctx.fillRect(
  col * cellSize + 1,
  row * cellSize + 1,
  cellSize - 2,
  cellSize - 2
);
```

The canvas element's background color (set via CSS or `ctx.fillRect` on the full canvas) defines the grid line color.

### 5.2 Render Loop

The simulation runs on a tick system. The render loop is decoupled from the simulation tick rate:

- **Simulation tick:** controlled by a `setInterval` or manually triggered. Updates the cell state array.
- **Render frame:** driven by `requestAnimationFrame`. Reads the current state array and redraws the canvas.

```js
// Simulation tick (e.g. every 100ms)
setInterval(() => {
  simulationTick();
}, tickIntervalMs);

// Render loop (60fps target)
function renderLoop() {
  if (isDirty) {
    redraw();
    isDirty = false;
  }
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);
```

`isDirty` is set to `true` whenever the state changes, avoiding unnecessary redraws.

### 5.3 Full vs. Partial Redraws

For small grids or infrequent updates, a full redraw each tick is acceptable. For large grids or high tick rates, only changed cells should be redrawn:

```js
// Clear and redraw only changed cells
for (const [row, col] of changedCells) {
  drawCell(row, col);
}
```

Implementors should start with full redraws and optimize to partial redraws if performance profiling reveals it as a bottleneck.

---

## 6. State Management

### 6.1 Cell State Array

The grid state is stored in a flat typed array for cache efficiency:

```js
// Uint8Array for simple binary states (alive/dead)
const state = new Uint8Array(GRID_ROWS * GRID_COLS);

// Access pattern
function getCell(row, col) { return state[row * GRID_COLS + col]; }
function setCell(row, col, val) { state[row * GRID_COLS + col] = val; }
```

For richer cell states (type, color, metadata), use an array of objects or parallel arrays depending on performance needs.

### 6.2 Double Buffering

To avoid reading and writing the same array during a simulation tick, maintain two state arrays and swap them each tick:

```js
let current = new Uint8Array(GRID_ROWS * GRID_COLS);
let next    = new Uint8Array(GRID_ROWS * GRID_COLS);

function simulationTick() {
  computeNextState(current, next);
  [current, next] = [next, current]; // swap buffers
  isDirty = true;
}
```

---

## 7. Interactivity

### 7.1 Overlay Cell Structure

The overlay `<div>` uses CSS Grid matching the logical grid dimensions:

```css
.grid-overlay {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none; /* container is transparent */
}

.grid-cell {
  pointer-events: all; /* individual cells receive events */
}
```

Each `.grid-cell` is a `<div>` with `data-row` and `data-col` attributes. Event listeners are attached via event delegation on the overlay container (not on each cell individually) for performance.

```js
overlay.addEventListener('mouseover', e => {
  const cell = e.target.closest('.grid-cell');
  if (!cell) return;
  const row = parseInt(cell.dataset.row);
  const col = parseInt(cell.dataset.col);
  onCellHover(row, col);
});

overlay.addEventListener('click', e => {
  const cell = e.target.closest('.grid-cell');
  if (!cell) return;
  onCellClick(parseInt(cell.dataset.row), parseInt(cell.dataset.col));
});
```

### 7.2 Tooltip System

Tooltips are rendered in a dedicated `<div>` outside the grid container, positioned absolutely relative to the viewport using the mouse coordinates from the pointer event.

```js
function showTooltip(content, x, y) {
  tooltip.innerHTML = content;
  tooltip.style.left = (x + 12) + 'px';
  tooltip.style.top  = (y + 12) + 'px';
  tooltip.style.display = 'block';
}

function hideTooltip() {
  tooltip.style.display = 'none';
}
```

Tooltip content is determined by the cell's metadata, which can be stored in a separate parallel data structure keyed by `row * GRID_COLS + col`.

### 7.3 Hover Highlight

When a cell is hovered, it is visually highlighted by redrawing only that cell on the canvas with a highlight color. On mouse-out, the cell is redrawn in its normal state color.

---

## 8. Module Structure

The implementation should be organized into the following logical modules (files or ES modules):

| Module | Responsibility |
|---|---|
| `grid.js` | Container setup, canvas + overlay creation, sizing, ResizeObserver |
| `renderer.js` | Canvas drawing: cells, grid lines, highlight, full/partial redraw |
| `state.js` | Cell state arrays, double-buffer swap, getCell/setCell accessors |
| `simulation.js` | Tick logic, rule application (e.g. Conway's rules) |
| `interaction.js` | Overlay event delegation, hover/click handlers, tooltip positioning |
| `main.js` | Wiring all modules together, game loop, configuration constants |

---

## 9. Configuration Constants

All tunable parameters should be defined in a single `config` object or at the top of `main.js`:

```js
const CONFIG = {
  GRID_COLS:       80,        // Number of columns
  GRID_ROWS:       60,        // Number of rows
  TICK_INTERVAL_MS: 100,      // Simulation speed in milliseconds
  GRID_LINE_COLOR: '#1a1a2e', // Canvas background / grid line color
  CELL_ALIVE_COLOR: '#e94560',
  CELL_DEAD_COLOR:  '#16213e',
  CELL_HOVER_COLOR: '#0f3460',
  CELL_GAP_PX:      1,        // Grid line thickness in pixels
};
```

---

## 10. Non-Goals

The following are explicitly out of scope for this implementation:

- Server-side state or multiplayer synchronization.
- WebGL or GPU-accelerated rendering.
- Accessibility (ARIA roles) for cell states — this can be layered on later.
- Mobile touch support — mouse events only for now.
- Any specific simulation ruleset — `simulation.js` should expose a hook but ship with Conway's Game of Life as the default.

---

## 11. Suggested Implementation Order

1. Set up the HTML skeleton: container, canvas, overlay, tooltip div.
2. Implement `grid.js`: container sizing, canvas + overlay dimensions, ResizeObserver.
3. Implement `state.js`: flat array, accessors, double-buffer swap.
4. Implement `renderer.js`: draw all cells, respecting `CONFIG` colors and gap.
5. Wire up `main.js`: initialize with a random starting state, call `redraw()`.
6. Implement `simulation.js`: Conway tick logic, set `isDirty = true` after each tick.
7. Add `requestAnimationFrame` render loop with `isDirty` guard.
8. Implement `interaction.js`: overlay event delegation, hover highlight, basic tooltip.
9. Add `setInterval` for simulation ticks and confirm rendering and simulation are decoupled.
10. Test resize behavior by manually resizing the browser window.
