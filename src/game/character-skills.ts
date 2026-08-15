// ============================================================================
// Per-character skill trees
// Each character has 3 branches with unique node IDs.
// Stat functions in skills.ts map equivalent IDs across characters.
// ============================================================================

import type { CharacterId } from './characters'
import { CHARACTERS } from './characters'

export type Branch = string

export type SkillNode = {
  id: string
  name: string
  description: string
  branch: Branch
  parent?: string
  maxRank: number
}

// ---------------------------------------------------------------------------
// Knight (original)
// ---------------------------------------------------------------------------

const KNIGHT_NODES: SkillNode[] = [
  { id: 'might', name: 'Might', description: '+15% sword damage per rank', branch: 'warrior', maxRank: 3 },
  { id: 'whirlwind', name: 'Whirlwind', description: 'Unlock 360° spin AoE [1]. Rank 2: +40% radius & damage', branch: 'warrior', parent: 'might', maxRank: 2 },
  { id: 'rageflow', name: 'Rageflow', description: '+30% rage gain per rank', branch: 'fury', maxRank: 2 },
  { id: 'fury', name: 'Fury', description: 'Unlock fury mode [3]: faster, harder swings. Rank 2: +4s duration', branch: 'fury', parent: 'rageflow', maxRank: 2 },
  { id: 'swift', name: 'Swift', description: 'Dash cooldown reduced by 40%', branch: 'fury', parent: 'rageflow', maxRank: 1 },
  { id: 'vitality', name: 'Vitality', description: '+30 max health per rank', branch: 'guardian', maxRank: 3 },
  { id: 'lifesteal', name: 'Lifesteal', description: 'Heal for 3% of damage dealt per rank', branch: 'guardian', parent: 'vitality', maxRank: 2 },
  { id: 'slam', name: 'Ground Slam', description: 'Unlock leaping slam AoE [2]. Rank 2: +40% radius & damage', branch: 'guardian', parent: 'vitality', maxRank: 2 },
]

// ---------------------------------------------------------------------------
// Barbarian
// ---------------------------------------------------------------------------

const BARBARIAN_NODES: SkillNode[] = [
  { id: 'cleave', name: 'Cleave', description: '+15% axe damage per rank', branch: 'berserker', maxRank: 3 },
  { id: 'reckless_spin', name: 'Reckless Spin', description: 'Unlock wide spinning axe AoE [1]. Rank 2: +40% radius & damage', branch: 'berserker', parent: 'cleave', maxRank: 2 },
  { id: 'bloodthirst', name: 'Bloodthirst', description: '+30% rage gain per rank', branch: 'ravager', maxRank: 2 },
  { id: 'berserk', name: 'Berserk', description: 'Unlock berserk [3]: double damage for a while. Rank 2: +4s duration', branch: 'ravager', parent: 'bloodthirst', maxRank: 2 },
  { id: 'unstoppable', name: 'Unstoppable', description: 'Leap cooldown reduced by 40%', branch: 'ravager', parent: 'bloodthirst', maxRank: 1 },
  { id: 'endurance', name: 'Endurance', description: '+30 max health per rank', branch: 'juggernaut', maxRank: 3 },
  { id: 'leech', name: 'Leech', description: 'Heal for 3% of damage dealt per rank', branch: 'juggernaut', parent: 'endurance', maxRank: 2 },
  { id: 'earthquake', name: 'Earthquake', description: 'Unlock leaping slam AoE [2]. Rank 2: +40% radius & damage', branch: 'juggernaut', parent: 'endurance', maxRank: 2 },
]

// ---------------------------------------------------------------------------
// Rogue
// ---------------------------------------------------------------------------

const ROGUE_NODES: SkillNode[] = [
  { id: 'precision', name: 'Precision', description: '+15% knife damage per rank', branch: 'assassination', maxRank: 3 },
  { id: 'blade_flurry', name: 'Shadow Flurry', description: 'Unlock shadow dash [1]: cut through enemies in a line. Rank 2: +40% damage', branch: 'assassination', parent: 'precision', maxRank: 2 },
  { id: 'dagger_rain', name: 'Dagger Rain', description: 'Unlock dagger rain [4]: daggers shred the area ahead of you. Rank 2: +40% radius & damage', branch: 'assassination', parent: 'blade_flurry', maxRank: 2 },
  { id: 'shadowstep', name: 'Shadowstep', description: '+30% rage gain per rank', branch: 'shadow', maxRank: 2 },
  { id: 'vanish', name: 'Vanish', description: 'Unlock vanish [3]: double attack speed for a burst. Rank 2: +4s duration', branch: 'shadow', parent: 'shadowstep', maxRank: 2 },
  { id: 'poison', name: 'Quickstep', description: 'Shadowstep cooldown reduced by 40%', branch: 'shadow', parent: 'shadowstep', maxRank: 1 },
  { id: 'agility', name: 'Agility', description: '+30 max health per rank', branch: 'acrobatics', maxRank: 3 },
  { id: 'evasion', name: 'Evasion', description: 'Heal for 3% of damage dealt per rank', branch: 'acrobatics', parent: 'agility', maxRank: 2 },
  { id: 'acrobat', name: 'Blade Dance', description: 'Unlock blade dance [2]: three rapid strikes in a cone. Rank 2: +40% damage', branch: 'acrobatics', parent: 'agility', maxRank: 2 },
]

