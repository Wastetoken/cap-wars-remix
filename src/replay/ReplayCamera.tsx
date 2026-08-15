import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '@/store'
import { getPlaybackPlayerPos } from './session'

// ============================================================================
// Free-roam cinematic camera — active only during replay playback.
// Starts in FOLLOW mode: the focus point tracks the recorded player so the
// action stays framed. Any manual camera input (drag, WASD/QE, wheel) takes
// over; press F to re-engage follow. All inputs write TARGETS; currents damp
// toward them each frame — that's what makes trailer motion smooth.
// ============================================================================

const LOOK_SPEED = 0.0045
const MOVE_SPEED = 14
const BOOST_MULT = 3.5
const DAMP = 9 // higher = snappier, lower = floatier
const MIN_PITCH = 0.05
const MAX_PITCH = 1.45
const MIN_ZOOM = 20
const MAX_ZOOM = 220
const ZOOM_STEP_OUT = 0.85
const ZOOM_STEP_IN = 1.18

export const ReplayCamera = () => {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const active = useGameStore((s) => s.replayPhase === 'playback')

  // Targets (input) vs currents (rendered) — damped each frame
  const target = useRef({ yaw: 0, pitch: 0.9, dist: 12, zoom: 80, focus: new THREE.Vector3() })
  const current = useRef({ yaw: 0, pitch: 0.9, dist: 12, zoom: 80, focus: new THREE.Vector3() })
  const keys = useRef(new Set<string>())
  const dragging = useRef(false)
  const follow = useRef(true)

  // Initialize from wherever the gameplay camera left off
  useEffect(() => {
    if (!active) return
    follow.current = true
    const focus = getPlaybackPlayerPos().clone()
    const offset = camera.position.clone().sub(focus)
    const dist = Math.max(offset.length(), 4)
    const yaw = Math.atan2(offset.x, offset.z)
    const pitch = Math.acos(THREE.MathUtils.clamp(offset.y / dist, -1, 1))
    const init = { yaw, pitch, dist, zoom: (camera as THREE.OrthographicCamera).zoom ?? 80 }
    target.current = { ...init, focus: focus.clone() }
    current.current = { ...init, focus: focus.clone() }
  }, [active, camera])

  // Input listeners — only while playback is active
  useEffect(() => {
    if (!active) return
    const el = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      dragging.current = true
      el.setPointerCapture(e.pointerId)
    }
    const onPointerUp = (e: PointerEvent) => {
      dragging.current = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return
      follow.current = false
      target.current.yaw -= e.movementX * LOOK_SPEED
      target.current.pitch = THREE.MathUtils.clamp(
        target.current.pitch + e.movementY * LOOK_SPEED,
        MIN_PITCH,
        MAX_PITCH
      )
    }
    const onWheel = (e: WheelEvent) => {
      follow.current = false
      target.current.zoom = THREE.MathUtils.clamp(
        target.current.zoom * (e.deltaY > 0 ? ZOOM_STEP_OUT : ZOOM_STEP_IN),
        MIN_ZOOM,
        MAX_ZOOM
      )
    }
    const CAM_MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'])
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code)
      if (e.code === 'KeyF') follow.current = !follow.current
      else if (CAM_MOVE_KEYS.has(e.code)) follow.current = false
    }
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code)
    const onBlur = () => keys.current.clear()

    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointermove', onPointerMove)
    el.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [active, gl])

  useFrame((_, delta) => {
    // Read the store directly — the `active` subscription lags a frame behind
    // an exit, which would stomp PlayerController's camera-restore snapshot.
    if (useGameStore.getState().replayPhase !== 'playback') return
    const t = target.current
    const c = current.current
    const k = keys.current

    // Move the focus point in the camera's ground plane
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? BOOST_MULT : 1
    const move = new THREE.Vector3(
      (Number(k.has('KeyD')) - Number(k.has('KeyA'))) ,
      Number(k.has('KeyE')) - Number(k.has('KeyQ')),
      Number(k.has('KeyS')) - Number(k.has('KeyW'))
    )
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * boost * delta)
      // Camera-relative: forward is the camera's XZ facing
      const yaw = c.yaw
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x)
      t.focus.addScaledVector(right, move.x)
      t.focus.addScaledVector(fwd, -move.z)
      t.focus.y += move.y
      t.focus.y = Math.max(t.focus.y, 0)
    }

    // Follow mode: the recorded player position owns the focus target
    if (follow.current) t.focus.copy(getPlaybackPlayerPos())

    // Damp everything toward its target — this is the smoothness
    c.yaw = THREE.MathUtils.damp(c.yaw, t.yaw, DAMP, delta)
    c.pitch = THREE.MathUtils.damp(c.pitch, t.pitch, DAMP, delta)
    c.dist = THREE.MathUtils.damp(c.dist, t.dist, DAMP, delta)
    c.zoom = THREE.MathUtils.damp(c.zoom, t.zoom, DAMP, delta)
    c.focus.x = THREE.MathUtils.damp(c.focus.x, t.focus.x, DAMP, delta)
    c.focus.y = THREE.MathUtils.damp(c.focus.y, t.focus.y, DAMP, delta)
    c.focus.z = THREE.MathUtils.damp(c.focus.z, t.focus.z, DAMP, delta)

    const sp = Math.sin(c.pitch)
    camera.position.set(
      c.focus.x + c.dist * sp * Math.sin(c.yaw),
      c.focus.y + c.dist * Math.cos(c.pitch),
      c.focus.z + c.dist * sp * Math.cos(c.yaw)
    )
    camera.lookAt(c.focus)
    const ortho = camera as THREE.OrthographicCamera
    if (ortho.isOrthographicCamera && Math.abs(ortho.zoom - c.zoom) > 0.01) {
      ortho.zoom = c.zoom
      ortho.updateProjectionMatrix()
    }
  })

  return null
}
