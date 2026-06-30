import type { Ants, World as WorldType } from '../game/types';

export interface Renderer {
  container: HTMLDivElement;
  resize(w: number, h: number): void;
  draw(world: WorldType, ants: Ants): void;
  destroy(): void;
}

export function createRenderer(container: HTMLDivElement): Renderer {
  let w = 32;
  let h = 32;
  let cellSize = 20;
  let canvas: HTMLCanvasElement;
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

    canvas = document.createElement('canvas');
    canvas.width = pixelW * dpr;
    canvas.height = pixelH * dpr;
    canvas.style.width = `${pixelW}px`;
    canvas.style.height = `${pixelH}px`;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    canvas.style.margin = 'auto';
    canvas.style.backgroundColor = '#2a2a2a';

    ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    imageData = ctx.createImageData(pixelW, pixelH);

    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.height = '100%';
    container.appendChild(canvas);
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
        let r = 30, g = 30, b = 30;

        if (t === 1) {
          r = 200;
          g = 150;
          b = 50;
        } else if (t === 2) {
          const amt = food[idx] / 255;
          r = Math.round(50 + amt * 100);
          g = Math.round(120 + amt * 135);
          b = Math.round(50 + amt * 50);
        }

        const homePher = pheromoneHome[idx];
        const foodPher = pheromoneFood[idx];

        if (homePher > 0 || foodPher > 0) {
          const blend = 0.5;
          if (homePher > 0) {
            r = Math.round(r * (1 - blend) + 50 * blend * homePher);
            g = Math.round(g * (1 - blend) + 80 * blend * homePher);
            b = Math.round(b * (1 - blend) + 180 * blend * homePher);
          }
          if (foodPher > 0) {
            r = Math.round(r * (1 - blend) + 180 * blend * foodPher);
            g = Math.round(g * (1 - blend) + 50 * blend * foodPher);
            b = Math.round(b * (1 - blend) + 120 * blend * foodPher);
          }
        }

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
      }
    }

    for (let i = 0; i < ants.count; i++) {
      const ax = ants.x[i];
      const ay = ants.y[i];
      if (ax < 0 || ax >= worldW || ay < 0 || ay >= worldH) continue;

      let r = 220, g = 220, b = 220;
      if (ants.state[i] === 1) {
        r = 255; g = 255; b = 100;
      } else if (ants.state[i] === 2) {
        r = 100; g = 200; b = 255;
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
    destroy() {
      container.innerHTML = '';
    },
  };
}