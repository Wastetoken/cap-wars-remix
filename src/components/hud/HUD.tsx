import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store'
import { eventBus, EVENTS } from '@/constants'
import { getAbilityList } from '@/game/abilities'
import {
  getSkillRank,
  prereqMet,
  isAbilityUnlocked,
  getCharacterSkillNodes,
  getCharacterBranches,
  maxHealthBonus,
  type GameSettings,
} from '@/game/skills'
import {
  DAMAGE_SKILL_IDS,
  HEALTH_SKILL_IDS,
  RAGE_SKILL_IDS,
  DASH_SKILL_IDS,
  LIFESTEAL_SKILL_IDS,
  ABILITY_SKILL_IDS,
  type SkillNode,
} from '@/game/character-skills'
import { soulsProgress, levelForSouls } from '@/game/progression'
import { LEVELS } from '@/game/levels'
import { CHARACTERS } from '@/game/characters'
import { RARITY_COLORS, type GearSlot } from '@/game/gear'
import { cycleLabel } from '@/game/cycle'
import { LoadoutScreen } from './LoadoutScreen'
import { MenuScene } from '@/components/menu/MenuScene'
import { LoadingArt } from './BootLoader'
import { playSting } from '@/game/audio'
import { useProgress } from '@react-three/drei'
import { LoginScreen } from '../menu/LoginScreen'

// ============================================================================
// HUD — DOM overlay: main menu, pause, settings, talent tree, vitals,
// abilities, XP bar, announcements, death and victory screens.
// ============================================================================

