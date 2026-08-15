import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventBus, EVENTS } from '@/constants'
import { useGameStore } from '@/store'
import { VFXEmitter, PARTICLES, useVFXEmitter } from './particles'
import {
  createEnergyRingMaterial,
  createFirePortalMaterial,
  type EnergyUniforms,
} from './vfx/energy'

// ============================================================================
// Exit portal — an arcane rift: cold voronoi disc, twin counter-rotating
// energy rings, and a swirl of orbiting shards. Walk into it to descend.
// ============================================================================

const PORTAL_POSITION: [number, number, number] = [0, 0, -10]
const ENTER_RADIUS = 1.6

export const Portal = () => {
  const portalActive = useGameStore((s) => s.portalActive)
  const ringARef = useRef<THREE.Mesh>(null)
  const ringBRef = useRef<THREE.Mesh>(null)
  const innerRef = useRef<THREE.Mesh>(null)

  // Twin energy rings — violet core, cyan-hot edge
  const ringA = useMemo(() => createEnergyRingMaterial('#4c1d95', '#67e8f9', 8), [])
  const ringB = useMemo(() => createEnergyRingMaterial('#312e81', '#a855f7', 6), [])
  // Cold voronoi rift face
  const rift = useMemo(() => createFirePortalMaterial(true), [])
  const uniforms = useRef<EnergyUniforms[]>([ringA.uniforms, ringB.uniforms, rift.uniforms])
  useEffect(
    () => () => {
      ringA.material.dispose()
      ringB.material.dispose()
      rift.material.dispose()
    },
    [ringA, ringB, rift]
  )

  const riftEmitter = useVFXEmitter(PARTICLES.RIFT)
  const timeRef = useRef(0)

  useFrame((_, delta) => {
    if (!portalActive) return
    if (useGameStore.getState().gamePhase !== 'playing') return

    timeRef.current += delta
    const t = timeRef.current
    for (const u of uniforms.current) u.uTime.value += delta

    if (ringARef.current) {
      ringARef.current.rotation.z = t * 0.9
      const pulse = 1 + Math.sin(t * 3) * 0.05
      ringARef.current.scale.setScalar(pulse)
    }
    if (ringBRef.current) {
      ringBRef.current.rotation.z = -t * 1.4
      const pulse = 1 + Math.cos(t * 2.2) * 0.08
      ringBRef.current.scale.setScalar(pulse)
    }
    if (innerRef.current) {
      innerRef.current.rotation.z = -t * 0.5
    }

    // Orbiting shard swirl — particles emitted along the ring's rim
    for (let i = 0; i < 3; i++) {
      const angle = t * 2.2 + (i * Math.PI * 2) / 3
      riftEmitter.emit(
        [
          PORTAL_POSITION[0] + Math.cos(angle) * 1.15,
          1.6 + Math.sin(t * 2.8 + i) * 0.35,
          PORTAL_POSITION[2] + Math.sin(angle) * 1.15,
        ],
        1
      )
    }

    // Player enters the portal
    const p = useGameStore.getState().playerPosition
    const dist = Math.hypot(p.x - PORTAL_POSITION[0], p.z - PORTAL_POSITION[2])
    if (dist < ENTER_RADIUS) {
      eventBus.emit(EVENTS.LEVEL_EXIT)
    }
  })

  if (!portalActive) return null

  return (
    <group position={PORTAL_POSITION}>
      <group position={[0, 1.6, 0]}>
        <mesh ref={ringARef} material={ringA.material}>
          <ringGeometry args={[0.92, 1.18, 48]} />
        </mesh>
        <mesh ref={ringBRef} material={ringB.material}>
          <ringGeometry args={[1.14, 1.32, 48]} />
        </mesh>
        <mesh ref={innerRef} material={rift.material}>
          <circleGeometry args={[1.05, 32]} />
        </mesh>
      </group>
      {/* Ground glow ring */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.5, 32]} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <VFXEmitter name={PARTICLES.RIFT} autoStart={false} />
    </group>
  )
}
