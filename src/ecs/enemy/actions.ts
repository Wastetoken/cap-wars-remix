import { createActions } from 'koota'
import {
  IsEnemy,
  IsMeleeEnemy,
  IsRangeEnemy,
  Position,
  Velocity,
  TargetVelocity,
  Rotation,
  Scale,
  Health,
  Speed,
  Color,
  MeshRef,
  isSpawned,
  ShootTimer,
  StunState,
  BossBrain,
  MobType as MobTrait,
} from './traits'
import { eventBus, EVENTS } from '@/constants'
import { MOBS, BOSS_MOBS, type MobType } from '@/game/mobs'
import type { WaveSpawn } from '@/game/levels'
import { cycleHealthMult, cycleSpeedMult, cycleSoulsMult, levelHealthMult, levelSoulsMult } from '@/game/cycle'
import { comboSoulsMult } from '@/game/combo'
import { useGameStore } from '@/store'

export type EnemyType = 'melee' | 'range'

export type SpawnEnemyOptions = {
  mob?: MobType
  position?: { x: number; y: number; z: number }
  health?: number
}

/**
 * ACTIONS - Factory functions for creating/destroying enemies
 *
 * Actions are bound to the world and provide a clean API
 * for spawning and managing entities.
 */

export const enemyActions = createActions((world) => {
  /**
   * Spawn a mob with stats from the mob definition
   */
  const spawnMob = (options: SpawnEnemyOptions = {}) => {
    const { mob = 'mage', position = { x: 0, y: 0, z: 0 }, health } = options
    const def = MOBS[mob]

    // Endless cycles + player-level scaling: deeper descents hit harder and
    // move faster, and mobs keep pace with your level
    const s = useGameStore.getState()
    const scaledHealth = Math.round((health ?? def.health) * cycleHealthMult(s.cycle) * levelHealthMult(s.playerLevel))
    const scaledSpeed = def.speed * cycleSpeedMult(s.cycle)

    const entity = world.spawn(
      IsEnemy,
      def.ranged ? IsRangeEnemy : IsMeleeEnemy,
      MobTrait({ value: mob }),
      Position(position),
      Velocity({ x: 0, y: 0, z: 0 }),
      TargetVelocity({ x: 0, y: 0, z: 0 }),
      Rotation({ x: 0, y: 0, z: 0 }),
      Scale({ x: 1, y: 1, z: 1 }),
      Health({ current: scaledHealth, max: scaledHealth }),
      Speed({ value: scaledSpeed }),
      StunState({ duration: 0 }),
      isSpawned({ value: false }),
      Color({ r: 1, g: 0.2, b: 0.2 }),
      ShootTimer({
        lastShot: 0,
        nextShot: def.attackCooldownMs * (0.8 + Math.random() * 0.6),
        bornAt: Date.now(),
      }),
      MeshRef,
      // Bosses get their own state machine — immune to stun/knockback
      ...(BOSS_MOBS.has(mob) ? [BossBrain] : [])
    )

    eventBus.emit(EVENTS.ENEMY_SPAWN, entity.id())
    return entity
  }

  return {
  spawnMob,

  /**
   * Spawn a wave from a composition: { rogue: 2, mage: 1, ... }
   * Mobs are placed on a ring around the arena center.
   */
  spawnWave: (composition: WaveSpawn, radius: number = 7) => {
    const entities = []
    const entries = Object.entries(composition) as [MobType, number][]
    const total = entries.reduce((sum, [, count]) => sum + count, 0)

    let slot = 0
    for (const [mob, count] of entries) {
      for (let i = 0; i < count; i++) {
        const angle = (slot / total) * Math.PI * 2 + Math.random() * 0.4
        entities.push(
          spawnMob({
            mob,
            position: {
              x: Math.cos(angle) * radius,
              y: 0,
              z: Math.sin(angle) * radius,
            },
          })
        )
        slot++
      }
    }
    return entities
  },

  /**
   * Destroy a specific enemy
   */
  destroyEnemy: (entity: ReturnType<typeof world.spawn>) => {
    if (entity.has(IsEnemy)) {
      entity.destroy()
    }
  },

  /**
   * Destroy all enemies
   */
  destroyAllEnemies: () => {
    world.query(IsEnemy).forEach((entity) => {
      entity.destroy()
    })
  },

  /**
   * Count living enemies
   */
  countEnemies: () => {
    let count = 0
    world.query(IsEnemy).forEach(() => count++)
    return count
  },

  /**
   * Damage an enemy, destroy if health <= 0
   */
  damageEnemy: (entity: ReturnType<typeof world.spawn>, amount: number) => {
    if (!entity.has(Health)) return

    const health = entity.get(Health)!
    const newHealth = Math.max(0, health.current - amount)

    entity.set(Health, { current: newHealth, max: health.max })
    const meshRef = entity.get(MeshRef)

    if (newHealth <= 0) {
      const mob = entity.has(MobTrait) ? entity.get(MobTrait)!.value : 'mage'
      const baseSouls = MOBS[mob as MobType]?.souls ?? 1
      const s = useGameStore.getState()
      // Combo pays out in souls — keep the streak alive for more XP
      const souls = Math.round(baseSouls * cycleSoulsMult(s.cycle) * levelSoulsMult(s.playerLevel) * comboSoulsMult(s.combo))
      const position = meshRef?.current?.position
      entity.destroy()
      // baseSouls rides along so loot tiers don't drift with cycle scaling
      eventBus.emit(EVENTS.ENEMY_DEAD, position, souls, baseSouls)
    }
  },
  }
})
