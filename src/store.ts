import { Vector3, Quaternion, type Mesh } from "three";
import { create } from "zustand";
import {
    loadSave,
    persistSave,
    awardSoulsRPC,
    prereqMet,
    maxHealthBonus,
    loadSettings,
    persistSettings,
    type Skills,
    type GameSettings,
    getCharacterSkillNodes,
} from "./game/skills";
import { levelForSouls, LEVEL_UP_HEAL_FRACTION } from "./game/progression";
import { eventBus, EVENTS } from "./constants";
import type { AbilityId } from "./game/abilities";
import type { CharacterId } from "./game/characters";
import { CHARACTERS, DEFAULT_CHARACTER } from "./game/characters";
import type { GearPiece } from "./game/gear";

// Sword hitbox transform (updated every frame from Caps.tsx)
export type SwordHitbox = {
    position: Vector3
    quaternion: Quaternion
    width: number   // plane width (0.5)
    height: number  // plane height (1.7)
}

interface GameState {
    playerPosition: Vector3
    setPlayerPosition: (position: Vector3) => void

    // Combat state
    isCharging: boolean
    setIsCharging: (charging: boolean) => void
    isSpinAttacking: boolean
    setSpinAttacking: (attacking: boolean) => void
    isParrying: boolean
    setParrying: (parrying: boolean) => void
    isDashing: boolean
    setDashing: (dashing: boolean) => void
    /** Touch device detected — shows the virtual joystick + buttons HUD */
    touchMode: boolean
    setTouchMode: (on: boolean) => void
    /** Rogue shadowstep i-frames — damage is ignored while true */
    isEvading: boolean
    setEvading: (evading: boolean) => void
    /** One-shot mobility animation request (dash / leap / blink / shadowstep) */
    mobilityAnim: { clip: string; timeScale: number } | null
    triggerMobilityAnim: (clip: string, timeScale: number) => void
    clearMobilityAnim: () => void
    spinAttackTriggered: boolean
    triggerSpinAttack: () => void
    clearSpinAttack: () => void
    dashAttackTriggered: boolean
    triggerDashAttack: () => void
    clearDashAttack: () => void
    target: Mesh | null
    setTarget: (target: Mesh | null) => void

    // Sword hitbox (world space)
    swordHitbox: SwordHitbox
    updateSwordHitbox: (position: Vector3, quaternion: Quaternion) => void

    // Attack dash (composable)
    attackDashTriggered: { distance: number; duration: number } | null
    triggerAttackDash: (distance?: number, duration?: number) => void
    clearAttackDash: () => void
    isAttackDashing: boolean
    setAttackDashing: (dashing: boolean) => void

    // Player vitals
    playerHealth: number
    playerMaxHealth: number
    playerDead: boolean
    damagePlayer: (amount: number) => void
    healPlayer: (amount: number) => void
    respawnPlayer: () => void

    // Combo — consecutive hits without taking damage
    combo: number
    comboBest: number
    comboLastAt: number
    registerComboHit: () => void
    breakCombo: () => void

    // Rage (ability resource)
    rage: number
    maxRage: number
    addRage: (amount: number) => void
    spendRage: (amount: number) => boolean

    // Souls (lifetime XP, persisted) — the ACTIVE character's souls
    souls: number
    addSouls: (amount: number) => void

    // Player leveling (derived from lifetime souls)
    playerLevel: number
    talentPoints: number // unspent

    // Character selection
    selectedCharacter: CharacterId
    setSelectedCharacter: (character: CharacterId) => void
    characterSkills: Record<CharacterId, Skills>
    /** Lifetime XP per character — each hero levels on their own time */
    characterSouls: Record<CharacterId, number>
    /** Unspent talent points per character */
    characterTalentPoints: Record<CharacterId, number>

    // Talents (persisted per-character)
    skills: Skills
    buySkill: (id: string) => boolean

    // Abilities
    abilityCooldowns: Record<AbilityId, number>
    triggerAbility: (id: AbilityId) => void
    abilityTriggered: AbilityId | null
    clearAbilityTrigger: () => void
    setAbilityCooldown: (id: AbilityId, readyAt: number) => void
    isFury: boolean
    setFury: (active: boolean) => void
    /** Active ability buff profile (per-class slot 3 / nova buffs) */
    furyBuff: { damageMult: number; speedMult: number } | null
    setFuryBuff: (buff: { damageMult: number; speedMult: number } | null) => void

