import * as THREE from 'three'
import gsap from 'gsap'
import { useVFXStore } from 'r3f-vfx'
import { world } from '@/ecs'
import { IsEnemy, MeshRef, MobType as MobTrait } from '@/ecs/enemy/traits'
import { eventBus, EVENTS } from '@/constants'
import { useGameStore } from '@/store'
import { combatTextApi } from '@/components/combatText'
import { setAudioRecorder, sfx, playSting, playTrack, LEVEL_TRACKS, type TrackKey } from '@/game/audio'
import {
  getPools,
  getRigs,
  getGhosts,
  getPlayerObject,
  enemyRigId,
  ghostEnemyId,
  GHOST_PLAYER_ID,
  PLAYER_RIG_ID,
  type RigEntry,
} from './rigRegistry'

// ============================================================================
// Record & replay session (trailer capture).
//
// Deterministic input-replay is impossible in this codebase (unseeded RNG in
// damage/AI/spawns, Date.now()/setTimeout timers, GSAP-owned transforms), so
// we record per-frame SNAPSHOTS at 30 Hz: player/enemy transforms, dominant
// animation clip + time per rig, projectile pool matrices — plus a COMPLETE
// FX/audio log: every particle spawn (slash trails, sparks, mobility bursts —
// all funnel through each system's `spawn`), every SFX/sting, and damage
// text. Playback re-fires the log exactly; live particle emission is
// suppressed during playback so nothing double-fires.
//
// Recordings serialize to a .json file (Save) and can be loaded back later
// (Load, from the main menu). Loaded recordings play through standalone
// "ghost" rigs since the recorded actors no longer exist.
// ============================================================================

const CAPTURE_INTERVAL = 1 / 30
const FILE_VERSION = 2

type RigPose = { clip: string; time: number }

type EnemySnap = {
  id: string
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
  anim: RigPose | null
}

type PoolSnap = { name: string; count: number; matrices: Float32Array }

type FrameSnap = {
  t: number
  px: number
  py: number
  pz: number
  pqx: number
  pqy: number
  pqz: number
  pqw: number
  playerAnim: RigPose | null
  enemies: EnemySnap[]
  pools: PoolSnap[]
}

type FxEntry =
  | { t: number; kind: 'spawn'; name: string; x: number; y: number; z: number; count: number; overrides: Record<string, unknown> | null }
  | { t: number; kind: 'sfx'; name: string; opts: { volume?: number; rate?: number; vary?: number } }
  | { t: number; kind: 'sting'; key: string }
  | { t: number; kind: 'dmg'; payload: Record<string, unknown> }

