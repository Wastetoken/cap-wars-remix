// ============================================================================
// Playable characters — each has unique model, animations, stats & skill tree.
// All models are KayKit Adventurers (CC0) with the same 76-clip library.
// ============================================================================

export type CharacterId = 'knight' | 'barbarian' | 'mage' | 'rogue'

export type CharacterDef = {
  id: CharacterId
  name: string
  title: string
  model: string
  scale: number
  /** Base max health before skill bonuses */
  baseHealth: number
  /** Movement speed multiplier */
  speed: number
  /** Attack damage multiplier (applied to base damage) */
  damageMult: number
  /** Which weapon attachment to keep visible */
  weapon: string
  /** Ranged characters fire bolts on basic attacks instead of melee swings */
  ranged?: boolean
  /** Signature mobility move on SHIFT — distinct per class */
  mobility: {
    name: string
    /** dash: quick ground burst · shadowstep: longer burst + evasion window ·
     *  blink: instant teleport · leap: arcing jump with a heavy landing */
    behavior: 'dash' | 'shadowstep' | 'blink' | 'leap'
    distance: number
    /** Travel time in seconds (blink ignores this) */
    duration: number
    /** Base cooldown in seconds (before talent reduction) */
    cooldown: number
    /** Clip played during the move */
    anim: string
    animSpeed: number
    /** shadowstep: i-frames in ms */
    evadeMs?: number
  }
  /** Attachment names to hide (all others shown) */
  hide: string[]
  /** Animation clip names for this character's weapon style */
  anims: {
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
  /** Skill tree branch IDs for this character */
  branches: [string, string, string]
  /** Branch display names */
  branchNames: [string, string, string]
  /** Branch colors */
  branchColors: [string, string, string]
}

const KNIGHT_HIDE = [
  '2H_Sword',
  '1H_Sword_Offhand',
  'Badge_Shield',
  'Rectangle_Shield',
  'Round_Shield',
  'Spike_Shield',
]

const BARBARIAN_HIDE = [
  '1H_Axe',
  '1H_Axe_Offhand',
  'Barbarian_Round_Shield',
  'Mug',
]

const MAGE_HIDE = [
  '1H_Wand',
  'Spellbook',
  'Spellbook_open',
]

const ROGUE_HIDE = [
  '1H_Crossbow',
  '2H_Crossbow',
  'Throwable',
]

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    title: 'Balanced swordsman',
    model: '/character/Knight.glb',
    scale: 0.75,
    baseHealth: 100,
    speed: 1,
    damageMult: 1,
    weapon: '1H_Sword',
    hide: KNIGHT_HIDE,
    mobility: {
      name: 'Dash',
      behavior: 'dash',
      distance: 6,
      duration: 0.2,
      cooldown: 1.5,
      anim: 'Dodge_Forward',
      animSpeed: 1.6,
    },
    anims: {
      stance: 'Idle',
      run: 'Running_A',
      attack1: '1H_Melee_Attack_Chop',
      attack2: '1H_Melee_Attack_Slice_Diagonal',
      spinAttack: '2H_Melee_Attack_Spin',
      dashAttack: '1H_Melee_Attack_Stab',
      slam: '1H_Melee_Attack_Stab',
      parry1: 'Block',
      parry2: 'Block_Attack',
    },
    branches: ['warrior', 'fury', 'guardian'],
    branchNames: ['Warrior', 'Fury', 'Guardian'],
    branchColors: ['#ef4444', '#f59e0b', '#22c55e'],
  },
  barbarian: {
    id: 'barbarian',
    name: 'Barbarian',
    title: 'Slow but devastating',
    model: '/character/Barbarian.glb',
    scale: 0.82,
    baseHealth: 140,
    speed: 0.85,
    damageMult: 1.35,
    weapon: '2H_Axe',
    hide: BARBARIAN_HIDE,
    mobility: {
      name: 'Leap',
      behavior: 'leap',
      distance: 8.5,
      duration: 0.45,
      cooldown: 1.7,
      anim: 'Jump_Full_Long',
      animSpeed: 1.3,
    },
    anims: {
      stance: 'Idle',
      run: 'Running_A',
      attack1: '2H_Melee_Attack_Chop',
      attack2: '2H_Melee_Attack_Slice',
      spinAttack: '2H_Melee_Attack_Spinning',
      dashAttack: '2H_Melee_Attack_Chop',
      slam: '2H_Melee_Attack_Chop',
      parry1: 'Block',
      parry2: 'Block_Attack',
    },
    branches: ['berserker', 'ravager', 'juggernaut'],
    branchNames: ['Berserker', 'Ravager', 'Juggernaut'],
    branchColors: ['#dc2626', '#f97316', '#16a34a'],
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    title: 'Fast dual-wielder',
    model: '/character/Rogue.glb',
    scale: 0.72,
    baseHealth: 80,
    speed: 1.15,
    damageMult: 0.85,
    weapon: 'Knife',
    hide: ROGUE_HIDE,
    mobility: {
      name: 'Shadowstep',
      behavior: 'shadowstep',
      distance: 8,
      duration: 0.16,
      cooldown: 1.5,
      anim: 'Dodge_Forward',
      animSpeed: 2.2,
      evadeMs: 350,
    },
    anims: {
      stance: 'Idle',
      run: 'Running_A',
      attack1: 'Dualwield_Melee_Attack_Chop',
      attack2: 'Dualwield_Melee_Attack_Slice',
      spinAttack: '2H_Melee_Attack_Spin',
      dashAttack: '1H_Melee_Attack_Stab',
      slam: 'Dualwield_Melee_Attack_Chop',
      parry1: 'Block',
      parry2: 'Block_Attack',
    },
    branches: ['assassination', 'shadow', 'acrobatics'],
    branchNames: ['Assassination', 'Shadow', 'Acrobatics'],
    branchColors: ['#a855f7', '#6366f1', '#06b6d4'],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    title: 'Ranged spellcaster',
    model: '/character/Mage.glb',
    scale: 0.74,
    baseHealth: 85,
    speed: 0.95,
    damageMult: 0.9,
    weapon: '2H_Staff',
    ranged: true,
    hide: MAGE_HIDE,
    mobility: {
      name: 'Blink',
      behavior: 'blink',
      distance: 8,
      duration: 0,
      cooldown: 2,
      anim: 'Spellcast_Raise',
      animSpeed: 2.2,
    },
    anims: {
      stance: 'Idle',
      run: 'Running_A',
      attack1: 'Spellcast_Shoot',
      attack2: 'Spellcast_Long',
      spinAttack: 'Spellcast_Raise',
      dashAttack: 'Spellcast_Shoot',
      slam: 'Spellcast_Raise',
      parry1: 'Block',
      parry2: 'Block_Attack',
    },
    branches: ['arcane', 'frost', 'conjuration'],
    branchNames: ['Arcane', 'Frost', 'Conjuration'],
    branchColors: ['#8b5cf6', '#3b82f6', '#10b981'],
  },
}

