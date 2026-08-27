import * as THREE from 'three'
import { Quaternion, Vector3, Vector2, Plane, Raycaster, Group, Euler } from 'three/webgpu'
import { OrthographicCamera, useKeyboardControls } from '@react-three/drei'
import { useRef, useEffect, Suspense } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { useGameStore, isGameFrozen } from './store'
import { Caps } from './caps/index'
import type { CapsHandle } from './caps/index'
import { VFXEmitter } from './components/particles'
import { mobilitySparksName } from './components/particles/mobility'
import { useVFXStore } from 'r3f-vfx'
import { resolvePosition, useCollisionStore, Layer } from './collision'
import { eventBus, EVENTS } from './constants'
import { ARENA_BOUND } from './components/arena'
import { dashCooldownMultiplier } from './game/skills'
import { gearDashCdMult, gearSpeedMult } from './game/gear'
import { CHARACTERS, CHARACTER_LIST, type CharacterId } from './game/characters'
import { touchMove, resetTouchMove } from './game/touch'
import { registerPlayerObject } from './replay/rigRegistry'

/** Below this stick magnitude the player stands still */
const TOUCH_DEADZONE = 0.22

const PLAYER_RADIUS = 0.4
const PLAYER_ID = 'player'

// Scratch objects for player-relative aim raycasts (avoid per-frame allocs)
const aimRaycaster = new Raycaster()
const aimNdc = new Vector2()
const aimPlane = new Plane(new Vector3(0, 1, 0), 0)
const aimHit = new Vector3()
/** Clicks within ~12px of the player keep the current facing (anti-jitter
 *  only — anything larger pins a stale facing when the camera re-settles) */
const AIM_DEADZONE_SQ = 0.15 * 0.15

// Cursor position tracked in raw client coords. R3F's state.pointer computes
// NDC from event offsetX/offsetY, which are relative to the event TARGET —
// any DOM overlay under the cursor (floating combat text, tooltips) silently
// corrupts it and snaps player aim to a garbage direction. Client coords +
// the canvas rect are immune to that.
const clientAim = { x: 0, y: 0, has: false }

