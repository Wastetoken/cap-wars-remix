import type { World } from 'koota'

import {
  IsEnemy,
  Position,
  Velocity,
  Speed,
  MeshRef,
  Rotation,
  TargetVelocity,
  IsRangeEnemy,
  IsMeleeEnemy,
  ShootTimer,
  StunState,
  MobType as MobTrait,
  BossBrain,
} from './traits'
import { bossBrainSystem } from './bossBrain'
import { damp } from 'three/src/math/MathUtils.js'
import { eventBus, EVENTS } from '@/constants'
import { useGameStore, isGameFrozen } from '@/store'
import { checkCircleCollision, Layer } from '@/collision'
import { ARENA_BOUND } from '@/constants'
import { MOBS, type MobType } from '@/game/mobs'
import { getIcePatches, ICE_PATCH_RADIUS, ICE_SLOW_AMOUNT } from '@/components/iceFloor'
/** Damping factor for velocity smoothing (higher = snappier, lower = smoother).
 *  At 6, a mob moving at full speed coasts ~speed/6 units after stopping —
 *  short enough that melee mobs don't slide into the player. */
const VELOCITY_SMOOTHING = 6

/** Melee mobs hold this far outside their max reach before swinging —
 *  leaves room for the damped coast so they stop at ~weapon range. */
const ATTACK_HOLDOFF = 0.3

/**
 * SYSTEMS - Update logic that runs each frame
 *
 * Systems query for entities with specific traits and update them.
 * Call these in useFrame() or a game loop.
 */

/**
 * Updates enemy positions based on velocity
 */
export function movementSystem(world: World, delta: number) {
  const patches = getIcePatches()
  world.query(IsEnemy, Position, Velocity, Speed).updateEach(([pos, vel, speed]) => {
    let speedMult = 1
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i]
      const dx = pos.x - patch.x
      const dz = pos.z - patch.z
      if (dx * dx + dz * dz < ICE_PATCH_RADIUS * ICE_PATCH_RADIUS) {
        speedMult = ICE_SLOW_AMOUNT
        break
      }
    }
    pos.x += vel.x * speed.value * speedMult * delta
    pos.y += vel.y * speed.value * speedMult * delta
    pos.z += vel.z * speed.value * speedMult * delta
  })
}

/**
 * Syncs ECS Position/Rotation/Scale to THREE.js mesh refs
 * Call this after movement systems to update visuals
 */
export function syncMeshSystem(world: World) {
  world.query(IsEnemy, Position, Rotation, MeshRef).forEach((entity) => {
    const pos = entity.get(Position)!
    const rot = entity.get(Rotation)!
    const meshRef = entity.get(MeshRef)!

    if (meshRef.current) {
      meshRef.current.position.set(pos.x, pos.y, pos.z)
      meshRef.current.rotation.set(rot.x, rot.y, rot.z)
    }
  })
}

/**
 * Melee behavior — chase the player, hold at weapon range, swing on cooldown.
 * The actual swing (animation + damage) is emitted as ENEMY_ATTACK and
 * handled by the EnemyMesh component.
 */
export function meleeBehaviorSystem(world: World) {
  const playerPosition = useGameStore.getState().playerPosition
  const now = Date.now()

  world
    .query(IsMeleeEnemy, Position, TargetVelocity, Rotation, ShootTimer, StunState, MobTrait)
    .forEach((entity) => {
      const pos = entity.get(Position)!
      const stunState = entity.get(StunState)!
      const shootTimer = entity.get(ShootTimer)!
      const mob = entity.get(MobTrait)!.value as MobType
      const def = MOBS[mob]

      // Don't move or attack if stunned
      if (stunState.duration > 0) {
        entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
        return
      }

      // The boss runs his own state machine (bossBrainSystem)
      if (entity.has(BossBrain)) return

      const dx = playerPosition.x - pos.x
      const dz = playerPosition.z - pos.z
      const distanceToPlayer = Math.sqrt(dx * dx + dz * dz)

      // Face the player
      if (distanceToPlayer > 0.1) {
        const rot = entity.get(Rotation)!
        entity.set(Rotation, { x: rot.x, y: Math.atan2(dx, dz), z: rot.z })
      }

      const holdDistance = Math.max(def.attackRange - ATTACK_HOLDOFF, 0.5)

      if (distanceToPlayer > holdDistance) {
        // Chase
        const dirX = dx / distanceToPlayer
        const dirZ = dz / distanceToPlayer
        entity.set(TargetVelocity, { x: dirX, y: 0, z: dirZ })
      } else {
        // In range — hold and swing on cooldown
        entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })

        if (now - shootTimer.lastShot >= shootTimer.nextShot) {
          eventBus.emit(EVENTS.ENEMY_ATTACK, entity.id())
          entity.set(ShootTimer, {
            lastShot: now,
            nextShot: def.attackCooldownMs * (0.85 + Math.random() * 0.5),
          })
        }
      }
    })
}

/**
 * Smoothly interpolates velocity toward target velocity using damp
 */
export function velocityDampingSystem(world: World, delta: number) {
  world.query(IsEnemy, Velocity, TargetVelocity).updateEach(([vel, targetVel]) => {
    vel.x = damp(vel.x, targetVel.x, VELOCITY_SMOOTHING, delta)
    vel.y = damp(vel.y, targetVel.y, VELOCITY_SMOOTHING, delta)
    vel.z = damp(vel.z, targetVel.z, VELOCITY_SMOOTHING, delta)
  })
}

