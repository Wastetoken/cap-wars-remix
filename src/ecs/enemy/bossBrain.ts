import type { World } from 'koota'
import * as THREE from 'three'
import {
  IsEnemy,
  Position,
  Rotation,
  TargetVelocity,
  Health,
  Speed,
  ShootTimer,
  BossBrain,
  MeshRef,
  MobType as MobTrait,
} from './traits'
import { eventBus, EVENTS, ARENA_BOUND } from '@/constants'
import { useGameStore } from '@/store'
import { MOBS, type MobType } from '@/game/mobs'
import { BOSS_CONFIG } from './bossConfig'
import { cycleDamageMult, levelDamageMult } from '@/game/cycle'

// ============================================================================
// Boss brains — one state machine, per-boss kits from bossConfig.ts.
//
// Unlike regular mobs, bosses are immune to stun and knockback (see
// Enemy.tsx onHit) and run this state machine instead of the
// melee/range behavior systems:
//
//   chase   → pursue the player, basic attack on cooldown
//   windup/leap → the King's telegraphed slam (red circle, leap, crush)
//   ring    → spin releases an expanding shockwave wall (dash through it)
//   volley  → fan of projectiles (reuses the enemy bullet system)
//   charge  → Oathbreaker: telegraphed shield-charge dash through the player
//   meteor  → Hexweaver: delayed AoE strikes on the player's position
//   blink   → Hexweaver: teleport to a telegraphed arena point (untouchable)
//   shadowstep → Nightshade: teleport past the player into a heavy backstab
//   vanish  → Nightshade: invisible + untargetable drift, then ambush hit
//   recover → brief vulnerability window, then back to chase
//
// Phases: ≤66% HP enrage (faster), ≤33% HP berserk (faster still, summons
// two adds once — type from the boss config). Phase speed changes multiply
// the CURRENT speed so the cycle speed multiplier applied at spawn survives.
// ============================================================================

/** Slam tuning (Barbarian King) */
const SLAM_WINDUP_S = 0.9
const SLAM_LEAP_S = 0.55
const SLAM_RADIUS = 3.4
const SLAM_DAMAGE = 40
const SLAM_ARC_HEIGHT = 3.2

/** Shockwave ring tuning */
const RING_SPIN_S = 0.55
const RING_MAX_RADIUS = 10.5
const RING_DAMAGE = 25

/** Shield charge tuning (Oathbreaker) */
const CHARGE_WINDUP_S = 0.7
const CHARGE_DASH_S = 0.42
const CHARGE_LENGTH = 12
const CHARGE_DAMAGE = 35
const CHARGE_HIT_RADIUS = 1.4

/** Blink + meteor tuning (Hexweaver) */
const BLINK_S = 0.65
const METEOR_RADIUS = 2.6
const METEOR_FALL_S = 0.95
const METEOR_INTERVAL_S = 0.55
const METEOR_DAMAGE = 32

/** Shadowstep + vanish tuning (Nightshade) */
const SHADOWSTEP_STRIKE_S = 0.35
const SHADOWSTEP_DAMAGE = 28
const VANISH_S = 1.2
const VANISH_DAMAGE = 22
const BACKSTAB_RADIUS = 2.4

const clampArena = (v: number) => Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, v))

