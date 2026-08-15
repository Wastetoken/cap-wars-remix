import { useEffect, useRef } from 'react'
import { useActions } from 'koota/react'
import { enemyActions } from '@/ecs/enemy/actions'
import { eventBus, EVENTS } from '@/constants'
import { LEVELS, FINAL_LEVEL_INDEX } from './levels'
import { useGameStore } from '@/store'
import type { MobType } from '@/game/mobs'

/**
 * Drives level + wave progression:
 * - announces the level, spawns waves in sequence
 * - when all waves die: opens the exit portal (or wins the game on the last level)
 * - portal touch / respawn / restart handled via events + store
 *
 * LEVEL LOADING:
 * To eliminate visible lag when entering a new level, a loading overlay is shown
 * while the first wave's enemies are spawned. Spawning is staggered at 280ms
 * intervals (up from 120ms) to keep frame time smooth. The overlay hides once
 * the full wave is out + a 600ms buffer.
 */
export const useLevelManager = () => {
  const { spawnMob, destroyAllEnemies } = useActions(enemyActions)
  const currentLevel = useGameStore((s) => s.currentLevel)
  const runId = useGameStore((s) => s.runId)
  const setWave = useGameStore((s) => s.setWave)

  const waveIndex = useRef(0)
  const enemiesRemaining = useRef(0)
  const waveActive = useRef(false)
  const waveTimeout = useRef<number | null>(null)
  const spawnTimers = useRef<number[]>([])
  const loadingTimer = useRef<number | null>(null)

  // ---------------------------------------------------------------------------
  // Level start / restart
  // ---------------------------------------------------------------------------
  useEffect(() => {
    waveIndex.current = 0
    waveActive.current = false
    destroyAllEnemies()

    // Only run while actually playing — the main menu / quit-to-menu
    // just clears the arena and waits.
    if (useGameStore.getState().gamePhase !== 'playing') return

    const cfg = LEVELS[currentLevel]
    eventBus.emit(EVENTS.LEVEL_START, currentLevel)

    // Show loading screen immediately — this masks the spawn hitch.
    useGameStore.getState().setLevelLoading(true)

    const startWave = (index: number) => {
      const composition = cfg.waves[index]
      const queue: MobType[] = []
      for (const [mob, count] of Object.entries(composition)) {
        for (let i = 0; i < (count ?? 0); i++) queue.push(mob as MobType)
      }
      const total = queue.length
      waveIndex.current = index
      enemiesRemaining.current = total
      waveActive.current = true
      useGameStore.getState().setWave(index)
      eventBus.emit(EVENTS.WAVE_START, { wave: index + 1 })
      eventBus.emit(EVENTS.ANNOUNCE, `Wave ${index + 1} / ${cfg.waves.length}`)

      // Stagger spawns ~280ms apart on a ring around the arena. Cloning a
      // skinned KayKit model per mob is expensive, so spawning a whole wave
      // in one frame caused a hitch at every wave start. If the game freezes
      // (pause / menu / death) mid-wave, the queue waits and resumes.
      let slot = 0
      const spawnNext = () => {
        if (slot >= total) {
          // Last mob spawned — schedule loading screen dismissal after a buffer
          // so the user doesn't see enemies popping in.
          loadingTimer.current = window.setTimeout(() => {
            useGameStore.getState().setLevelLoading(false)
            eventBus.emit(EVENTS.ANNOUNCE, cfg.name, cfg.subtitle)
          }, 600)
          return
        }
        // Pause spawning only for actual gameplay freezes (not loading —
        // loading is when spawning MUST happen). Otherwise we'd deadlock:
        // isLevelLoading=true → isGameFrozen=true → spawn waits forever.
        const s = useGameStore.getState()
        if (s.gamePhase !== 'playing' || s.skillTreeOpen || s.settingsOpen || s.playerDead || s.gameWon) {
          spawnTimers.current.push(window.setTimeout(spawnNext, 250))
          return
        }
        const angle = (slot / total) * Math.PI * 2 + Math.random() * 0.4
        spawnMob({
          mob: queue[slot],
          position: { x: Math.cos(angle) * 8, y: 0, z: Math.sin(angle) * 8 },
        })
        slot++
        if (slot < total) {
          spawnTimers.current.push(window.setTimeout(spawnNext, 280))
        } else {
          // Wave fully queued — dismiss loading after buffer
          loadingTimer.current = window.setTimeout(() => {
            useGameStore.getState().setLevelLoading(false)
            eventBus.emit(EVENTS.ANNOUNCE, cfg.name, cfg.subtitle)
          }, 600)
        }
      }
      spawnNext()
    }

    const firstWave = window.setTimeout(() => startWave(0), 400)

    // Enemy death -> advance waves -> level cleared
    const onEnemyDead = () => {
      if (!waveActive.current) return
      enemiesRemaining.current--
      if (enemiesRemaining.current > 0) return

      waveActive.current = false
      const next = waveIndex.current + 1

      if (next < cfg.waves.length) {
        eventBus.emit(EVENTS.WAVE_COMPLETE, { wave: next })
        waveTimeout.current = window.setTimeout(() => startWave(next), cfg.delayBetweenWavesMs)
        return
      }

      // All waves cleared
      if (currentLevel >= FINAL_LEVEL_INDEX) {
        useGameStore.getState().setGameWon(true)
        eventBus.emit(EVENTS.GAME_WON)
      } else {
        useGameStore.getState().setPortalActive(true)
        eventBus.emit(EVENTS.LEVEL_CLEARED, currentLevel)
        eventBus.emit(EVENTS.ANNOUNCE, 'Level cleared', 'Enter the portal')
      }
    }

    eventBus.on(EVENTS.ENEMY_DEAD, onEnemyDead)

    // Bosses summon adds in phase 3 — they count toward the wave so
    // the level can't end while they're alive. The add type rides in
    // the event payload (assassins for the King, class mobs for the rest).
    const onBossSummon = (pos: { x: number; z: number; add?: MobType }) => {
      if (!waveActive.current) return
      for (let i = 0; i < 2; i++) {
        enemiesRemaining.current++
        const angle = Math.random() * Math.PI * 2
        spawnMob({
          mob: pos.add ?? 'assassin',
          position: { x: pos.x + Math.cos(angle) * 2, y: 0, z: pos.z + Math.sin(angle) * 2 },
        })
      }
    }
    eventBus.on(EVENTS.BOSS_SUMMON, onBossSummon)

    return () => {
      window.clearTimeout(firstWave)
      if (waveTimeout.current) window.clearTimeout(waveTimeout.current)
      if (loadingTimer.current) window.clearTimeout(loadingTimer.current)
      for (const t of spawnTimers.current) window.clearTimeout(t)
      spawnTimers.current = []
      eventBus.off(EVENTS.ENEMY_DEAD, onEnemyDead)
      eventBus.off(EVENTS.BOSS_SUMMON, onBossSummon)
      useGameStore.getState().setLevelLoading(false)
    }
  }, [currentLevel, runId, spawnMob, destroyAllEnemies, setWave])

  // ---------------------------------------------------------------------------
  // Portal exit -> next level
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const onExit = () => {
      const s = useGameStore.getState()
      if (!s.portalActive) return
      // Show loading immediately so the next level's spawn hitch is masked
      s.setLevelLoading(true)
      s.setLevel(s.currentLevel + 1)
    }
    eventBus.on(EVENTS.LEVEL_EXIT, onExit)
    return () => {
      eventBus.off(EVENTS.LEVEL_EXIT, onExit)
    }
  }, [])
}
