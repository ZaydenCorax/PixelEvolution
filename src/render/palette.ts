// Colour tokens for the canvas renderer, matching DESIGN_TEMPLATE.dc.html
// (option 1A "Instrument"). The renderer draws with the 2D canvas API, so most
// entries are CSS colour strings; food is an RGB pair lerped by cell amount and
// the pheromone hues are raw "r,g,b" so alpha can be applied per-crumb.

export type RGB = readonly [number, number, number];

export const PALETTE = {
  /** Canvas background — shows through cell insets as grid lines. */
  bg: '#0c0e11',
  cellEmpty: '#171a1f',
  nest: '#e0a13a',
  nestCore: '#efb156',
  foodLow: [0x2f, 0x6b, 0x3a] as RGB,
  foodHigh: [0x8a, 0xe0, 0x84] as RGB,
  /** Trail hues as "r,g,b" — blue = home, pink = food (alpha added per crumb). */
  pheromoneHome: '74,163,255',
  pheromoneFood: '255,93,176',
  antSearching: '#eef2ff',
  antCarrying: '#b6f36a',
  antReturning: '#ff9d4d',
  antHalo: 'rgba(0,0,0,0.55)',
  antSpecular: 'rgba(255,255,255,0.65)',
  hoverOutline: '#e0a13a',
} as const;