export const HUD = () => {
  const gamePhase = useGameStore((s) => s.gamePhase)
  const playerDead = useGameStore((s) => s.playerDead)
  const gameWon = useGameStore((s) => s.gameWon)
  const skillTreeOpen = useGameStore((s) => s.skillTreeOpen)
  const settingsOpen = useGameStore((s) => s.settingsOpen)
  const loadoutOpen = useGameStore((s) => s.loadoutOpen)
  const touchMode = useGameStore((s) => s.touchMode)

  const inRun = gamePhase === 'playing' || gamePhase === 'paused'
  const overlayOpen = skillTreeOpen || settingsOpen || loadoutOpen
  const isLevelLoading = useGameStore((s) => s.isLevelLoading)

  return (
    <div className={`hud ${touchMode ? 'touch-mode' : ''}`}>
      {inRun && <InGameHud />}

      <Announcements />
      <DamageFlash />

      {gamePhase === 'login' && !isLevelLoading && !overlayOpen && <LoginScreen />}
      {gamePhase === 'menu' && !overlayOpen && <MainMenu />}
      {gamePhase === 'paused' && !overlayOpen && !playerDead && !gameWon && <PauseMenu />}
      {settingsOpen && <SettingsMenu />}
      {skillTreeOpen && <TalentTree />}
      {loadoutOpen && <LoadoutScreen />}
      {playerDead && <DeathScreen />}
      {gameWon && <VictoryScreen />}
      <LoadingOverlay />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gear loadout — one rarity-colored chip per piece collected this run
// ---------------------------------------------------------------------------

const SLOT_LETTERS: Record<GearSlot, string> = {
  weapon: 'W',
  armor: 'A',
  boots: 'B',
  trinket: 'T',
}

const GearBar = () => {
  const gear = useGameStore((s) => s.gear)
  if (gear.length === 0) return null
  return (
    <div className="gear-bar">
      {gear.map((g) => (
        <div
          key={g.id}
          className={`gear-chip ${g.rarity}`}
          style={{ borderColor: RARITY_COLORS[g.rarity], color: RARITY_COLORS[g.rarity] }}
          title={`${g.name} — ${g.statLine}`}
        >
          {SLOT_LETTERS[g.slot]}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// In-game HUD (vitals, XP, abilities, hints)
// ---------------------------------------------------------------------------

const InGameHud = () => {
  const health = useGameStore((s) => s.playerHealth)
  const maxHealth = useGameStore((s) => s.playerMaxHealth)
  const rage = useGameStore((s) => s.rage)
  const maxRage = useGameStore((s) => s.maxRage)
  const souls = useGameStore((s) => s.souls)
  const talentPoints = useGameStore((s) => s.talentPoints)
  const currentLevel = useGameStore((s) => s.currentLevel)
  const isFury = useGameStore((s) => s.isFury)
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)

  const xp = soulsProgress(souls)
  const charName = CHARACTERS[selectedCharacter].name
  const touchMode = useGameStore((s) => s.touchMode)
  const setSkillTreeOpen = useGameStore((s) => s.setSkillTreeOpen)
  const setLoadoutOpen = useGameStore((s) => s.setLoadoutOpen)
  const cycle = useGameStore((s) => s.cycle)

  return (
    <>
      {/* Top-left: player level + XP + current dungeon level */}
      <div className="hud-top-left">
        <div className="level-badge">Lv {xp.level}</div>
        <div className="xp-column">
          <div className="bar xp-bar">
            <div className="bar-fill" style={{ width: `${xp.fraction * 100}%` }} />
            <span className="bar-label">
              {xp.into} / {xp.needed} souls
            </span>
          </div>
          <div className="hud-level">
            {charName} — {LEVELS[currentLevel]?.name}
            {cycle > 0 && <span className="cycle-badge">Cycle {cycleLabel(cycle)}</span>}
          </div>
          <GearBar />
        </div>
      </div>

      {/* Talent point reminder (tappable on touch) */}
      {talentPoints > 0 &&
        (touchMode ? (
          <button className="talent-reminder tappable" onClick={() => setSkillTreeOpen(true)}>
            {talentPoints} talent point{talentPoints > 1 ? 's' : ''} — tap to spend
          </button>
        ) : (
          <div className="talent-reminder">
            {talentPoints} talent point{talentPoints > 1 ? 's' : ''} — press TAB
          </div>
        ))}

      {/* Bottom-left: vitals */}
      <div className="hud-vitals">
        <div className="bar hp-bar">
          <div className="bar-fill" style={{ width: `${(health / maxHealth) * 100}%` }} />
          <span className="bar-label">
            {Math.ceil(health)} / {maxHealth}
          </span>
        </div>
        <div className="bar rage-bar">
          <div className={`bar-fill ${isFury ? 'fury' : ''}`} style={{ width: `${(rage / maxRage) * 100}%` }} />
        </div>
      </div>

      {/* Loadout button — top-right, tappable on touch */}
      <button className="loadout-button tappable" onClick={() => setLoadoutOpen(true)}>
        🎒 Loadout{touchMode ? '' : ' (C)'}
      </button>

      {/* Bottom-center: abilities (replaced by thumb buttons on touch) */}
      {!touchMode && <AbilityBar />}

      {/* Hint */}
      {!touchMode && <div className="hud-hint">TAB — talents · C — loadout · ESC — pause</div>}
    </>
  )
}

// ---------------------------------------------------------------------------
// Ability bar
// ---------------------------------------------------------------------------

const AbilityBar = () => {
  const skills = useGameStore((s) => s.skills)
  const rage = useGameStore((s) => s.rage)
  const cooldowns = useGameStore((s) => s.abilityCooldowns)
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  const [, setTick] = useState(0)

  // Refresh cooldown sweeps
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 100)
    return () => window.clearInterval(t)
  }, [])

  const now = Date.now()
  const abilities = getAbilityList(selectedCharacter)

  return (
    <div className="ability-bar">
      {abilities.map((ab) => {
        const unlocked = isAbilityUnlocked(skills, selectedCharacter, ab.id)
        const remaining = Math.max(0, cooldowns[ab.id] - now)
        const cdFraction = remaining / ab.cooldownMs
        const affordable = rage >= ab.rageCost

        return (
          <div
            key={ab.id}
            className={`ability-slot framed ${unlocked ? '' : 'locked'} ${affordable && unlocked ? '' : 'dim'}`}
            title={unlocked ? `${ab.name} — ${ab.description}` : `${ab.name} — Locked, unlock in the talent tree (TAB)`}
          >
            <span className="ability-disc">
              <img className="ability-icon" src={`/ui/icons/${ab.name.toLowerCase().replace(/\s+/g, '-')}.png`} alt={ab.name} draggable={false} />
            </span>
            {!unlocked && <img className="ability-chains" src="/ui/locked-chains.png" alt="" draggable={false} />}
            <span className="ability-key">{ab.keyLabel}</span>
            <span className="ability-cost">{ab.rageCost}</span>
            {remaining > 0 && (
              <div
                className="ability-cd"
                style={{
                  background: `conic-gradient(rgba(0,0,0,0.75) ${cdFraction * 360}deg, transparent 0deg)`,
                }}
              >
                {(remaining / 1000).toFixed(1)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

const MainMenu = () => {
  const startGame = useGameStore((s) => s.startGame)
  const setSkillTreeOpen = useGameStore((s) => s.setSkillTreeOpen)
  const setSettingsOpen = useGameStore((s) => s.setSettingsOpen)
  const setLevelLoading = useGameStore((s) => s.setLevelLoading)
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  // Per-character progression for the status bar
  const souls = useGameStore((s) => s.characterSouls[s.selectedCharacter] ?? 0)
  const talentPoints = useGameStore((s) => s.characterTalentPoints[s.selectedCharacter] ?? 0)
  const skills = useGameStore((s) => s.characterSkills[s.selectedCharacter] ?? {})
  // Hold the menu UI back until the 3D diorama is fully loaded — no
  // half-rendered scene or placeholder junk on screen at startup
  const { progress } = useProgress()
  const sceneReady = progress >= 100

  useEffect(() => {
    if (sceneReady) {
      setLevelLoading(false)
    }
  }, [sceneReady, setLevelLoading])

  const heroLevel = levelForSouls(souls)
  const maxHp = CHARACTERS[selectedCharacter].baseHealth + maxHealthBonus(skills)

  const onExitGame = () => {
    // Browsers only let scripts close windows they opened — tell the player
    window.close()
    eventBus.emit(EVENTS.ANNOUNCE, 'Exit', 'Close the browser tab to quit')
  }

  return (
    <div className="overlay menu-overlay scenic">
      {/* Full-screen 3D diorama — click a hero to select them */}
      <MenuScene />

      {!sceneReady ? null : (
      <div className="menu-panel scenic-panel">
        <div className="menu-rpg-bottom">
          <div className="menu-rpg-buttons">
            <button
              className="menu-rpg-btn primary"
              onClick={() => {
                playSting('enter-dungeon')
                startGame()
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 21V10a8 8 0 0 1 16 0v11" />
                <path d="M4 21h16" />
                <path d="M9 21v-6a3 3 0 0 1 6 0v6" />
                <path d="M2 21h20" strokeWidth="2" />
              </svg>
              <span>Enter Dungeon</span>
            </button>
            <button className="menu-rpg-btn" onClick={() => setSkillTreeOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 11a8 8 0 0 1 16 0v3l-2 2v5H6v-5l-2-2z" />
                <path d="M12 3v4" />
                <path d="M8 21v-4M16 21v-4" />
              </svg>
              <span>Talents</span>
            </button>
            <button className="menu-rpg-btn" onClick={() => setSettingsOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
              </svg>
              <span>Settings</span>
            </button>
            <button className="menu-rpg-btn" onClick={onExitGame}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M14 4H6v16h8" />
                <path d="M10 12h11M18 8l3 4-3 4" />
              </svg>
              <span>Exit Game</span>
            </button>
          </div>

          <div className="menu-rpg-status">
            <div className="menu-rpg-stat">
              <svg className="stat-icon heart" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21C6 16.5 2.5 13 2.5 8.9 2.5 6 4.7 4 7.2 4c1.9 0 3.6 1 4.8 2.7C13.2 5 14.9 4 16.8 4c2.5 0 4.7 2 4.7 4.9 0 4.1-3.5 7.6-9.5 12.1z" />
              </svg>
              <div className="stat-text">
                <span className="stat-label">HP</span>
                <span className="stat-value">{maxHp} / {maxHp}</span>
              </div>
              <div className="stat-bar"><div className="stat-bar-fill hp" style={{ width: '100%' }} /></div>
            </div>

            <div className="menu-rpg-level">
              <span className="level-caption">LV</span>
              <span className="level-num">{heroLevel}</span>
            </div>

            <div className="menu-rpg-stat">
              <svg className="stat-icon flame" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2c1 4-4 6-4 11a6 6 0 0 0 12 0c0-2.5-1.2-4.3-2.5-6-.3 1.5-1 2.5-2 3 .5-3-1.5-6.5-3.5-8z" />
              </svg>
              <div className="stat-text">
                <span className="stat-label">Souls</span>
                <span className="stat-value">{souls.toLocaleString()}</span>
              </div>
            </div>

            <div className="menu-rpg-stat">
              <svg className="stat-icon star" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
              </svg>
              <div className="stat-text">
                <span className="stat-label">Talent Pts</span>
                <span className="stat-value">{talentPoints}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pause menu
// ---------------------------------------------------------------------------

const PauseMenu = () => {
  const setGamePhase = useGameStore((s) => s.setGamePhase)
  const setSkillTreeOpen = useGameStore((s) => s.setSkillTreeOpen)
  const setSettingsOpen = useGameStore((s) => s.setSettingsOpen)
  const quitToMenu = useGameStore((s) => s.quitToMenu)
  const currentLevel = useGameStore((s) => s.currentLevel)
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)

  return (
    <div className="overlay pause-overlay">
      <div className="menu-panel">
        <div className="pause-title">PAUSED</div>
        <div className="game-subtitle">{LEVELS[currentLevel]?.name}</div>
        <div className="character-pause-name">{CHARACTERS[selectedCharacter].name}</div>

        <div className="menu-buttons">
          <button className="hud-button primary" onClick={() => setGamePhase('playing')}>
            Resume
          </button>
          <button className="hud-button" onClick={() => setSkillTreeOpen(true)}>
            Talents
          </button>
          <button className="hud-button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button className="hud-button danger" onClick={quitToMenu}>
            Quit to Menu
          </button>
        </div>

        <div className="menu-controls">ESC — resume</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings menu
// ---------------------------------------------------------------------------

const SettingsMenu = () => {
  const settings = useGameStore((s) => s.settings)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const setSettingsOpen = useGameStore((s) => s.setSettingsOpen)

  const Segmented = <K extends keyof GameSettings>({
    label,
    settingKey,
    options,
  }: {
    label: string
    settingKey: K
    options: { value: GameSettings[K]; label: string }[]
  }) => (
    <div className="settings-row">
      <div className="settings-label">{label}</div>
      <div className="settings-options">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            className={`settings-option ${settings[settingKey] === opt.value ? 'active' : ''}`}
            onClick={() => updateSettings({ [settingKey]: opt.value })}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )

  const Slider = ({
    label,
    settingKey,
  }: {
    label: string
    settingKey: 'musicVolume' | 'sfxVolume'
  }) => (
    <div className="settings-row">
      <div className="settings-label">{label}</div>
      <div className="settings-options">
        <input
          type="range"
          className="settings-slider"
          min={0}
          max={100}
          value={Math.round(settings[settingKey] * 100)}
          onChange={(e) => updateSettings({ [settingKey]: Number(e.target.value) / 100 })}
        />
        <span className="settings-slider-value">
          {Math.round(settings[settingKey] * 100)}%
        </span>
      </div>
    </div>
  )

  return (
    <div className="overlay settings-overlay">
      <div className="menu-panel">
        <div className="pause-title">SETTINGS</div>

        <div className="settings-list">
          <Slider label="Music" settingKey="musicVolume" />
          <Slider label="Sound effects" settingKey="sfxVolume" />
          <Segmented
            label="Camera shake"
            settingKey="cameraShake"
            options={[
              { value: true, label: 'On' },
              { value: false, label: 'Off' },
            ]}
          />
          <Segmented
            label="Shadows"
            settingKey="shadows"
            options={[
              { value: 'high', label: 'High' },
              { value: 'low', label: 'Low' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <Segmented
            label="Particle density"
            settingKey="particles"
            options={[
              { value: 'full', label: 'Full' },
              { value: 'reduced', label: 'Reduced' },
            ]}
          />
          <Segmented
            label="Post-processing"
            settingKey="postProcessing"
            options={[
              { value: true, label: 'On' },
              { value: false, label: 'Off' },
            ]}
          />
        </div>

        <div className="menu-buttons">
          <button className="hud-button primary" onClick={() => setSettingsOpen(false)}>
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Talent tree (per-character, 3 branches, prerequisites, 1 point per rank)
// ---------------------------------------------------------------------------

const TalentTree = () => {
  const skills = useGameStore((s) => s.skills)
  const souls = useGameStore((s) => s.souls)
  const talentPoints = useGameStore((s) => s.talentPoints)
  const buySkill = useGameStore((s) => s.buySkill)
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  const setSkillTreeOpen = useGameStore((s) => s.setSkillTreeOpen)
  const [focusId, setFocusId] = useState<string | null>(null)

  const xp = soulsProgress(souls)
  const nodes = getCharacterSkillNodes(selectedCharacter)
  const branches = getCharacterBranches(selectedCharacter)

  // Rune glyphs for passive nodes (ability nodes use their icon art)
  const runeFor = (id: string) => {
    if (DAMAGE_SKILL_IDS.includes(id)) return 'sword'
    if (HEALTH_SKILL_IDS.includes(id)) return 'heart'
    if (RAGE_SKILL_IDS.includes(id)) return 'rage'
    if (DASH_SKILL_IDS.includes(id)) return 'wind'
    if (LIFESTEAL_SKILL_IDS.includes(id)) return 'drop'
    return 'gem'
  }
  const abilityNodeIds = new Set(
    Object.values(ABILITY_SKILL_IDS[selectedCharacter] ?? {})
  )

  // Vine layout: root on top, children fan out below — positions in px
  const VINE_W = 210
  const layoutBranch = (bnodes: SkillNode[]) => {
    const depths = new Map<string, number>()
    const depthOf = (n: SkillNode): number =>
      depths.get(n.id) ??
      (() => {
        const d = n.parent ? depthOf(bnodes.find((b) => b.id === n.parent)!) + 1 : 0
        depths.set(n.id, d)
        return d
      })()
    const byDepth = new Map<number, SkillNode[]>()
    bnodes.forEach((n) => {
      const d = depthOf(n)
      byDepth.set(d, [...(byDepth.get(d) ?? []), n])
    })
    const pos = new Map<string, { x: number; y: number }>()
    byDepth.forEach((list, d) => {
      list.forEach((n, i) => {
        const x = list.length === 1 ? VINE_W / 2 : 55 + (i * (VINE_W - 110)) / (list.length - 1)
        pos.set(n.id, { x, y: 44 + d * 112 })
      })
    })
    return { pos, height: 44 + (byDepth.size - 1) * 112 + 110 }
  }

  const focused = focusId ? nodes.find((n) => n.id === focusId) : null

  return (
    <div className="overlay skilltree-overlay">
      <div className="skilltree-panel wide">
        <div className="skilltree-header">
          <h2>{CHARACTERS[selectedCharacter].name} — Talents</h2>
          <div className="skilltree-resources">
            <span className="level-badge">Lv {xp.level}</span>
            <span className={`points-badge ${talentPoints > 0 ? 'has-points' : ''}`}>
              {talentPoints} point{talentPoints === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="skilltree-branches vines">
          {branches.map((branch) => {
            const bnodes = nodes.filter((n) => n.branch === branch.id)
            const { pos, height } = layoutBranch(bnodes)
            return (
              <div className="branch-vine" key={branch.id}>
                <div className="branch-header" style={{ color: branch.color }}>
                  {branch.name}
                </div>
                <div className="vine-body" style={{ height }}>
                  <svg
                    className="vine-links"
                    viewBox={`0 0 ${VINE_W} ${height}`}
                    preserveAspectRatio="none"
                  >
                    {bnodes
                      .filter((n) => n.parent)
                      .map((n) => {
                        const a = pos.get(n.parent!)!
                        const b = pos.get(n.id)!
                        const lit = getSkillRank(skills, n.id) > 0
                        const open = prereqMet(skills, n.id, nodes)
                        const midY = (a.y + b.y) / 2
                        return (
                          <path
                            key={n.id}
                            d={`M ${a.x} ${a.y + 30} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y - 30}`}
                            className={`vine-link ${lit ? 'lit' : open ? 'open' : ''}`}
                            style={lit || open ? { stroke: branch.color } : undefined}
                          />
                        )
                      })}
                  </svg>
                  {bnodes.map((node) => {
                    const p = pos.get(node.id)!
                    const rank = getSkillRank(skills, node.id)
                    const maxed = rank >= node.maxRank
                    const met = prereqMet(skills, node.id, nodes)
                    const canBuy = !maxed && met && talentPoints > 0
                    const isAbility = abilityNodeIds.has(node.id)
                    const icon = `/ui/icons/${node.name.toLowerCase().replace(/\s+/g, '-')}.png`
                    return (
                      <button
                        key={node.id}
                        className={`skill-medallion ${maxed ? 'maxed' : rank > 0 ? 'learned' : canBuy ? 'affordable' : met ? 'poor' : 'locked'}`}
                        style={{ left: p.x - 32, top: p.y - 32, ['--branch' as string]: branch.color }}
                        onClick={() => {
                          setFocusId(node.id)
                          buySkill(node.id)
                        }}
                        onMouseEnter={() => setFocusId(node.id)}
                      >
                        <span className="medallion-core">
                          {isAbility ? (
                            <img className="medallion-icon" src={icon} alt="" draggable={false} />
                          ) : (                            <svg className={`medallion-rune rune-${runeFor(node.id)}`} viewBox="0 0 24 24">
                              {runeFor(node.id) === 'sword' && (
                                <path d="M12 2 L14 8 L14 16 L12 22 L10 16 L10 8 Z M7 10 L17 10 L17 12 L7 12 Z" fill="currentColor" />
                              )}
                              {runeFor(node.id) === 'heart' && (
                                <path d="M12 21 C5 15 3 10 6 7 C8 5 11 6 12 8 C13 6 16 5 18 7 C21 10 19 15 12 21 Z" fill="currentColor" />
                              )}
                              {runeFor(node.id) === 'rage' && (
                                <path d="M13 2 L6 13 L11 13 L9 22 L18 10 L13 10 Z" fill="currentColor" />
                              )}
                              {runeFor(node.id) === 'wind' && (
                                <path d="M3 8 L15 8 C18 8 18 12 15 12 M3 12 L18 12 M3 16 L13 16 C16 16 16 20 13 20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                              )}
                              {runeFor(node.id) === 'drop' && (
                                <path d="M12 3 C12 3 6 10 6 14 A6 6 0 0 0 18 14 C18 10 12 3 12 3 Z" fill="currentColor" />
                              )}
                              {runeFor(node.id) === 'gem' && (
                                <path d="M12 3 L19 9 L12 21 L5 9 Z M5 9 L19 9" stroke="currentColor" strokeWidth="1.6" fill="none" />
                              )}
                            </svg>
                          )}
                        </span>
                        {!met && <img className="medallion-chains" src="/ui/locked-chains.png" alt="" draggable={false} />}
                        <span className="medallion-pips">
                          {Array.from({ length: node.maxRank }, (_, i) => (
                            <span key={i} className={`pip ${i < rank ? 'filled' : ''}`} />
                          ))}
                        </span>
                        <span className="medallion-name">{node.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="skilltree-detail">
          {focused ? (
            <>
              <span className="detail-name">{focused.name}</span>
              <span className="detail-desc">{focused.description}</span>
              <span className="detail-cost">
                {getSkillRank(skills, focused.id) >= focused.maxRank
                  ? 'MAXED'
                  : !prereqMet(skills, focused.id, nodes) && focused.parent
                    ? `Requires ${nodes.find((n) => n.id === focused.parent)?.name}`
                    : talentPoints > 0
                      ? 'Click to learn — 1 point'
                      : 'Need a talent point'}
              </span>
            </>
          ) : (
            <span className="detail-hint">
              Kill mobs → collect souls → level up → earn points · ESC to close
            </span>
          )}
        </div>

        <div className="menu-buttons">
          <button className="hud-button primary" onClick={() => setSkillTreeOpen(false)}>
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

const Announcements = () => {
  const [message, setMessage] = useState<{ title: string; subtitle?: string; key: number } | null>(
    null
  )

  useEffect(() => {
    const onAnnounce = (title: string, subtitle?: string) => {
      setMessage({ title, subtitle, key: Date.now() })
    }
    eventBus.on(EVENTS.ANNOUNCE, onAnnounce)
    return () => {
      eventBus.off(EVENTS.ANNOUNCE, onAnnounce)
    }
  }, [])

  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), 2600)
    return () => window.clearTimeout(t)
  }, [message])

  if (!message) return null

  return (
    <div className="announce" key={message.key}>
      <div className="announce-title">{message.title}</div>
      {message.subtitle && <div className="announce-sub">{message.subtitle}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Damage flash
// ---------------------------------------------------------------------------

const DamageFlash = () => {
  const damageFlash = useGameStore((s) => s.damageFlash)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (damageFlash === 0) return
    setVisible(true)
    const t = window.setTimeout(() => setVisible(false), 160)
    return () => window.clearTimeout(t)
  }, [damageFlash])

  return <div className={`damage-vignette ${visible ? 'on' : ''}`} />
}

// ---------------------------------------------------------------------------
// Death / victory
// ---------------------------------------------------------------------------

const DeathScreen = () => {
  const respawnPlayer = useGameStore((s) => s.respawnPlayer)
  const quitToMenu = useGameStore((s) => s.quitToMenu)

  return (
    <div className="overlay death-overlay">
      <div className="death-text">YOU DIED</div>
      <div className="menu-buttons">
        <button className="hud-button primary" onClick={respawnPlayer}>
          Rise again
        </button>
        <button className="hud-button" onClick={quitToMenu}>
          Main menu
        </button>
      </div>
    </div>
  )
}

const VictoryScreen = () => {
  const quitToMenu = useGameStore((s) => s.quitToMenu)
  const descendDeeper = useGameStore((s) => s.descendDeeper)
  const souls = useGameStore((s) => s.souls)
  const cycle = useGameStore((s) => s.cycle)
  const gear = useGameStore((s) => s.gear)

  const xp = soulsProgress(souls)

  return (
    <div className="overlay victory-overlay">
      <div className="victory-text">THE KING IS DEAD</div>
      <div className="victory-sub">
        Cycle {cycleLabel(cycle)} cleared — level {xp.level}, {souls} souls, {gear.length} gear
      </div>
      <div className="victory-sub dim">The dungeon deepens. Your gear and power come with you.</div>
      <div className="menu-buttons">
        <button className="hud-button primary" onClick={descendDeeper}>
          Descend deeper — Cycle {cycleLabel(cycle + 1)}
        </button>
        <button className="hud-button" onClick={quitToMenu}>
          Claim victory
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Level loading overlay — masks enemy spawn lag
// ---------------------------------------------------------------------------

const LoadingOverlay = () => {
  const isLevelLoading = useGameStore((s) => s.isLevelLoading)
  const loadingProgress = useGameStore((s) => s.loadingProgress)
  const currentLevel = useGameStore((s) => s.currentLevel)

  if (!isLevelLoading) return null

  return <LoadingArt label={`Entering ${LEVELS[currentLevel]?.name ?? 'Dungeon'}`} progress={loadingProgress} />
}
