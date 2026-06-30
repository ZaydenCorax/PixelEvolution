export const PALETTE = {
  empty: [30, 30, 30, 255] as const,
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