/**
 * Bounds checking - keep enemies within the arena
 */
export function boundsSystem(world: World, bounds: number = 10) {
  world.query(IsEnemy, Position, Velocity).updateEach(([pos, vel]) => {
    // Bounce off bounds
    if (Math.abs(pos.x) > bounds) {
      vel.x *= -1
      pos.x = Math.sign(pos.x) * bounds
    }
    if (Math.abs(pos.z) > bounds) {
      vel.z *= -1
      pos.z = Math.sign(pos.z) * bounds
    }
  })
}

/**
 * Range enemy behavior - look at player, move away, and shoot periodically
 */
export function rangeEnemyBehaviorSystem(world: World) {
  const playerPosition = useGameStore.getState().playerPosition
  const now = Date.now()

  world
    .query(IsRangeEnemy, Position, TargetVelocity, Rotation, ShootTimer, StunState, MobTrait)
    .forEach((entity) => {
      const pos = entity.get(Position)!
      const rot = entity.get(Rotation)!
      const shootTimer = entity.get(ShootTimer)!
      const stunState = entity.get(StunState)!
      const mob = entity.get(MobTrait)!.value as MobType
      const def = MOBS[mob]

      // Don't move or shoot if stunned
      if (stunState.duration > 0) {
        entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
        return
      }

      // Bosses run their own state machine (bossBrainSystem)
      if (entity.has(BossBrain)) return

      // Calculate vector from enemy to player
      const dx = playerPosition.x - pos.x
      const dz = playerPosition.z - pos.z
      const distanceToPlayer = Math.sqrt(dx * dx + dz * dz)

      // Look at player (rotate to face player)
      if (distanceToPlayer > 0.1) {
        const angleToPlayer = Math.atan2(dx, dz)
        entity.set(Rotation, { x: rot.x, y: angleToPlayer, z: rot.z })
      }

      // Circle/strafe around player behavior
      const idealDistance = 8 // Ideal distance to maintain from player
      const strafeSpeed = 1.2 // Speed when circling
      const approachSpeed = 0.8 // Speed when adjusting distance

      if (distanceToPlayer > 0.1) {
        // Normalize direction to player
        const dirX = dx / distanceToPlayer
        const dirZ = dz / distanceToPlayer

        // Calculate perpendicular direction for strafing (tangent)
        const tangentX = -dirZ
        const tangentZ = dirX

        // Distance error (positive = too far, negative = too close)
        const distanceError = distanceToPlayer - idealDistance

        // Move towards/away from player to maintain ideal distance
        const radialVelX = dirX * distanceError * approachSpeed
        const radialVelZ = dirZ * distanceError * approachSpeed

        // Circle around player
        const tangentVelX = tangentX * strafeSpeed
        const tangentVelZ = tangentZ * strafeSpeed

        // Combine radial and tangent velocities
        entity.set(TargetVelocity, {
          x: radialVelX + tangentVelX,
          y: 0,
          z: radialVelZ + tangentVelZ,
        })
      } else {
        entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
      }

      // Shoot periodically
      if (now - shootTimer.lastShot >= shootTimer.nextShot) {
        // Trigger shoot event for this enemy
        eventBus.emit(EVENTS.ENEMY_ATTACK, entity.id())

        // Update timer with new random offset using entity.set()
        entity.set(ShootTimer, {
          lastShot: now,
          nextShot: def.attackCooldownMs * (0.8 + Math.random() * 0.7),
        })
      }
    })
}

/**
 * Stun decay system - reduces stun duration over time
 */
export function stunDecaySystem(world: World, delta: number) {
  world.query(IsEnemy, StunState).forEach((entity) => {
    const stunState = entity.get(StunState)!
    if (stunState.duration > 0) {
      entity.set(StunState, { duration: Math.max(0, stunState.duration - delta) })
    }
  })
}

/**
 * Enemy collision resolution - prevents enemies from overlapping
 */
const ENEMY_COLLISION_RADIUS = 0.5

export function enemyCollisionSystem(world: World) {
  world.query(IsEnemy, Position).forEach((entity) => {
    const pos = entity.get(Position)!
    const colliderId = `enemy-${entity.id()}`

    // Check collision with other enemies
    const collision = checkCircleCollision(
      pos.x,
      pos.z,
      ENEMY_COLLISION_RADIUS,
      colliderId,
      Layer.ENEMY
    )

    // Apply collision pushback if overlapping
    if (collision.hit) {
      entity.set(Position, {
        x: pos.x + collision.pushX,
        y: pos.y,
        z: pos.z + collision.pushZ,
      })
    }
  })
}

/** AI freezes while menus are open, the player is dead, or the game is over */
const isPaused = () => isGameFrozen(useGameStore.getState())

/**
 * Combined enemy update system - run all enemy systems in order
 */
export function updateEnemySystems(world: World, delta: number) {
  if (isPaused()) return

  stunDecaySystem(world, delta)
  meleeBehaviorSystem(world)
  rangeEnemyBehaviorSystem(world)
  bossBrainSystem(world, delta)
  velocityDampingSystem(world, delta)
  movementSystem(world, delta)
  enemyCollisionSystem(world)
  boundsSystem(world, ARENA_BOUND)
  syncMeshSystem(world)
}
