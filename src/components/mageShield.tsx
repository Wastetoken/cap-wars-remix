import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, isGameFrozen } from '@/store'
import { eventBus, EVENTS } from '@/constants'
import {
  createMageShieldMaterial,
  SHIELD_RADIUS,
  type MageShieldMaterial,
} from './vfx/mageShield'

// ============================================================================
// Mage block bubble — the hex force shield from the owner's Shield Siege demo.
// Only the mage gets it: while the mage holds RMB (isParrying), the bubble
// dissolves in around the player; blocked hits (PARRY_BLOCK) spawn expanding
// ripple rings at the impact point. Other classes keep the plain spark burst.
// ============================================================================

const SHIELD_CENTER_HEIGHT = 0.95 // bubble rides the player's chest
const REVEAL_SPEED = 3.5 // deploy (demo revealSpeed)
const HIDE_SPEED = 2.5 // collapse on release

export const MageShield = () => {
  const isMage = useGameStore((s) => s.selectedCharacter === 'mage')
  const { material, uniforms, registerHit } = useMemo(() => createMageShieldMaterial(), [])
  useEffect(() => () => material.dispose(), [material])
  const meshRef = useRef<THREE.Mesh | null>(null)
  const matRef = useRef<MageShieldMaterial['registerHit'] | null>(null)
  matRef.current = registerHit

  // Blocked hits ripple the bubble at the impact point
  useEffect(() => {
    const onBlock = (pos: { x: number; y: number; z: number }) => {
      const mesh = meshRef.current
      const s = useGameStore.getState()
      if (!mesh || !mesh.visible || s.selectedCharacter !== 'mage') return
      matRef.current?.(new THREE.Vector3(pos.x, pos.y, pos.z), mesh.position)
    }
    eventBus.on(EVENTS.PARRY_BLOCK, onBlock)
    return () => {
      eventBus.off(EVENTS.PARRY_BLOCK, onBlock)
    }
  }, [])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const store = useGameStore.getState()

    const pp = store.playerPosition
    mesh.position.set(pp.x, pp.y + SHIELD_CENTER_HEIGHT, pp.z)

    if (isGameFrozen(store)) return
    uniforms.uTime.value += delta

    const blocking = isMage && store.isParrying
    const dir = blocking ? -1 : 1
    const speed = blocking ? REVEAL_SPEED : HIDE_SPEED
    uniforms.uReveal.value = THREE.MathUtils.clamp(
      uniforms.uReveal.value + dir * delta * speed,
      0,
      1
    )
    mesh.visible = uniforms.uReveal.value < 0.999
  })

  if (!isMage) return null

  return (
    <mesh
      ref={meshRef}
      name="mage-shield"
      material={material}
      visible={false}
      renderOrder={2}
      frustumCulled={false}
    >
      <sphereGeometry args={[SHIELD_RADIUS, 48, 48]} />
    </mesh>
  )
}
