import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventBus, EVENTS } from '@/constants'
import { useGameStore } from '@/store'
import { createEnergyRingMaterial, type EnergyUniforms } from './vfx/energy'

// ============================================================================
// Shockwave rings — expanding ground energy rings for slam / whirlwind /
// mobility casts. TSL noise-streaked bands with hot leading edges (bloom
// food), not flat colored rings.
// ============================================================================

type Ring = {
  id: number
  x: number
  z: number
  maxRadius: number
  bornAt: number
  duration: number
  colorA: string
  colorB: string
}

let nextRingId = 1

/** Preset ring pairs: [delay ms, maxRadius, duration, colorA, colorB] */
type RingSpec = [number, number, number, string, string]

const CAST_RINGS: Record<string, RingSpec[]> = {
  'slam-land': [
    [0, 6.3, 550, '#ff8c1a', '#fff3d6'],
    [60, 4.5, 500, '#ffd28a', '#ffffff'],
  ],
  whirlwind: [[0, 3.8, 450, '#38bdf8', '#e0f2fe']],
  'meteor-land': [
    [0, 5.5, 600, '#fb923c', '#fde68a'],
    [70, 3.6, 520, '#fdba74', '#fff7ed'],
  ],
  nova: [
    [0, 4.6, 550, '#38bdf8', '#e0f2fe'],
    [60, 3.2, 480, '#7dd3fc', '#f0f9ff'],
  ],
  'blink-out': [[0, 2.2, 380, '#a78bfa', '#ede9fe']],
  'blink-in': [[0, 2.2, 380, '#a78bfa', '#ede9fe']],
  shadowstep: [[0, 1.8, 320, '#6366f1', '#c7d2fe']],
  'leap-land': [
    [0, 3.4, 450, '#fbbf24', '#fff7e0'],
    [50, 2.2, 400, '#fde68a', '#ffffff'],
  ],
}

export const Shockwaves = () => {
  const [rings, setRings] = useState<Ring[]>([])
  const ringRefs = useRef(new Map<number, { mesh: THREE.Mesh; u: EnergyUniforms }>())

  useEffect(() => {
    const spawn = (x: number, z: number, specs: RingSpec[]) => {
      setRings((prev) => [
        ...prev,
        ...specs.map(([delay, maxRadius, duration, colorA, colorB]) => ({
          id: nextRingId++,
          x,
          z,
          maxRadius,
          bornAt: performance.now() + delay,
          duration,
          colorA,
          colorB,
        })),
      ])
    }

    const onCast = (id: string, position: { x: number; z: number }) => {
      const specs = CAST_RINGS[id]
      if (specs) spawn(position.x, position.z, specs)
    }

    const onLevelUp = () => {
      const p = useGameStore.getState().playerPosition
      spawn(p.x, p.z, [[0, 5, 700, '#ffd700', '#fff8dc']])
    }

    eventBus.on(EVENTS.ABILITY_CAST, onCast)
    eventBus.on(EVENTS.LEVEL_UP, onLevelUp)
    return () => {
      eventBus.off(EVENTS.ABILITY_CAST, onCast)
      eventBus.off(EVENTS.LEVEL_UP, onLevelUp)
    }
  }, [])

  useFrame((_, delta) => {
    if (rings.length === 0) return
    const now = performance.now()
    const expired: number[] = []

    for (const ring of rings) {
      const entry = ringRefs.current.get(ring.id)
      const age = now - ring.bornAt
      if (age < 0) continue // delayed start
      const t = Math.min(age / ring.duration, 1)

      if (t >= 1) {
        expired.push(ring.id)
        continue
      }
      if (!entry) continue

      const eased = 1 - Math.pow(1 - t, 3)
      entry.mesh.scale.setScalar(0.2 + eased * ring.maxRadius)
      entry.u.uTime.value += delta
      entry.u.uOpacity.value = (1 - t) * 0.9
    }

    if (expired.length > 0) {
      for (const id of expired) ringRefs.current.delete(id)
      setRings((prev) => prev.filter((r) => !expired.includes(r.id)))
    }
  })

  return (
    <>
      {rings.map((ring) => (
        <EnergyRingMesh
          key={ring.id}
          ring={ring}
          register={(mesh, u) => {
            if (mesh) ringRefs.current.set(ring.id, { mesh, u })
            else ringRefs.current.delete(ring.id)
          }}
        />
      ))}
    </>
  )
}

const EnergyRingMesh = ({
  ring,
  register,
}: {
  ring: Ring
  register: (mesh: THREE.Mesh | null, u: EnergyUniforms) => void
}) => {
  const { material, uniforms } = useMemo(
    () => createEnergyRingMaterial(ring.colorA, ring.colorB),
    [ring.colorA, ring.colorB]
  )
  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh
      ref={(m: THREE.Mesh | null) => register(m, uniforms)}
      position={[ring.x, 0.09, ring.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <ringGeometry args={[0.8, 1, 64]} />
    </mesh>
  )
}
