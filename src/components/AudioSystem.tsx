import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store'
import { eventBus, EVENTS } from '@/constants'
import { LEVELS } from '@/game/levels'
import { isBossMob } from '@/game/mobs'
import {
  playTrack,
  stopTrack,
  pauseTrack,
  resumeTrack,
  playSting,
  setMusicVolume,
  setSfxVolume,
  startLoop,
  stopLoop,
  LEVEL_TRACKS,
  sfx,
} from '@/game/audio'

// ============================================================================
// AudioSystem — subscribes to game events and plays the sound pack.
// Music follows game state: each level has its own soundtrack track, the
// portal transition crossfades into the next one, and the Laugh sting stacks
// on top when entering a boss level. SFX map to combat and boss choreography
// events. Mounted once in App.
// ============================================================================

const isBossLevel = (index: number) =>
  (LEVELS[index]?.waves ?? []).some((w) => Object.keys(w).some(isBossMob))

const desiredTrack = (s: {
  gamePhase: string
  currentLevel: number
  gameWon: boolean
}) => {
  if (s.gameWon) return null
  if (s.gamePhase === 'menu') return 'menu' as const
  if (s.gamePhase === 'playing') return LEVEL_TRACKS[s.currentLevel] ?? 'rift'
  return undefined // paused — leave whatever is playing alone
}

