import type { Ants, World as WorldType } from '../game/types';
import { TERRAIN, ANT_STATE, MAX_FOOD_PER_CELL } from '../game/constants';
import { PALETTE } from './palette';

// Linear interpolation between two channel values (used for the food gradient).
function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

// Paint a centred square inside one grid cell, sized by `value` (0..1) — used to render
// a pheromone marker so it shrinks in proportion to its remaining decay value. A fully
// decayed crumb (value → 0) rounds to zero size and draws nothing.
function fillCellSquare(
  data: Uint8ClampedArray,
  worldW: number,
  cellSize: number,
  cellX: number,
  cellY: number,
  value: number,
  color: readonly number[],
): void {
  const size = Math.round((cellSize - 2) * value);
  if (size <= 0) return;

  const off = Math.floor((cellSize - size) / 2);
  const baseX = cellX * cellSize + off;
  const baseY = cellY * cellSize + off;
  const stride = worldW * cellSize;

  for (let sy = 0; sy < size; sy++) {
    for (let sx = 0; sx < size; sx++) {
      const di = ((baseY + sy) * stride + (baseX + sx)) * 4;
      data[di] = color[0];
      data[di + 1] = color[1];
      data[di + 2] = color[2];
      data[di + 3] = 255;
    }
  }
}

export interface Renderer {
  container: HTMLDivElement;
  resize(w: number, h: number): void;
  draw(world: WorldType, ants: Ants): void;
  /** Map a viewport (clientX/Y) point to a grid cell, or null if outside the canvas. */
  clientToCell(clientX: number, clientY: number): { x: number; y: number } | null;
  destroy(): void;
}

export function createRenderer(container: HTMLDivElement): Renderer {
  let w = 32;
  let h = 32;
  let cellSize = 20;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D;
  let imageData: ImageData;

  function resize(worldW: number, worldH: number): void {
    w = worldW;
    h = worldH;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const maxSize = Math.min(rect.width || 600, rect.height || 600) / dpr;
    cellSize = Math.max(8, Math.floor(maxSize / Math.max(w, h)));

    const pixelW = w * cellSize;
    const pixelH = h * cellSize;

    // Reuse the canvas element across resizes so the ResizeObserver can call this
    // cheaply and we don't tear down/rebuild DOM (or lose it under the overlay).
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.imageRendering = 'pixelated';
      canvas.style.display = 'block';
      canvas.style.margin = 'auto';
      canvas.style.backgroundColor = '#2a2a2a';
      container.innerHTML = '';
      container.style.position = 'relative';
      container.style.width = '100%';
      container.style.height = '100%';
      container.appendChild(canvas);
    }

    canvas.width = pixelW * dpr;
    canvas.height = pixelH * dpr;
    canvas.style.width = `${pixelW}px`;
    canvas.style.height = `${pixelH}px`;

    ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    imageData = ctx.createImageData(pixelW, pixelH);
  }

  function clientToCell(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX >= rect.right ||
      clientY < rect.top ||
      clientY >= rect.bottom
    ) {
      return null;
    }
    const x = Math.floor(((clientX - rect.left) / rect.width) * w);
    const y = Math.floor(((clientY - rect.top) / rect.height) * h);
    if (x < 0 || x >= w || y < 0 || y >= h) return null;
    return { x, y };
  }

  function draw(world: WorldType, ants: Ants): void {
    const { terrain, food, pheromoneHome, pheromoneFood } = world;
    const data = imageData.data;
    const worldW = w;
    const worldH = h;

    for (let y = 0; y < worldH; y++) {
      for (let x = 0; x < worldW; x++) {
        const idx = y * worldW + x;
        const t = terrain[idx];
        let r = PALETTE.empty[0], g = PALETTE.empty[1], b = PALETTE.empty[2];

        if (t === TERRAIN.NEST) {
          r = PALETTE.nest[0];
          g = PALETTE.nest[1];
          b = PALETTE.nest[2];
        } else if (t === TERRAIN.FOOD) {
          const amt = food[idx] / MAX_FOOD_PER_CELL;
          r = lerp(PALETTE.foodLow[0], PALETTE.foodHigh[0], amt);
          g = lerp(PALETTE.foodLow[1], PALETTE.foodHigh[1], amt);
          b = lerp(PALETTE.foodLow[2], PALETTE.foodHigh[2], amt);
        }

        // Fill the cell inset with the terrain colour (the 1px border is left showing
        // the canvas background → free grid lines).
        for (let cy = 1; cy < cellSize - 1; cy++) {
          for (let cx = 1; cx < cellSize - 1; cx++) {
            const px = (y * cellSize + cy) * (worldW * cellSize) + (x * cellSize + cx);
            const di = px * 4;
            data[di] = r;
            data[di + 1] = g;
            data[di + 2] = b;
            data[di + 3] = 255;
          }
        }

        // Draw each present pheromone as a centred square whose size scales with its
        // remaining decay value, so a marker visibly shrinks as it ages. When both
        // trails share a cell, draw the larger square first so the smaller stays visible.
        const homePher = pheromoneHome[idx];
        const foodPher = pheromoneFood[idx];
        if (foodPher > 0 || homePher > 0) {
          if (foodPher >= homePher) {
            fillCellSquare(data, worldW, cellSize, x, y, foodPher, PALETTE.pheromoneFood);
            fillCellSquare(data, worldW, cellSize, x, y, homePher, PALETTE.pheromoneHome);
          } else {
            fillCellSquare(data, worldW, cellSize, x, y, homePher, PALETTE.pheromoneHome);
            fillCellSquare(data, worldW, cellSize, x, y, foodPher, PALETTE.pheromoneFood);
          }
        }
      }
    }

    for (let i = 0; i < ants.count; i++) {
      const ax = ants.x[i];
      const ay = ants.y[i];
      if (ax < 0 || ax >= worldW || ay < 0 || ay >= worldH) continue;

      let [r, g, b] = PALETTE.antSearching;
      if (ants.state[i] === ANT_STATE.CARRYING) {
        [r, g, b] = PALETTE.antCarrying;
      } else if (ants.state[i] === ANT_STATE.RETURNING) {
        [r, g, b] = PALETTE.antReturning;
      }

      const antSize = Math.min(cellSize - 2, 10);
      const startX = ax * cellSize + Math.floor((cellSize - antSize) / 2);
      const startY = ay * cellSize + Math.floor((cellSize - antSize) / 2);

      for (let ay2 = 0; ay2 < antSize; ay2++) {
        for (let ax2 = 0; ax2 < antSize; ax2++) {
          const px = ((startY + ay2) * (worldW * cellSize)) + (startX + ax2);
          const di = px * 4;
          data[di] = r;
          data[di + 1] = g;
          data[di + 2] = b;
          data[di + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  return {
    container,
    resize,
    draw,
    clientToCell,
    destroy() {
      container.innerHTML = '';
      canvas = null;
    },
  };
}