// ============================================================================
// Player leveling — souls collected from mobs are XP.
// Each level-up grants 1 talent point, a 25% heal and a full rage bar.
// ============================================================================

/** Cumulative souls required to REACH each level (index = level; level 1 = start). */
const LEVEL_THRESHOLDS = [0, 0, 15, 35, 65, 105, 160, 230, 320, 430, 560, 720]

/** Souls needed to reach `level` (levels beyond the table keep growing ×1.35). */
export const soulsForLevel = (level: number): number => {
  if (level <= 1) return 0
  if (level < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level]
  let req = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]
  for (let l = LEVEL_THRESHOLDS.length; l <= level; l++) {
    req = Math.round(req * 1.35)
  }
  return req
}

/** Highest level reachable with `souls` lifetime souls. Level 1 = starting level. */
export const levelForSouls = (souls: number): number => {
  let level = 1
  while (souls >= soulsForLevel(level + 1)) level++
  return level
}

/** Progress toward the next level for HUD bars. */
export const soulsProgress = (souls: number) => {
  const level = levelForSouls(souls)
  const floor = soulsForLevel(level)
  const ceil = soulsForLevel(level + 1)
  return {
    level,
    into: souls - floor,
    needed: ceil - floor,
    fraction: (souls - floor) / (ceil - floor),
  }
}

/** Fraction of max health restored on level-up. */
export const LEVEL_UP_HEAL_FRACTION = 0.25
