import * as THREE from 'three'
import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import gsap from 'gsap'
import { useGameStore, isGameFrozen } from '../store'
import { slashFlipX } from '../components/particles/slash'
import { swordGlowUniform } from './materials'
import { dealDamageInArea } from '../collision'
import type { AnimationState, CharacterAnims } from './types'
import {
  ATTACK_SPEED,
  SPIN_ATTACK_SPEED,
  DASH_ATTACK_SPEED,
  CHARGE_DELAY_MS,
  CHARGE_TIME_MS,
  PARRY_DURATION_MS,
  PARRY_COOLDOWN_MS,
} from './types'
import { eventBus, EVENTS } from '../constants'
import { ARENA_BOUND } from '../components/arena'
import { useVFXEmitter, PARTICLES } from '../components/particles'
import {
  getAbility,
  abilityRankScale,
  buffDuration,
  type AbilityId,
  type AbilityBehavior,
  type AbilityDef,
} from '@/game/abilities'
import { isAbilityUnlocked, abilityRank, damageMultiplier } from '@/game/skills'
import { gearDamageMult } from '@/game/gear'
import { comboAttackSpeedMult } from '@/game/combo'
import type { CharacterId } from '@/game/characters'

const PARRY_SPEED = 2
const ATTACK_DAMAGE = 10
const SPIN_ATTACK_DAMAGE = 100
const RUN_SPEED_THRESHOLD = 0.5

/** Spin AoE damage tick interval (seconds) */
const SPIN_TICK = 0.4
/** Slam hop timing (seconds) */
const SLAM_AIR_TIME = 0.55
/** Flurry strike lands this far ahead of the player */
const FLURRY_REACH = 2.2
/** Brief input lockout for instant-cast abilities (volley / nova) */
const CAST_LOCKOUT = 0.45

type UseCapsControllerProps = {
  actions: Record<string, THREE.AnimationAction | null>
  mixer: THREE.AnimationMixer | null
  weapon: THREE.Object3D | null
  swordRef2: React.RefObject<THREE.Group | null>
  group: React.RefObject<THREE.Group | null>
  slashEmitterRef: React.RefObject<{ emit: (overrides?: Record<string, unknown>) => void } | null>
  sparkEmitterRef: React.RefObject<{ emit: (overrides?: Record<string, unknown>) => void } | null>
  anims: CharacterAnims
  characterId: CharacterId
  /** Ranged characters (mage) fire bolts instead of melee swings */
  ranged: boolean
}

type ActiveAbility = {
  behavior: AbilityBehavior | 'cast' | null
  elapsed: number
  nextTick: number
  duration: number
  radius: number
  damage: number
  hitsLeft: number
  tickInterval: number
  target: THREE.Vector3 | null
  hitSet: Set<string>
}

const idleAbility = (): ActiveAbility => ({
  behavior: null,
  elapsed: 0,
  nextTick: 0,
  duration: 0,
  radius: 0,
  damage: 0,
  hitsLeft: 0,
  tickInterval: SPIN_TICK,
  target: null,
  hitSet: new Set<string>(),
})