    // Progression
    currentLevel: number
    setLevel: (index: number) => void
    runId: number
    currentWave: number
    setWave: (wave: number) => void
    portalActive: boolean
    setPortalActive: (active: boolean) => void
    gameWon: boolean
    setGameWon: (won: boolean) => void
    resetRun: () => void
    /** Endless cycles (NG+) — 0 = first descent, +1 per Descend */
    cycle: number
    /** Continue the run past the final level at the next cycle */
    descendDeeper: () => void

    // Gear (run-scoped loot — lost on death / new run)
    gear: GearPiece[]
    addGear: (piece: GearPiece) => void

    // Level loading state (masks spawn lag)
    isLevelLoading: boolean
    setLevelLoading: (loading: boolean) => void

    // Auth
    authUser: any | null
    setAuthUser: (user: any | null) => void

    gamePhase: 'login' | 'menu' | 'playing' | 'paused'
    setGamePhase: (phase: 'login' | 'menu' | 'playing' | 'paused') => void
    startGame: () => void
    quitToMenu: () => void

    // Settings (persisted separately from progression)
    loadCloudSave: (saveData: any) => void
    settings: GameSettings
    updateSettings: (patch: Partial<GameSettings>) => void

    // UI
    skillTreeOpen: boolean
    setSkillTreeOpen: (open: boolean) => void
    settingsOpen: boolean
    setSettingsOpen: (open: boolean) => void
    /** WoW-style character loadout sheet (C key / HUD button) */
    loadoutOpen: boolean
    setLoadoutOpen: (open: boolean) => void
    damageFlash: number
    triggerDamageFlash: () => void

    // Replay mode (trailer capture) — see src/replay/session.ts
    replayPhase: 'idle' | 'recording' | 'playback'
    setReplayPhase: (phase: 'idle' | 'recording' | 'playback') => void
    replayTime: number
    setReplayTime: (t: number) => void
    replayDuration: number
    setReplayDuration: (t: number) => void
    replaySpeed: number
    setReplaySpeed: (speed: number) => void
    replayPlaying: boolean
    setReplayPlaying: (playing: boolean) => void
    /** True when playing back a recording loaded from disk (ghost rigs) */
    replayExternal: boolean
    setReplayExternal: (external: boolean) => void
}

/** True when gameplay (AI, input, bullets, pickups) should be frozen. */
export const isGameFrozen = (s: {
    gamePhase: string
    skillTreeOpen: boolean
    settingsOpen: boolean
    playerDead: boolean
    gameWon: boolean
    isLevelLoading?: boolean
    loadoutOpen?: boolean
    replayPhase?: string
}) =>
    s.gamePhase !== 'playing' ||
    s.skillTreeOpen ||
    s.settingsOpen ||
    s.playerDead ||
    s.gameWon ||
    s.isLevelLoading === true ||
    s.loadoutOpen === true ||
    s.replayPhase === 'playback'

