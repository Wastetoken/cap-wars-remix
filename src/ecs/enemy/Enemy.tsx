import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useQuery, useWorld, useTrait } from 'koota/react'
import * as THREE from 'three/webgpu'
import gsap from 'gsap'
import type { Entity } from 'koota'
import { useGLTF } from '@react-three/drei'
import { acquireClone, releaseClone, prewarmPool } from './meshPool'

import {
  IsEnemy,
  Position,
  Scale,
  MeshRef,
  Health,
  Velocity,
  StunState,
  BossBrain,
  MobType as MobTrait,
} from './traits'
import { updateEnemySystems } from './systems'
import { Healthbar } from '@/components/hud/healthbar'
import { useCollisionStore, Layer } from '@/collision'
import type { HitPosition } from '@/collision'
import { useVFXEmitter, PARTICLES } from '@/components/particles'
import { useGameStore, isGameFrozen } from '@/store'
import { cycleDamageMult, levelDamageMult } from '@/game/cycle'
import { gearCritChance } from '@/game/gear'
import { damp } from 'three/src/math/MathUtils.js'
import { eventBus, EVENTS } from '@/constants'
import { useLevelManager } from '@/game/useLevelManager'
import { VFXEmitter } from 'r3f-vfx'
import { MOBS, isBossMob, type MobType } from '@/game/mobs'
import { registerRig, unregisterRig, enemyRigId } from '@/replay/rigRegistry'

// ============================================================================
// Enemy renderer — KayKit Adventurers mobs (Mage / Rogue / Barbarian / Knight)
// ============================================================================

const ENEMY_COLLISION_RADIUS = 0.5

// Clip names shared by every KayKit Adventurers character
const CLIP_IDLE = 'Idle'
const CLIP_RUN = 'Running_A'
const CLIP_SHOOT = 'Spellcast_Shoot'
const HIT_CLIPS = ['Hit_A', 'Hit_B']
const RUN_SPEED_THRESHOLD = 0.3

/** Delay between a melee swing starting and the damage landing */
const MELEE_DAMAGE_DELAY_MS = 450

// Tip of the 2H staff in staff-local space (bounds: y -0.9 .. 1.25)
const STAFF_TIP_LOCAL = new THREE.Vector3(0.1, 1.25, 0)

// Bullets travel along -Z of the emitted quaternion (see components/bullets.tsx),
// so flip the enemy facing (+Z) by 180° around Y
const FLIP_Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)

type ModelMap = Record<string, { scene: THREE.Group; animations: THREE.AnimationClip[] }>

// Knockback configuration
type KnockbackConfig = {
  direction: THREE.Vector3
  distance: number
  duration: number
  ease?: string
}

// ============================================
// Individual Enemy Renderer
// ============================================

interface EnemyMeshProps {
  entity: Entity
  models: ModelMap
}

/**
 * Renders a single enemy entity as a KayKit mob.
 * Syncs with ECS traits reactively.
 * Registers with collision system for sword hit detection.
 */
