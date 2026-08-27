// ============================================================================
// Talent tree — spend talent points earned from leveling up.
// Now supports per-character skill trees (save v3).
// Backward compatible with v2 saves (Knight-only).
// ============================================================================

import {
  DAMAGE_SKILL_IDS,
  HEALTH_SKILL_IDS,
  RAGE_SKILL_IDS,
  DASH_SKILL_IDS,
  LIFESTEAL_SKILL_IDS,
  ABILITY_SKILL_IDS,
  getCharacterSkillNodes,
  getCharacterBranches,
} from './character-skills'
import type { AbilityId } from './abilities'
import type { CharacterId } from './characters'
import { CHARACTERS, DEFAULT_CHARACTER } from './characters'
import { levelForSouls } from './progression'
import { supabase } from '../supabaseClient'

// Re-export character skill helpers for convenience
export { getCharacterSkillNodes, getCharacterBranches }

export type Branch = string

export type SkillNode = {
  id: string
  name: string
  description: string
  branch: Branch
  parent?: string
  maxRank: number
}

// Legacy exports for backward compat — Knight skill nodes
export const SKILL_NODES = getCharacterSkillNodes('knight')
export const BRANCHES = getCharacterBranches('knight')

export type Skills = Record<string, number>

export const getSkillRank = (skills: Skills, id: string) => skills[id] ?? 0

/** Total ranks across all talents = points ever spent. */
export const totalRanks = (skills: Skills) =>
  Object.values(skills).reduce((sum, r) => sum + r, 0)

/**
 * Can the next rank of `id` be bought right now?
 * Requires: not maxed, parent talent at >= the rank being bought.
 * (Talent points are checked by the store.)
 */
export const prereqMet = (skills: Skills, id: string, nodes: SkillNode[]): boolean => {
  const node = nodes.find((n) => n.id === id)
  if (!node) return false
  const rank = getSkillRank(skills, id)
  if (rank >= node.maxRank) return false
  if (!node.parent) return true
  // Buying rank N requires the parent at rank N or higher
  return getSkillRank(skills, node.parent) >= rank + 1
}

/** Cost of the next rank in talent points, or null if maxed. Always 1. */
export const nextRankCost = (skills: Skills, id: string, nodes: SkillNode[]): number | null => {
  const node = nodes.find((n) => n.id === id)
  if (!node) return null
  const rank = getSkillRank(skills, id)
  return rank >= node.maxRank ? null : 1
}

// ---------------------------------------------------------------------------
// Derived stats — check ALL equivalent skill IDs across characters
// ---------------------------------------------------------------------------

const totalRankFor = (skills: Skills, ids: string[]) =>
  ids.reduce((sum, id) => sum + getSkillRank(skills, id), 0)

export const damageMultiplier = (skills: Skills) => 1 + 0.15 * totalRankFor(skills, DAMAGE_SKILL_IDS)

export const maxHealthBonus = (skills: Skills) => 30 * totalRankFor(skills, HEALTH_SKILL_IDS)

export const rageGainMultiplier = (skills: Skills) => 1 + 0.3 * totalRankFor(skills, RAGE_SKILL_IDS)

export const dashCooldownMultiplier = (skills: Skills) =>
  totalRankFor(skills, DASH_SKILL_IDS) > 0 ? 0.6 : 1

export const lifestealFraction = (skills: Skills) => 0.03 * totalRankFor(skills, LIFESTEAL_SKILL_IDS)

export const abilityRank = (skills: Skills, character: CharacterId, slot: AbilityId) =>
  getSkillRank(skills, ABILITY_SKILL_IDS[character]?.[slot] ?? '')

export const isAbilityUnlocked = (skills: Skills, character: CharacterId, slot: AbilityId) =>
  abilityRank(skills, character, slot) > 0

// ---------------------------------------------------------------------------
// Persistence (save version 4 — per-character skills, souls, talent points)
// ---------------------------------------------------------------------------

