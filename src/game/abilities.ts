// ============================================================================
// Abilities — rage spenders on keys 1 / 2 / 3 (rogue also has a slot 4).
// Every class has its OWN kit: same three slots, genuinely different mechanics.
// Unlocked and upgraded through each class's talent tree.
// ============================================================================

import type { CharacterId } from './characters'

/** Slot ids — keyed so cooldowns / triggers stay per-slot across classes. */
export type AbilityId = 'slot1' | 'slot2' | 'slot3' | 'slot4'

export type AbilityBehavior =
  | 'spin' // 360° AoE around self, ticking (knight, barbarian)
  | 'slam' // leap + AoE landing at self (knight, barbarian)
  | 'buff' // timed self-buff (all classes, different profiles)
  | 'dashstrike' // dash forward, hitting everything on the path (rogue)
  | 'flurry' // rapid multi-hit cone in front (rogue)
  | 'daggerrain' // ticking AoE rain at a point ahead (rogue)
  | 'volley' // fire a spread of projectiles (mage)
  | 'meteor' // delayed AoE at a point ahead (mage)
  | 'nova' // instant AoE burst around self + small buff (mage)

export type BuffProfile = {
  damageMult: number
  speedMult: number
}

export type AbilityDef = {
  id: AbilityId
  behavior: AbilityBehavior
  name: string
  key: string
  keyLabel: string
  rageCost: number
  cooldownMs: number
  /** AoE radius (rank 2 multiplies by 1.4). Meaning depends on behavior. */
  radius: number
  /** Base damage (rank 2 multiplies by 1.4; also scaled by damage talents) */
  damage: number
  /** Animation clip to play — every KayKit model shares the same 76 clips */
  anim: string
  /** spin: total duration in seconds */
  spinDuration?: number
  /** slam: set false for a grounded smash with no leap (barbarian) */
  leap?: boolean
  /** dashstrike: dash distance / duration */
  dashDistance?: number
  dashDuration?: number
  /** flurry: number of hits and interval between them */
  flurryHits?: number
  flurryInterval?: number
  /** daggerrain: seconds between damage ticks and distance ahead of the player */
  tickInterval?: number
  rainDistance?: number
  /** volley: projectile count and total spread (radians) */
  boltCount?: number
  boltSpread?: number
  /** meteor: cast delay before impact and distance ahead of the player */
  impactDelay?: number
  impactDistance?: number
  /** buff / nova: buff profile and duration in ms (rank 2 adds 4s) */
  buff?: BuffProfile
  durationMs?: number
  description: string
}

// ---------------------------------------------------------------------------
// Knight — the baseline melee kit
// ---------------------------------------------------------------------------

const KNIGHT_ABILITIES: Partial<Record<AbilityId, AbilityDef>> = {
  slot1: {
    id: 'slot1',
    behavior: 'spin',
    name: 'Whirlwind',
    key: 'Digit1',
    keyLabel: '1',
    rageCost: 30,
    cooldownMs: 3000,
    radius: 3.5,
    damage: 45,
    anim: '2H_Melee_Attack_Spin',
    spinDuration: 1.2,
    description: 'Spin your blade 360°, hitting everything around you',
  },
  slot2: {
    id: 'slot2',
    behavior: 'slam',
    name: 'Ground Slam',
    key: 'Digit2',
    keyLabel: '2',
    rageCost: 40,
    cooldownMs: 6000,
    radius: 4.5,
    damage: 70,
    anim: '1H_Melee_Attack_Stab',
    description: 'Leap up and slam the ground with a shockwave',
  },
  slot3: {
    id: 'slot3',
    behavior: 'buff',
    name: 'Fury',
    key: 'Digit3',
    keyLabel: '3',
    rageCost: 50,
    cooldownMs: 15000,
    radius: 0,
    damage: 0,
    anim: 'Spellcast_Raise',
    buff: { damageMult: 1.5, speedMult: 1.5 },
    durationMs: 8000,
    description: 'Blade ignites: +50% attack speed and damage for a while',
  },
}

// ---------------------------------------------------------------------------
// Barbarian — slower, wider, heavier hits
// ---------------------------------------------------------------------------

const BARBARIAN_ABILITIES: Partial<Record<AbilityId, AbilityDef>> = {
  slot1: {
    id: 'slot1',
    behavior: 'spin',
    name: 'Reckless Spin',
    key: 'Digit1',
    keyLabel: '1',
    rageCost: 35,
    cooldownMs: 4000,
    radius: 4.75,
    damage: 65,
    anim: '2H_Melee_Attack_Spinning',
    spinDuration: 1.6,
    description: 'A wild, wide axe spin that grinds everything nearby',
  },
  slot2: {
    id: 'slot2',
    behavior: 'slam',
    name: 'Earthquake',
    key: 'Digit2',
    keyLabel: '2',
    rageCost: 45,
    cooldownMs: 8000,
    radius: 6,
    damage: 100,
    anim: '2H_Melee_Attack_Chop',
    leap: false,
    description: 'Shatter the ground — a huge shockwave around you',
  },
  slot3: {
    id: 'slot3',
    behavior: 'buff',
    name: 'Berserk',
    key: 'Digit3',
    keyLabel: '3',
    rageCost: 50,
    cooldownMs: 18000,
    radius: 0,
    damage: 0,
    anim: 'Spellcast_Raise',
    buff: { damageMult: 2.0, speedMult: 1.15 },
    durationMs: 8000,
    description: 'Double damage, slightly faster swings. Pure rage',
  },
}