export const PlayerController = () => {
  const playerRef = useRef<Group>(null)
  const velocity = useRef(new Vector3())
  const cameraRef = useRef<THREE.OrthographicCamera>(null)
  const capsRef = useRef<CapsHandle>(null)
  const scratchVec3 = useRef(new Vector3())
  const scratchQuat = useRef(new Quaternion())
  const scratchEuler = useRef(new Euler())

  // Hide the live player while a saved-replay ghost is performing (external
  // playback) so the two rigs don't overlap.
  const hideLivePlayer = useGameStore(
    (s) => s.replayPhase === 'playback' && s.replayExternal
  )
  useEffect(() => {
    if (playerRef.current) playerRef.current.visible = !hideLivePlayer
  }, [hideLivePlayer])

  // Set while replay playback owns the camera; cleared (with a full camera
  // restore) on the first gameplay frame after exit.
  const wasReplayPlayback = useRef(false)

  // Register player collider on mount
  const registerCollider = useCollisionStore((s) => s.registerCollider)
  const unregisterCollider = useCollisionStore((s) => s.unregisterCollider)
  const updateCollider = useCollisionStore((s) => s.updateCollider)

  // Ortho zoom is px-per-unit: at 80 a 390px phone sees < 5 world units —
  // impossible to read boss telegraphs. Scale zoom so narrow viewports
  // still see ~16 units across.
  const viewportSize = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)

  // Track the real cursor in client coordinates (see clientAim above)
  useEffect(() => {
    const track = (e: PointerEvent) => {
      clientAim.x = e.clientX
      clientAim.y = e.clientY
      clientAim.has = true
    }
    window.addEventListener('pointermove', track)
    window.addEventListener('pointerdown', track)
    return () => {
      window.removeEventListener('pointermove', track)
      window.removeEventListener('pointerdown', track)
    }
  }, [])

  /** Cursor NDC computed from client coords against the canvas rect. */
  const getAimNdc = (): Vector2 | null => {
    if (!clientAim.has) return null
    const rect = gl.domElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    aimNdc.set(
      ((clientAim.x - rect.left) / rect.width) * 2 - 1,
      -(((clientAim.y - rect.top) / rect.height) * 2 - 1)
    )
    return aimNdc
  }
  useEffect(() => {
    const cam = cameraRef.current
    if (!cam) return
    cam.zoom = Math.min(80, Math.max(viewportSize.width, 320) / 16)
    cam.updateProjectionMatrix()
  }, [viewportSize])

  useEffect(() => {
    registerCollider({
      id: PLAYER_ID,
      x: 0,
      z: 0,
      radius: PLAYER_RADIUS,
      solid: true,
      layer: Layer.PLAYER,
    })
    return () => unregisterCollider(PLAYER_ID)
  }, [])

  // Movement — base 4.5 u/s, scaled by the class's own speed stat
  // (knight 1.0 / barbarian 0.85 / rogue 1.15 / mage 0.95)
  const BASE_SPEED = 4.5
  const speedMultiplier = useRef(1)
  const isDashing = useRef(false)
  const dashDelay = useRef(0)

  // Double-tap dodge tracking
  const DOUBLE_TAP_THRESHOLD = 300 // ms
  const lastKeyPressTime = useRef<Record<string, number>>({})
  const keyIsDown = useRef<Record<string, boolean>>({})
  const dodgeCooldown = useRef(0)
  const DODGE_COOLDOWN = 500 // ms between dodges

  // Keyboard
  const [, get] = useKeyboardControls()
  const mobilitySparksRef = useRef<any>(null)
  // One emitter per class pool (see the JSX below); route the shared ref to
  // the current class's emitter instead of remounting on switch.
  const mobilityEmitters = useRef<Partial<Record<CharacterId, any>>>({})

  // Per-class mobility spark pool (accents on top of the MobilityFX shaders)
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  useEffect(() => {
    mobilitySparksRef.current = mobilityEmitters.current[selectedCharacter] ?? null
  }, [selectedCharacter])

  // Store state
  const isCharging = useGameStore((s) => s.isCharging)
  const isSpinAttacking = useGameStore((s) => s.isSpinAttacking)
  const isParrying = useGameStore((s) => s.isParrying)
  const setDashing = useGameStore((s) => s.setDashing)
  const spinAttackTriggered = useGameStore((s) => s.spinAttackTriggered)
  const clearSpinAttack = useGameStore((s) => s.clearSpinAttack)
  const dashAttackTriggered = useGameStore((s) => s.dashAttackTriggered)
  const clearDashAttack = useGameStore((s) => s.clearDashAttack)
  const attackDashTriggered = useGameStore((s) => s.attackDashTriggered)
  const clearAttackDash = useGameStore((s) => s.clearAttackDash)
  const isAttackDashing = useGameStore((s) => s.isAttackDashing)
  const setAttackDashing = useGameStore((s) => s.setAttackDashing)

  // Camera shake - subtle rotation on hit (once per slash)
  const baseRotation = useRef({ x: -Math.PI / 4, y: 0 })
  const hasShakenThisAttack = useRef(false)

  const cameraShake = () => {
    if (!cameraRef.current || hasShakenThisAttack.current) return
    if (!useGameStore.getState().settings.cameraShake) return
    hasShakenThisAttack.current = true

    const intensity = 0.03
    const rx = (Math.random() - 0.5) * intensity
    const ry = (Math.random() - 0.5) * intensity

    gsap.to(cameraRef.current.rotation, {
      x: baseRotation.current.x + rx,
      y: baseRotation.current.y + ry,
      duration: 0.03,
      ease: 'power2.out',
    })
  }

  const resetCameraRotation = () => {
    if (!cameraRef.current) return
    hasShakenThisAttack.current = false
    gsap.to(cameraRef.current.rotation, {
      x: baseRotation.current.x,
      y: baseRotation.current.y,
      duration: 0.03,
      ease: 'power2.out',
    })
  }

  // Listen to camera shake events
  useEffect(() => {
    eventBus.on(EVENTS.CAMERA_SHAKE, cameraShake)
    eventBus.on(EVENTS.ATTACK_END, resetCameraRotation)
    return () => {
      eventBus.off(EVENTS.CAMERA_SHAKE, cameraShake)
      eventBus.off(EVENTS.ATTACK_END, resetCameraRotation)
    }
  }, [])

  // Core dash function - reusable and parameterizable
  type DashConfig = {
    direction?: Vector3 // defaults to player's forward direction
    distance: number
    duration: number
    ease?: string // defaults to "power2.out"
    cooldown?: number // if set, applies cooldown after dash
    /** Leap: arc the Y position up to this height and back over the dash */
    arcHeight?: number
    /** Fired when the dash (and arc) completes — used for leap landing */
    onLand?: () => void
    onStart?: () => void
    onComplete?: () => void
    skipIfDashing?: boolean // defaults to true
    isDodge?: boolean
  }

  const dash = (config: DashConfig) => {
    const {
      direction,
      distance,
      duration,
      ease = 'power2.out',
      cooldown,
      arcHeight,
      onLand,
      onStart,
      onComplete,
      skipIfDashing = true,
      isDodge = false,
    } = config

    if (!playerRef.current) return
    if (skipIfDashing && isDashing.current) return
    if (cooldown !== undefined && dashDelay.current > 0) return
    isDodge && mobilitySparksRef.current?.start()

    const dir = direction ?? playerRef.current.getWorldDirection(scratchVec3.current)
    if (dir.length() === 0) return

    isDashing.current = true
    setDashing(true)
    onStart?.()

    const target = scratchVec3.current.copy(playerRef.current.position).add(dir.normalize().multiplyScalar(distance))

    const tweenVars: gsap.TweenVars = {
      x: target.x,
      z: target.z,
      duration,
      ease,
      onComplete: () => {
        isDashing.current = false
        setDashing(false)
        if (cooldown !== undefined) dashDelay.current = cooldown
        mobilitySparksRef.current?.stop()
        onLand?.()
        onComplete?.()
      },
    }
    // Flat dashes tween Y to the ground — never to the current height.
    // Capturing target.y mid-leap pinned the player at the arc peak (2.2)
    // forever whenever a spin/dash attack landed during the leap.
    if (!arcHeight) tweenVars.y = 0
    gsap.to(playerRef.current.position, tweenVars)

    if (arcHeight) {
      gsap
        .timeline()
        .to(playerRef.current.position, {
          y: arcHeight,
          duration: duration * 0.45,
          ease: 'power2.out',
        })
        .to(playerRef.current.position, {
          y: 0,
          duration: duration * 0.55,
          ease: 'power3.in',
        })
    }
  }

  // Specific dash presets using the core function
  const spinAttackDash = (direction: Vector3, distance: number) => {
    dash({
      direction,
      distance,
      duration: 0.4,
      ease: 'power3.in',
      skipIfDashing: false,
    })
  }

  const attackDash = (distance: number, duration: number) => {
    dash({
      distance,
      duration,
      onStart: () => setAttackDashing(true),
      onComplete: () => setAttackDashing(false),
    })
  }

  const dashTo = (direction: Vector3) => {
    const store = useGameStore.getState()
    const sparksName = mobilitySparksName(store.selectedCharacter)
    const mob = CHARACTERS[store.selectedCharacter].mobility
    const cooldown =
      mob.cooldown * dashCooldownMultiplier(store.skills) * gearDashCdMult(store.gear)

    // Play the class's mobility animation (visual layer, never blocks combat)
    store.triggerMobilityAnim(mob.anim, mob.animSpeed)

    switch (mob.behavior) {
      case 'blink': {
        // Instant teleport — no travel time, rings at both ends
        if (!playerRef.current || isDashing.current || dashDelay.current > 0) return
        const origin = playerRef.current.position.clone()
        const raw = origin.clone().add(direction.clone().normalize().multiplyScalar(mob.distance))
        const resolved = resolvePosition(origin.x, origin.z, raw.x, raw.z, PLAYER_RADIUS, PLAYER_ID)
        const tx = THREE.MathUtils.clamp(resolved.x, -ARENA_BOUND, ARENA_BOUND)
        const tz = THREE.MathUtils.clamp(resolved.z, -ARENA_BOUND, ARENA_BOUND)

        eventBus.emit(EVENTS.ABILITY_CAST, 'blink-out', origin)
        playerRef.current.position.set(tx, origin.y, tz)
        updateCollider(PLAYER_ID, tx, tz)
        eventBus.emit(EVENTS.ABILITY_CAST, 'blink-in', playerRef.current.position.clone())

        // Arcane beam pillars at both ends + mote accents
        eventBus.emit(EVENTS.MOBILITY_CAST, {
          kind: 'blink',
          ox: origin.x,
          oz: origin.z,
          dx: tx,
          dz: tz,
          durationMs: 0,
        })
        const vfx = useVFXStore.getState()
        vfx.emit(sparksName, { x: origin.x, y: 0.6, z: origin.z, count: 14, overrides: null })
        vfx.emit(sparksName, { x: tx, y: 0.6, z: tz, count: 14, overrides: null })

        // Brief dash window so blink → attack still counts as a dash attack
        isDashing.current = true
        setDashing(true)
        dashDelay.current = cooldown
        window.setTimeout(() => {
          isDashing.current = false
          setDashing(false)
        }, 150)
        break
      }

      case 'leap': {
        const o = playerRef.current?.position
        const nd = direction.clone().normalize()
        dash({
          direction,
          distance: mob.distance,
          duration: mob.duration,
          ease: 'power1.inOut',
          cooldown,
          isDodge: true,
          arcHeight: 2.2,
          onStart: () => {
            if (!o) return
            eventBus.emit(EVENTS.MOBILITY_CAST, {
              kind: 'leap',
              ox: o.x,
              oz: o.z,
              dx: o.x + nd.x * mob.distance,
              dz: o.z + nd.z * mob.distance,
              durationMs: mob.duration * 1000,
            })
          },
          onLand: () => {
            const p = playerRef.current!.position
            eventBus.emit(EVENTS.ABILITY_CAST, 'leap-land', p.clone())
            // Ember shower on impact
            useVFXStore
              .getState()
              .emit(sparksName, { x: p.x, y: 0.3, z: p.z, count: 18, overrides: null })
            eventBus.emit(EVENTS.CAMERA_SHAKE)
          },
        })
        break
      }

      case 'shadowstep': {
        // Longer, faster burst with an evasion window
        store.setEvading(true)
        window.setTimeout(
          () => useGameStore.getState().setEvading(false),
          mob.evadeMs ?? 300
        )
        eventBus.emit(EVENTS.ABILITY_CAST, 'shadowstep', playerRef.current!.position.clone())
        const o = playerRef.current?.position
        const nd = direction.clone().normalize()
        dash({
          direction,
          distance: mob.distance,
          duration: mob.duration,
          cooldown,
          isDodge: true,
          onStart: () => {
            if (!o) return
            eventBus.emit(EVENTS.MOBILITY_CAST, {
              kind: 'shadowstep',
              ox: o.x,
              oz: o.z,
              dx: o.x + nd.x * mob.distance,
              dz: o.z + nd.z * mob.distance,
              durationMs: mob.duration * 1000,
            })
          },
        })
        break
      }

      default: {
        const o = playerRef.current?.position
        const nd = direction.clone().normalize()
        dash({
          direction,
          distance: mob.distance,
          duration: mob.duration,
          cooldown,
          isDodge: true,
          onStart: () => {
            if (!o) return
            eventBus.emit(EVENTS.MOBILITY_CAST, {
              kind: 'dash',
              ox: o.x,
              oz: o.z,
              dx: o.x + nd.x * mob.distance,
              dz: o.z + nd.z * mob.distance,
              durationMs: mob.duration * 1000,
            })
          },
        })
        break
      }
    }
  }

  const updateCamera = (delta: number) => {
    if (!playerRef.current || !cameraRef.current) return
    const { x, y, z } = playerRef.current.position
    scratchVec3.current.set(x, y + 6, z + 5)
    cameraRef.current.position.lerp(scratchVec3.current, 4 * delta)
  }

  const updateVelocity = () => {
    // Touch: analog stick wins over the keyboard when it's engaged
    if (useGameStore.getState().touchMode && touchMove.active) {
      if (touchMove.magnitude < TOUCH_DEADZONE) {
        velocity.current.set(0, 0, 0)
      } else {
        // Not normalized — stick magnitude = analog walk/run speed
        velocity.current.set(touchMove.x, 0, touchMove.y)
      }
      return
    }
    const { up, down, left, right } = get()
    velocity.current.x = Number(right) - Number(left)
    velocity.current.z = Number(down) - Number(up)
    velocity.current.y = 0
    velocity.current.normalize()
  }

  const updatePlayerPosition = (delta: number) => {
    if (!playerRef.current || isDashing.current) return
    const effectiveSpeed =
      BASE_SPEED *
      CHARACTERS[useGameStore.getState().selectedCharacter].speed *
      speedMultiplier.current *
      gearSpeedMult(useGameStore.getState().gear)

    const currentPos = playerRef.current.position
    const movement = velocity.current.clone().multiplyScalar(delta * effectiveSpeed)
    const targetX = currentPos.x + movement.x
    const targetZ = currentPos.z + movement.z

    // Resolve solid collisions using the store
    const resolved = resolvePosition(
      currentPos.x,
      currentPos.z,
      targetX,
      targetZ,
      PLAYER_RADIUS,
      PLAYER_ID
    )

    // Clamp to arena walls
    playerRef.current.position.x = THREE.MathUtils.clamp(resolved.x, -ARENA_BOUND, ARENA_BOUND)
    playerRef.current.position.z = THREE.MathUtils.clamp(resolved.z, -ARENA_BOUND, ARENA_BOUND)

    // Update our collider position in the store
    updateCollider(PLAYER_ID, playerRef.current.position.x, playerRef.current.position.z)
  }

  const updatePlayerRotation = (delta: number) => {
    if (!playerRef.current) return

    // Touch: no persistent cursor — face the run direction, hold facing when idle
    if (useGameStore.getState().touchMode) {
      if (velocity.current.lengthSq() > 0.04) {
        const yaw = Math.atan2(velocity.current.x, velocity.current.z)
        scratchQuat.current.setFromEuler(scratchEuler.current.set(0, yaw, 0))
        playerRef.current.quaternion.slerp(scratchQuat.current, delta * 12)
      }
      return
    }

    // Aim from the PLAYER, not screen center: camera-follow lag leaves the
    // player off-center, and the attack lunge shoves it further — with
    // center-relative aim the cursor ends up behind the player and facing
    // snaps 180° on every melee hit. Raycast the cursor onto the ground and
    // face the hit point relative to the player's actual position.
    if (!cameraRef.current) return
    const ndc = getAimNdc()
    if (!ndc) return
    aimRaycaster.setFromCamera(ndc, cameraRef.current)
    aimPlane.constant = -playerRef.current.position.y
    if (!aimRaycaster.ray.intersectPlane(aimPlane, aimHit)) return
    const dx = aimHit.x - playerRef.current.position.x
    const dz = aimHit.z - playerRef.current.position.z
    if (dx * dx + dz * dz < AIM_DEADZONE_SQ) return
    scratchQuat.current.setFromEuler(scratchEuler.current.set(0, Math.atan2(dx, dz), 0))
    playerRef.current.quaternion.slerp(scratchQuat.current, delta * 10)
  }

  // Input handlers
  useEffect(() => {
    // Expose the player rig's root to the replay recorder
    registerPlayerObject(playerRef.current)
    const getDodgeDirection = (key: string): Vector3 | null => {
      const store = useGameStore.getState()
      if (isGameFrozen(store)) return null
      const char = CHARACTERS[store.selectedCharacter]
      const distance = char.mobility.distance * 0.5 // Half of shift dash
      const duration = Math.max(0.08, char.mobility.duration * 0.5) // Rapid

      switch (key) {
        case 'KeyA':
          // Dodge left (strafe left)
          scratchVec3.current.set(-distance, 0, 0)
          return scratchVec3.current
        case 'KeyS':
          // Dodge backward
          const backward = playerRef.current?.getWorldDirection(scratchVec3.current) ?? scratchVec3.current.set(0, 0, -1)
          backward.multiplyScalar(-distance)
          return backward
        case 'KeyD':
          // Dodge right (strafe right)
          scratchVec3.current.set(distance, 0, 0)
          return scratchVec3.current
        default:
          return null
      }
    }

    const performDodge = () => {
      const store = useGameStore.getState()
      if (isGameFrozen(store)) return
      const dashDir =
        velocity.current.length() > 0
          ? velocity.current.clone()
          : (playerRef.current?.getWorldDirection(scratchVec3.current) ?? scratchVec3.current.set(0, 0, -1))
      dashTo(dashDir)
    }

    const performDoubleTapDodge = (key: string) => {
      const store = useGameStore.getState()
      if (isGameFrozen(store)) return
      if (!playerRef.current) return
      if (dodgeCooldown.current > 0) return
      if (isDashing.current) return

      // Ignore key repeat - only count the initial keydown
      if (keyIsDown.current[key]) return
      keyIsDown.current[key] = true

      const now = performance.now()
      const lastPress = lastKeyPressTime.current[key] || 0
      lastKeyPressTime.current[key] = now

      if (now - lastPress < DOUBLE_TAP_THRESHOLD) {
        // Double tap detected!
        const dodgeDir = getDodgeDirection(key)
        if (dodgeDir) {
          dodgeCooldown.current = DODGE_COOLDOWN
          const store = useGameStore.getState()
          const char = CHARACTERS[store.selectedCharacter]
          const distance = char.mobility.distance * 0.5
          const duration = Math.max(0.08, char.mobility.duration * 0.5)
          const o = playerRef.current?.position.clone()
          const nd = dodgeDir.clone().normalize()

          // Trigger dodge VFX
          dash({
            direction: dodgeDir,
            distance,
            duration,
            isDodge: true,
            onStart: () => {
              if (!o) return
              eventBus.emit(EVENTS.MOBILITY_CAST, {
                kind: 'dash',
                ox: o.x,
                oz: o.z,
                dx: o.x + nd.x * distance,
                dz: o.z + nd.z * distance,
                durationMs: duration * 1000,
              })
            },
          })

          // Clear dodge cooldown
          window.setTimeout(() => {
            dodgeCooldown.current = 0
          }, DODGE_COOLDOWN)
        }
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const store = useGameStore.getState()

      // F8 / Esc-in-playback are handled globally in ReplayHUD — that listener
      // lives outside the Canvas so a WebGL context loss can't detach it.

      // Talent tree toggle (in-game only; menus have their own buttons)
      if (e.code === 'Tab' || e.code === 'KeyK') {
        e.preventDefault()
        if (store.gamePhase !== 'menu' && !store.playerDead && !store.gameWon) {
          store.setSkillTreeOpen(!store.skillTreeOpen)
        }
        return
      }

      // Loadout sheet toggle (character + gear)
      if (e.code === 'KeyC') {
        if (store.gamePhase !== 'menu' && !store.playerDead && !store.gameWon) {
          store.setLoadoutOpen(!store.loadoutOpen)
        }
        return
      }

      // Escape: close topmost overlay, otherwise pause / resume
      if (e.code === 'Escape') {
        if (store.loadoutOpen) store.setLoadoutOpen(false)
        else if (store.skillTreeOpen) store.setSkillTreeOpen(false)
        else if (store.settingsOpen) store.setSettingsOpen(false)
        else if (store.gamePhase === 'playing' && !store.playerDead && !store.gameWon)
          store.setGamePhase('paused')
        else if (store.gamePhase === 'paused') store.setGamePhase('playing')
        return
      }

      // Frozen while menus are open / dead / game won / not playing
      if (isGameFrozen(store)) return

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') performDodge()


      // Double-tap dodge with A, S, D
      if (e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD') {
        performDoubleTapDodge(e.code)
      }
      // Abilities — slots map to the selected class's kit
      if (e.code === 'Digit1') store.triggerAbility('slot1')
      if (e.code === 'Digit2') store.triggerAbility('slot2')
      if (e.code === 'Digit3') store.triggerAbility('slot3')
      if (e.code === 'Digit4') store.triggerAbility('slot4')
    }

    const handleMouseDown = (e: MouseEvent) => {
      const store = useGameStore.getState()
      if (isGameFrozen(store)) return
      if (e.button === 0) capsRef.current?.onMouseDown()
      if (e.button === 2) capsRef.current?.onRightClick()
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD') {
        keyIsDown.current[e.code] = false
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) capsRef.current?.onMouseUp()
      if (e.button === 2) capsRef.current?.onRightRelease()
    }
    // Releasing LMB outside the browser window never delivers mouseup, which
    // latches isCharging and pins movement speed to 0. Same for the mage's
    // hold-to-block RMB. Blur is the reliable signal that a release was missed.
    const handleWindowBlur = () => {
      capsRef.current?.onMouseUp()
      capsRef.current?.onRightRelease()
    }
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()

    // Touch buttons route through the same paths as mouse/shift
    const onTouchDash = () => performDodge()
    const onTouchAttackStart = () => {
      if (isGameFrozen(useGameStore.getState())) return
      capsRef.current?.onMouseDown()
    }
    const onTouchAttackEnd = () => capsRef.current?.onMouseUp()
    const onTouchBlockStart = () => {
      if (isGameFrozen(useGameStore.getState())) return
      capsRef.current?.onRightClick()
    }
    const onTouchBlockEnd = () => capsRef.current?.onRightRelease()

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('contextmenu', handleContextMenu)
    eventBus.on(EVENTS.TOUCH_DASH, onTouchDash)
    eventBus.on(EVENTS.TOUCH_ATTACK_START, onTouchAttackStart)
    eventBus.on(EVENTS.TOUCH_ATTACK_END, onTouchAttackEnd)
    eventBus.on(EVENTS.TOUCH_BLOCK_START, onTouchBlockStart)
    eventBus.on(EVENTS.TOUCH_BLOCK_END, onTouchBlockEnd)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('contextmenu', handleContextMenu)
      eventBus.off(EVENTS.TOUCH_DASH, onTouchDash)
      eventBus.off(EVENTS.TOUCH_ATTACK_START, onTouchAttackStart)
      eventBus.off(EVENTS.TOUCH_ATTACK_END, onTouchAttackEnd)
      eventBus.off(EVENTS.TOUCH_BLOCK_START, onTouchBlockStart)
      eventBus.off(EVENTS.TOUCH_BLOCK_END, onTouchBlockEnd)
      resetTouchMove()
      registerPlayerObject(null)
    }
  }, [])

  // Game loop
  useFrame(({ delta }) => {
    if (!playerRef.current || !cameraRef.current) return

    const uiState = useGameStore.getState()

    // Replay playback owns the scene and the camera — hands off entirely
    if (uiState.replayPhase === 'playback') {
      wasReplayPlayback.current = true
      return
    }
    // Exiting replay: ReplayCamera stomped rotation + zoom and updateCamera
    // only ever restores position — snap ALL THREE back to gameplay framing.
    if (wasReplayPlayback.current) {
      wasReplayPlayback.current = false
      const cam = cameraRef.current
      const p = playerRef.current.position
      cam.position.set(p.x, p.y + 6, p.z + 5)
      cam.rotation.set(-Math.PI / 4, 0, 0)
      cam.zoom = Math.min(80, Math.max(viewportSize.width, 320) / 16)
      cam.updateProjectionMatrix()
    }

    // Frozen while menus are open / dead / game won / not playing
    if (isGameFrozen(uiState)) {
      updateCamera(delta)
      return
    }

    // Speed multiplier: slow down when charging, spin attacking, parrying, or attack dashing
    const shouldSlowDown = isCharging || isSpinAttacking || isParrying || isAttackDashing
    if (shouldSlowDown) {
      // Smooth, gradual slowdown (instant for attack dash)
      const lerpSpeed = isAttackDashing ? 20 : 3
      speedMultiplier.current = THREE.MathUtils.lerp(speedMultiplier.current, 0, delta * lerpSpeed)
    } else {
      speedMultiplier.current = THREE.MathUtils.lerp(speedMultiplier.current, 1, delta * 6)
    }

    // Trigger spin attack dash
    if (spinAttackTriggered) {
      clearSpinAttack()
      const dashDir = playerRef.current.getWorldDirection(scratchVec3.current)
      spinAttackDash(dashDir, 6)
    }

    // Trigger dash attack dash (like spin attack)
    if (dashAttackTriggered) {
      clearDashAttack()
      const dashDir = playerRef.current.getWorldDirection(scratchVec3.current)
      spinAttackDash(dashDir, 3) // Longer dash for dash attack
    }

    // Trigger attack dash — capped so the lunge never overshoots the aim
    // point. Clicking an adjacent enemy used to carry the player past the
    // cursor, flipping facing 180° on every hit.
    if (attackDashTriggered) {
      const { distance, duration } = attackDashTriggered
      clearAttackDash()
      let capped = distance
      const ndc = getAimNdc()
      if (cameraRef.current && ndc) {
        aimRaycaster.setFromCamera(ndc, cameraRef.current)
        aimPlane.constant = -playerRef.current.position.y
        if (aimRaycaster.ray.intersectPlane(aimPlane, aimHit)) {
          const aimDist = Math.hypot(
            aimHit.x - playerRef.current.position.x,
            aimHit.z - playerRef.current.position.z
          )
          // Stop ~half a unit short of the cursor (melee contact range)
          capped = Math.min(distance, Math.max(0, aimDist - 0.5))
        }
      }
      if (capped > 0.05) attackDash(capped, duration)
    }

    updateCamera(delta)
    updateVelocity()
    updatePlayerPosition(delta)
    updatePlayerRotation(delta)

    // Dashes tween the position directly — keep them inside the arena too
    const px = THREE.MathUtils.clamp(playerRef.current.position.x, -ARENA_BOUND, ARENA_BOUND)
    const pz = THREE.MathUtils.clamp(playerRef.current.position.z, -ARENA_BOUND, ARENA_BOUND)
    if (px !== playerRef.current.position.x || pz !== playerRef.current.position.z) {
      playerRef.current.position.x = px
      playerRef.current.position.z = pz
      updateCollider(PLAYER_ID, px, pz)
    }

    // Grounding safety net: once no dash/leap tween is active, settle back to
    // ground level. A flat dash fired mid-leap can outlive the arc tween and
    // otherwise leaves the player floating at the captured arc height.
    if (!isDashing.current && playerRef.current.position.y !== 0) {
      const gy = THREE.MathUtils.damp(playerRef.current.position.y, 0, 12, delta)
      playerRef.current.position.y = Math.abs(gy) < 0.01 ? 0 : gy
    }

    dashDelay.current -= delta
  })

  return (
    <>
      <OrthographicCamera
        ref={cameraRef}
        makeDefault
        position={[10, 20, 0]}
        rotation={[-Math.PI / 4, 0, 0]}
        zoom={80}
        near={0.1}
        far={60}
      />

      <group ref={playerRef}>
        {/* Caps loads the hero GLB; keep that Suspense local so the
            controller (camera + movement) never suspends with it. */}
        <Suspense fallback={null}>
          <Caps ref={capsRef} />
        </Suspense>
        {/* One emitter per class pool, mounted permanently. A keyed remount
            here disposed GPU buffers the compute pipeline still referenced
            and froze the whole WebGPU canvas on character switch. */}
        {CHARACTER_LIST.map((id) => (
          <VFXEmitter
            key={id}
            position={[0, 0.1, 0]}
            localDirection={true}
            ref={(r) => {
              mobilityEmitters.current[id] = r
            }}
            name={mobilitySparksName(id)}
            emitCount={4}
            autoStart={false}
          />
        ))}
      </group>
    </>
  )
}
