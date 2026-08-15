import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventBus, EVENTS } from '@/constants'
import { useGameStore, isGameFrozen } from '@/store'
import { createIceFloorMaterial } from './vfx/iceFloor'
import type { EnergyUniforms } from './vfx/energy'

// ============================================================================
// Ice floor patches — deep parallax ice left on the ground by Ice Nova.
// Same lifecycle shape as Shockwaves: refs map + state list + per-instance
// material disposed on unmount.
// ============================================================================

type Patch = {
  id: number
  x: number
  z: number
  bornAt: number
}

const LIFETIME = 6000
const FADE_IN = 300
const FADE_OUT = 1000

let nextPatchId = 1

export const IceFloors = () => {
  const [patches, setPatches] = useState<Patch[]>([])
  const patchRefs = useRef(new Map<number, { u: EnergyUniforms }>())

  useEffect(() => {
    const onCast = (id: string, position: THREE.Vector3) => {
      if (id !== 'nova') return
      setPatches((prev) => [
        ...prev,
        { id: nextPatchId++, x: position.x, z: position.z, bornAt: performance.now() },
      ])
    }

    eventBus.on(EVENTS.ABILITY_CAST, onCast)
    return () => {
      eventBus.off(EVENTS.ABILITY_CAST, onCast)
    }
  }, [])

  useFrame((_, delta) => {
    if (isGameFrozen(useGameStore.getState())) return
    if (patches.length === 0) return
    const now = performance.now()
    const expired: number[] = []

    for (const patch of patches) {
      const entry = patchRefs.current.get(patch.id)
      const age = now - patch.bornAt

      if (age >= LIFETIME) {
        expired.push(patch.id)
        continue
      }
      if (!entry) continue

      entry.u.uTime.value += delta
      const fadeIn = Math.min(age / FADE_IN, 1)
      const fadeOut = Math.min((LIFETIME - age) / FADE_OUT, 1)
      entry.u.uOpacity.value = Math.min(fadeIn, fadeOut)
    }

    if (expired.length > 0) {
      for (const id of expired) patchRefs.current.delete(id)
      setPatches((prev) => prev.filter((p) => !expired.includes(p.id)))
    }
  })

  return (
    <>
      {patches.map((patch) => (
        <IceFloorMesh
          key={patch.id}
          patch={patch}
          register={(u) => {
            if (u) patchRefs.current.set(patch.id, { u })
            else patchRefs.current.delete(patch.id)
          }}
        />
      ))}
    </>
  )
}

const IceFloorMesh = ({
  patch,
  register,
}: {
  patch: Patch
  register: (u: EnergyUniforms | null) => void
}) => {
  const { material, uniforms } = useMemo(() => createIceFloorMaterial(), [])
  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh
      ref={(m: THREE.Mesh | null) => register(m ? uniforms : null)}
      position={[patch.x, 0.07, patch.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={4.5}
      material={material}
    >
      <circleGeometry args={[1, 64]} />
    </mesh>
  )
}