// ---------------------------------------------------------------------------
// Mage
// ---------------------------------------------------------------------------

const MAGE_NODES: SkillNode[] = [
  { id: 'potency', name: 'Potency', description: '+15% spell damage per rank', branch: 'arcane', maxRank: 3 },
  { id: 'arcane_barrage', name: 'Arcane Volley', description: 'Unlock arcane volley [1]: fire five bolts in a spread. Rank 2: +40% damage', branch: 'arcane', parent: 'potency', maxRank: 2 },
  { id: 'chill', name: 'Chill', description: '+30% rage gain per rank', branch: 'frost', maxRank: 2 },
  { id: 'ice_nova', name: 'Ice Nova', description: 'Unlock ice nova [3]: frost burst + empowered spells. Rank 2: +4s duration', branch: 'frost', parent: 'chill', maxRank: 2 },
  { id: 'blink', name: 'Blink', description: 'Blink cooldown reduced by 40%', branch: 'frost', parent: 'chill', maxRank: 1 },
  { id: 'mana_pool', name: 'Mana Pool', description: '+30 max health per rank', branch: 'conjuration', maxRank: 3 },
  { id: 'soul_drain', name: 'Soul Drain', description: 'Heal for 3% of damage dealt per rank', branch: 'conjuration', parent: 'mana_pool', maxRank: 2 },
  { id: 'meteor', name: 'Meteor', description: 'Unlock meteor [2]: call a meteor down ahead of you. Rank 2: +40% radius & damage', branch: 'conjuration', parent: 'mana_pool', maxRank: 2 },
]

const CHARACTER_NODES: Record<CharacterId, SkillNode[]> = {
  knight: KNIGHT_NODES,
  barbarian: BARBARIAN_NODES,
  rogue: ROGUE_NODES,
  mage: MAGE_NODES,
}

export const getCharacterSkillNodes = (character: CharacterId): SkillNode[] =>
  CHARACTER_NODES[character] ?? KNIGHT_NODES

export const getCharacterBranches = (character: CharacterId) => {
  const c = CHARACTERS[character]
  return [
    { id: c.branches[0], name: c.branchNames[0], color: c.branchColors[0] },
    { id: c.branches[1], name: c.branchNames[1], color: c.branchColors[1] },
    { id: c.branches[2], name: c.branchNames[2], color: c.branchColors[2] },
  ]
}

// ---------------------------------------------------------------------------
// Cross-character stat mappings
// Each stat function checks for ANY equivalent skill ID across characters.
// ---------------------------------------------------------------------------

/** All IDs that grant +% damage */
export const DAMAGE_SKILL_IDS = ['might', 'cleave', 'precision', 'potency']

/** All IDs that grant +max health */
export const HEALTH_SKILL_IDS = ['vitality', 'endurance', 'agility', 'mana_pool']

/** All IDs that grant +rage gain */
export const RAGE_SKILL_IDS = ['rageflow', 'bloodthirst', 'shadowstep', 'chill']

/** All IDs that reduce dash cooldown */
export const DASH_SKILL_IDS = ['swift', 'unstoppable', 'poison', 'blink']

/** All IDs that grant lifesteal */
export const LIFESTEAL_SKILL_IDS = ['lifesteal', 'leech', 'evasion', 'soul_drain']

// ---------------------------------------------------------------------------
// Ability unlock mapping — which talent node unlocks which ability slot,
// per character. Slots: slot1 [1], slot2 [2], slot3 [3], slot4 [4] (rogue only).
// ---------------------------------------------------------------------------

import type { AbilityId } from './abilities'

export const ABILITY_SKILL_IDS: Record<CharacterId, Partial<Record<AbilityId, string>>> = {
  knight: { slot1: 'whirlwind', slot2: 'slam', slot3: 'fury' },
  barbarian: { slot1: 'reckless_spin', slot2: 'earthquake', slot3: 'berserk' },
  rogue: { slot1: 'blade_flurry', slot2: 'acrobat', slot3: 'vanish', slot4: 'dagger_rain' },
  mage: { slot1: 'arcane_barrage', slot2: 'meteor', slot3: 'ice_nova' },
}