const SAVE_KEY = 'caps-wars-save'
const SAVE_VERSION = 4

export type SaveData = {
  /** Active character's souls (convenience mirror of characterSouls) */
  souls: number
  skills: Skills
  /** Active character's unspent talent points */
  talentPoints: number
  selectedCharacter: CharacterId
  characterSkills: Record<CharacterId, Skills>
  /** Lifetime XP per character — levels are per-character */
  characterSouls: Record<CharacterId, number>
  /** Unspent talent points per character */
  characterTalentPoints: Record<CharacterId, number>
}

const emptySouls = (): Record<CharacterId, number> => ({ knight: 0, barbarian: 0, rogue: 0, mage: 0 })
const emptyTalentPoints = (): Record<CharacterId, number> => ({ knight: 0, barbarian: 0, rogue: 0, mage: 0 })

export const loadSave = (): SaveData => {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const souls: number = parsed.souls ?? 0

      // v4: per-character souls + talent points
      if (parsed.version === SAVE_VERSION) {
        const characterSkills: Record<CharacterId, Skills> = parsed.characterSkills ?? {}
        // Never trust the persisted id — an unknown value (older/newer build,
        // hand-edited save) makes CHARACTERS[id] undefined and spawns the
        // wrong hero or crashes the loadout.
        const selectedCharacter: CharacterId =
          parsed.selectedCharacter && parsed.selectedCharacter in CHARACTERS
            ? parsed.selectedCharacter
            : DEFAULT_CHARACTER
        const characterSouls = { ...emptySouls(), ...parsed.characterSouls }
        const characterTalentPoints = { ...emptyTalentPoints(), ...parsed.characterTalentPoints }
        const currentSkills = characterSkills[selectedCharacter] ?? parsed.skills ?? {}
        return {
          souls: characterSouls[selectedCharacter] ?? 0,
          skills: currentSkills,
          talentPoints: characterTalentPoints[selectedCharacter] ?? 0,
          selectedCharacter,
          characterSkills,
          characterSouls,
          characterTalentPoints,
        }
      }

      // v3 / v2 / v1 migration: the global progression becomes the Knight's —
      // other heroes start at level 1 and level up on their own time.
      const characterSkills: Record<CharacterId, Skills> =
        parsed.version === 3
          ? (parsed.characterSkills ?? { knight: parsed.skills ?? {}, barbarian: {}, rogue: {}, mage: {} })
          : { knight: parsed.skills ?? {}, barbarian: {}, rogue: {}, mage: {} }
      const skills = characterSkills.knight ?? parsed.skills ?? {}
      let talentPoints: number
      if (parsed.version === 3 || parsed.version === 2) {
        talentPoints = parsed.talentPoints ?? 0
      } else {
        const earnedPoints = Math.max(0, levelForSouls(souls) - 1)
        talentPoints = Math.max(0, earnedPoints - totalRanks(skills))
      }
      const characterSouls = { ...emptySouls(), knight: souls }
      const characterTalentPoints = { ...emptyTalentPoints(), knight: talentPoints }
      return {
        souls,
        skills,
        talentPoints,
        selectedCharacter: 'knight',
        characterSkills,
        characterSouls,
        characterTalentPoints,
      }
    }
  } catch {
    // corrupted save — start fresh
  }
  return {
    souls: 0,
    skills: {},
    talentPoints: 0,
    selectedCharacter: DEFAULT_CHARACTER,
    characterSkills: { knight: {}, barbarian: {}, rogue: {}, mage: {} },
    characterSouls: emptySouls(),
    characterTalentPoints: emptyTalentPoints(),
  }
}