// ---------------------------------------------------------------------------
// Rogue — mobility and burst, not standing AoE
// ---------------------------------------------------------------------------

const ROGUE_ABILITIES: Partial<Record<AbilityId, AbilityDef>> = {
  slot1: {
    id: 'slot1',
    behavior: 'dashstrike',
    name: 'Shadow Flurry',
    key: 'Digit1',
    keyLabel: '1',
    rageCost: 25,
    cooldownMs: 2500,
    radius: 1.5,
    damage: 55,
    anim: 'Dualwield_Melee_Attack_Stab',
    dashDistance: 6.5,
    dashDuration: 0.25,
    description: 'Dash straight through enemies, cutting everything on the path',
  },
  slot2: {
    id: 'slot2',
    behavior: 'flurry',
    name: 'Blade Dance',
    key: 'Digit2',
    keyLabel: '2',
    rageCost: 30,
    cooldownMs: 4000,
    radius: 2.4,
    damage: 35,
    anim: 'Dualwield_Melee_Attack_Slice',
    flurryHits: 3,
    flurryInterval: 0.16,
    description: 'Three lightning-fast strikes in a cone ahead of you',
  },
  slot3: {
    id: 'slot3',
    behavior: 'buff',
    name: 'Vanish',
    key: 'Digit3',
    keyLabel: '3',
    rageCost: 40,
    cooldownMs: 12000,
    radius: 0,
    damage: 0,
    anim: 'Dodge_Backward',
    buff: { damageMult: 1.25, speedMult: 2.0 },
    durationMs: 6000,
    description: 'Melt into shadow: double attack speed for a short burst',
  },
  slot4: {
    id: 'slot4',
    behavior: 'daggerrain',
    name: 'Dagger Rain',
    key: 'Digit4',
    keyLabel: '4',
    rageCost: 35,
    cooldownMs: 8000,
    radius: 3,
    damage: 14,
    anim: 'Throw',
    tickInterval: 0.25,
    rainDistance: 3,
    durationMs: 2500,
    description: 'A rain of daggers shreds the area ahead of you',
  },
}

// ---------------------------------------------------------------------------
// Mage — ranged caster. No melee at all.
// ---------------------------------------------------------------------------

const MAGE_ABILITIES: Partial<Record<AbilityId, AbilityDef>> = {
  slot1: {
    id: 'slot1',
    behavior: 'volley',
    name: 'Arcane Volley',
    key: 'Digit1',
    keyLabel: '1',
    rageCost: 25,
    cooldownMs: 2500,
    radius: 0,
    damage: 20,
    anim: 'Spellcast_Shoot',
    boltCount: 5,
    boltSpread: 0.6,
    description: 'Fire a fan of five arcane bolts in front of you',
  },
  slot2: {
    id: 'slot2',
    behavior: 'meteor',
    name: 'Meteor',
    key: 'Digit2',
    keyLabel: '2',
    rageCost: 45,
    cooldownMs: 7000,
    radius: 4,
    damage: 110,
    anim: 'Spellcast_Raise',
    impactDelay: 0.6,
    impactDistance: 6,
    description: 'Call a meteor down on a spot ahead of you',
  },
  slot3: {
    id: 'slot3',
    behavior: 'nova',
    name: 'Ice Nova',
    key: 'Digit3',
    keyLabel: '3',
    rageCost: 40,
    cooldownMs: 12000,
    radius: 4.25,
    damage: 45,
    anim: 'Spellcast_Long',
    buff: { damageMult: 1.3, speedMult: 1.3 },
    durationMs: 6000,
    description: 'Frost bursts outward, then empowers your spells briefly',
  },
}

export const CHARACTER_ABILITIES: Record<CharacterId, Partial<Record<AbilityId, AbilityDef>>> = {
  knight: KNIGHT_ABILITIES,
  barbarian: BARBARIAN_ABILITIES,
  rogue: ROGUE_ABILITIES,
  mage: MAGE_ABILITIES,
}

/** Only slots the class actually defines — slot4 exists on rogue only */
export const getAbilityList = (character: CharacterId): AbilityDef[] => {
  const kit = CHARACTER_ABILITIES[character] ?? KNIGHT_ABILITIES
  return [kit.slot1, kit.slot2, kit.slot3, kit.slot4].filter(
    (def): def is AbilityDef => def !== undefined
  )
}

export const getAbility = (character: CharacterId, slot: AbilityId): AbilityDef | undefined =>
  (CHARACTER_ABILITIES[character] ?? KNIGHT_ABILITIES)[slot]

/** Rank-2 scaling shared by all damaging abilities */
export const abilityRankScale = (rank: number) => (rank >= 2 ? 1.4 : 1)

/** Buff duration: rank 2 adds 4 seconds */
export const buffDuration = (def: AbilityDef, rank: number) =>
  (def.durationMs ?? 8000) + (rank >= 2 ? 4000 : 0)