type RecordingMeta = {
  characterId: string
  level: number
  enemies: Record<string, string> // entity id -> mob type
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let frames: FrameSnap[] = []
let fx: FxEntry[] = []
let meta: RecordingMeta = { characterId: 'knight', level: 0, enemies: {} }
let recTime = 0
let lastCapture = -Infinity
let recording = false
let external = false
let duration = 0
let playhead = 0
let fxCursor = 0
let lastEmitT = 0
let resumeSnap: FrameSnap | null = null

/** Live playback lookup: entity id -> mesh + rig (captured at playback start) */
let playbackEnemies = new Map<string, { mesh: THREE.Object3D; rig: RigEntry | null }>()

// ---------------------------------------------------------------------------
// Particle spawn taps — EVERY emission (store emit, emitter ref, auto-loop)
// ends in a system's spawn(x, y, z, count, overrides). Wrapping those covers
// slash trails and every other effect the old store-level tap missed.
// ---------------------------------------------------------------------------

type SpawnFn = (x: number, y: number, z: number, count: number, overrides?: Record<string, unknown> | null) => unknown
const origSpawns = new Map<string, SpawnFn>()
const tappedSystems = new Set<object>()

const ensureSpawnTaps = () => {
  const particles = (useVFXStore.getState() as unknown as { particles: Record<string, { spawn?: SpawnFn }> }).particles ?? {}
  for (const [name, sys] of Object.entries(particles)) {
    if (!sys?.spawn || tappedSystems.has(sys)) continue
    tappedSystems.add(sys)
    const orig = sys.spawn.bind(sys) as SpawnFn
    origSpawns.set(name, orig)
    sys.spawn = ((x: number, y: number, z: number, count: number, overrides?: Record<string, unknown> | null) => {
      if (recording) {
        fx.push({ t: recTime, kind: 'spawn', name, x, y, z, count, overrides: overrides ? { ...overrides } : null })
      } else if (useGameStore.getState().replayPhase === 'playback') {
        // Playback must show ONLY the recorded emissions — suppress live ones
        return undefined
      }
      return orig(x, y, z, count, overrides)
    }) as SpawnFn
  }
}

// SFX + sting tap (installed once; gates on the recording flag)
setAudioRecorder((entry) => {
  if (!recording) return
  if (entry.kind === 'sfx') fx.push({ t: recTime, kind: 'sfx', name: entry.name, opts: { ...entry.opts } })
  else fx.push({ t: recTime, kind: 'sting', key: entry.key })
})

// Damage text rides the event bus — log it while recording
eventBus.on(EVENTS.DAMAGE_TEXT, (p: Record<string, unknown>) => {
  if (recording) fx.push({ t: recTime, kind: 'dmg', payload: { ...p } })
})

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/** The visually dominant action on a rig: highest effective weight, even if
 *  it's a clamped LoopOnce that already finished (that's still the pose). */
const dominantAnim = (rig: RigEntry): RigPose | null => {
  let best: THREE.AnimationAction | null = null
  let bestW = 0
  for (const a of (rig.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions) {
    const w = a.getEffectiveWeight()
    if (w > bestW && a.enabled) {
      best = a
      bestW = w
    }
  }
  if (!best) return null
  return { clip: best.getClip().name, time: best.time }
}

const captureFrame = (t: number): FrameSnap => {
  ensureSpawnTaps()
  const rigs = getRigs()
  const player = getPlayerObject()

  const enemies: EnemySnap[] = []
  for (const e of world.query(IsEnemy)) {
    const mesh = e.get(MeshRef)?.current
    if (!mesh) continue
    const id = String(e.id())
    if (!meta.enemies[id]) meta.enemies[id] = e.get(MobTrait)?.value ?? 'mage'
    const rig = rigs.get(enemyRigId(id))
    enemies.push({
      id,
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
      qx: mesh.quaternion.x,
      qy: mesh.quaternion.y,
      qz: mesh.quaternion.z,
      qw: mesh.quaternion.w,
      anim: rig ? dominantAnim(rig) : null,
    })
  }

  const pools: PoolSnap[] = []
  for (const [name, getMesh] of getPools()) {
    const mesh = getMesh()
    if (!mesh) continue
    pools.push({
      name,
      count: mesh.count,
      matrices: (mesh.instanceMatrix.array as Float32Array).slice(0, mesh.count * 16),
    })
  }

  return {
    t,
    px: player?.position.x ?? 0,
    py: player?.position.y ?? 0,
    pz: player?.position.z ?? 0,
    pqx: player?.quaternion.x ?? 0,
    pqy: player?.quaternion.y ?? 0,
    pqz: player?.quaternion.z ?? 0,
    pqw: player?.quaternion.w ?? 1,
    playerAnim: rigs.has(PLAYER_RIG_ID) ? dominantAnim(rigs.get(PLAYER_RIG_ID)!) : null,
    enemies,
    pools,
  }
}

// ---------------------------------------------------------------------------
// Pose application (playback + resume restore)
// ---------------------------------------------------------------------------

const _q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()

/** The interpolated player position at the current playhead — updated by every
 *  apply. ReplayCamera uses it to keep the action framed (follow mode). */
const appliedPlayerPos = new THREE.Vector3()
export const getPlaybackPlayerPos = () => appliedPlayerPos

type ApplyTarget = { object: THREE.Object3D; rig: RigEntry | null } | null

const playerTarget = (): ApplyTarget => {
  if (external) {
    const g = getGhosts().get(GHOST_PLAYER_ID)
    return g ? { object: g.object, rig: g.rig } : null
  }
  const obj = getPlayerObject()
  if (!obj) return null
  return { object: obj, rig: getRigs().get(PLAYER_RIG_ID) ?? null }
}

const enemyTarget = (id: string): ApplyTarget => {
  if (external) {
    const g = getGhosts().get(ghostEnemyId(id))
    return g ? { object: g.object, rig: g.rig } : null
  }
  const live = playbackEnemies.get(id)
  return live ? { object: live.mesh, rig: live.rig } : null
}

/** Force a rig into a recorded pose: dominant clip at weight 1, everything
 *  else at 0, time set explicitly. `hold` pauses the action (playback);
 *  resume restore passes false so live controllers take over cleanly. */
const poseRig = (rig: RigEntry, a: RigPose | null, b: RigPose | null, alpha: number, hold: boolean) => {
  let pose = a
  if (a && b && a.clip === b.clip) {
    pose = { clip: a.clip, time: THREE.MathUtils.lerp(a.time, b.time, alpha) }
  } else if (b && alpha >= 0.5) {
    pose = b
  }
  if (!pose) return
  const clipTime = pose.time
  for (const action of (rig.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions) {
    if (action.getClip().name === pose.clip) {
      action.enabled = true
      if (!action.isRunning()) action.play()
      action.paused = hold
      action.setEffectiveWeight(1)
      action.time = Math.min(clipTime, action.getClip().duration - 1e-4)
    } else {
      action.setEffectiveWeight(0)
    }
  }
  rig.mixer.update(0)
}

const applyPoolSnap = (snap: PoolSnap) => {
  const getMesh = getPools().get(snap.name)
  const mesh = getMesh?.()
  if (!mesh) return
  const arr = mesh.instanceMatrix.array as Float32Array
  if (snap.count * 16 > arr.length) return
  arr.set(snap.matrices)
  mesh.count = snap.count
  mesh.instanceMatrix.needsUpdate = true
}

/** Apply a single frame exactly (used for the resume snapshot on exit). */
const applyFrameExact = (f: FrameSnap, hold: boolean) => {
  const pt = playerTarget()
  if (pt) {
    pt.object.position.set(f.px, f.py, f.pz)
    appliedPlayerPos.copy(pt.object.position)
    pt.object.quaternion.set(f.pqx, f.pqy, f.pqz, f.pqw)
    if (pt.rig) poseRig(pt.rig, f.playerAnim, null, 0, hold)
  }
  for (const e of f.enemies) {
    const entry = enemyTarget(e.id)
    if (entry) {
      entry.object.position.set(e.x, e.y, e.z)
      entry.object.quaternion.set(e.qx, e.qy, e.qz, e.qw)
      if (entry.rig) poseRig(entry.rig, e.anim, null, 0, hold)
    }
  }
  for (const p of f.pools) applyPoolSnap(p)
}

/** Interpolated apply between two recorded frames. */
const applyFrameLerp = (a: FrameSnap, b: FrameSnap, alpha: number) => {
  const pt = playerTarget()
  if (pt) {
    pt.object.position.set(
      THREE.MathUtils.lerp(a.px, b.px, alpha),
      THREE.MathUtils.lerp(a.py, b.py, alpha),
      THREE.MathUtils.lerp(a.pz, b.pz, alpha)
    )
    appliedPlayerPos.copy(pt.object.position)
    _q1.set(a.pqx, a.pqy, a.pqz, a.pqw)
    _q2.set(b.pqx, b.pqy, b.pqz, b.pqw)
    pt.object.quaternion.slerpQuaternions(_q1, _q2, alpha)
    if (pt.rig) poseRig(pt.rig, a.playerAnim, b.playerAnim, alpha, true)
  }

  const bById = new Map<string, EnemySnap>()
  for (const e of b.enemies) bById.set(e.id, e)
  for (const ea of a.enemies) {
    const entry = enemyTarget(ea.id)
    if (!entry) continue
    const eb = bById.get(ea.id)
    if (eb) {
      entry.object.position.set(
        THREE.MathUtils.lerp(ea.x, eb.x, alpha),
        THREE.MathUtils.lerp(ea.y, eb.y, alpha),
        THREE.MathUtils.lerp(ea.z, eb.z, alpha)
      )
      _q1.set(ea.qx, ea.qy, ea.qz, ea.qw)
      _q2.set(eb.qx, eb.qy, eb.qz, eb.qw)
      entry.object.quaternion.slerpQuaternions(_q1, _q2, alpha)
      if (entry.rig) poseRig(entry.rig, ea.anim, eb.anim, alpha, true)
    } else {
      // Despawns before b — hold a's pose
      entry.object.position.set(ea.x, ea.y, ea.z)
      entry.object.quaternion.set(ea.qx, ea.qy, ea.qz, ea.qw)
      if (entry.rig) poseRig(entry.rig, ea.anim, null, 0, true)
    }
  }
  // Projectile matrices don't interpolate meaningfully — snap to the nearest frame
  const poolSrc = alpha < 0.5 ? a : b
  for (const p of poolSrc.pools) applyPoolSnap(p)
}

const applyAt = (t: number) => {
  if (frames.length === 0) return
  if (frames.length === 1 || t <= frames[0].t) {
    applyFrameLerp(frames[0], frames[0], 0)
    return
  }
  const last = frames[frames.length - 1]
  if (t >= last.t) {
    applyFrameLerp(last, last, 0)
    return
  }
  // Binary search for the bracketing pair
  let lo = 0
  let hi = frames.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (frames[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = frames[lo]
  const b = frames[hi]
  const alpha = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0
  applyFrameLerp(a, b, alpha)
}

// ---------------------------------------------------------------------------
// FX/audio re-emission (forward playback only — GPU particles can't scrub)
// ---------------------------------------------------------------------------

const emitFxUpTo = (t: number) => {
  while (fxCursor < fx.length && fx[fxCursor].t <= t) {
    const entry = fx[fxCursor]
    switch (entry.kind) {
      case 'spawn':
        origSpawns.get(entry.name)?.(entry.x, entry.y, entry.z, entry.count, entry.overrides)
        break
      case 'sfx':
        sfx(entry.name, entry.opts)
        break
      case 'sting':
        playSting(entry.key as TrackKey)
        break
      case 'dmg':
        eventBus.emit(EVENTS.DAMAGE_TEXT, entry.payload)
        break
    }
    fxCursor++
  }
}

const fxCursorFor = (t: number) => {
  let i = 0
  while (i < fx.length && fx[i].t <= t) i++
  return i
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const isRecording = () => recording
export const getRecordingMeta = () => meta
export const hasRecording = () => frames.length > 0

export const startRecording = () => {
  if (recording) return
  ensureSpawnTaps()
  const s = useGameStore.getState()
  frames = []
  fx = []
  meta = { characterId: s.selectedCharacter, level: s.currentLevel, enemies: {} }
  recTime = 0
  lastCapture = -Infinity
  external = false
  recording = true
  s.setReplayExternal(false)
  s.setReplayPhase('recording')
}

/** Called every frame by ReplaySystem while recording. */
export const tickRecord = (delta: number) => {
  if (!recording) return
  recTime += delta
  if (recTime - lastCapture >= CAPTURE_INTERVAL) {
    lastCapture = recTime
    frames.push(captureFrame(recTime))
  }
}

const enterPlaybackShared = () => {
  playhead = 0
  fxCursor = 0
  lastEmitT = 0
  if (frames.length > 0) appliedPlayerPos.set(frames[0].px, frames[0].py, frames[0].pz)
  const s = useGameStore.getState()
  s.setReplayDuration(duration)
  s.setReplayTime(0)
  s.setReplayPlaying(true)
  s.setReplayPhase('playback')
  applyAt(0)
}

/** F8 while recording: freeze the live game and enter playback at t=0. */
export const stopRecordingToPlayback = () => {
  if (!recording) return
  recording = false
  if (frames.length === 0) {
    useGameStore.getState().setReplayPhase('idle')
    return
  }

  // Freeze-frame the live sim so exit can restore it exactly
  resumeSnap = captureFrame(recTime)
  duration = recTime

  // GSAP tweens ignore the game freeze — kill them so nothing drifts
  const player = getPlayerObject()
  if (player) {
    gsap.killTweensOf(player.position)
    gsap.killTweensOf(player.rotation)
  }
  playbackEnemies = new Map()
  const rigs = getRigs()
  for (const e of world.query(IsEnemy)) {
    const mesh = e.get(MeshRef)?.current
    if (!mesh) continue
    const id = String(e.id())
    gsap.killTweensOf(mesh.position)
    playbackEnemies.set(id, { mesh, rig: rigs.get(enemyRigId(id)) ?? null })
  }

  enterPlaybackShared()
}

/** Called every frame by ReplaySystem during playback. */
export const tickPlayback = (delta: number) => {
  const s = useGameStore.getState()
  if (s.replayPlaying) {
    playhead = Math.min(playhead + delta * s.replaySpeed, duration)
    if (playhead >= duration) s.setReplayPlaying(false)
  }
  applyAt(playhead)
  if (s.replayPlaying && playhead >= lastEmitT) {
    emitFxUpTo(playhead)
  }
  lastEmitT = playhead
  s.setReplayTime(playhead)
}

/** Scrubber seek — applies immediately, re-arms FX emission. */
export const seek = (t: number) => {
  playhead = THREE.MathUtils.clamp(t, 0, duration)
  fxCursor = fxCursorFor(playhead)
  lastEmitT = playhead
  combatTextApi.clear()
  applyAt(playhead)
  useGameStore.getState().setReplayTime(playhead)
}

/** Esc / F8 during playback: restore the frozen live state and resume play
 *  (in-session) or tear down ghosts and return to the menu (external). */
export const exitPlayback = () => {
  const s = useGameStore.getState()
  if (s.replayPhase !== 'playback') return
  if (external) {
    // Live scene was never touched — just drop the recording state
    frames = []
    fx = []
    external = false
    s.setReplayExternal(false)
    if (s.gamePhase === 'menu') playTrack('menu')
  } else if (resumeSnap) {
    applyFrameExact(resumeSnap, false)
  }
  // Un-pause every action so live controllers/mixers resume cleanly
  for (const rig of getRigs().values()) {
    for (const a of (rig.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions) {
      a.paused = false
    }
  }
  resumeSnap = null
  playbackEnemies = new Map()
  combatTextApi.clear()
  s.setReplayPlaying(false)
  s.setReplayTime(0)
  s.setReplayPhase('idle')
}

// ---------------------------------------------------------------------------
// Save / load (.json file download + file picker)
// ---------------------------------------------------------------------------

const round3 = (v: number) => Math.round(v * 1000) / 1000

/** JSON replacer: THREE objects survive as tagged plain data; numbers shrink */
const replacer = (_key: string, value: unknown): unknown => {
  const v = value as Record<string, unknown> | null
  if (v && typeof v === 'object') {
    if ((v as { isVector3?: boolean }).isVector3) return { $v3: [round3(v.x as number), round3(v.y as number), round3(v.z as number)] }
    if ((v as { isQuaternion?: boolean }).isQuaternion)
      return { $q: [round3(v.x as number), round3(v.y as number), round3(v.z as number), round3(v.w as number)] }
    if ((v as { isColor?: boolean }).isColor) return { $c: (v as unknown as THREE.Color).getHexString() }
    if ((v as { isEuler?: boolean }).isEuler) return { $e: [round3(v.x as number), round3(v.y as number), round3(v.z as number), v.order] }
    if (value instanceof Float32Array) return Array.from(value, round3)
  }
  if (typeof value === 'number') return round3(value)
  return value
}

const reviver = (_key: string, value: unknown): unknown => {
  const v = value as Record<string, unknown> | null
  if (v && typeof v === 'object' && !Array.isArray(value)) {
    if (Array.isArray(v.$v3)) return new THREE.Vector3(...(v.$v3 as [number, number, number]))
    if (Array.isArray(v.$q)) return new THREE.Quaternion(...(v.$q as [number, number, number, number]))
    if (typeof v.$c === 'string') return new THREE.Color(v.$c as string)
    if (Array.isArray(v.$e)) return new THREE.Euler(...(v.$e as [number, number, number, THREE.EulerOrder]))
  }
  return value
}

/** Serialize the current recording and download it as a .json file. */
export const exportRecording = () => {
  if (frames.length === 0) return
  const data = {
    version: FILE_VERSION,
    duration,
    meta,
    frames,
    fx,
  }
  const blob = new Blob([JSON.stringify(data, replacer)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.href = url
  a.download = `caps-replay-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Parse a recording file and enter external (ghost-rig) playback. */
export const importRecording = async (file: File) => {
  const data = JSON.parse(await file.text(), reviver) as {
    version: number
    duration: number
    meta: RecordingMeta
    frames: (Omit<FrameSnap, 'pools'> & { pools: (Omit<PoolSnap, 'matrices'> & { matrices: number[] })[] })[]
    fx: FxEntry[]
  }
  if (data.version !== FILE_VERSION || !Array.isArray(data.frames) || data.frames.length === 0) {
    throw new Error('Not a compatible replay file')
  }
  frames = data.frames.map((f) => ({
    ...f,
    pools: f.pools.map((p) => ({ ...p, matrices: Float32Array.from(p.matrices) })),
  }))
  fx = data.fx
  meta = data.meta
  duration = data.duration
  external = true
  resumeSnap = null
  playbackEnemies = new Map()

  const s = useGameStore.getState()
  s.setReplayExternal(true)
  // Aim the cinematic camera at the recorded action, not the menu spawn point
  const f0 = frames[0]
  s.setPlayerPosition(new THREE.Vector3(f0.px, f0.py, f0.pz))
  // Score the replay with the level's track
  const track = LEVEL_TRACKS[meta.level]
  if (track) playTrack(track)
  enterPlaybackShared()
}