export const persistSave = (
  selectedCharacter: CharacterId,
  characterSkills: Record<CharacterId, Skills>,
  characterSouls: Record<CharacterId, number>,
  characterTalentPoints: Record<CharacterId, number>,
  userId?: string
) => {
  const payload = {
    version: SAVE_VERSION,
    // Legacy mirrors of the active character (used only by old migrations)
    souls: characterSouls[selectedCharacter] ?? 0,
    skills: characterSkills[selectedCharacter] ?? {},
    talentPoints: characterTalentPoints[selectedCharacter] ?? 0,
    selectedCharacter,
    characterSkills,
    characterSouls,
    characterTalentPoints,
  }

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
  } catch {
    // storage unavailable — play session-only
  }

  if (userId) {
    // Fire and forget cloud save
    supabase.from('saves').upsert({
      user_id: userId,
      save_data: payload,
      updated_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.error('Cloud save failed:', error)
    })
  }
}

export async function awardSoulsRPC(
  userId: string,
  characterKey: string,
  souls: number,
) {
  const { error } = await supabase.rpc('award_souls', {
    p_user_id: userId,
    p_character_key: characterKey,
    p_souls: souls,
  })
  if (error) throw error
}

export const fetchCloudSave = async (userId: string): Promise<SaveData | null> => {
  const { data, error } = await supabase
    .from('saves')
    .select('save_data')
    .eq('user_id', userId)
    .maybeSingle()
  
  if (error || !data) return null
  
  const parsed = data.save_data
  if (parsed.version === SAVE_VERSION) {
    const characterSkills: Record<CharacterId, Skills> = parsed.characterSkills ?? {}
    const sc = parsed.selectedCharacter && parsed.selectedCharacter in CHARACTERS
      ? parsed.selectedCharacter
      : DEFAULT_CHARACTER
    return {
      souls: parsed.characterSouls[sc] ?? 0,
      skills: characterSkills[sc] ?? parsed.skills ?? {},
      talentPoints: parsed.characterTalentPoints[sc] ?? 0,
      selectedCharacter: sc,
      characterSkills: parsed.characterSkills,
      characterSouls: parsed.characterSouls,
      characterTalentPoints: parsed.characterTalentPoints,
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Settings persistence (separate key — graphics/feel, not progression)
// ---------------------------------------------------------------------------

export type GameSettings = {
  cameraShake: boolean
  shadows: 'high' | 'low' | 'off'
  particles: 'full' | 'reduced'
  postProcessing: 'off' | 'low' | 'high'
  musicVolume: number
  sfxVolume: number
}

export const DEFAULT_SETTINGS: GameSettings = {
  cameraShake: true,
  shadows: 'high',
  particles: 'full',
  postProcessing: 'high',
  musicVolume: 0.55,
  sfxVolume: 0.85,
}

const SETTINGS_KEY = 'caps-wars-settings'

const isMobileDevice = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 1024px)').matches)

let persistTimer: ReturnType<typeof setTimeout> | null = null

export const persistSaveDebounced = (
  character: string,
  characterSkills: Record<string, any>,
  characterSouls: Record<string, number>,
  characterTalentPoints: Record<string, number>,
  userId?: string
) => {
  if (persistTimer) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    persistSave(character, characterSkills, characterSouls, characterTalentPoints, userId)
    persistTimer = null
  }, 800)
}

export const loadSettings = (): GameSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<GameSettings>
      const merged = { ...DEFAULT_SETTINGS, ...saved }
      if (saved.postProcessing !== undefined) return merged
      return { ...merged, postProcessing: !isMobileDevice() ? 'high' : 'low' as const }
    }
  } catch {
    // fall through to defaults
  }
  return {
    ...DEFAULT_SETTINGS,
    shadows: isMobileDevice() ? 'off' : 'high',
    particles: isMobileDevice() ? 'reduced' : 'full',
    postProcessing: !isMobileDevice() ? 'high' : 'low',
  }
}

export const persistSettings = (settings: GameSettings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable
  }
}

/** Particle count multiplier derived from settings. */
export const particleScale = (s: GameSettings) => (s.particles === 'reduced' ? 0.4 : 1)
