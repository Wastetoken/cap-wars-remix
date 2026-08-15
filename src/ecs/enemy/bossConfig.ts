import type { MobType } from '@/game/mobs'

// ============================================================================
// Per-boss tuning — bossBrainSystem looks this up by the entity's MobTrait
// so the state machine itself stays generic. The Barbarian King ('boss')
// keeps his original slam / ring / volley kit; each class boss has its own.
// ============================================================================

export type BossSpecial =
  // Barbarian King
  | 'slam'
  | 'ring'
  | 'volley'
  // The Oathbreaker (knight)
  | 'charge'
  // The Hexweaver (mage)
  | 'meteor'
  | 'blink'
  // The Nightshade (rogue)
  | 'shadowstep'
  | 'vanish'

export type BossConfig = {
  /** Display name for phase announcements */
  name: string
  /** Specials cycle in this order */
  specials: BossSpecial[]
  /** Global speed multiplier per phase (index 0 = phase 1) */
  phaseSpeed: [number, number, number]
  /** Special-attack cooldown in seconds per phase */
  phaseCooldown: [number, number, number]
  /** Adds summoned once at phase 3 */
  summonAdd: MobType
  /** Animation clips for special choreography (shared KayKit library) */
  anims: {
    /** telegraph windup (slam / charge / meteor cast / backstab) */
    windup: string
    /** ring spin */
    spin: string
    /** volley throw */
    throw: string
    /** movement burst (leap / charge dash / blink) */
    dash: string
  }
  /** Projectile fan tuning for the volley special */
  volley: { shots: number; intervalS: number; fanRad: number }
  /** ANNOUNCE title + subtitle at phase 2 / phase 3 */
  enrageMsg: [string, string]
  berserkMsg: [string, string]
}

export const BOSS_CONFIG: Record<string, BossConfig> = {
  // ---------------------------------------------------------------------------
  boss: {
    name: 'The Barbarian King',
    specials: ['slam', 'ring', 'volley'],
    phaseSpeed: [1, 1.35, 1.65],
    phaseCooldown: [7, 5.2, 4.0],
    summonAdd: 'assassin',
    anims: {
      windup: '2H_Melee_Attack_Chop',
      spin: '2H_Melee_Attack_Spin',
      throw: 'Throw',
      dash: 'Jump_Full_Long',
    },
    volley: { shots: 5, intervalS: 0.13, fanRad: 0.16 },
    enrageMsg: ['The King is enraged!', 'Watch his tempo'],
    berserkMsg: ['The King calls his guard!', 'Berserk'],
  },
  // ---------------------------------------------------------------------------
  'boss-knight': {
    name: 'The Oathbreaker',
    specials: ['charge', 'ring', 'volley'],
    phaseSpeed: [1, 1.25, 1.5],
    phaseCooldown: [6.5, 5.0, 3.8],
    summonAdd: 'knight',
    anims: {
      windup: '1H_Melee_Attack_Stab',
      spin: '2H_Melee_Attack_Spin',
      throw: 'Throw',
      dash: 'Dodge_Forward',
    },
    volley: { shots: 3, intervalS: 0.16, fanRad: 0.12 },
    enrageMsg: ['The Oathbreaker presses the attack!', 'His guard is up'],
    berserkMsg: ['The Oathbreaker calls his knights!', 'No mercy'],
  },
  // ---------------------------------------------------------------------------
  'boss-mage': {
    name: 'The Hexweaver',
    specials: ['meteor', 'blink', 'volley'],
    phaseSpeed: [1, 1.2, 1.4],
    phaseCooldown: [6.0, 4.6, 3.4],
    summonAdd: 'mage',
    anims: {
      windup: 'Spellcast_Long',
      spin: 'Spellcast_Raise',
      throw: 'Spellcast_Shoot',
      dash: 'Spellcast_Raise',
    },
    volley: { shots: 6, intervalS: 0.11, fanRad: 0.14 },
    enrageMsg: ["The Hexweaver's hexes deepen!", 'Mind the sky'],
    berserkMsg: ['The Hexweaver calls her acolytes!', 'Arcane fury'],
  },
  // ---------------------------------------------------------------------------
  'boss-rogue': {
    name: 'The Nightshade',
    specials: ['shadowstep', 'vanish', 'volley'],
    phaseSpeed: [1, 1.3, 1.55],
    phaseCooldown: [5.5, 4.2, 3.2],
    summonAdd: 'rogue',
    anims: {
      windup: '1H_Melee_Attack_Stab',
      spin: 'Dualwield_Melee_Attack_Slice',
      throw: 'Throw',
      dash: 'Dodge_Forward',
    },
    volley: { shots: 7, intervalS: 0.1, fanRad: 0.28 },
    enrageMsg: ['The Nightshade quickens!', 'Watch your back'],
    berserkMsg: ['The Nightshade calls her shades!', 'Nowhere to hide'],
  },
}
