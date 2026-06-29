export const PALETTE = {
  empty: [30, 30, 30, 255] as const,
  wall: [10, 10, 10, 255] as const,
  nest: [200, 150, 50, 255] as const,
  foodLow: [50, 120, 50, 255] as const,
  foodHigh: [150, 255, 100, 255] as const,
  pheromoneHome: [50, 80, 180, 255] as const,
  pheromoneFood: [180, 50, 120, 255] as const,
  antSearching: [220, 220, 220, 255] as const,
  antCarrying: [255, 255, 100, 255] as const,
  antReturning: [100, 200, 255, 255] as const,
} as const;

export type RGB = readonly [number, number, number, number];

export function cellColor(terrain: number, food: number): RGB {
  if (terrain === 1) return PALETTE.wall;
  if (terrain === 2) return PALETTE.nest;
  if (terrain === 3) {
    const t = food / 255;
    return [
      Math.round(PALETTE.foodLow[0] + (PALETTE.foodHigh[0] - PALETTE.foodLow[0]) * t),
      Math.round(PALETTE.foodLow[1] + (PALETTE.foodHigh[1] - PALETTE.foodLow[1]) * t),
      Math.round(PALETTE.foodLow[2] + (PALETTE.foodHigh[2] - PALETTE.foodLow[2]) * t),
      255,
    ] as RGB;
  }
  return PALETTE.empty;
}

export function antColor(state: number): RGB {
  if (state === 1) return PALETTE.antCarrying;
  if (state === 2) return PALETTE.antReturning;
  return PALETTE.antSearching;
}
