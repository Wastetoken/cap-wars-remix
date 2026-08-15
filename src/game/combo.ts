// ============================================================================
// Combo — consecutive hits without taking damage build a combo. The combo
// pays out twice: more souls per kill (XP) and faster attacks at tiers.
// Getting hit or going quiet for too long breaks it.
// ============================================================================

/** Time without landing a hit before the combo drops */
export const COMBO_WINDOW_MS = 3500

/** Souls (XP) multiplier: +2% per hit, capped at ×2 (50 combo) */
export const comboSoulsMult = (combo: number) => 1 + Math.min(combo, 50) * 0.02

/** Attack-speed multiplier by tier: 10+ → +10%, 25+ → +20%, 40+ → +30% */
export const comboAttackSpeedMult = (combo: number) =>
  combo >= 40 ? 1.3 : combo >= 25 ? 1.2 : combo >= 10 ? 1.1 : 1

/** Combo tiers — milestone announcements + counter styling */
export const COMBO_TIERS = [
  { at: 40, label: 'UNSTOPPABLE', bonus: '+30% attack speed', color: '#fbbf24' },
  { at: 25, label: 'RAMPAGE', bonus: '+20% attack speed', color: '#f97316' },
  { at: 10, label: 'ON A ROLL', bonus: '+10% attack speed', color: '#67e8f9' },
] as const

export const comboTier = (combo: number) =>
  COMBO_TIERS.find((t) => combo >= t.at) ?? null