export const AudioSystem = () => {
  const gamePhase = useGameStore((s) => s.gamePhase)
  const currentLevel = useGameStore((s) => s.currentLevel)
  const gameWon = useGameStore((s) => s.gameWon)
  const skillTreeOpen = useGameStore((s) => s.skillTreeOpen)
  const loadoutOpen = useGameStore((s) => s.loadoutOpen)
  const settingsOpen = useGameStore((s) => s.settingsOpen)
  const musicVolume = useGameStore((s) => s.settings.musicVolume)
  const sfxVolume = useGameStore((s) => s.settings.sfxVolume)

  // -------------------------------------------------------------------------
  // Music by game state — crossfade happens inside playTrack
  // -------------------------------------------------------------------------
  useEffect(() => {
    const key = desiredTrack({ gamePhase, currentLevel, gameWon })
    if (key === undefined) return
    if (key === null) stopTrack()
    else playTrack(key)
  }, [gamePhase, currentLevel, gameWon])

  // Boss entry sting — Laugh stacks on top of the level track
  const prevLevelRef = useRef(currentLevel)
  useEffect(() => {
    const prev = prevLevelRef.current
    prevLevelRef.current = currentLevel
    if (gamePhase === 'playing' && currentLevel !== prev && isBossLevel(currentLevel)) {
      playSting('laugh')
    }
  }, [currentLevel, gamePhase])

  // No music while loadout / talent tree / settings overlays are open
  const overlayOpen = skillTreeOpen || loadoutOpen || settingsOpen
  useEffect(() => {
    if (overlayOpen) pauseTrack()
    else resumeTrack()
  }, [overlayOpen])

  // Live volume sync from the settings menu
  useEffect(() => setMusicVolume(musicVolume), [musicVolume])
  useEffect(() => setSfxVolume(sfxVolume), [sfxVolume])

  // Browser autoplay unlock — retry the desired track on every gesture until
  // it's actually playing (playTrack no-ops once the track is running)
  useEffect(() => {
    const unlock = () => {
      const key = desiredTrack(useGameStore.getState())
      if (key) playTrack(key)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Character select impact + player damage grunt
  useEffect(
    () =>
      useGameStore.subscribe((s, prev) => {
        if (s.selectedCharacter !== prev.selectedCharacter) {
          sfx('MUSIC-Character-Selected-Impact', { volume: 0.7, vary: 0 })
        }
        if (s.damageFlash !== prev.damageFlash && s.gamePhase === 'playing') {
          sfx('PLAYER-Hit-Grunt', { volume: 0.8 })
        }
      }),
    []
  )

  // Low-HP heartbeat loop — under 25% health while alive in a run
  const playerHealth = useGameStore((s) => s.playerHealth)
  const playerMaxHealth = useGameStore((s) => s.playerMaxHealth)
  const playerDead = useGameStore((s) => s.playerDead)
  useEffect(() => {
    const low =
      gamePhase === 'playing' && !playerDead && playerHealth / playerMaxHealth < 0.25
    if (low) startLoop('heartbeat', 0.55)
    else stopLoop('heartbeat')
    // Safety: never let the charge loop outlive the run or the player
    if (gamePhase !== 'playing' || playerDead) stopLoop('charge-sharpen')
  }, [gamePhase, playerHealth, playerMaxHealth, playerDead])

  // UI click blips on menu buttons (hero nameplates excluded — they have
  // their own selection impact)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.hud-button, .settings-option')) {
        sfx('ui-click', { volume: 0.25, vary: 0.03 })
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // -------------------------------------------------------------------------
  // Combat + boss SFX
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onShoot = () => sfx('MAGIC-Frostbolt', { volume: 0.3, rate: 1.1 })
    const onLevelUp = () => sfx('MUSIC-Character-Selected-Impact', { volume: 0.6, vary: 0 })
    const onEnemyDead = (_pos: unknown, souls: number) => {
      if ((souls ?? 0) >= 60) sfx('BOSS-Death', { volume: 1, vary: 0 })
      else sfx('enemy-die', { volume: 0.3 })
    }
    // Hit feedback — melee rotates through the three sword clashes
    let clashIdx = 0
    const onEnemyHit = (kind: string) => {
      if (kind === 'bolt') {
        sfx('bolt-hit-armor', { volume: 0.45 })
      } else {
        clashIdx = (clashIdx + 1) % 3
        sfx(`sword-clash-${clashIdx + 1}`, { volume: 0.5 })
      }
    }
    const onEnemyShoot = () => sfx('enemy-shoot', { volume: 0.25 })
    const onEnemyAttack = () => sfx('swing', { volume: 0.25, rate: 0.8 })
    const onPlayerDied = () => {
      playSting('death-evil')
      sfx('player-die-grunt', { volume: 0.9, vary: 0 })
      sfx('body-fall', { volume: 0.6, vary: 0 })
    }
    const onWaveStart = () => {
      sfx('wave-start', { volume: 0.4, vary: 0 })
      const s = useGameStore.getState()
      if (isBossLevel(s.currentLevel)) sfx('BOSS-Frustrated', { volume: 0.55 })
    }
    const onWaveComplete = () => sfx('wave-complete', { volume: 0.45, vary: 0 })
    const onLevelCleared = () => sfx('portal-open', { volume: 0.55 })
    const onLevelExit = () => {
      // Rift pull: vacuum whoosh up front, deep thunder rumble underneath
      sfx('portal-enter', { volume: 0.55, vary: 0 })
      sfx('portal-rumble', { volume: 0.35, vary: 0 })
    }
    const onGameWon = () => sfx('victory-bell', { volume: 0.5, vary: 0 })
    const onMeteorTelegraph = () => sfx('meteor-fuse', { volume: 0.45, vary: 0 })
    const onItemPickup = () => sfx('item-pickup', { volume: 0.7 })
    const onParryBlock = () => {
      // Metallic ring for a successful block — distinct from the brace
      sfx('parry', { volume: 0.7, rate: 0.9, vary: 0 })
    }
    const onTalentBuy = (success: boolean) => {
      if (success) sfx('talent-buy', { volume: 0.55, vary: 0 })
      else sfx('talent-fail', { volume: 0.4, vary: 0 })
    }

    // Class mobility + ability casts
    const onMobility = (payload: { kind?: string }) => {
      if (payload?.kind === 'dash') sfx('MOVEMENT-Jump', { volume: 0.45, rate: 1.3 })
      if (payload?.kind === 'leap') sfx('MOVEMENT-Jump', { volume: 0.9 })
    }
    const onCast = (kind: string) => {
      switch (kind) {
        case 'swing':
          sfx('swing', { volume: 0.4 })
          break
        case 'spin':
          sfx('spin', { volume: 0.5 })
          break
        case 'parry':
          sfx('parry', { volume: 0.35, rate: 1.3 })
          break
        case 'blink-out':
          sfx('blink-out', { volume: 0.5 })
          break
        case 'charge-start':
          startLoop('charge-sharpen', 0.4)
          break
        case 'charge-stop':
          stopLoop('charge-sharpen')
          break
        case 'charge-ready':
          sfx('charge-ready', { volume: 0.5, vary: 0 })
          break
        case 'blink-in':
          sfx('Lightning-Strike-1', { volume: 0.5, rate: 1.2 })
          break
        case 'leap-land':
          sfx('Explosion-1', { volume: 0.7 })
          break
        case 'shadowstep':
          sfx('ARROW-Shadow-Volley', { volume: 0.6 })
          break
        case 'whirlwind':
          sfx('Explosion-3', { volume: 0.45, rate: 1.25 })
          break
        case 'fury':
          sfx('Incoming-Swell-1', { volume: 0.7 })
          break
        case 'nova':
          sfx('MAGIC-Firefrost', { volume: 0.8 })
          break
        case 'slam-land':
          sfx('Lightning-Strike-2', { volume: 0.7 })
          break
        case 'meteor-land':
          sfx('MAGIC-Fireball', { volume: 0.6 })
          sfx('Explosion-2', { volume: 0.85 })
          break
        case 'dagger-rain':
          sfx('ARROW-Fire', { volume: 0.7 })
          break
      }
    }

    // Boss choreography
    const onBossAnim = (_id: number, clip: string) => {
      if (clip === 'Cheer') sfx('BOSS-Phase-Change-Horn-Alert', { volume: 0.9, vary: 0 })
      if (clip === 'Throw') sfx('ARROW-Nuke', { volume: 0.7 })
    }
    const onTelegraph = () => sfx('BOSS-Incoming-Spikes-Earth-Rumble', { volume: 0.8, vary: 0 })
    const onSlamLand = () => sfx('BOSS-Meteor-Hit-Rumble', { volume: 0.9, vary: 0 })
    const onRing = () => sfx('Incoming-Swell-1', { volume: 0.55 })
    const onSummon = () => sfx('BOSS-Shadow-Portal', { volume: 0.8, vary: 0 })

    eventBus.on(EVENTS.PLAYER_SHOOT, onShoot)
    eventBus.on(EVENTS.LEVEL_UP, onLevelUp)
    eventBus.on(EVENTS.ENEMY_DEAD, onEnemyDead)
    eventBus.on(EVENTS.ENEMY_HIT, onEnemyHit)
    eventBus.on(EVENTS.SHOOT, onEnemyShoot)
    eventBus.on(EVENTS.ENEMY_ATTACK, onEnemyAttack)
    eventBus.on(EVENTS.PLAYER_DIED, onPlayerDied)
    eventBus.on(EVENTS.WAVE_START, onWaveStart)
    eventBus.on(EVENTS.WAVE_COMPLETE, onWaveComplete)
    eventBus.on(EVENTS.LEVEL_CLEARED, onLevelCleared)
    eventBus.on(EVENTS.LEVEL_EXIT, onLevelExit)
    eventBus.on(EVENTS.GAME_WON, onGameWon)
    eventBus.on(EVENTS.METEOR_TELEGRAPH, onMeteorTelegraph)
    eventBus.on(EVENTS.ITEM_PICKUP, onItemPickup)
    eventBus.on(EVENTS.PARRY_BLOCK, onParryBlock)
    eventBus.on(EVENTS.TALENT_BUY, onTalentBuy)
    eventBus.on(EVENTS.MOBILITY_CAST, onMobility)
    eventBus.on(EVENTS.ABILITY_CAST, onCast)
    eventBus.on(EVENTS.BOSS_ANIM, onBossAnim)
    eventBus.on(EVENTS.BOSS_TELEGRAPH, onTelegraph)
    eventBus.on(EVENTS.BOSS_SLAM_LAND, onSlamLand)
    eventBus.on(EVENTS.BOSS_RING, onRing)
    eventBus.on(EVENTS.BOSS_SUMMON, onSummon)
    return () => {
      eventBus.off(EVENTS.PLAYER_SHOOT, onShoot)
      eventBus.off(EVENTS.LEVEL_UP, onLevelUp)
      eventBus.off(EVENTS.ENEMY_DEAD, onEnemyDead)
      eventBus.off(EVENTS.ENEMY_HIT, onEnemyHit)
      eventBus.off(EVENTS.SHOOT, onEnemyShoot)
      eventBus.off(EVENTS.ENEMY_ATTACK, onEnemyAttack)
      eventBus.off(EVENTS.PLAYER_DIED, onPlayerDied)
      eventBus.off(EVENTS.WAVE_START, onWaveStart)
      eventBus.off(EVENTS.WAVE_COMPLETE, onWaveComplete)
      eventBus.off(EVENTS.LEVEL_CLEARED, onLevelCleared)
      eventBus.off(EVENTS.LEVEL_EXIT, onLevelExit)
      eventBus.off(EVENTS.GAME_WON, onGameWon)
      eventBus.off(EVENTS.METEOR_TELEGRAPH, onMeteorTelegraph)
      eventBus.off(EVENTS.ITEM_PICKUP, onItemPickup)
      eventBus.off(EVENTS.PARRY_BLOCK, onParryBlock)
      eventBus.off(EVENTS.TALENT_BUY, onTalentBuy)
      eventBus.off(EVENTS.MOBILITY_CAST, onMobility)
      eventBus.off(EVENTS.ABILITY_CAST, onCast)
      eventBus.off(EVENTS.BOSS_ANIM, onBossAnim)
      eventBus.off(EVENTS.BOSS_TELEGRAPH, onTelegraph)
      eventBus.off(EVENTS.BOSS_SLAM_LAND, onSlamLand)
      eventBus.off(EVENTS.BOSS_RING, onRing)
      eventBus.off(EVENTS.BOSS_SUMMON, onSummon)
    }
  }, [])

  return null
}