export function EnemyMesh({ entity, models }: EnemyMeshProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const staffTipRef = useRef<THREE.Group>(null!)
  const staffObj = useRef<THREE.Object3D | null>(null)
  const gatherEnergyRef = useRef<{ emit: (overrides?: Record<string, unknown>) => boolean } | null>(
    null
  )
  const damagePlayer = useGameStore((s) => s.damagePlayer)

  // Mob definition from trait
  const mob = (entity.get(MobTrait)?.value ?? 'mage') as MobType
  const def = MOBS[mob]
  const isRange = def.ranged
  const isBoss = isBossMob(mob)

  const model = models[def.model]
  const clone = useMemo(() => acquireClone(mob, model.scene), [mob, model.scene])
  // MANUAL ANIMATION SETUP — same pattern as Caps.tsx. drei v11 alpha's
  // useAnimations binds clips in a layout effect that doesn't re-run when the
  // ref attaches, so actions can silently never be created (T-pose / broken
  // skinning while AI and damage keep running).
  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone])
  const actions = useMemo(() => {
    const acts: Record<string, THREE.AnimationAction> = {}
    for (const clip of model.animations) acts[clip.name] = mixer.clipAction(clip)
    return acts
  }, [mixer, model.animations])

  // Expose this rig to the replay recorder/playback engine
  useEffect(() => {
    registerRig(enemyRigId(entity.id()), { mixer, actions })
    return () => unregisterRig(enemyRigId(entity.id()))
  }, [entity, mixer, actions])

  // Return clone to pool on unmount so it can be reused
  useEffect(() => {
    return () => {
      releaseClone(mob, clone)
    }
  }, [mob, clone])

  // Collision store
  const registerCollider = useCollisionStore((s) => s.registerCollider)
  const unregisterCollider = useCollisionStore((s) => s.unregisterCollider)
  const updateCollider = useCollisionStore((s) => s.updateCollider)

  const { emit } = useVFXEmitter(PARTICLES.IMPACT)
  const { emit: emitFlare } = useVFXEmitter(PARTICLES.IMPACT_FLARE)
  const { emit: emitSpawn } = useVFXEmitter(PARTICLES.SPAWN)

  // Position/Scale are read once, non-reactively: position is driven every
  // frame by syncMeshSystem via MeshRef, and scale never changes after spawn.
  // Subscribing with useTrait re-rendered this entire subtree (mesh, health
  // bar DOM, collider effect) every time a system called entity.set(Position)
  // — with mobs crowding the player that was every enemy, every frame.
  const initialPos = entity.get(Position)
  const initialScale = entity.get(Scale)
  // Health changes only on hits — safe to subscribe for the health bar
  const health = useTrait(entity, Health)

  // Animation state
  const currentAnim = useRef<string>(CLIP_IDLE)
  const busyOneShot = useRef(false)

  // Hit flash - per-instance emissive materials
  const hitValue = useRef(0)
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([])
  // Boss weapon materials — ignited in phase 2/3
  const axeMatsRef = useRef<THREE.MeshStandardMaterial[]>([])

  // Melee attack damage timer
  const meleeDamageTimer = useRef<number | null>(null)

  // Temp objects for staff-tip world transform (avoid GC)
  const tmpTip = useMemo(() => new THREE.Vector3(), [])
  const tmpQuat = useMemo(() => new THREE.Quaternion(), [])
  const tmpParentQuat = useMemo(() => new THREE.Quaternion(), [])

  const playLocomotion = useCallback(
    (name: string) => {
      if (currentAnim.current === name || !actions[name]) return
      actions[currentAnim.current]?.fadeOut(0.2)
      actions[name]?.reset().fadeIn(0.2).play()
      currentAnim.current = name
    },
    [actions]
  )

  const playOneShot = useCallback(
    (name: string, timeScale = 1) => {
      const action = actions[name]
      if (!action) return
      actions[currentAnim.current]?.fadeOut(0.1)
      action.reset().fadeIn(0.1).play()
      action.setLoop(THREE.LoopOnce, 1)
      action.setEffectiveTimeScale(timeScale)
      action.clampWhenFinished = true
      currentAnim.current = name
      busyOneShot.current = true
    },
    [actions]
  )

  // ---------------------------------------------------------------------------
  // Ranged attack (mage)
  // ---------------------------------------------------------------------------

  const isChargingRef = useRef(false)
  const chargeTimeRef = useRef(0)

  const shoot = useCallback(() => {
    if (isChargingRef.current) return
    isChargingRef.current = true
    chargeTimeRef.current = 0
  }, [])

  const completeShot = useCallback(() => {
    if (!staffTipRef.current) return

    const position = staffTipRef.current.getWorldPosition(new THREE.Vector3())
    // Bullets travel -Z of this quaternion -> flip enemy facing by PI
    const quat = groupRef.current.getWorldQuaternion(new THREE.Quaternion()).multiply(FLIP_Y)

    playOneShot(CLIP_SHOOT, 1.2)
    eventBus.emit(EVENTS.SHOOT, position, quat)

    isChargingRef.current = false
    chargeTimeRef.current = 0
  }, [playOneShot])

  // ---------------------------------------------------------------------------
  // Melee attack (rogue / barbarian / knight)
  // ---------------------------------------------------------------------------

  const meleeAttack = useCallback(() => {
    playOneShot(def.attackClip, def.attackClip.includes('2H') ? 1.4 : 1.2)

    // Damage lands mid-swing if the player is still in range
    if (meleeDamageTimer.current) window.clearTimeout(meleeDamageTimer.current)
    meleeDamageTimer.current = window.setTimeout(() => {
      if (!entity.has(Position)) return
      const { playerDead } = useGameStore.getState()
      if (playerDead) return

      const pos = entity.get(Position)!
      const playerPos = useGameStore.getState().playerPosition
      const dist = Math.hypot(playerPos.x - pos.x, playerPos.z - pos.z)

      if (dist <= def.attackRange + 0.6) {
        const state = useGameStore.getState()
        if (state.isParrying) {
          // Blocked — no damage, spark burst + ring handled via PARRY_BLOCK
          eventBus.emit(EVENTS.PARRY_BLOCK, {
            x: playerPos.x,
            y: 1.2,
            z: playerPos.z,
          })
          return
        }
        damagePlayer(Math.round(def.damage * cycleDamageMult(state.cycle) * levelDamageMult(state.playerLevel)))
        eventBus.emit(EVENTS.CAMERA_SHAKE)
      }
    }, MELEE_DAMAGE_DELAY_MS)
  }, [def, entity, playOneShot, damagePlayer])

  // One-time setup: hide attachments per mob, clone materials for hit flash,
  // shadows, locate staff, spawn VFX
  useEffect(() => {
    const showSet = new Set(def.show)
    const mats: THREE.MeshStandardMaterial[] = []

    clone.traverse((obj) => {
      if (def.hide.includes(obj.name)) {
        obj.visible = false
        return
      }
      if (showSet.has(obj.name)) obj.visible = true

      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        const src = mesh.material as THREE.MeshStandardMaterial
        const mat = src.clone()
        mat.emissive = new THREE.Color('#FF7139')
        mat.emissiveIntensity = 0
        mesh.material = mat
        mats.push(mat)
      }
    })
    materialsRef.current = mats

    // Tag the Barbarian King's axe materials so the brain can ignite them
    // per phase (weapon ignite stays barbarian-only)
    axeMatsRef.current = []
    if (mob === 'boss') {
      const axe = clone.getObjectByName('2H_Axe')
      axe?.traverse((obj) => {
        const m = obj as THREE.Mesh
        if (m.isMesh) axeMatsRef.current.push(m.material as THREE.MeshStandardMaterial)
      })
    }

    staffObj.current = isRange ? (clone.getObjectByName('2H_Staff') ?? null) : null
    const spawnPos = groupRef.current?.position
    emitSpawn(spawnPos ? [spawnPos.x, spawnPos.y, spawnPos.z] : undefined, 10)

    return () => {
      if (meleeDamageTimer.current) window.clearTimeout(meleeDamageTimer.current)
      // Release the per-instance hit-flash materials (cloned in traverse above)
      for (const mat of mats) mat.dispose()
    }
  }, [clone, def, isRange, emitSpawn])

  // Idle on mount + return to locomotion when one-shots finish
  useEffect(() => {
    actions[CLIP_IDLE]?.reset().fadeIn(0.1).play()
    currentAnim.current = CLIP_IDLE

    const onFinished = () => {
      busyOneShot.current = false
    }
    mixer.addEventListener('finished', onFinished)
    return () => {
      mixer.removeEventListener('finished', onFinished)
      mixer.stopAllAction()
    }
  }, [actions, mixer])

  // Listen for attack events from the AI systems
  useEffect(() => {
    const handleEnemyAttack = (attackingEntityId: number) => {
      if (attackingEntityId !== entity.id()) return
      if (isRange) shoot()
      else meleeAttack()
    }

    eventBus.on(EVENTS.ENEMY_ATTACK, handleEnemyAttack)
    return () => {
      eventBus.off(EVENTS.ENEMY_ATTACK, handleEnemyAttack)
    }
  }, [entity, isRange, shoot, meleeAttack])

  // Boss special-attack animation requests from bossBrainSystem
  useEffect(() => {
    if (!isBoss) return
    const handleBossAnim = (entityId: number, clip: string, timeScale: number) => {
      if (entityId !== entity.id()) return
      playOneShot(clip, timeScale)
    }
    eventBus.on(EVENTS.BOSS_ANIM, handleBossAnim)
    return () => {
      eventBus.off(EVENTS.BOSS_ANIM, handleBossAnim)
    }
  }, [entity, isBoss, playOneShot])

  // Knockback state
  const isKnockedBack = useRef(false)
  const knockbackTween = useRef<gsap.core.Tween | null>(null)

  // Unique collider ID based on entity
  const colliderId = `enemy-${entity.id()}`

  // Knockback function - pushes enemy in a direction
  const knockback = useCallback(
    (config: KnockbackConfig) => {
      const { direction, distance, duration, ease = 'power2.out' } = config

      if (!entity.has(Position)) return

      // Kill any existing knockback tween
      if (knockbackTween.current) {
        knockbackTween.current.kill()
      }

      isKnockedBack.current = true

      const currentPos = entity.get(Position)!
      const normalizedDir = direction.clone().normalize()

      const targetX = currentPos.x + normalizedDir.x * distance
      const targetZ = currentPos.z + normalizedDir.z * distance

      // Animate position using gsap
      const animTarget = { x: currentPos.x, z: currentPos.z }

      knockbackTween.current = gsap.to(animTarget, {
        x: targetX,
        z: targetZ,
        duration,
        ease,
        onUpdate: () => {
          if (entity.has(Position)) {
            entity.set(Position, {
              x: animTarget.x,
              y: currentPos.y,
              z: animTarget.z,
            })
          }
        },
        onComplete: () => {
          isKnockedBack.current = false
          knockbackTween.current = null
        },
      })
    },
    [entity]
  )

  // Handle hit from player sword / abilities
  const onHit = useCallback(
    (_attackerId: string, damage: number, hitPosition: HitPosition) => {
      const { x, y, z } = hitPosition
      const isBoss = entity.has(BossBrain)

      // The Hexweaver is untouchable mid-blink and the Nightshade while
      // vanished — the hit whiffs entirely (no damage, no flinch)
      const brainState = entity.get(BossBrain)?.state
      if (brainState === 'blink' || brainState === 'vanish') return

      // Calculate actual damage with random variance, then roll crit
      // (chance comes from stacked gear crit%, crits deal double)
      const store = useGameStore.getState()
      const crit = Math.random() < gearCritChance(store.gear)
      const actualDamage = Math.round((damage + Math.floor(Math.random() * 20)) * (crit ? 2 : 1))

      // Apply damage
      const { damageEnemy } = enemyActionsHelper
      damageEnemy(entity, actualDamage)

      // Combo + floating combat text
      store.registerComboHit()
      eventBus.emit(EVENTS.DAMAGE_TEXT, { x, y: y + 0.6, z, amount: actualDamage, crit })

      // Rage + lifesteal for the player
      const { rageGainMultiplier, lifestealFraction } = skillHelpers
      store.addRage(2 * rageGainMultiplier(store.skills))
      const lifesteal = actualDamage * lifestealFraction(store.skills)
      if (lifesteal > 0) store.healPlayer(lifesteal)

      // The King has poise: no stun, no knockback, and he only flinches
      // occasionally — stunlocking him is not a strategy.
      if (!isBoss) {
        entity.set(StunState, { duration: 0.5 })
      }

      // Visual effects
      emit([x, y, z], 30)
      emitFlare([x, y, z], 10)

      // Hit reaction animation + emissive flash on this enemy only
      // (the King only flinches between attacks — never mid-special)
      if (!isBoss || (Math.random() < 0.2 && entity.get(BossBrain)?.state === 'chase')) {
        playOneShot(HIT_CLIPS[Math.floor(Math.random() * HIT_CLIPS.length)], 1.5)
      }
      hitValue.current = 1

      // Trigger camera shake (once per slash, handled in PlayerController)
      eventBus.emit(EVENTS.CAMERA_SHAKE)
      const playerPosition = useGameStore.getState().playerPosition

      if (isBoss) return

      // Calculate knockback direction: from attacker (player) toward enemy
      if (entity.has(Position)) {
        const enemyPos = entity.get(Position)!
        const knockbackDir = new THREE.Vector3(
          enemyPos.x - playerPosition.x,
          0,
          enemyPos.z - playerPosition.z
        )

        // If positions are the same, use a random direction
        if (knockbackDir.length() < 0.001) {
          knockbackDir.set(Math.random() - 0.5, 0, Math.random() - 0.5)
        }

        // Apply knockback - push enemy away from the attacker
        knockback({
          direction: knockbackDir,
          distance: 1.5,
          duration: 0.2,
          ease: 'power2.out',
        })
      }
    },
    [entity, emit, emitFlare, knockback, playOneShot]
  )

  // Keep the latest hit handler in a ref so collider registration can happen
  // once on mount. Re-registering on every position change (the old code had
  // `position` as an effect dep) churned the collision store every frame.
  const onHitRef = useRef(onHit)
  onHitRef.current = onHit

  // Register collider with collision system — mount only
  useEffect(() => {
    const pos = entity.get(Position)
    if (!pos) return

    registerCollider({
      id: colliderId,
      x: pos.x,
      z: pos.z,
      radius: ENEMY_COLLISION_RADIUS * def.scale + 0.15,
      solid: true,
      layer: Layer.ENEMY,
      onHit: (attackerId, damage, hitPosition) => onHitRef.current(attackerId, damage, hitPosition),
    })

    return () => unregisterCollider(colliderId)
  }, [colliderId, entity, registerCollider, unregisterCollider, def.scale])

  // Update collider position, hit flash decay, locomotion, staff anchor, charging
  useFrame((_, delta) => {
    // During replay playback the replay engine drives transforms and poses
    if (useGameStore.getState().replayPhase === 'playback') return

    // Manual mixer (replaces drei useAnimations) must be stepped every frame
    mixer.update(delta)

    const pos = entity.get(Position)
    if (pos) {
      updateCollider(colliderId, pos.x, pos.z)
    }

    // Decay hit flash on this enemy's materials
    if (materialsRef.current.length > 0) {
      hitValue.current = damp(hitValue.current, 0, 7, delta)
      const intensity = hitValue.current * 3
      if (intensity > 0.01) {
        for (let i = 0; i < materialsRef.current.length; i++) {
          materialsRef.current[i].emissiveIntensity = intensity
        }
      }
    }

    // Boss weapon ignite — phase 2 smoulders, phase 3 burns hot
    if (isBoss && axeMatsRef.current.length > 0) {
      const brain = entity.get(BossBrain)
      if (brain && brain.phase >= 2) {
        const flash = hitValue.current * 3
        if (brain.phase >= 3) {
          const pulse = 2.2 + Math.sin(performance.now() * 0.012) * 0.8
          for (const mat of axeMatsRef.current) {
            mat.emissive.set('#ff3300')
            mat.emissiveIntensity = Math.max(pulse, flash)
          }
        } else {
          for (const mat of axeMatsRef.current) {
            mat.emissive.set('#ff7a1a')
            mat.emissiveIntensity = Math.max(0.9, flash)
          }
        }
      }
    }

    // Locomotion - crossfade Idle <-> Run from actual velocity
    if (!busyOneShot.current && entity.has(Velocity)) {
      const vel = entity.get(Velocity)!
      const speed = Math.hypot(vel.x, vel.z)
      playLocomotion(speed > RUN_SPEED_THRESHOLD ? CLIP_RUN : CLIP_IDLE)
    }

    // Drive the staff-tip anchor (spell charge VFX + bullet origin)
    if (staffTipRef.current && staffObj.current) {
      staffObj.current.updateWorldMatrix(true, false)
      tmpTip.copy(STAFF_TIP_LOCAL).applyMatrix4(staffObj.current.matrixWorld)
      staffTipRef.current.position.copy(staffTipRef.current.parent!.worldToLocal(tmpTip))
      staffObj.current.getWorldQuaternion(tmpQuat)
      staffTipRef.current.parent!.getWorldQuaternion(tmpParentQuat)
      staffTipRef.current.quaternion.copy(tmpParentQuat.invert().multiply(tmpQuat))
    }

    // Handle charging sequence for range enemies (frozen with the game)
    if (isGameFrozen(useGameStore.getState())) return
    if (isRange && isChargingRef.current && gatherEnergyRef.current) {
      chargeTimeRef.current += delta

      const CHARGE_DURATION = 0.5
      const PAUSE_DURATION = 0.5
      const TOTAL_DURATION = CHARGE_DURATION + PAUSE_DURATION

      if (chargeTimeRef.current <= CHARGE_DURATION) {
        // Phase 1: Charging (0 to 0.5s) - emit with lifetime from 1 to 0.1
        const progress = chargeTimeRef.current / CHARGE_DURATION
        const lifetime = 1 - progress * 0.9 // Goes from 1 to 0.1

        gatherEnergyRef.current.emit({
          lifetime,
        })
      } else if (chargeTimeRef.current <= TOTAL_DURATION) {
        // Phase 2: Pause (0.5s to 1s) - no emission
      } else {
        // Phase 3: Fire!
        completeShot()
      }
    }
  })

  // Store mesh ref in ECS for system access
  useEffect(() => {
    if (groupRef.current && entity.has(MeshRef)) {
      entity.set(MeshRef, { current: groupRef.current as unknown as THREE.Mesh })
    }
    return () => {
      if (entity.has(MeshRef)) {
        entity.set(MeshRef, { current: null })
      }
    }
  }, [entity])

  // Kill any running knockback tween on unmount
  useEffect(() => {
    return () => {
      knockbackTween.current?.kill()
    }
  }, [])

  // Don't render if traits are missing (entity destroyed)
  if (!initialPos || !initialScale) return null

  return (
    <group
      ref={groupRef}
      position={[initialPos.x, initialPos.y, initialPos.z]}
      scale={[initialScale.x * def.scale, initialScale.y * def.scale, initialScale.z * def.scale]}
    >
      {/* Health bar above enemy — only mounted once damaged, so full-health
          mobs don't pay for a DOM overlay every frame */}
      {health && health.current < health.max && (
        <Healthbar position={[0, 2.8, 0]} health={health.current} healthMax={health.max} />
      )}

      {/* KayKit mob - faces +Z */}
      <primitive object={clone} dispose={null} />

      {/* Staff-tip anchor: spell charge VFX + bullet spawn point (range only) */}
      {isRange && (
        <group ref={staffTipRef}>
          <VFXEmitter ref={gatherEnergyRef} name={PARTICLES.BULLET_ENERGY} autoStart={false} />
        </group>
      )}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Helpers bound lazily to avoid koota hook rules in callbacks
// ---------------------------------------------------------------------------
import { world } from '@/ecs'
import { enemyActions as boundEnemyActions } from './actions'
import { rageGainMultiplier, lifestealFraction } from '@/game/skills'

const enemyActionsHelper = boundEnemyActions(world)
const skillHelpers = { rageGainMultiplier, lifestealFraction }

// Preload mob models
useGLTF.preload('/character/Mage.glb')
useGLTF.preload('/character/Rogue.glb')
useGLTF.preload('/character/Barbarian.glb')
useGLTF.preload('/character/Knight.glb')

// ============================================
// Enemy Manager (queries and renders all enemies)
// ============================================

/**
 * Queries all enemies and renders them.
 * Loads every mob model once and shares them across instances.
 */
export function EnemyManager() {
  const world = useWorld()
  const enemies = useQuery(IsEnemy)

  const mage = useGLTF('/character/Mage.glb')
  const rogue = useGLTF('/character/Rogue.glb')
  const barbarian = useGLTF('/character/Barbarian.glb')
  const knight = useGLTF('/character/Knight.glb')

  const models = useMemo<ModelMap>(
    () => ({
      '/character/Mage.glb': { scene: mage.scene, animations: mage.animations },
      '/character/Rogue.glb': { scene: rogue.scene, animations: rogue.animations },
      '/character/Barbarian.glb': { scene: barbarian.scene, animations: barbarian.animations },
      '/character/Knight.glb': { scene: knight.scene, animations: knight.animations },
    }),
    [mage, rogue, barbarian, knight]
  )

  useEffect(() => {
    const entries = [
      ['mage', mage.scene],
      ['rogue', rogue.scene],
      ['barbarian', barbarian.scene],
      ['knight', knight.scene],
    ] as const

    let cancelled = false
    const prewarmNext = (index: number) => {
      if (cancelled || index >= entries.length) return
      const [mobType, scene] = entries[index]
      prewarmPool(mobType, scene, 2)
      setTimeout(() => prewarmNext(index + 1), 0)
    }
    prewarmNext(0)

    return () => {
      cancelled = true
    }
  }, [mage, rogue, barbarian, knight])

  // Run enemy systems every frame
  useFrame((_, delta) => {
    updateEnemySystems(world, delta)
  })

  return (
    <>
      {enemies.map((entity) => (
        <EnemyMesh key={entity.id()} entity={entity} models={models} />
      ))}
    </>
  )
}

// ============================================
// Complete Enemy System Component
// ============================================

/**
 * All-in-one component: manages enemy lifecycle with levels and waves.
 */
export function EnemySystem() {
  useLevelManager()
  return <EnemyManager />
}