export function bossBrainSystem(world: World, delta: number) {
  const store = useGameStore.getState()
  const playerPos = store.playerPosition
  const now = Date.now()

  /** Damage scaling shared by every boss special */
  const scaled = (base: number) =>
    Math.round(base * cycleDamageMult(store.cycle) * levelDamageMult(store.playerLevel))

  world
    .query(IsEnemy, Position, Rotation, TargetVelocity, Health, Speed, ShootTimer, BossBrain, MeshRef)
    .forEach((entity) => {
      const pos = entity.get(Position)!
      const rot = entity.get(Rotation)!
      const brain = entity.get(BossBrain)!
      const health = entity.get(Health)!
      const speed = entity.get(Speed)!
      const shootTimer = entity.get(ShootTimer)!
      const meshRef = entity.get(MeshRef)

      const mob = (entity.has(MobTrait) ? entity.get(MobTrait)!.value : 'boss') as MobType
      const cfg = BOSS_CONFIG[mob] ?? BOSS_CONFIG.boss
      const def = MOBS[mob] ?? MOBS.boss

      brain.t += delta

      // ------------------------------------------------------------------
      // Phase transitions — speed scales multiplicatively off the current
      // value so spawn-time cycle scaling isn't wiped out
      // ------------------------------------------------------------------
      const hpFrac = health.current / health.max
      if (brain.phase === 1 && hpFrac <= 0.66) {
        brain.phase = 2
        entity.set(Speed, { value: speed.value * (cfg.phaseSpeed[1] / cfg.phaseSpeed[0]) })
        eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), 'Cheer', 1.3)
        eventBus.emit(EVENTS.ANNOUNCE, cfg.enrageMsg[0], cfg.enrageMsg[1])
      } else if (brain.phase === 2 && hpFrac <= 0.33) {
        brain.phase = 3
        entity.set(Speed, { value: speed.value * (cfg.phaseSpeed[2] / cfg.phaseSpeed[1]) })
        eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), 'Cheer', 1.6)
        eventBus.emit(EVENTS.ANNOUNCE, cfg.berserkMsg[0], cfg.berserkMsg[1])
        if (!brain.summoned) {
          brain.summoned = true
          eventBus.emit(EVENTS.BOSS_SUMMON, { x: pos.x, z: pos.z, add: cfg.summonAdd })
        }
      }

      const dx = playerPos.x - pos.x
      const dz = playerPos.z - pos.z
      const dist = Math.hypot(dx, dz)

      // Face the player except mid-leap, mid-charge-dash, or while vanished
      const charging = brain.state === 'charge' && brain.chargeDashing
      if (brain.state !== 'leap' && !charging && brain.state !== 'vanish' && dist > 0.1) {
        entity.set(Rotation, { x: rot.x, y: Math.atan2(dx, dz), z: rot.z })
      }

      switch (brain.state) {
        // ----------------------------------------------------------------
        case 'chase': {
          brain.specialCooldown -= delta
          const holdDistance = Math.max(def.attackRange - 0.3, 0.5)

          if (brain.specialCooldown <= 0 && dist < 11 && !store.playerDead) {
            // Start the next telegraphed special (rotation from the config)
            const pick = cfg.specials[brain.nextSpecial % cfg.specials.length]
            brain.nextSpecial++
            brain.t = 0
            entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })

            if (pick === 'slam') {
              brain.state = 'windup'
              brain.targetX = playerPos.x
              brain.targetZ = playerPos.z
              eventBus.emit(EVENTS.BOSS_TELEGRAPH, {
                x: brain.targetX,
                z: brain.targetZ,
                radius: SLAM_RADIUS,
                durationMs: SLAM_WINDUP_S * 1000,
              })
              eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), cfg.anims.windup, 0.45)
            } else if (pick === 'ring') {
              brain.state = 'ring'
              brain.ringReleased = false
              eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), cfg.anims.spin, 0.85)
            } else if (pick === 'volley') {
              brain.state = 'volley'
              brain.volleyShotsLeft = cfg.volley.shots
              brain.volleyTimer = 0
              eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), cfg.anims.throw, 1.0)
            } else if (pick === 'charge') {
              // Telegraph the charge endpoint, wind up, then dash through
              brain.state = 'charge'
              brain.chargeDashing = false
              brain.chargeHit = false
              const nx = dist > 0.1 ? dx / dist : 0
              const nz = dist > 0.1 ? dz / dist : 1
              const len = Math.min(dist + 4, CHARGE_LENGTH)
              brain.targetX = clampArena(pos.x + nx * len)
              brain.targetZ = clampArena(pos.z + nz * len)
              eventBus.emit(EVENTS.BOSS_TELEGRAPH, {
                x: brain.targetX,
                z: brain.targetZ,
                radius: 2.0,
                durationMs: CHARGE_WINDUP_S * 1000,
              })
              eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), cfg.anims.windup, 0.8)
            } else if (pick === 'meteor') {
              // Delayed strikes raining on the player's live position
              brain.state = 'meteor'
              brain.meteorLeft = 1 + brain.phase // 2 / 3 / 4 strikes
              brain.meteorTimer = 0
              brain.meteorStrikes = []
              eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), cfg.anims.windup, 1.0)
            } else if (pick === 'blink') {
              // Telegraphed teleport to a random arena point; untouchable
              // for the blink's duration (Enemy.tsx onHit skips 'blink')
              brain.state = 'blink'
              brain.targetX = clampArena((Math.random() * 2 - 1) * (ARENA_BOUND - 1.5))
              brain.targetZ = clampArena((Math.random() * 2 - 1) * (ARENA_BOUND - 1.5))
              eventBus.emit(EVENTS.BOSS_TELEGRAPH, {
                x: brain.targetX,
                z: brain.targetZ,
                radius: 1.6,
                durationMs: BLINK_S * 1000,
              })
              eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), cfg.anims.dash, 1.6)
            } else if (pick === 'shadowstep') {
              // Emerge just past the player along the line of approach,
              // then land a heavy backstab
              brain.state = 'shadowstep'
              brain.strikeDone = false
              const nx = dist > 0.1 ? dx / dist : 0
              const nz = dist > 0.1 ? dz / dist : 1
              const bx = clampArena(playerPos.x + nx * 1.4)
              const bz = clampArena(playerPos.z + nz * 1.4)
              entity.set(Position, { x: bx, y: 0, z: bz })
              entity.set(Rotation, {
                x: rot.x,
                y: Math.atan2(playerPos.x - bx, playerPos.z - bz),
                z: rot.z,
              })
              eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), cfg.anims.windup, 1.3)
            } else {
              // vanish — hide, drift toward the player, ambush on reappear
              brain.state = 'vanish'
              brain.strikeDone = false
              if (meshRef?.current) meshRef.current.visible = false
            }
            break
          }

          if (dist > holdDistance) {
            entity.set(TargetVelocity, { x: dx / dist, y: 0, z: dz / dist })
          } else {
            entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
            if (now - shootTimer.lastShot >= shootTimer.nextShot) {
              eventBus.emit(EVENTS.ENEMY_ATTACK, entity.id())
              entity.set(ShootTimer, {
                lastShot: now,
                nextShot: def.attackCooldownMs * (0.85 + Math.random() * 0.5),
              })
            }
          }
          break
        }

        // ----------------------------------------------------------------
        case 'windup': {
          entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
          if (brain.t >= SLAM_WINDUP_S) {
            brain.state = 'leap'
            brain.t = 0
            brain.leapFromX = pos.x
            brain.leapFromZ = pos.z
            eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), cfg.anims.dash, 1.1)
          }
          break
        }

        // ----------------------------------------------------------------
        case 'leap': {
          entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
          const t = Math.min(brain.t / SLAM_LEAP_S, 1)
          entity.set(Position, {
            x: brain.leapFromX + (brain.targetX - brain.leapFromX) * t,
            y: Math.sin(t * Math.PI) * SLAM_ARC_HEIGHT,
            z: brain.leapFromZ + (brain.targetZ - brain.leapFromZ) * t,
          })
          if (t >= 1) {
            entity.set(Position, { x: brain.targetX, y: 0, z: brain.targetZ })
            brain.state = 'recover'
            brain.recoverFor = 0.9
            brain.t = 0
            eventBus.emit(EVENTS.BOSS_SLAM_LAND, { x: brain.targetX, z: brain.targetZ })
            eventBus.emit(EVENTS.CAMERA_SHAKE)
            // AoE check against the telegraphed circle (i-frames respected
            // inside damagePlayer)
            const pdx = playerPos.x - brain.targetX
            const pdz = playerPos.z - brain.targetZ
            if (Math.hypot(pdx, pdz) <= SLAM_RADIUS) {
              store.damagePlayer(scaled(SLAM_DAMAGE))
            }
          }
          break
        }

        // ----------------------------------------------------------------
        case 'ring': {
          entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
          if (!brain.ringReleased && brain.t >= RING_SPIN_S) {
            brain.ringReleased = true
            eventBus.emit(EVENTS.BOSS_RING, {
              x: pos.x,
              z: pos.z,
              maxRadius: RING_MAX_RADIUS,
              damage: scaled(RING_DAMAGE),
              durationMs: 1700,
            })
            eventBus.emit(EVENTS.CAMERA_SHAKE)
            brain.state = 'recover'
            brain.recoverFor = 0.6
            brain.t = 0
          }
          break
        }

        // ----------------------------------------------------------------
        case 'volley': {
          entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
          brain.volleyTimer -= delta
          if (brain.volleyShotsLeft > 0 && brain.volleyTimer <= 0) {
            brain.volleyTimer = cfg.volley.intervalS
            brain.volleyShotsLeft--
            // Projectile fan toward the player's current position.
            // Bullets travel along -Z of the quaternion (see bullets.tsx),
            // and enemies face +Z, so add PI — same flip Enemy.completeShot uses.
            const shotIndex = cfg.volley.shots - brain.volleyShotsLeft // 0..N-1
            const spread = (shotIndex - (cfg.volley.shots - 1) / 2) * cfg.volley.fanRad
            const yaw = Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z) + spread + Math.PI
            const quat = new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              yaw
            )
            const origin = new THREE.Vector3(pos.x, pos.y + 1.4 * def.scale, pos.z)
            eventBus.emit(EVENTS.SHOOT, origin, quat)
          }
          if (brain.volleyShotsLeft <= 0 && brain.t > 0.9) {
            brain.state = 'recover'
            brain.recoverFor = 0.5
            brain.t = 0
          }
          break
        }

        // ----------------------------------------------------------------
        case 'charge': {
          if (!brain.chargeDashing) {
            entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
            if (brain.t >= CHARGE_WINDUP_S) {
              brain.chargeDashing = true
              brain.chargeFromX = pos.x
              brain.chargeFromZ = pos.z
              brain.t = 0
              eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), cfg.anims.dash, 1.6)
            }
          } else {
            const t = Math.min(brain.t / CHARGE_DASH_S, 1)
            const cx = brain.chargeFromX + (brain.targetX - brain.chargeFromX) * t
            const cz = brain.chargeFromZ + (brain.targetZ - brain.chargeFromZ) * t
            entity.set(Position, { x: cx, y: 0, z: cz })
            // Contact damage once if the dash clips the player
            if (
              !brain.chargeHit &&
              !store.playerDead &&
              Math.hypot(playerPos.x - cx, playerPos.z - cz) <= CHARGE_HIT_RADIUS
            ) {
              brain.chargeHit = true
              store.damagePlayer(scaled(CHARGE_DAMAGE))
              eventBus.emit(EVENTS.CAMERA_SHAKE)
            }
            if (t >= 1) {
              brain.state = 'recover'
              brain.recoverFor = 0.8
              brain.t = 0
            }
          }
          break
        }

        // ----------------------------------------------------------------
        case 'meteor': {
          entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
          brain.meteorTimer -= delta
          if (brain.meteorLeft > 0 && brain.meteorTimer <= 0) {
            brain.meteorTimer = METEOR_INTERVAL_S
            brain.meteorLeft--
            const sx = clampArena(playerPos.x + (Math.random() - 0.5) * 1.2)
            const sz = clampArena(playerPos.z + (Math.random() - 0.5) * 1.2)
            brain.meteorStrikes.push({ x: sx, z: sz, at: brain.t + METEOR_FALL_S })
            eventBus.emit(EVENTS.BOSS_TELEGRAPH, {
              x: sx,
              z: sz,
              radius: METEOR_RADIUS,
              durationMs: METEOR_FALL_S * 1000,
            })
          }
          if (brain.meteorStrikes.length > 0) {
            const landing = brain.meteorStrikes.filter((s) => brain.t >= s.at)
            if (landing.length > 0) {
              brain.meteorStrikes = brain.meteorStrikes.filter((s) => brain.t < s.at)
              for (const s of landing) {
                eventBus.emit(EVENTS.BOSS_SLAM_LAND, { x: s.x, z: s.z })
                if (
                  !store.playerDead &&
                  Math.hypot(playerPos.x - s.x, playerPos.z - s.z) <= METEOR_RADIUS
                ) {
                  store.damagePlayer(scaled(METEOR_DAMAGE))
                }
              }
              eventBus.emit(EVENTS.CAMERA_SHAKE)
            }
          }
          if (brain.meteorLeft <= 0 && brain.meteorStrikes.length === 0) {
            brain.state = 'recover'
            brain.recoverFor = 0.6
            brain.t = 0
          }
          break
        }

        // ----------------------------------------------------------------
        case 'blink': {
          entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
          if (brain.t >= BLINK_S) {
            entity.set(Position, { x: brain.targetX, y: 0, z: brain.targetZ })
            eventBus.emit(EVENTS.BOSS_SLAM_LAND, { x: brain.targetX, z: brain.targetZ })
            brain.state = 'recover'
            brain.recoverFor = 0.5
            brain.t = 0
          }
          break
        }

        // ----------------------------------------------------------------
        case 'shadowstep': {
          entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
          if (!brain.strikeDone && brain.t >= SHADOWSTEP_STRIKE_S) {
            brain.strikeDone = true
            if (!store.playerDead && dist <= BACKSTAB_RADIUS) {
              store.damagePlayer(scaled(SHADOWSTEP_DAMAGE))
              eventBus.emit(EVENTS.CAMERA_SHAKE)
            }
          }
          if (brain.t >= 0.8) {
            brain.state = 'recover'
            brain.recoverFor = 0.6
            brain.t = 0
          }
          break
        }

        // ----------------------------------------------------------------
        case 'vanish': {
          // Hidden drift toward the player (untargetable — Enemy.tsx onHit
          // skips 'vanish'), then reappear with an ambush strike
          if (dist > 0.1) {
            entity.set(TargetVelocity, { x: dx / dist, y: 0, z: dz / dist })
          }
          if (brain.t >= VANISH_S) {
            if (meshRef?.current) meshRef.current.visible = true
            entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
            eventBus.emit(EVENTS.BOSS_ANIM, entity.id(), cfg.anims.windup, 1.3)
            if (!store.playerDead && dist <= BACKSTAB_RADIUS + 0.6) {
              store.damagePlayer(scaled(VANISH_DAMAGE))
              eventBus.emit(EVENTS.CAMERA_SHAKE)
            }
            brain.state = 'recover'
            brain.recoverFor = 0.7
            brain.t = 0
          }
          break
        }

        // ----------------------------------------------------------------
        case 'recover': {
          entity.set(TargetVelocity, { x: 0, y: 0, z: 0 })
          if (brain.t >= brain.recoverFor) {
            brain.state = 'chase'
            brain.t = 0
            brain.specialCooldown =
              cfg.phaseCooldown[brain.phase - 1] * (0.85 + Math.random() * 0.3)
          }
          break
        }
      }

      // Bosses do not chase while winding up / leaping / spinning / etc.
      if (brain.state !== 'chase') {
        // keep them inside the arena even mid-leap / mid-charge
        if (Math.abs(pos.x) > ARENA_BOUND) entity.set(Position, { ...pos, x: clampArena(pos.x) })
        if (Math.abs(pos.z) > ARENA_BOUND) entity.set(Position, { ...pos, z: clampArena(pos.z) })
      }
    })
}
