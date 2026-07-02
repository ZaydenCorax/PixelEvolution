import type { Ants, World as WorldType } from '../game/types';
import { TERRAIN, ANT_STATE, MAX_FOOD_PER_CELL } from '../game/constants';
import { PALETTE } from './palette';

// Linear interpolation between two channel values (used for the food gradient).
function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

export interface Renderer {
  container: HTMLDivElement;
  resize(w: number, h: number): void;
  /** Draw the world; `hover` (optional) outlines the inspected cell. */
  draw(world: WorldType, ants: Ants, hover?: { x: number; y: number } | null): void;
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

  function resize(worldW: number, worldH: number): void {
    w = worldW;
    h = worldH;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const maxSize = Math.min(rect.width || 640, rect.height || 640);
    cellSize = Math.max(6, Math.floor(maxSize / Math.max(w, h)));

    const pixelW = w * cellSize;
    const pixelH = h * cellSize;

    // Reuse the canvas element across resizes so the ResizeObserver can call this
    // cheaply and we don't tear down/rebuild DOM (or lose it under the overlay).
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.display = 'block';
      container.innerHTML = '';
      container.appendChild(canvas);
    }

    canvas.width = pixelW * dpr;
    canvas.height = pixelH * dpr;
    canvas.style.width = `${pixelW}px`;
    canvas.style.height = `${pixelH}px`;

    ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  // One pheromone crumb: a centred square that shrinks and fades with the marker's
  // remaining value (1 = fresh, →0 = decayed), with a soft same-hue halo.
  function drawCrumb(x: number, y: number, value: number, rgb: string): void {
    const side = cellSize * (0.2 + 0.55 * value);
    const px = x * cellSize + (cellSize - side) / 2;
    const py = y * cellSize + (cellSize - side) / 2;
    ctx.shadowColor = `rgba(${rgb},0.6)`;
    ctx.shadowBlur = cellSize * 0.35 * value;
    ctx.fillStyle = `rgba(${rgb},${0.22 + 0.55 * value})`;
    ctx.fillRect(px, py, side, side);
  }

  function draw(world: WorldType, ants: Ants, hover: { x: number; y: number } | null = null): void {
    if (!canvas) return;
    const { terrain, food, pheromoneHome, pheromoneFood } = world;
    const size = Math.max(w, h) * cellSize;

    // Background — the 1px cell insets let it show through as grid lines.
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = PALETTE.cellEmpty;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 1, cellSize - 1);
      }
    }

    // Pheromone breadcrumbs: blue = home trail, pink = food trail. Nest and food
    // cells own their look, so no crumbs there. When both trails share a cell the
    // larger square is drawn first so the smaller stays visible.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (terrain[idx] !== TERRAIN.EMPTY) continue;
        const home = pheromoneHome[idx];
        const foodPher = pheromoneFood[idx];
        if (home <= 0 && foodPher <= 0) continue;
        if (foodPher >= home) {
          if (foodPher > 0) drawCrumb(x, y, foodPher, PALETTE.pheromoneFood);
          if (home > 0) drawCrumb(x, y, home, PALETTE.pheromoneHome);
        } else {
          drawCrumb(x, y, home, PALETTE.pheromoneHome);
          if (foodPher > 0) drawCrumb(x, y, foodPher, PALETTE.pheromoneFood);
        }
      }
    }
    ctx.shadowBlur = 0;

    // Solid terrain: food cells (green gradient by amount) and the nest block
    // (amber, with a lighter core at the exact centre).
    const nestXs: number[] = [];
    const nestYs: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const t = terrain[idx];
        if (t === TERRAIN.FOOD) {
          const amt = Math.min(1, food[idx] / MAX_FOOD_PER_CELL);
          const r = lerp(PALETTE.foodLow[0], PALETTE.foodHigh[0], amt);
          const g = lerp(PALETTE.foodLow[1], PALETTE.foodHigh[1], amt);
          const b = lerp(PALETTE.foodLow[2], PALETTE.foodHigh[2], amt);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 1, cellSize - 1);
        } else if (t === TERRAIN.NEST) {
          nestXs.push(x);
          nestYs.push(y);
          ctx.fillStyle = PALETTE.nest;
          ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 1, cellSize - 1);
        }
      }
    }
    // Lighter core at the nest's centre cell (mid of the stamped block).
    if (nestXs.length > 0) {
      const cx = nestXs[Math.floor(nestXs.length / 2)];
      const cy = nestYs[Math.floor(nestYs.length / 2)];
      ctx.fillStyle = PALETTE.nestCore;
      ctx.fillRect(cx * cellSize + 1, cy * cellSize + 1, cellSize - 1, cellSize - 1);
    }

    // Ants as bright discs — dark halo, state-coloured body, specular glint — so
    // they pop above the faded crumbs and never read as trail squares.
    for (let i = 0; i < ants.count; i++) {
      const ax = ants.x[i];
      const ay = ants.y[i];
      if (ax < 0 || ax >= w || ay < 0 || ay >= h) continue;

      let color: string = PALETTE.antSearching;
      if (ants.state[i] === ANT_STATE.CARRYING) color = PALETTE.antCarrying;
      else if (ants.state[i] === ANT_STATE.RETURNING) color = PALETTE.antReturning;

      const px = ax * cellSize + cellSize / 2;
      const py = ay * cellSize + cellSize / 2;
      const rad = Math.max(3, cellSize * 0.34);

      ctx.beginPath();
      ctx.arc(px, py, rad + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.antHalo;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px - rad * 0.3, py - rad * 0.3, rad * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.antSpecular;
      ctx.fill();
    }

    // Amber outline on the hovered (inspected) cell.
    if (hover) {
      ctx.strokeStyle = PALETTE.hoverOutline;
      ctx.lineWidth = 2;
      ctx.strokeRect(hover.x * cellSize + 0.5, hover.y * cellSize + 0.5, cellSize - 1, cellSize - 1);
    }
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
