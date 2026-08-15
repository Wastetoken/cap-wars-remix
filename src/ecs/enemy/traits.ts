import { trait } from 'koota'
import * as THREE from 'three'

/**
 * TRAITS - Building blocks of enemy data
 * Think of traits as "components" in traditional ECS terminology.
 * Each trait represents a slice of data that can be attached to entities.
 */

// ============================================
// IDENTITY TRAITS (Tags)
// ============================================

/** Tag to identify an entity as an enemy */
export const IsEnemy = trait()

/** Enemy type: melee (sword arm visible) */
export const IsMeleeEnemy = trait()

/** Enemy type: ranged (canon visible) */
export const IsRangeEnemy = trait()

// ============================================
// TRANSFORM TRAITS
// ============================================

/** 3D Position in world space */
export const Position = trait({ x: 0, y: 0, z: 0 })

/** Velocity for movement */
export const Velocity = trait({ x: 0, y: 0, z: 0 })

/** Rotation (euler angles) */
export const Rotation = trait({ x: 0, y: 0, z: 0 })

/** Scale */
export const Scale = trait({ x: 1, y: 1, z: 1 })

// ============================================
// GAMEPLAY TRAITS
// ============================================

/** Health component */
export const Health = trait({ current: 100, max: 100 })

/** Movement speed multiplier */
export const Speed = trait({ value: 1 })

/** Target position for AI movement */
export const TargetPosition = trait({ x: 0, y: 0, z: 0 })

/** Target velocity for smooth steering (velocity damps toward this) */
export const TargetVelocity = trait({ x: 0, y: 0, z: 0 })

/** Shoot/attack timer (range shooting + melee swings) */
export const ShootTimer = trait(() => ({
  lastShot: Date.now(),
  nextShot: 3000 + Math.random() * 2000, // 3-5 seconds
}))

/** Which mob this entity is (key of MOBS) */
export const MobType = trait({ value: 'mage' as string })

/** Stun state - enemy can't move or shoot when stunned */
export const StunState = trait({ duration: 0 })

/**
 * Boss state machine — attached to every boss mob (see BOSS_MOBS).
 * Bosses are immune to stun/knockback; this trait drives their
 * telegraphed special attacks and phase transitions.
 * Timers are mutated in place by bossBrainSystem (no reactive sets
 * per frame); transitions flip `state`, which EnemyMesh reads.
 */
export const BossBrain = trait(() => ({
  state: 'chase' as
    | 'chase'
    | 'windup'
    | 'leap'
    | 'ring'
    | 'volley'
    | 'recover'
    | 'charge'
    | 'meteor'
    | 'blink'
    | 'shadowstep'
    | 'vanish',
  /** seconds in current state */
  t: 0,
  phase: 1,
  /** seconds until the next special attack may start */
  specialCooldown: 5,
  /** index into the boss config's specials rotation */
  nextSpecial: 0,
  /** special target (slam circle / charge endpoint / blink destination) */
  targetX: 0,
  targetZ: 0,
  leapFromX: 0,
  leapFromZ: 0,
  /** recover duration for the current recovery (varies by attack) */
  recoverFor: 0.8,
  volleyShotsLeft: 0,
  volleyTimer: 0,
  /** ring released mid-spin (fire once) */
  ringReleased: false,
  /** phase-3 add summons fired */
  summoned: false,
  /** knight charge: dash origin, dash phase latch, contact-hit latch */
  chargeFromX: 0,
  chargeFromZ: 0,
  chargeDashing: false,
  chargeHit: false,
  /** mage meteor: casts left + pending impacts (`at` = brain.t to land) */
  meteorLeft: 0,
  meteorTimer: 0,
  meteorStrikes: [] as { x: number; z: number; at: number }[],
  /** rogue melee specials: delayed heavy hit fired */
  strikeDone: false,
}))

export const isSpawned = trait({ value: false })

// ============================================
// VISUAL TRAITS
// ============================================

/** Color for rendering */
export const Color = trait({ r: 1, g: 0, b: 0 }) // Default red

/**
 * Reference to THREE.js mesh (use callback for non-serializable objects)
 * ⚠️ Must use callback syntax for class instances
 */
export const MeshRef = trait(() => ({ current: null as THREE.Mesh | null }))