export const useCapsController = ({
  actions,
  mixer,
  weapon,
  swordRef2,
  group,
  slashEmitterRef,
  sparkEmitterRef,
  anims,
  characterId,
  ranged,
}: UseCapsControllerProps) => {
  const hitEntitiesRef = useRef<Set<string>>(new Set())
  const prevPlayerPos = useRef(new THREE.Vector3())
  // Monotonic id for attack one-shots — lets the playOneShot watchdog tell a
  // stale timer apart from a newer attack that legitimately replaced it
  const attackSeq = useRef(0)
  // Same idea for mobility one-shots (leap/blink/…): their 'finished' event
  // can be lost when an attack fades the action out early, latching
  // isMobility forever and freezing locomotion.
  const mobilitySeq = useRef(0)

  const tmpPos = useRef(new THREE.Vector3())
  const tmpQuat = useRef(new THREE.Quaternion())
  const tmpParentQuat = useRef(new THREE.Quaternion())

  const { start, stop } = useVFXEmitter(PARTICLES.ENERGY)

  const setIsCharging = useGameStore((s) => s.setIsCharging)
  const setSpinAttacking = useGameStore((s) => s.setSpinAttacking)
  const setParrying = useGameStore((s) => s.setParrying)
  const triggerSpinAttack = useGameStore((s) => s.triggerSpinAttack)
  const triggerDashAttack = useGameStore((s) => s.triggerDashAttack)
  const triggerAttackDash = useGameStore((s) => s.triggerAttackDash)

  const state = useRef<AnimationState>({
    currentAnimation: anims.stance,
    nextAttack: anims.attack1,
    isAttacking: false,
    isParrying: false,
    isMobility: false,
    mobilityClip: '',
    isHolding: false,
    holdStartTime: 0,
    chargeProgress: 0,
    isInChargeStance: false,
    queuedAttack: null,
    rmbHeld: false,
    parryStartTime: 0,
    parryCooldownEnd: 0,
  })

  const animationParams = useRef({
    speed: 1,
    clamp: false,
    loop: true,
  })

  const abilityState = useRef<ActiveAbility>(idleAbility())

  const abilityTriggered = useGameStore((s) => s.abilityTriggered)
  const clearAbilityTrigger = useGameStore((s) => s.clearAbilityTrigger)
  const mobilityAnim = useGameStore((s) => s.mobilityAnim)
  const clearMobilityAnim = useGameStore((s) => s.clearMobilityAnim)
  const setAbilityCooldown = useGameStore((s) => s.setAbilityCooldown)
  const spendRage = useGameStore((s) => s.spendRage)
  const setFury = useGameStore((s) => s.setFury)
  const setFuryBuff = useGameStore((s) => s.setFuryBuff)

  // Reset state when anims change (character switch)
  useEffect(() => {
    state.current.currentAnimation = anims.stance
    state.current.nextAttack = anims.attack1
    abilityState.current = idleAbility()
  }, [anims])

  const getPlayerWorldPos = () => {
    const p = new THREE.Vector3()
    group.current?.getWorldPosition(p)
    return p
  }

  /** Player facing direction on the XZ plane */
  const getForward = () => {
    const dir = new THREE.Vector3(0, 0, -1)
    if (group.current) group.current.getWorldDirection(dir)
    dir.y = 0
    return dir.lengthSq() > 0 ? dir.normalize() : new THREE.Vector3(0, 0, -1)
  }

  /** Fire a player bolt (mage). Damage already includes all multipliers. */
  const fireBolt = (dir: THREE.Vector3, damage: number) => {
    const origin = getPlayerWorldPos().add(dir.clone().multiplyScalar(0.6))
    origin.y = 1.1
    eventBus.emit(EVENTS.PLAYER_SHOOT, origin, dir, damage)
  }

  /** Current ability buff profile (slot 3 buffs / ice nova), if any */
  const getBuff = () => useGameStore.getState().furyBuff

  /** Full basic-attack bolt damage with talents + buff */
  const boltDamage = (base: number) =>
    base *
    damageMultiplier(useGameStore.getState().skills) *
    (getBuff()?.damageMult ?? 1) *
    gearDamageMult(useGameStore.getState().gear)

  const dealAbilityDamage = (radius: number, damage: number) => {
    const pos = getPlayerWorldPos()
    hitEntitiesRef.current.clear()
    dealDamageInArea(pos.x, pos.z, radius, damage, 'player', pos.y + 1)
  }

  // -------------------------------------------------------------------------
  // Animation helpers
  // -------------------------------------------------------------------------

  const playOneShot = (clip: string, timeScale: number) => {
    const s = state.current
    const action = actions[clip]
    if (!action) return

    actions[s.currentAnimation]?.fadeOut(0.1)
    action.reset().fadeIn(0.1).play()
    action.setLoop(THREE.LoopOnce, 1)
    action.setEffectiveTimeScale(timeScale)
    action.clampWhenFinished = true

    s.isAttacking = true
    s.currentAnimation = clip
    animationParams.current = { speed: timeScale, clamp: true, loop: false }

    // Watchdog: the mixer's 'finished' event is the only normal exit from
    // isAttacking, and a shared clip (mage Blink = spin attack) can consume
    // it. If that happens, recover so the player is never disarmed.
    const seq = ++attackSeq.current
    const durationMs = (action.getClip().duration / Math.max(timeScale, 0.01)) * 1000 + 250
    window.setTimeout(() => {
      const st = state.current
      if (!st.isAttacking || attackSeq.current !== seq) return
      st.isAttacking = false
      hitEntitiesRef.current.clear()
      setSpinAttacking(false)
      eventBus.emit(EVENTS.ATTACK_END)
      actions[st.currentAnimation]?.fadeOut(0.15)
      actions[anims.stance]?.reset().fadeIn(0.15).play()
      st.currentAnimation = anims.stance
      animationParams.current = { speed: 1, clamp: false, loop: true }
    }, durationMs)
  }

  const backToStance = (fade = 0.15) => {
    const s = state.current
    s.isAttacking = false
    eventBus.emit(EVENTS.ATTACK_END)
    actions[s.currentAnimation]?.fadeOut(fade)
    actions[anims.stance]?.reset().fadeIn(fade).play()
    s.currentAnimation = anims.stance
    animationParams.current = { speed: 1, clamp: false, loop: true }
  }

  /**
   * One-shot mobility clip (dash / shadowstep / blink / leap).
   * Visual layer only — never blocks attacks, abilities, or charging.
   */
  const playMobility = (clip: string, timeScale: number) => {
    const s = state.current
    if (s.isAttacking || s.isParrying) return
    const action = actions[clip]
    if (!action) return

    actions[s.currentAnimation]?.fadeOut(0.08)
    action.reset().fadeIn(0.08).play()
    action.setLoop(THREE.LoopOnce, 1)
    action.setEffectiveTimeScale(timeScale)
    action.clampWhenFinished = true

    s.isMobility = true
    s.mobilityClip = clip
    s.currentAnimation = clip
    animationParams.current = { speed: timeScale, clamp: true, loop: false }

    // Watchdog: if an attack fades this action out early, the mixer never
    // emits 'finished' and isMobility would stay latched, permanently
    // suppressing locomotion. Recover after the clip's real duration.
    const seq = ++mobilitySeq.current
    const durationMs = (action.getClip().duration / Math.max(timeScale, 0.01)) * 1000 + 250
    window.setTimeout(() => {
      const st = state.current
      if (!st.isMobility || st.mobilityClip !== clip || mobilitySeq.current !== seq) return
      st.isMobility = false
      st.mobilityClip = ''
      if (!st.isAttacking && !st.isParrying && st.currentAnimation === clip) {
        actions[clip]?.fadeOut(0.15)
        actions[anims.stance]?.reset().fadeIn(0.15).play()
        st.currentAnimation = anims.stance
        animationParams.current = { speed: 1, clamp: false, loop: true }
      }
    }, durationMs)
  }

  // -------------------------------------------------------------------------
  // Ability behaviors — each class kit maps slots onto these
  // -------------------------------------------------------------------------

  const gsapHop = (obj: THREE.Object3D) => {
    gsap.to(obj.position, {
      y: 1.3,
      duration: SLAM_AIR_TIME * 0.45,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(obj.position, {
          y: 0,
          duration: SLAM_AIR_TIME * 0.55,
          ease: 'power3.in',
        })
      },
    })
  }

  const scaledDamage = (def: AbilityDef, rank: number) =>
    def.damage *
    abilityRankScale(rank) *
    damageMultiplier(useGameStore.getState().skills) *
    gearDamageMult(useGameStore.getState().gear)

  const executeSpin = (def: AbilityDef, rank: number) => {
    const scale = abilityRankScale(rank)
    playOneShot(def.anim, 1.2)

    abilityState.current = {
      ...idleAbility(),
      behavior: 'spin',
      duration: def.spinDuration ?? 1.2,
      tickInterval: SPIN_TICK,
      radius: def.radius * scale,
      damage: scaledDamage(def, rank),
    }

    eventBus.emit(EVENTS.ABILITY_CAST, 'whirlwind', getPlayerWorldPos())
  }

  const executeSlam = (def: AbilityDef, rank: number) => {
    const scale = abilityRankScale(rank)
    playOneShot(def.anim, 1.4)

    abilityState.current = {
      ...idleAbility(),
      behavior: 'slam',
      duration: def.leap === false ? SLAM_AIR_TIME * 0.7 : SLAM_AIR_TIME,
      radius: def.radius * scale,
      damage: scaledDamage(def, rank),
    }

    if (def.leap !== false && group.current) gsapHop(group.current)
  }

  const executeBuff = (def: AbilityDef, rank: number) => {
    const profile = def.buff ?? { damageMult: 1.5, speedMult: 1.5 }
    playOneShot(def.anim, 1.4)
    abilityState.current = { ...idleAbility(), behavior: 'cast', duration: CAST_LOCKOUT }

    setFury(true)
    setFuryBuff(profile)
    swordGlowUniform.value = 1
    eventBus.emit(EVENTS.ABILITY_CAST, 'fury', getPlayerWorldPos())

    window.setTimeout(() => {
      setFury(false)
      setFuryBuff(null)
    }, buffDuration(def, rank))
  }

  const executeDashstrike = (def: AbilityDef, rank: number) => {
    playOneShot(def.anim, 1.6)
    triggerAttackDash(def.dashDistance ?? 6, def.dashDuration ?? 0.25)

    abilityState.current = {
      ...idleAbility(),
      behavior: 'dashstrike',
      duration: (def.dashDuration ?? 0.25) + 0.1,
      radius: def.radius,
      damage: scaledDamage(def, rank),
    }
  }

  const executeFlurry = (def: AbilityDef, rank: number) => {
    playOneShot(def.anim, 2.0)

    abilityState.current = {
      ...idleAbility(),
      behavior: 'flurry',
      nextTick: 0, // first strike lands immediately
      tickInterval: def.flurryInterval ?? 0.16,
      hitsLeft: def.flurryHits ?? 3,
      radius: def.radius,
      damage: scaledDamage(def, rank),
    }
  }

  const executeVolley = (def: AbilityDef, rank: number) => {
    playOneShot(def.anim, 1.4)
    abilityState.current = { ...idleAbility(), behavior: 'cast', duration: CAST_LOCKOUT }

    const count = def.boltCount ?? 5
    const spread = def.boltSpread ?? 0.6
    const forward = getForward()
    const baseAngle = Math.atan2(forward.x, forward.z)
    const damage = scaledDamage(def, rank)

    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1))
      const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle))
      fireBolt(dir, damage)
    }
    sparkEmitterRef.current?.emit({})
  }

  const executeMeteor = (def: AbilityDef, rank: number) => {
    const scale = abilityRankScale(rank)
    playOneShot(def.anim, 1.2)

    const forward = getForward()
    const target = getPlayerWorldPos().add(forward.multiplyScalar(def.impactDistance ?? 6))
    target.x = THREE.MathUtils.clamp(target.x, -ARENA_BOUND, ARENA_BOUND)
    target.z = THREE.MathUtils.clamp(target.z, -ARENA_BOUND, ARENA_BOUND)

    const radius = def.radius * scale
    eventBus.emit(EVENTS.METEOR_TELEGRAPH, {
      x: target.x,
      z: target.z,
      radius,
      durationMs: (def.impactDelay ?? 0.6) * 1000,
    })

    abilityState.current = {
      ...idleAbility(),
      behavior: 'meteor',
      duration: def.impactDelay ?? 0.6,
      radius,
      damage: scaledDamage(def, rank),
      target,
    }
  }

  const executeDaggerRain = (def: AbilityDef, rank: number) => {
    const scale = abilityRankScale(rank)
    playOneShot(def.anim, 1.4)

    const forward = getForward()
    const target = getPlayerWorldPos().add(forward.multiplyScalar(def.rainDistance ?? 3))
    target.x = THREE.MathUtils.clamp(target.x, -ARENA_BOUND, ARENA_BOUND)
    target.z = THREE.MathUtils.clamp(target.z, -ARENA_BOUND, ARENA_BOUND)

    abilityState.current = {
      ...idleAbility(),
      behavior: 'daggerrain',
      nextTick: 0, // first tick lands immediately
      tickInterval: def.tickInterval ?? 0.25,
      duration: (def.durationMs ?? 2500) / 1000,
      radius: def.radius * scale,
      damage: scaledDamage(def, rank),
      target,
    }

    eventBus.emit(EVENTS.ABILITY_CAST, 'dagger-rain', target.clone())
  }

  const executeNova = (def: AbilityDef, rank: number) => {
    const scale = abilityRankScale(rank)
    playOneShot(def.anim, 1.3)
    abilityState.current = { ...idleAbility(), behavior: 'cast', duration: CAST_LOCKOUT + 0.15 }

    dealAbilityDamage(def.radius * scale, scaledDamage(def, rank))
    eventBus.emit(EVENTS.ABILITY_CAST, 'nova', getPlayerWorldPos())
    eventBus.emit(EVENTS.CAMERA_SHAKE)

    // Ice Nova also empowers spells briefly
    const profile = def.buff ?? { damageMult: 1.3, speedMult: 1.3 }
    setFury(true)
    setFuryBuff(profile)
    window.setTimeout(() => {
      setFury(false)
      setFuryBuff(null)
    }, buffDuration(def, rank))
  }

  const tryExecuteAbility = (slot: AbilityId) => {
    const s = state.current
    const store = useGameStore.getState()
    const def = getAbility(characterId, slot)
    if (!def) return

    if (s.isAttacking || s.isParrying) return
    if (!isAbilityUnlocked(store.skills, characterId, slot)) return
    if (Date.now() < store.abilityCooldowns[slot]) return
    if (!spendRage(def.rageCost)) return

    const rank = abilityRank(store.skills, characterId, slot)
    setAbilityCooldown(slot, Date.now() + def.cooldownMs)

    switch (def.behavior) {
      case 'spin':
        executeSpin(def, rank)
        break
      case 'slam':
        executeSlam(def, rank)
        break
      case 'buff':
        executeBuff(def, rank)
        break
      case 'dashstrike':
        executeDashstrike(def, rank)
        break
      case 'flurry':
        executeFlurry(def, rank)
        break
      case 'daggerrain':
        executeDaggerRain(def, rank)
        break
      case 'volley':
        executeVolley(def, rank)
        break
      case 'meteor':
        executeMeteor(def, rank)
        break
      case 'nova':
        executeNova(def, rank)
        break
    }
  }

  // -------------------------------------------------------------------------
  // Basic attacks (LMB), spin attack (charged), dash attack, parry
  // -------------------------------------------------------------------------

  const executeAttack = (attackName: string) => {
    const s = state.current
    const action = actions[attackName]
    if (!action) return

    const speed =
      ATTACK_SPEED * (getBuff()?.speedMult ?? 1) * comboAttackSpeedMult(useGameStore.getState().combo)
    playOneShot(attackName, speed)

    if (ranged) {
      // Mage: cast a bolt instead of swinging
      fireBolt(getForward(), boltDamage(ATTACK_DAMAGE))
      sparkEmitterRef.current?.emit({})
    } else {
      triggerAttackDash(1.2, 0.15)

      slashFlipX.value = attackName === anims.attack2 ? 0 : 1
      const direction =
        attackName === anims.attack2
          ? [
              [1, 1],
              [0, 0],
              [0, 0],
            ]
          : [
              [-1, -1],
              [0, 0],
              [0, 0],
            ]
      slashEmitterRef.current?.emit({ direction })
      eventBus.emit(EVENTS.ABILITY_CAST, 'swing')
    }

    s.nextAttack = attackName === anims.attack1 ? anims.attack2 : anims.attack1
  }

  const executeSpinAttack = () => {
    const action = actions[anims.spinAttack]
    if (!action) return

    playOneShot(anims.spinAttack, SPIN_ATTACK_SPEED * comboAttackSpeedMult(useGameStore.getState().combo))
    setSpinAttacking(true)

    if (ranged) {
      // Charged cast: 3-bolt burst, no forward lurch
      const forward = getForward()
      const baseAngle = Math.atan2(forward.x, forward.z)
      const damage = boltDamage(SPIN_ATTACK_DAMAGE / 4)
      for (const offset of [-0.3, 0, 0.3]) {
        fireBolt(
          new THREE.Vector3(Math.sin(baseAngle + offset), 0, Math.cos(baseAngle + offset)),
          damage
        )
      }
    } else {
      triggerSpinAttack()
      eventBus.emit(EVENTS.ABILITY_CAST, 'spin')
    }
  }

  const executeDashAttack = () => {
    const action = actions[anims.dashAttack]
    if (!action) return

    playOneShot(anims.dashAttack, DASH_ATTACK_SPEED * comboAttackSpeedMult(useGameStore.getState().combo))

    if (ranged) {
      fireBolt(getForward(), boltDamage(ATTACK_DAMAGE * 1.5))
    } else {
      triggerDashAttack()

      slashFlipX.value = 1
      slashEmitterRef.current?.emit({
        direction: [
          [-1, -1],
          [0, 0],
          [0, 0],
        ],
      })
      eventBus.emit(EVENTS.ABILITY_CAST, 'swing')
    }
  }

  const executeParry = () => {
    const s = state.current
    const now = Date.now()

    if (s.isAttacking || s.isParrying || now < s.parryCooldownEnd) return

    const parryAnims =
      characterId === 'mage'
        ? [anims.parry1] // mage holds the Block pose while RMB is held — Block_Attack would swing
        : [anims.parry1, anims.parry2]
    const randomIndex = Math.floor(Math.random() * parryAnims.length)
    const parryName = parryAnims[randomIndex]
    const action = actions[parryName]
    if (!action) return

    actions[s.currentAnimation]?.fadeOut(0.1)
    action.reset().fadeIn(0.1).play()
    action.setLoop(THREE.LoopOnce, 1)
    action.setEffectiveTimeScale(PARRY_SPEED)
    action.clampWhenFinished = true

    animationParams.current = { speed: PARRY_SPEED, clamp: true, loop: false }

    s.isParrying = true
    s.rmbHeld = true
    s.parryStartTime = now
    s.currentAnimation = parryName
    setParrying(true)
    eventBus.emit(EVENTS.ABILITY_CAST, 'parry')
  }

  const exitParry = () => {
    const s = state.current
    s.isParrying = false
    s.rmbHeld = false
    s.parryCooldownEnd = Date.now() + PARRY_COOLDOWN_MS
    setParrying(false)

    actions[s.currentAnimation]?.fadeOut(0.1)
    actions[anims.stance]?.reset().fadeIn(0.1).play()
    s.currentAnimation = anims.stance
    animationParams.current = { speed: 1, clamp: false, loop: true }
  }

  const enterChargeStance = () => {
    const s = state.current
    if (s.isInChargeStance) return

    actions[s.currentAnimation]?.fadeOut(0.1)
    actions[anims.stance]?.reset().fadeIn(0.1).play()
    s.currentAnimation = anims.stance
    animationParams.current = { speed: 1, clamp: false, loop: true }
    s.isInChargeStance = true
    start()
    setIsCharging(true)
    if (!ranged) eventBus.emit(EVENTS.ABILITY_CAST, 'charge-start')
  }

  const exitChargeStance = () => {
    const s = state.current
    if (s.isInChargeStance && !ranged) eventBus.emit(EVENTS.ABILITY_CAST, 'charge-stop')
    s.isInChargeStance = false
    s.chargeProgress = 0
    stop()
    setIsCharging(false)
  }

  const onMouseDown = () => {
    const s = state.current
    s.isHolding = true
    s.holdStartTime = Date.now()
  }

  const onMouseUp = () => {
    const s = state.current

    if (!s.isHolding) return
    if (s.isAttacking || s.isParrying) {
      // Released mid-swing: buffer the intent so the follow-up fires the
      // moment the current attack ends, instead of eating the click.
      s.queuedAttack = s.isInChargeStance && s.chargeProgress >= 1 ? 'spin' : 'attack'
      s.isHolding = false
      exitChargeStance()
      return
    }

    const wasInChargeStance = s.isInChargeStance
    const wasFullyCharged = s.chargeProgress >= 1

    s.isHolding = false
    exitChargeStance()

    const { isDashing } = useGameStore.getState()

    if (isDashing) {
      executeDashAttack()
    } else if (wasInChargeStance && wasFullyCharged) {
      executeSpinAttack()
    } else {
      executeAttack(s.nextAttack)
    }
  }

  const onRightClick = () => {
    executeParry()
  }

  // RMB released — the mage's hold-to-block drops at the next frame check
  // (past the minimum parry duration); other classes expire on their timer.
  const onRightRelease = () => {
    state.current.rmbHeld = false
  }

  useEffect(() => {
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      const finishedName = e.action.getClip().name
      const attackAnimations = [anims.attack1, anims.attack2, anims.spinAttack, anims.dashAttack]
      const isAttackClip = attackAnimations.includes(finishedName)

      // Mobility one-shot ended — hand control back to locomotion.
      // The mage's Blink and spin attack SHARE the 'Spellcast_Raise' clip:
      // blink mid-charge, then release a charged spin — the spin restarts
      // that same action while it's still registered as the mobility clip.
      // Swallowing the finished event here left isAttacking true forever
      // (no attacks, speed pinned to 0). Fall through to attack completion.
      if (finishedName === state.current.mobilityClip && state.current.isMobility) {
        state.current.isMobility = false
        state.current.mobilityClip = ''
        if (!(isAttackClip && state.current.isAttacking)) {
          if (!state.current.isAttacking && !state.current.isParrying) {
            actions[state.current.currentAnimation]?.fadeOut(0.15)
            actions[anims.stance]?.reset().fadeIn(0.15).play()
            state.current.currentAnimation = anims.stance
            animationParams.current = { speed: 1, clamp: false, loop: true }
          }
          return
        }
      }

      if (isAttackClip && abilityState.current.behavior === null) {
        state.current.isAttacking = false
        hitEntitiesRef.current.clear()
        eventBus.emit(EVENTS.ATTACK_END)

        if (finishedName === anims.spinAttack) {
          setSpinAttacking(false)
          actions[state.current.currentAnimation]?.fadeOut(0.1)
          actions[anims.stance]?.reset().fadeIn(0.1).play()
          state.current.currentAnimation = anims.stance
          animationParams.current = { speed: 1, clamp: false, loop: true }
        }

        if (finishedName === anims.dashAttack) {
          actions[state.current.currentAnimation]?.fadeOut(0.1)
          actions[anims.stance]?.reset().fadeIn(0.1).play()
          state.current.currentAnimation = anims.stance
          animationParams.current = { speed: 1, clamp: false, loop: true }
        }
      }
    }

    mixer?.addEventListener('finished', onFinished)
    return () => mixer?.removeEventListener('finished', onFinished)
  }, [mixer, setSpinAttacking, actions, anims])

  useEffect(() => {
    const action = actions[anims.stance]?.reset().fadeIn(0.1).play()
    if (action) {
      state.current.currentAnimation = anims.stance
      animationParams.current = { speed: 1, clamp: false, loop: true }
    }
  }, [actions, anims])

  // ---------------------------------------------------------------------------
  // Per-frame ability state machine
  // ---------------------------------------------------------------------------

  const updateAbility = (delta: number) => {
    const ab = abilityState.current
    if (!ab.behavior) return

    ab.elapsed += delta

    switch (ab.behavior) {
      case 'spin': {
        if (ab.elapsed >= ab.nextTick) {
          ab.nextTick += ab.tickInterval
          dealAbilityDamage(ab.radius, ab.damage)
          slashEmitterRef.current?.emit({
            direction: [
              [-1, 1],
              [0, 0],
              [0, 0],
            ],
          })
          eventBus.emit(EVENTS.CAMERA_SHAKE)
        }
        if (ab.elapsed >= ab.duration) {
          abilityState.current = idleAbility()
          backToStance()
        }
        break
      }

      case 'slam': {
        if (ab.elapsed >= ab.duration) {
          abilityState.current = idleAbility()
          dealAbilityDamage(ab.radius, ab.damage)
          eventBus.emit(EVENTS.ABILITY_CAST, 'slam-land', getPlayerWorldPos())
          eventBus.emit(EVENTS.CAMERA_SHAKE)
          sparkEmitterRef.current?.emit({})
          backToStance()
        }
        break
      }

      case 'dashstrike': {
        // Damage everything along the dash path — each enemy hit only once
        const pos = getPlayerWorldPos()
        const newHits = dealDamageInArea(
          pos.x,
          pos.z,
          ab.radius,
          ab.damage,
          'player',
          pos.y + 1,
          ab.hitSet
        )
        for (const id of newHits) ab.hitSet.add(id)
        if (newHits.length > 0) {
          eventBus.emit(EVENTS.CAMERA_SHAKE)
          eventBus.emit(EVENTS.ENEMY_HIT, 'melee')
        }

        if (ab.elapsed >= ab.duration) {
          abilityState.current = idleAbility()
          backToStance()
        }
        break
      }

      case 'flurry': {
        if (ab.hitsLeft > 0 && ab.elapsed >= ab.nextTick) {
          ab.nextTick += ab.tickInterval
          ab.hitsLeft--

          const forward = getForward()
          const pos = getPlayerWorldPos().add(forward.multiplyScalar(FLURRY_REACH))
          hitEntitiesRef.current.clear()
          dealDamageInArea(pos.x, pos.z, ab.radius, ab.damage, 'player', pos.y + 1)

          slashFlipX.value = ab.hitsLeft % 2
          slashEmitterRef.current?.emit({
            direction: [
              [-1, -1],
              [0, 0],
              [0, 0],
            ],
          })
        }
        if (ab.hitsLeft <= 0 && ab.elapsed >= ab.nextTick) {
          abilityState.current = idleAbility()
          backToStance()
        }
        break
      }

      case 'daggerrain': {
        // Ticking AoE at the fixed rain target for the full duration
        if (ab.target && ab.elapsed >= ab.nextTick) {
          ab.nextTick += ab.tickInterval
          dealDamageInArea(ab.target.x, ab.target.z, ab.radius, ab.damage, 'player', 0.5)
        }
        if (ab.elapsed >= ab.duration) {
          abilityState.current = idleAbility()
          backToStance()
        }
        break
      }

      case 'meteor': {
        if (ab.elapsed >= ab.duration && ab.target) {
          abilityState.current = idleAbility()
          dealDamageInArea(ab.target.x, ab.target.z, ab.radius, ab.damage, 'player', 0.5)
          eventBus.emit(EVENTS.ABILITY_CAST, 'meteor-land', ab.target.clone())
          eventBus.emit(EVENTS.CAMERA_SHAKE)
          backToStance()
        }
        break
      }

      case 'cast': {
        if (ab.elapsed >= ab.duration) {
          abilityState.current = idleAbility()
          backToStance()
        }
        break
      }
    }
  }

  useFrame((_, delta) => {
    const s = state.current
    const currentGlow = swordGlowUniform.value
    const buff = getBuff()


    if (abilityTriggered) {
      clearAbilityTrigger()
      tryExecuteAbility(abilityTriggered)
    }

    if (mobilityAnim) {
      clearMobilityAnim()
      playMobility(mobilityAnim.clip, mobilityAnim.timeScale)
    }

    updateAbility(delta)

    // Fire a buffered attack the moment the swing/parry that swallowed the
    // click ends. Cleared without firing if the game froze in between.
    if (s.queuedAttack && !s.isAttacking && !s.isParrying) {
      const queued = s.queuedAttack
      s.queuedAttack = null
      if (!isGameFrozen(useGameStore.getState())) {
        if (queued === 'spin') executeSpinAttack()
        else executeAttack(s.nextAttack)
      }
    }

    if (swordRef2.current && weapon && group.current) {
      group.current.updateWorldMatrix(true, true)
      weapon.getWorldPosition(tmpPos.current)
      weapon.getWorldQuaternion(tmpQuat.current)

      const parent = swordRef2.current.parent
      if (parent) {
        parent.updateWorldMatrix(true, false)
        swordRef2.current.position.copy(parent.worldToLocal(tmpPos.current.clone()))
        parent.getWorldQuaternion(tmpParentQuat.current).invert()
        swordRef2.current.quaternion.copy(tmpParentQuat.current.multiply(tmpQuat.current))
      }
    }

    if (!s.isAttacking && !s.isParrying && !s.isInChargeStance && !s.isMobility) {
      const p = useGameStore.getState().playerPosition
      const speed = prevPlayerPos.current.distanceTo(p) / Math.max(delta, 1e-4)
      prevPlayerPos.current.copy(p)

      const want = speed > RUN_SPEED_THRESHOLD ? anims.run : anims.stance
      if (s.currentAnimation !== want && actions[want]) {
        actions[s.currentAnimation]?.fadeOut(0.15)
        actions[want]?.reset().fadeIn(0.15).play()
        s.currentAnimation = want
        animationParams.current = { speed: 1, clamp: false, loop: true }
      }
    } else {
      prevPlayerPos.current.copy(useGameStore.getState().playerPosition)
    }

    if (s.isParrying) {
      const parryElapsed = Date.now() - s.parryStartTime
      // Mage: the block is a hold — it stays up while RMB is held and only
      // drops on release (past the minimum parry duration). Other classes use
      // the fixed-duration parry.
      const holdActive = characterId === 'mage' && s.rmbHeld
      if (parryElapsed >= PARRY_DURATION_MS && !holdActive) {
        exitParry()
      }
    }

    if (s.isHolding && !s.isAttacking && !s.isParrying) {
      const holdDuration = Date.now() - s.holdStartTime

      if (holdDuration >= CHARGE_DELAY_MS && !s.isInChargeStance) {
        enterChargeStance()
      }

      if (s.isInChargeStance) {
        const chargeTime = holdDuration - CHARGE_DELAY_MS
        const nextProgress = Math.min(1, chargeTime / CHARGE_TIME_MS)
        if (s.chargeProgress < 1 && nextProgress >= 1 && !ranged) {
          eventBus.emit(EVENTS.ABILITY_CAST, 'charge-ready')
        }
        s.chargeProgress = nextProgress
        swordGlowUniform.value = s.chargeProgress
      }
    } else if (s.isAttacking && !ranged) {
      swordGlowUniform.value = 1
      const direction =
        s.nextAttack === anims.attack2
          ? [
              [1, 1],
              [-1, -1],
              [0, 0],
            ]
          : [
              [-1, -1],
              [-1, -1],
              [0, 0],
            ]
      sparkEmitterRef.current?.emit({ direction })

      const swordHitbox = useGameStore.getState().swordHitbox
      const hitboxX = swordHitbox.position.x
      const hitboxY = swordHitbox.position.y
      const hitboxZ = swordHitbox.position.z
      const hitboxRadius = swordHitbox.height * 0.8

      const baseDamage = s.currentAnimation === anims.spinAttack ? SPIN_ATTACK_DAMAGE : ATTACK_DAMAGE
      const damage =
        baseDamage *
        damageMultiplier(useGameStore.getState().skills) *
        (buff?.damageMult ?? 1) *
        gearDamageMult(useGameStore.getState().gear)

      const newHits = dealDamageInArea(
        hitboxX,
        hitboxZ,
        hitboxRadius,
        damage,
        'player',
        hitboxY,
        hitEntitiesRef.current
      )

      for (const hitId of newHits) {
        hitEntitiesRef.current.add(hitId)
      }
      if (newHits.length > 0) eventBus.emit(EVENTS.ENEMY_HIT, 'melee')
    } else if (!s.isParrying) {
      swordGlowUniform.value = buff ? 1 : THREE.MathUtils.lerp(currentGlow, 0, delta * 12)
    }
  })

  return {
    onMouseDown,
    onMouseUp,
    onRightClick,
    onRightRelease,
    isAttacking: state.current.isAttacking,
  }
}
