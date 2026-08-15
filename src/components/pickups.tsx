import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventBus, EVENTS } from '@/constants'
import { useGameStore, isGameFrozen } from '@/store'
import {
  spawnDrops,
  stepOrb,
  MAX_ORBS,
  type OrbKind,
  type OrbState,
} from '@/game/orbs'

// ============================================================================
// Loot orbs — GoW-style pickups dropped by slain mobs.
// Red = souls (XP), Green = health, Blue = rage.
// Simulation lives in @/game/orbs (pure, unit-tested); this component only
// mirrors orb state to meshes and applies collection effects.
// ============================================================================

const COLORS: Record<OrbKind, string> = {
  soul: '#ff4030',
  health: '#4ade80',
  rage: '#38bdf8',
}

let nextId = 1

export const Pickups = () => {
  const [orbs, setOrbs] = useState<OrbState[]>([])
  const meshRefs = useRef(new Map<number, THREE.Mesh>())

  // Clear leftover orbs when a run resets (death, quit to menu, new run)
  const runId = useGameStore((s) => s.runId)
  useEffect(() => {
    setOrbs([])
    meshRefs.current.clear()
  }, [runId])

  // Spawn orbs on enemy death
  useEffect(() => {
    const onEnemyDead = (position: THREE.Vector3 | undefined, souls: number) => {
      if (!position) return
      const drops = spawnDrops(position, souls, nextId, performance.now())
      nextId += drops.length
      setOrbs((prev) => [...prev.slice(-MAX_ORBS), ...drops])
    }

    eventBus.on(EVENTS.ENEMY_DEAD, onEnemyDead)
    return () => {
      eventBus.off(EVENTS.ENEMY_DEAD, onEnemyDead)
    }
  }, [])

  // Simulate orbs
  useFrame(({ delta }) => {
    if (orbs.length === 0) return
    if (isGameFrozen(useGameStore.getState())) return

    const playerPos = useGameStore.getState().playerPosition
    const now = performance.now()
    const collected: OrbState[] = []

    for (const orb of orbs) {
      if (stepOrb(orb, playerPos, delta, now)) {
        collected.push(orb)
        continue
      }
      const mesh = meshRefs.current.get(orb.id)
      if (mesh) mesh.position.set(orb.x, orb.y, orb.z)
    }

    if (collected.length > 0) {
      const store = useGameStore.getState()
      for (const orb of collected) {
        meshRefs.current.delete(orb.id)
        if (orb.kind === 'soul') store.addSouls(orb.value)
        else if (orb.kind === 'health') store.healPlayer(orb.value)
        else store.addRage(orb.value)
      }
      const ids = new Set(collected.map((o) => o.id))
      setOrbs((prev) => prev.filter((o) => !ids.has(o.id)))
    }
  })

  return (
    <>
      {orbs.map((orb) => (
        <mesh
          key={orb.id}
          ref={(m: THREE.Mesh | null) => {
            if (m) meshRefs.current.set(orb.id, m)
            else meshRefs.current.delete(orb.id)
          }}
          position={[orb.x, orb.y, orb.z]}
        >
          <sphereGeometry args={[orb.kind === 'soul' ? 0.12 : 0.18, 12, 12]} />
          <meshBasicMaterial color={COLORS[orb.kind]} toneMapped={false} />
        </mesh>
      ))}
    </>
  )
}
