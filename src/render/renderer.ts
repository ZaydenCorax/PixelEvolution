import type { Ants, World as WorldType } from '../game/types';
import { inBounds } from '../game/world';
import { cellColor, antColor } from './palette';

const PIXEL_SCALE = 6;

export interface Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  offscreen: HTMLCanvasElement;
  offCtx: CanvasRenderingContext2D;
  buffer: ImageData;
  pixels: Uint8ClampedArray;
  resize(w: number, h: number): void;
  draw(world: WorldType, ants: Ants): void;
  destroy(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const offscreen = document.createElement('canvas');
  const offCtx = offscreen.getContext('2d', { willReadFrequently: true })!;

  let w = 0;
  let h = 0;
  let pixels = new Uint8ClampedArray(4);
  let buffer = new ImageData(1, 1);

  function resize(worldW: number, worldH: number): void {
    w = worldW;
    h = worldH;
    canvas.width = worldW * PIXEL_SCALE;
    canvas.height = worldH * PIXEL_SCALE;
    offscreen.width = worldW;
    offscreen.height = worldH;
    buffer = offCtx.createImageData(worldW, worldH);
    pixels = buffer.data;
  }

  function draw(world: WorldType, ants: Ants): void {
    const len = w * h;
    for (let i = 0; i < len; i++) {
      const terrain = world.terrain[i];
      const food = world.food[i];
      const c = cellColor(terrain, food);

      const j = i * 4;
      pixels[j] = c[0];
      pixels[j + 1] = c[1];
      pixels[j + 2] = c[2];
      pixels[j + 3] = c[3];
    }

    for (let i = 0; i < ants.count; i++) {
      const ax = ants.x[i];
      const ay = ants.y[i];
      if (inBounds(world, ax, ay)) {
        const idx = ay * world.w + ax;
        const c = antColor(ants.state[i]);
        const j = idx * 4;
        pixels[j] = c[0];
        pixels[j + 1] = c[1];
        pixels[j + 2] = c[2];
        pixels[j + 3] = c[3];
      }
    }

    offCtx.putImageData(buffer, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
  }

  return {
    canvas,
    ctx,
    offscreen,
    offCtx,
    buffer,
    pixels,
    resize,
    draw,
    destroy() {},
  };
}
