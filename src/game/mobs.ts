// ============================================================================
// Mob definitions — all models are KayKit Adventurers (CC0), same rig,
// same 76-clip animation library.
// ============================================================================

export type MobType =
  | 'mage'
  | 'rogue'
  | 'barbarian'
  | 'boss'
  | 'boss-knight'
  | 'boss-mage'
  | 'boss-rogue'
  | 'knight'
  | 'berserker'
  | 'assassin'

export type MobDef = {
  model: string
  scale: number
  health: number
  speed: number
  /** Ranged mobs shoot, melee mobs chase and swing */
  ranged: boolean
  /** Damage of a melee swing (also bullet damage for ranged) */
  damage: number
  attackClip: string
  attackRange: number
  attackCooldownMs: number
  /** Soul value dropped on death */
  souls: number
  /** Attachments to keep visible (all others hidden) */
  show: string[]
  /** Attachment names that exist but must always be hidden */
  hide: string[]
}

const MAGE_HIDE = ['1H_Wand', 'Spellbook', 'Spellbook_open']
const ROGUE_HIDE = ['1H_Crossbow', '2H_Crossbow', 'Throwable']
const BARBARIAN_HIDE = ['1H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Mug']
const KNIGHT_HIDE = [
  '2H_Sword',
  '1H_Sword_Offhand',
  'Badge_Shield',
  'Rectangle_Shield',
  'Round_Shield',
  'Spike_Shield',
]

export const MOBS: Record<MobType, MobDef> = {
  mage: {
    model: '/character/Mage.glb',
    scale: 0.7,
    health: 90,
    speed: 1,
    ranged: true,
    damage: 12,
    attackClip: 'Spellcast_Shoot',
    attackRange: 12,
    attackCooldownMs: 3000,
    souls: 3,
    show: ['2H_Staff'],
    hide: MAGE_HIDE,
  },
  rogue: {
    model: '/character/Rogue.glb',
    scale: 0.7,
    health: 60,
    speed: 2.4,
    ranged: false,
    damage: 8,
    attackClip: 'Dualwield_Melee_Attack_Slice',
    attackRange: 1.7,
    attackCooldownMs: 1400,
    souls: 2,
    show: ['Knife', 'Knife_Offhand'],
    hide: ROGUE_HIDE,
  },
  barbarian: {
    model: '/character/Barbarian.glb',
    scale: 0.78,
    health: 240,
    speed: 0.85,
    ranged: false,
    damage: 22,
    attackClip: '2H_Melee_Attack_Chop',
    attackRange: 2.2,
    attackCooldownMs: 2200,
    souls: 6,
    show: ['2H_Axe'],
    hide: BARBARIAN_HIDE,
  },
  boss: {
    model: '/character/Barbarian.glb',
    scale: 1.25,
    health: 1400,
    speed: 1.1,
    ranged: false,
    damage: 30,
    attackClip: '2H_Melee_Attack_Chop',
    attackRange: 2.8,
    attackCooldownMs: 1800,
    souls: 60,
    show: ['2H_Axe'],
    hide: BARBARIAN_HIDE,
  },
  // ---- Per-class bosses (state machines in ecs/enemy/bossBrain.ts) ---------
  'boss-knight': {
    // The Oathbreaker — shield charge, shockwave ring, sword volley
    model: '/character/Knight.glb',
    scale: 1.25,
    health: 1500,
    speed: 1.2,
    ranged: false,
    damage: 28,
    attackClip: '1H_Melee_Attack_Chop',
    attackRange: 2.4,
    attackCooldownMs: 1600,
    souls: 70,
    show: ['1H_Sword', 'Badge_Shield'],
    hide: KNIGHT_HIDE,
  },
  'boss-mage': {
    // The Hexweaver — blink, meteor strikes, bolt barrage
    model: '/character/Mage.glb',
    scale: 1.25,
    health: 1200,
    speed: 1.3,
    ranged: true,
    damage: 16,
    attackClip: 'Spellcast_Shoot',
    attackRange: 11,
    attackCooldownMs: 2200,
    souls: 60,
    show: ['2H_Staff'],
    hide: MAGE_HIDE,
  },
  'boss-rogue': {
    // The Nightshade — shadowstep backstab, vanish ambush, dagger fan
    model: '/character/Rogue.glb',
    scale: 1.25,
    health: 1100,
    speed: 2.6,
    ranged: false,
    damage: 22,
    attackClip: 'Dualwield_Melee_Attack_Slice',
    attackRange: 1.9,
    attackCooldownMs: 1200,
    souls: 60,
    show: ['Knife', 'Knife_Offhand'],
    hide: ROGUE_HIDE,
  },
  // ---- New mobs -----------------------------------------------------------
  knight: {
    model: '/character/Knight.glb',
    scale: 0.74,
    health: 150,
    speed: 1.1,
    ranged: false,
    damage: 16,
    attackClip: '1H_Melee_Attack_Chop',
    attackRange: 1.9,
    attackCooldownMs: 1600,
    souls: 4,
    show: ['1H_Sword'],
    hide: KNIGHT_HIDE,
  },
  berserker: {
    model: '/character/Barbarian.glb',
    scale: 0.72,
    health: 120,
    speed: 1.6,
    ranged: false,
    damage: 14,
    attackClip: '2H_Melee_Attack_Slice',
    attackRange: 1.8,
    attackCooldownMs: 1300,
    souls: 4,
    show: ['2H_Axe'],
    hide: BARBARIAN_HIDE,
  },
  assassin: {
    model: '/character/Rogue.glb',
    scale: 0.75,
    health: 100,
    speed: 3.0,
    ranged: false,
    damage: 18,
    attackClip: 'Dualwield_Melee_Attack_Chop',
    attackRange: 1.6,
    attackCooldownMs: 1100,
    souls: 5,
    show: ['Knife', 'Knife_Offhand'],
    hide: ROGUE_HIDE,
  },
}

/** Every model used by the mob roster (for preloading / shared loading) */
export const MOB_MODELS = [...new Set(Object.values(MOBS).map((m) => m.model))]

/** All boss mob types — the Barbarian King plus one per playable class */
export const BOSS_MOBS: ReadonlySet<MobType> = new Set([
  'boss',
  'boss-knight',
  'boss-mage',
  'boss-rogue',
])

export const isBossMob = (mob: string): boolean => BOSS_MOBS.has(mob as MobType)
