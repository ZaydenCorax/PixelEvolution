import type { Ants, World as WorldType } from '../game/types';
import { cellColor, antColor } from './palette';

const EMPTY_CELL_COLOR = [30, 30, 30] as const;
const CELL_MIN_SIZE = 12;

export interface Renderer {
  container: HTMLDivElement;
  resize(w: number, h: number): void;
  draw(world: WorldType, ants: Ants): void;
  destroy(): void;
}

export function createRenderer(container: HTMLDivElement): Renderer {
  let w = 0;
  let h = 0;
  const cells: HTMLDivElement[] = [];

  function resize(worldW: number, worldH: number): void {
    w = worldW;
    h = worldH;
    container.innerHTML = '';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${w}, minmax(${CELL_MIN_SIZE}px, 1fr))`;
    container.style.gridTemplateRows = `repeat(${h}, minmax(${CELL_MIN_SIZE}px, 1fr))`;
    container.style.gap = '1px';
    container.style.width = '100%';
    container.style.height = '100%';

    for (let i = 0; i < w * h; i++) {
      const cell = document.createElement('div');
      cell.style.width = '100%';
      cell.style.height = '100%';
      cell.style.minWidth = `${CELL_MIN_SIZE}px`;
      cell.style.minHeight = `${CELL_MIN_SIZE}px`;
      cell.style.boxSizing = 'border-box';
      cell.style.padding = '2px';
      cell.style.backgroundColor = `rgb(${EMPTY_CELL_COLOR[0]}, ${EMPTY_CELL_COLOR[1]}, ${EMPTY_CELL_COLOR[2]})`;
      container.appendChild(cell);
      cells.push(cell);
    }
  }

  function draw(world: WorldType, ants: Ants): void {
    const worldW = world.w;
    const worldH = world.h;
    const len = worldW * worldH;
    for (let i = 0; i < len; i++) {
      const terrain = world.terrain[i];
      const food = world.food[i];
      const c = cellColor(terrain, food);
      cells[i].style.backgroundColor = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }

    for (let i = 0; i < ants.count; i++) {
      const ax = ants.x[i];
      const ay = ants.y[i];
      if (ax >= 0 && ax < worldW && ay >= 0 && ay < worldH) {
        const idx = ay * worldW + ax;
        const c = antColor(ants.state[i]);
        cells[idx].style.backgroundColor = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      }
    }
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