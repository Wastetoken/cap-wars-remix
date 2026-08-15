// ============================================================================
// Animation Constants & Types
// ============================================================================
// Clip names from the KayKit Adventurers (CC0) — 75 embedded animations per model.
// https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
//
// Each character uses different clips for their weapon style.
// ============================================================================

export const Animations = {
  ATTACK_01: '1H_Melee_Attack_Chop',
  ATTACK_02: '1H_Melee_Attack_Slice_Diagonal',
  DASH_ATTACK: '1H_Melee_Attack_Stab',
  PARRY_01: 'Block',
  PARRY_02: 'Block_Attack',
  SPIN_ATTACK: '2H_Melee_Attack_Spin',
  STANCE: 'Idle',
  RUN: 'Running_A',
} as const

export const ParryAnimations = [
  Animations.PARRY_01,
  Animations.PARRY_02,
] as const

// ============================================================================
// Types
// ============================================================================

export type ActionName = string

export type CharacterAnims = {
  stance: string
  run: string
  attack1: string
  attack2: string
  spinAttack: string
  dashAttack: string
  slam: string
  parry1: string
  parry2: string
}

export type CapsHandle = {
  onMouseDown: () => void
  onMouseUp: () => void
  onRightClick: () => void
  onRightRelease: () => void
}

export type AnimationState = {
  currentAnimation: string
  nextAttack: string
  isAttacking: boolean
  isParrying: boolean
  /** A one-shot mobility clip (dash/leap/blink) is playing — suppresses
   *  locomotion overrides but does NOT block attacks or abilities */
  isMobility: boolean
  mobilityClip: string
  isHolding: boolean
  holdStartTime: number
  chargeProgress: number
  isInChargeStance: boolean
  /** Click released mid-swing — fire it as soon as the swing ends instead of
   *  swallowing the input (buffered attack) */
  queuedAttack: 'attack' | 'spin' | null
  /** RMB is currently held — the mage's block stays up until release */
  rmbHeld: boolean
  parryStartTime: number
  parryCooldownEnd: number
}

// ============================================================================
// Constants
// ============================================================================

export const ATTACK_SPEED = 2.5
export const SPIN_ATTACK_SPEED = 1.5
export const CHARGE_DELAY_MS = 200  // Time before stance/charging starts
export const CHARGE_TIME_MS = 600   // Time to fully charge after stance starts
export const PARRY_DURATION_MS = 500  // Time before returning to stance after parry
export const PARRY_COOLDOWN_MS = 2000 // Cooldown before parry can be used again
export const DASH_ATTACK_SPEED = 2.5
