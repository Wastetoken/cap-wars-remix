// ============================================================================
// Endless cycles (NG+) — after the King falls the run can continue from
// Level I with every mob scaled up. The power fantasy: your gear, talents
// and souls keep accumulating; the dungeon keeps getting meaner.
// ============================================================================

/** Enemy health multiplier per cycle beyond the first */
export const cycleHealthMult = (cycle: number) => 1 + 0.6 * cycle

/** Enemy damage multiplier per cycle */
export const cycleDamageMult = (cycle: number) => 1 + 0.3 * cycle

/** Enemy speed multiplier per cycle (capped — readability matters) */
export const cycleSpeedMult = (cycle: number) => Math.min(1 + 0.06 * cycle, 1.35)

/** Soul reward multiplier per cycle */
export const cycleSoulsMult = (cycle: number) => 1 + 0.5 * cycle

// ---------------------------------------------------------------------------
// Player-level scaling — mobs keep pace with your level so a high-level
// run isn't a one-shot parade. Stacks multiplicatively with cycle scaling.
// ---------------------------------------------------------------------------

/** Enemy health multiplier vs player level (+35% per level past 1) */
export const levelHealthMult = (playerLevel: number) => 1 + 0.35 * (playerLevel - 1)

/** Enemy damage multiplier vs player level (+12% per level past 1) */
export const levelDamageMult = (playerLevel: number) => 1 + 0.12 * (playerLevel - 1)

/** Soul reward multiplier vs player level (+10% per level past 1) */
export const levelSoulsMult = (playerLevel: number) => 1 + 0.1 * (playerLevel - 1)

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** Display name for a cycle: 0 → 'I', 1 → 'II', …, 10+ → '11' */
export const cycleLabel = (cycle: number) =>
  cycle < ROMAN.length ? ROMAN[cycle] : String(cycle + 1)
