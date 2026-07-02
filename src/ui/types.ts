// Shared shapes for the UI rails.

/** One per-state row in the right rail's colony readout. */
export interface StateStat {
  name: string;
  /** Dot colour — matches the ant's disc colour on the grid. */
  dot: string;
  /** Energy-bar colour (the searching row uses blue, not its white dot colour). */
  bar: string;
  count: number;
  avgEnergy: number; // 0..maxEnergy
  avgAge: number;
}
