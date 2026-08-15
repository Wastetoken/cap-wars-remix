import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, isGameFrozen } from '@/store'
import { createBuffAuraMaterial, type BuffAuraUniforms } from './vfx/buffAura'

// ============================================================================
// Player buff aura — swirling green-teal energy (Green-Aura raymarch port)
// wrapped around the player while an ability buff is active (Fury, Berserk,
// Vanish, Ice Nova empowerment — all driven through isFury/furyBuff).
// Billboards to the camera every frame and fades in/out over ~0.25s.
// ============================================================================

const AURA_SIZE = 2.6
const AURA_HEIGHT = 1.2
const FADE_TIME = 0.25

export const BuffAura = () => {
  const buffActive = useGameStore((s) => s.isFury || s.furyBuff !== null)
  const { material, uniforms } = useMemo(() => createBuffAuraMaterial(), [])
  useEffect(() => () => material.dispose(), [material])
  const entryRef = useRef<{ mesh: THREE.Mesh; u: BuffAuraUniforms } | null>(null)

  useFrame(({ camera }, delta) => {
    const entry = entryRef.current
    if (!entry) return
    const { mesh, u } = entry
    const store = useGameStore.getState()

    // Billboard to the camera and ride the player's chest
    mesh.quaternion.copy(camera.quaternion)
    const pp = store.playerPosition
    mesh.position.set(pp.x, pp.y + AURA_HEIGHT, pp.z)

    if (isGameFrozen(store)) return
    u.uTime.value += delta

    const dir = buffActive ? 1 : -1
    u.uOpacity.value = THREE.MathUtils.clamp(u.uOpacity.value + (dir * delta) / FADE_TIME, 0, 1)
    mesh.visible = u.uOpacity.value > 0.001
  })

  return (
    <mesh
      ref={(m: THREE.Mesh | null) => {
        entryRef.current = m ? { mesh: m, u: uniforms } : null
      }}
      material={material}
      visible={false}
    >
      <planeGeometry args={[AURA_SIZE, AURA_SIZE]} />
    </mesh>
  )
}