export const CHARACTER_LIST: CharacterId[] = ['knight', 'barbarian', 'rogue', 'mage']

export const DEFAULT_CHARACTER: CharacterId = 'knight'

// ============================================================================
// Per-class VFX identity — every visual the character produces (slash arc,
// weapon charge glow, mobility ghost + sparks) reads from this table so each
// class has its own color language.
// ============================================================================

export type ClassVfx = {
  /** Basic-attack slash arc colors (TSL uniforms, hot HDR) */
  slash: { base: string; glow: string }
  /** Slash spark spray pair [primary, secondary] */
  slashSparks: [string, string]
  /** Weapon charge-up glow */
  swordGlow: string
  /** Mobility move: trailing body ghost */
  ghost: { color: string; size: number; opacity: number }
  /** Mobility move: spark/wisp spray */
  sparks: { color: string; secondary: string; gravity: number }
}

export const CHARACTER_VFX: Record<CharacterId, ClassVfx> = {
  // Steel & gold — the signature orange slash stays his
  knight: {
    slash: { base: '#ffa808', glow: '#8f9aff' },
    slashSparks: ['#FF711E', '#3d91ff'],
    swordGlow: '#FF9C39',
    ghost: { color: '#dbeafe', size: 2.0, opacity: 0.55 },
    sparks: { color: '#fde68a', secondary: '#93c5fd', gravity: -0.7 },
  },
  // Fire & embers — heavier ghost, embers that rise
  barbarian: {
    slash: { base: '#ff4208', glow: '#ffc46b' },
    slashSparks: ['#ff5a1a', '#ffd28a'],
    swordGlow: '#FF3D00',
    ghost: { color: '#ff7a2a', size: 2.35, opacity: 0.6 },
    sparks: { color: '#ffb35c', secondary: '#ff5a1a', gravity: 0.5 },
  },
  // Shadow violet — sleeker ghost, wisps that drift upward
  rogue: {
    slash: { base: '#a855f7', glow: '#6366f1' },
    slashSparks: ['#a855f7', '#818cf8'],
    swordGlow: '#A855F7',
    ghost: { color: '#7c3aed', size: 1.7, opacity: 0.5 },
    sparks: { color: '#c4b5fd', secondary: '#6366f1', gravity: 0.6 },
  },
  // Arcane cyan-violet — weightless motes, no gravity
  mage: {
    slash: { base: '#7dd3fc', glow: '#8b5cf6' },
    slashSparks: ['#7dd3fc', '#c4b5fd'],
    swordGlow: '#7DD3FC',
    ghost: { color: '#c4b5fd', size: 1.9, opacity: 0.55 },
    sparks: { color: '#e0e7ff', secondary: '#a78bfa', gravity: 0 },
  },
}