export const useGameStore = create<GameState>((set, get) => {
    const save = loadSave()
    const settings = loadSettings()
    const character = save.selectedCharacter ?? DEFAULT_CHARACTER
    const charDef = CHARACTERS[character]
    const baseHealth = charDef.baseHealth + maxHealthBonus(save.skills)

    return {
        playerPosition: new Vector3(),
        setPlayerPosition: (position) => set({ playerPosition: position }),

        // Combat state
        isCharging: false,
        setIsCharging: (charging) => set({ isCharging: charging }),
        isSpinAttacking: false,
        setSpinAttacking: (attacking) => set({ isSpinAttacking: attacking }),
        isParrying: false,
        setParrying: (parrying) => set({ isParrying: parrying }),
        isDashing: false,
        setDashing: (dashing) => set({ isDashing: dashing }),
        touchMode: false,
        setTouchMode: (on) => set({ touchMode: on }),
        isEvading: false,
        setEvading: (evading) => set({ isEvading: evading }),
        mobilityAnim: null,
        triggerMobilityAnim: (clip, timeScale) => set({ mobilityAnim: { clip, timeScale } }),
        clearMobilityAnim: () => set({ mobilityAnim: null }),
        spinAttackTriggered: false,
        triggerSpinAttack: () => set({ spinAttackTriggered: true }),
        clearSpinAttack: () => set({ spinAttackTriggered: false }),
        dashAttackTriggered: false,
        triggerDashAttack: () => set({ dashAttackTriggered: true }),
        clearDashAttack: () => set({ dashAttackTriggered: false }),
        target: null,
        setTarget: (target) => set({ target }),

        // Sword hitbox (world space) - mutate in place for performance
        swordHitbox: {
            position: new Vector3(),
            quaternion: new Quaternion(),
            width: 0.5,
            height: 1.7
        },
        updateSwordHitbox: (position, quaternion) => {
            const hitbox = get().swordHitbox
            hitbox.position.copy(position)
            hitbox.quaternion.copy(quaternion)
        },

        // Attack dash (composable)
        attackDashTriggered: null,
        triggerAttackDash: (distance = 1.2, duration = 0.15) => set({ attackDashTriggered: { distance, duration } }),
        clearAttackDash: () => set({ attackDashTriggered: null }),
        isAttackDashing: false,
        setAttackDashing: (dashing) => set({ isAttackDashing: dashing }),

        // Player vitals
        playerHealth: baseHealth,
        playerMaxHealth: baseHealth,
        playerDead: false,

        // Combo
        combo: 0,
        comboBest: 0,
        comboLastAt: 0,
        registerComboHit: () => {
            const s = get()
            const combo = s.combo + 1
            set({ combo, comboBest: Math.max(s.comboBest, combo), comboLastAt: Date.now() })
        },
        breakCombo: () => {
            if (get().combo > 0) set({ combo: 0 })
        },
        damagePlayer: (amount) => {
            const s = get()
            // Dashing is an evasion window for every class — that's how you
            // cross the King's shockwave wall.
            if (s.playerDead || s.gamePhase !== 'playing' || s.isEvading || s.isDashing) return
            const next = Math.max(0, s.playerHealth - amount)
            // Getting hit breaks your combo
            set({ playerHealth: next, damageFlash: s.damageFlash + 1, combo: 0 })
            if (next <= 0) {
                set({ playerDead: true })
                eventBus.emit(EVENTS.PLAYER_DIED)
            }
        },
        healPlayer: (amount) => {
            const s = get()
            set({ playerHealth: Math.min(s.playerMaxHealth, s.playerHealth + amount) })
        },
        respawnPlayer: () => {
            const s = get()
            set({
                playerHealth: s.playerMaxHealth,
                rage: 0,
                playerDead: false,
                isFury: false,
                furyBuff: null,
                isEvading: false,
                portalActive: false,
                // Clear combat flags that may have been latched when the
                // player died (e.g. mid-charge) — they pin speed to 0.
                isCharging: false,
                isSpinAttacking: false,
                isParrying: false,
                isDashing: false,
                isAttackDashing: false,
                spinAttackTriggered: false,
                dashAttackTriggered: false,
                attackDashTriggered: null,
                mobilityAnim: null,
                combo: 0,
                runId: s.runId + 1,
            })
        },

        // Rage
        rage: 0,
        maxRage: 100,
        addRage: (amount) => {
            const s = get()
            set({ rage: Math.min(s.maxRage, s.rage + amount) })
        },
        spendRage: (amount) => {
            const s = get()
            if (s.rage < amount) return false
            set({ rage: s.rage - amount })
            return true
        },

        // Souls (lifetime XP) + level-ups — per character
        souls: save.souls,
        playerLevel: levelForSouls(save.souls),
        talentPoints: save.talentPoints,
        characterSouls: save.characterSouls,
        characterTalentPoints: save.characterTalentPoints,
        addSouls: (amount) => {
            const s = get()
            const next = s.souls + amount
            const characterSouls = { ...s.characterSouls, [s.selectedCharacter]: next }
            const newLevel = levelForSouls(next)
            const persistUserId = s.authUser?.id
            const callAwardRpc = async () => {
              if (!persistUserId) return
              try {
                await awardSoulsRPC(persistUserId, s.selectedCharacter, amount)
              } catch (error) {
                console.error('award_souls failed:', error)
              }
            }
            if (newLevel > s.playerLevel) {
                const levelsGained = newLevel - s.playerLevel
                const talentPoints = s.talentPoints + levelsGained
                const characterTalentPoints = { ...s.characterTalentPoints, [s.selectedCharacter]: talentPoints }
                const heal = s.playerMaxHealth * LEVEL_UP_HEAL_FRACTION
                set({
                    souls: next,
                    characterSouls,
                    playerLevel: newLevel,
                    talentPoints,
                    characterTalentPoints,
                    playerHealth: Math.min(s.playerMaxHealth, s.playerHealth + heal),
                    rage: s.maxRage,
                })
                eventBus.emit(EVENTS.LEVEL_UP, newLevel)
                eventBus.emit(EVENTS.ANNOUNCE, `Level ${newLevel}`, `+${levelsGained} talent point${levelsGained > 1 ? 's' : ''} — press TAB`)
                persistSave(s.selectedCharacter, s.characterSkills, characterSouls, characterTalentPoints, persistUserId)
                void callAwardRpc()
                return
            }
            set({ souls: next, characterSouls })
            persistSave(s.selectedCharacter, s.characterSkills, characterSouls, s.characterTalentPoints, persistUserId)
            void callAwardRpc()
        },

        // Character selection
        selectedCharacter: character,
        characterSkills: save.characterSkills,
        setSelectedCharacter: (character) => {
            const s = get()
            const skills = s.characterSkills[character] ?? {}
            const charDef = CHARACTERS[character]
            const newMaxHealth = charDef.baseHealth + maxHealthBonus(skills)
            // Each hero has their own souls, level and unspent talent points
            const souls = s.characterSouls[character] ?? 0
            set({
                selectedCharacter: character,
                skills,
                souls,
                playerLevel: levelForSouls(souls),
                talentPoints: s.characterTalentPoints[character] ?? 0,
                playerMaxHealth: newMaxHealth,
                playerHealth: newMaxHealth,
            })
            persistSave(character, s.characterSkills, s.characterSouls, s.characterTalentPoints, s.authUser?.id)
        },

        // Talents (1 point per rank, parent prerequisite)
        skills: save.skills,
        buySkill: (id) => {
            const s = get()
            const nodes = getCharacterSkillNodes(s.selectedCharacter)
            if (s.talentPoints < 1 || !prereqMet(s.skills, id, nodes)) {
                eventBus.emit(EVENTS.TALENT_BUY, false)
                return false
            }
            const skills = { ...s.skills, [id]: (s.skills[id] ?? 0) + 1 }
            const talentPoints = s.talentPoints - 1
            const newMax = CHARACTERS[s.selectedCharacter].baseHealth + maxHealthBonus(skills)
            const healthGain = newMax - s.playerMaxHealth
            const characterSkills = { ...s.characterSkills, [s.selectedCharacter]: skills }
            const characterTalentPoints = { ...s.characterTalentPoints, [s.selectedCharacter]: talentPoints }
            set({
                skills,
                talentPoints,
                characterTalentPoints,
                playerMaxHealth: newMax,
                playerHealth: healthGain > 0 ? s.playerHealth + healthGain : s.playerHealth,
                characterSkills,
            })
            persistSave(s.selectedCharacter, characterSkills, s.characterSouls, characterTalentPoints, s.authUser?.id)
            eventBus.emit(EVENTS.TALENT_BUY, true)
            return true
        },

        // Abilities
        abilityCooldowns: { slot1: 0, slot2: 0, slot3: 0, slot4: 0 },
        abilityTriggered: null,
        triggerAbility: (id) => set({ abilityTriggered: id }),
        clearAbilityTrigger: () => set({ abilityTriggered: null }),
        setAbilityCooldown: (id, readyAt) =>
            set((s) => ({ abilityCooldowns: { ...s.abilityCooldowns, [id]: readyAt } })),
        isFury: false,
        setFury: (active) => set({ isFury: active }),
        furyBuff: null,
        setFuryBuff: (buff) => set({ furyBuff: buff }),

        // Progression
        currentLevel: 0,
        setLevel: (index) => set({ currentLevel: index, currentWave: 0, portalActive: false }),
        runId: 0,
        currentWave: 0,
        setWave: (wave) => set({ currentWave: wave }),
        portalActive: false,
        setPortalActive: (active) => set({ portalActive: active }),
        gameWon: false,
        setGameWon: (won) => set({ gameWon: won }),
        cycle: 0,
        descendDeeper: () =>
            set((s) => ({
                cycle: s.cycle + 1,
                gameWon: false,
                currentLevel: 0,
                currentWave: 0,
                portalActive: false,
                isLevelLoading: false,
                runId: s.runId + 1,
            })),

        // Gear (run-scoped loot)
        gear: [],
        addGear: (piece) => {
            const s = get()
            set({
                gear: [...s.gear, piece],
                playerMaxHealth: s.playerMaxHealth + piece.hpFlat,
                playerHealth: s.playerHealth + piece.hpFlat,
            })
            eventBus.emit(EVENTS.ANNOUNCE, piece.name, piece.statLine)
            eventBus.emit(EVENTS.ITEM_PICKUP)
        },

        resetRun: () => set((s) => {
            // Gear is lost — recompute max health from character + talents only
            const baseMax = CHARACTERS[s.selectedCharacter].baseHealth + maxHealthBonus(s.skills)
            return {
                currentLevel: 0,
                currentWave: 0,
                portalActive: false,
                gameWon: false,
                cycle: 0,
                gear: [],
                playerDead: false,
                playerMaxHealth: baseMax,
                playerHealth: baseMax,
                rage: 0,
                isFury: false,
                furyBuff: null,
                isEvading: false,
                isLevelLoading: false,
                // Combat flags can stick true across a run (e.g. mouse released
                // outside the window mid-charge) and pin movement speed to 0
                // with no visible UI — always clear them for a fresh run.
                isCharging: false,
                isSpinAttacking: false,
                isParrying: false,
                isDashing: false,
                isAttackDashing: false,
                spinAttackTriggered: false,
                dashAttackTriggered: false,
                attackDashTriggered: null,
                mobilityAnim: null,
                combo: 0,
                runId: s.runId + 1,
            }
        }),

        // Level loading state (masks spawn lag)
        isLevelLoading: false,
        setLevelLoading: (loading) => set({ isLevelLoading: loading }),

        // Auth
        authUser: null,
        setAuthUser: (user) => set({ authUser: user }),
        gamePhase: 'login',
        setGamePhase: (phase) => set({ gamePhase: phase }),

        // Persistence & settings
        settings,
        loadCloudSave: (saveData) => {
            set({
                souls: saveData.souls,
                characterSkills: saveData.characterSkills,
                characterSouls: saveData.characterSouls,
                characterTalentPoints: saveData.characterTalentPoints,
                selectedCharacter: saveData.selectedCharacter
            })
            const s = get()
            persistSave(s.selectedCharacter, s.characterSkills, s.characterSouls, s.characterTalentPoints, s.authUser?.id)
        },
        updateSettings: (patch) => {
            const next = { ...get().settings, ...patch }
            set({ settings: next })
            persistSettings(next)
        },

        // UI
        skillTreeOpen: false,
        setSkillTreeOpen: (open) => set({ skillTreeOpen: open }),
        settingsOpen: false,
        setSettingsOpen: (open) => set({ settingsOpen: open }),
        loadoutOpen: false,
        setLoadoutOpen: (open) => set({ loadoutOpen: open }),
        damageFlash: 0,
        triggerDamageFlash: () => set((s) => ({ damageFlash: s.damageFlash + 1 })),

        // Replay mode (trailer capture)
        replayPhase: 'idle',
        setReplayPhase: (phase) => set({ replayPhase: phase }),
        replayTime: 0,
        setReplayTime: (t) => set({ replayTime: t }),
        replayDuration: 0,
        setReplayDuration: (t) => set({ replayDuration: t }),
        replaySpeed: 1,
        setReplaySpeed: (speed) => set({ replaySpeed: speed }),
        replayPlaying: false,
        setReplayPlaying: (playing) => set({ replayPlaying: playing }),
        replayExternal: false,
        setReplayExternal: (external) => set({ replayExternal: external }),
    }
})

// Exposed for debugging / e2e probes
if (typeof window !== 'undefined') {
  ;(window as any).__gameStore = useGameStore
}
