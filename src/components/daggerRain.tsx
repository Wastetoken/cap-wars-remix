import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventBus, EVENTS } from '@/constants'
import { useGameStore, isGameFrozen } from '@/store'

// ============================================================================
// Dagger Rain — spectral daggers pour down on the target area for the
// ability's duration, respawning at the top to keep density constant, then
// fall out. One InstancedMesh per active rain, driven per-frame.
// ============================================================================

type Rain = {
  id: number
  x: number
  z: number
}

type Dagger = {
  ox: number
  oz: number
  y: number
  drift: number // accumulated horizontal travel
  speed: number
  quat: THREE.Quaternion
  active: boolean
}

let nextRainId = 1

const DAGGER_COUNT = 70
const RAIN_DURATION = 2.5 // seconds of respawning rain
const RAIN_RADIUS = 3
const SPAWN_MIN_Y = 6
const SPAWN_MAX_Y = 8
const FALL_SPEED = 10 // units per second
const DRIFT = 0.6 // horizontal drift (+x) as a fraction of fall speed

const DOWN = new THREE.Vector3(0, -1, 0)

const randomOffset = (d: Dagger) => {
  const angle = Math.random() * Math.PI * 2
  const r = Math.sqrt(Math.random()) * RAIN_RADIUS
  d.ox = Math.cos(angle) * r
  d.oz = Math.sin(angle) * r
}

const spawnDagger = (initial: boolean): Dagger => {
  const speed = FALL_SPEED * (0.85 + Math.random() * 0.3)
  const fallDir = new THREE.Vector3(DRIFT * speed, -speed, 0).normalize()
  const align = new THREE.Quaternion().setFromUnitVectors(DOWN, fallDir)
  const roll = new THREE.Quaternion().setFromAxisAngle(fallDir, Math.random() * Math.PI * 2)

  const d: Dagger = {
    ox: 0,
    oz: 0,
    y: initial
      ? 0.5 + Math.random() * 7.5
      : SPAWN_MIN_Y + Math.random() * (SPAWN_MAX_Y - SPAWN_MIN_Y),
    drift: 0,
    speed,
    quat: roll.multiply(align),
    active: true,
  }
  randomOffset(d)
  return d
}

const respawnDagger = (d: Dagger) => {
  randomOffset(d)
  d.y = SPAWN_MIN_Y + Math.random() * (SPAWN_MAX_Y - SPAWN_MIN_Y)
  d.drift = 0
}

export const DaggerRain = () => {
  const [rains, setRains] = useState<Rain[]>([])

  useEffect(() => {
    const onCast = (id: string, target: THREE.Vector3) => {
      if (id !== 'dagger-rain') return
      setRains((prev) => [...prev, { id: nextRainId++, x: target.x, z: target.z }])
    }
    eventBus.on(EVENTS.ABILITY_CAST, onCast)
    return () => {
      eventBus.off(EVENTS.ABILITY_CAST, onCast)
    }
  }, [])

  const removeRain = (id: number) => setRains((prev) => prev.filter((r) => r.id !== id))

  return (
    <>
      {rains.map((rain) => (
        <RainField key={rain.id} rain={rain} onDone={removeRain} />
      ))}
    </>
  )
}

const RainField = ({ rain, onDone }: { rain: Rain; onDone: (id: number) => void }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  // Mutable per-frame state, touched only inside useFrame
  const daggersRef = useRef<Dagger[]>([])
  const elapsed = useRef(0)
  const finished = useRef(false)

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const texture = useMemo(() => new THREE.TextureLoader().load('/vfx/dagger.png'), [])
  const geometry = useMemo(() => new THREE.PlaneGeometry(0.22, 0.93), [])
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [texture]
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
      texture.dispose()
    },
    [geometry, material, texture]
  )

  useFrame((_, delta) => {
    if (isGameFrozen(useGameStore.getState())) return
    const mesh = meshRef.current
    if (!mesh || finished.current) return

    // Lazy init inside the frame loop keeps Math.random out of render
    if (daggersRef.current.length === 0) {
      daggersRef.current = Array.from({ length: DAGGER_COUNT }, () => spawnDagger(true))
    }
    const daggers = daggersRef.current

    elapsed.current += delta
    const spawning = elapsed.current < RAIN_DURATION
    let anyActive = false

    for (let i = 0; i < daggers.length; i++) {
      const d = daggers[i]
      if (d.active) {
        d.y -= d.speed * delta
        d.drift += DRIFT * d.speed * delta
        if (d.y <= 0.05) {
          if (spawning) respawnDagger(d)
          else d.active = false
        }
      }

      if (d.active) {
        anyActive = true
        dummy.position.set(rain.x + d.ox + d.drift, d.y, rain.z + d.oz)
        dummy.quaternion.copy(d.quat)
        dummy.scale.setScalar(1)
      } else {
        dummy.scale.setScalar(0)
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    if (!spawning && !anyActive) {
      finished.current = true
      onDone(rain.id)
    }
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, DAGGER_COUNT]}
      frustumCulled={false}
    />
  )
}
