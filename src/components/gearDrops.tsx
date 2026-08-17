import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { eventBus, EVENTS } from '@/constants'
import { useGameStore, isGameFrozen } from '@/store'
import { rollGearDrop, RARITY_COLORS, resolveDropWeaponModel, type GearPiece, type GearRarity, type GearSlot } from '@/game/gear'
import { createEnergyRingMaterial, type EnergyUniforms } from './vfx/energy'

// ============================================================================
// Gear drops — slain elites and bosses leave the actual KayKit item floating
// in a rarity-colored energy ring (boots keep the crystal — the pack has no
// boot model). Walk over one to auto-equip: the stat lands instantly, the
// announcement banners, and the weapon aura upgrades.
// ============================================================================

/** Real item model per slot+rarity — boots fall back to the crystal */
const DROP_MODELS: Partial<Record<GearSlot, Partial<Record<GearRarity, string>>>> = {
  weapon: {
    common: '/items/sword_1handed.gltf',
    rare: '/items/axe_1handed.gltf',
    epic: '/items/sword_2handed.gltf',
    legendary: '/items/sword_2handed_color.gltf',
  },
  armor: {
    common: '/items/shield_round_color.gltf',
    rare: '/items/shield_square_color.gltf',
    epic: '/items/shield_spikes_color.gltf',
    legendary: '/items/shield_badge_color.gltf',
  },
  trinket: {
    common: '/items/smokebomb.gltf',
    rare: '/items/smokebomb.gltf',
    epic: '/items/spellbook_closed.gltf',
    legendary: '/items/spellbook_open.gltf',
  },
}

type Drop = {
  id: number
  piece: GearPiece
  x: number
  z: number
  bornAt: number
  modelUrl: string
}

const MAX_DROPS = 12
/** Start gliding to the player inside this radius */
const MAGNET_RADIUS = 2.4
const COLLECT_RADIUS = 0.9

let nextDropId = 1

export const GearDrops = () => {
  const [drops, setDrops] = useState<Drop[]>([])
  const crystalRefs = useRef(new Map<number, THREE.Object3D>())
  const ringRefs = useRef(new Map<number, { mesh: THREE.Mesh; u: EnergyUniforms }>())

  // Clear leftover drops when a run resets
  const runId = useGameStore((s) => s.runId)
  useEffect(() => {
    setDrops([])
    crystalRefs.current.clear()
    ringRefs.current.clear()
  }, [runId])

  useEffect(() => {
    const onEnemyDead = (
      position: THREE.Vector3 | undefined,
      _souls: number,
      baseSouls?: number
    ) => {
      if (!position) return
      const characterId = useGameStore.getState().selectedCharacter
      const piece = rollGearDrop(nextDropId, baseSouls ?? _souls, characterId)
      if (!piece) return
      nextDropId++

      let modelUrl: string
      if (piece.slot === 'weapon') {
        const external = resolveDropWeaponModel(characterId, piece.rarity)
        if (external) {
          modelUrl = external
        } else {
          modelUrl = DROP_MODELS[piece.slot]?.[piece.rarity] ?? ''
        }
      } else if (piece.slot === 'armor') {
        const lower = piece.name.toLowerCase()
        if (lower.includes('spiked')) {
          modelUrl = piece.rarity === 'epic' ? '/items/shield-spiked-cv.glb' : '/items/shield-spiked-cs.glb'
        } else if (lower.includes('square')) {
          modelUrl = piece.rarity === 'epic' ? '/items/shield-square-cv.glb' : '/items/shield-square-cs.glb'
        } else {
          modelUrl = DROP_MODELS[piece.slot]?.[piece.rarity] ?? ''
        }
      } else {
        modelUrl = DROP_MODELS[piece.slot]?.[piece.rarity] ?? ''
      }

      setDrops((prev) => [
        ...prev.slice(-(MAX_DROPS - 1)),
        { id: piece.id, piece, x: position.x, z: position.z, bornAt: performance.now(), modelUrl },
      ])
    }
    eventBus.on(EVENTS.ENEMY_DEAD, onEnemyDead)
    return () => {
      eventBus.off(EVENTS.ENEMY_DEAD, onEnemyDead)
    }
  }, [])

  useFrame(({ elapsed, delta }) => {
    if (drops.length === 0) {
      ;(window as any).__gearDrops = 0
      return
    }
    const store = useGameStore.getState()
    ;(window as any).__gearDrops = drops.length
    if (isGameFrozen(store)) return

    const pp = store.playerPosition
    const t = elapsed
    const collected: number[] = []

    for (const drop of drops) {
      const dx = pp.x - drop.x
      const dz = pp.z - drop.z
      const dist = Math.hypot(dx, dz)

      if (dist < COLLECT_RADIUS) {
        collected.push(drop.id)
        store.addGear(drop.piece)
        continue
      }
      // Magnet glide
      if (dist < MAGNET_RADIUS) {
        const pull = (1 - dist / MAGNET_RADIUS) * 10 * delta
        drop.x += (dx / dist) * pull
        drop.z += (dz / dist) * pull
      }

      const crystal = crystalRefs.current.get(drop.id)
      if (crystal) {
        crystal.position.set(drop.x, 0.55 + Math.sin(t * 2.2 + drop.id) * 0.09, drop.z)
        crystal.rotation.y = t * 1.4 + drop.id
      }
      const ring = ringRefs.current.get(drop.id)
      if (ring) {
        ring.mesh.position.set(drop.x, 0.07, drop.z)
        ring.u.uTime.value += delta
        ring.u.uOpacity.value = 0.45 + Math.sin(t * 3 + drop.id) * 0.18
      }
    }

    if (collected.length > 0) {
      for (const id of collected) {
        crystalRefs.current.delete(id)
        ringRefs.current.delete(id)
      }
      setDrops((prev) => prev.filter((d) => !collected.includes(d.id)))
    }
  })

  return (
    <>
      {drops.map((drop) => (
        <GearDrop key={drop.id} drop={drop} crystalRefs={crystalRefs} ringRefs={ringRefs} />
      ))}
    </>
  )
}

const GearDrop = ({
  drop,
  crystalRefs,
  ringRefs,
}: {
  drop: Drop
  crystalRefs: React.RefObject<Map<number, THREE.Object3D>>
  ringRefs: React.RefObject<Map<number, { mesh: THREE.Mesh; u: EnergyUniforms }>>
}) => {
  const rarityColor = RARITY_COLORS[drop.piece.rarity]
  const modelUrl = drop.modelUrl
  const { material, uniforms } = useMemo(
    () => createEnergyRingMaterial(rarityColor, '#ffffff', 5),
    [rarityColor]
  )
  useEffect(() => () => material.dispose(), [material])

  const setItemRef = (o: THREE.Object3D | null) => {
    if (o) crystalRefs.current!.set(drop.id, o)
    else crystalRefs.current!.delete(drop.id)
  }

  return (
    <>
      {modelUrl ? (
        <Suspense fallback={<Crystal color={rarityColor} x={drop.x} z={drop.z} setRef={setItemRef} />}>
          <DroppedItem url={modelUrl} x={drop.x} z={drop.z} setRef={setItemRef} />
        </Suspense>
      ) : (
        <Crystal color={rarityColor} x={drop.x} z={drop.z} setRef={setItemRef} />
      )}
      <mesh
        ref={(m: THREE.Mesh | null) => {
          if (m) ringRefs.current!.set(drop.id, { mesh: m, u: uniforms })
          else ringRefs.current!.delete(drop.id)
        }}
        position={[drop.x, 0.07, drop.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={material}
      >
        <ringGeometry args={[0.5, 0.72, 48]} />
      </mesh>
    </>
  )
}

/** Glowing crystal — boots drop + suspense fallback */
const Crystal = ({
  color,
  x,
  z,
  setRef,
}: {
  color: string
  x: number
  z: number
  setRef: (o: THREE.Object3D | null) => void
}) => (
  <mesh ref={setRef} position={[x, 0.55, z]}>
    <octahedronGeometry args={[0.2, 0]} />
    <meshBasicMaterial color={color} toneMapped={false} />
  </mesh>
)

/** The actual KayKit item, normalized to a consistent display size */
const DroppedItem = ({
  url,
  x,
  z,
  setRef,
}: {
  url: string
  x: number
  z: number
  setRef: (o: THREE.Object3D | null) => void
}) => {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => {
    const item = scene.clone(true)
    const box = new THREE.Box3().setFromObject(item)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    // Center horizontally, sit the bottom at the group origin
    item.position.set(-center.x, -box.min.y, -center.z)
    const group = new THREE.Group()
    group.add(item)
    group.scale.setScalar(0.6 / maxDim)
    group.position.set(x, 0.45, z)
    return group
  }, [scene, x, z])
  return <primitive object={obj} ref={setRef} />
}

// Preload every drop model so pickups never suspend mid-fight
useGLTF.preload('/items/sword_1handed.gltf')
useGLTF.preload('/items/axe_1handed.gltf')
useGLTF.preload('/items/sword_2handed.gltf')
useGLTF.preload('/items/sword_2handed_color.gltf')
useGLTF.preload('/items/shield_round_color.gltf')
useGLTF.preload('/items/shield_square_color.gltf')
useGLTF.preload('/items/shield_spikes_color.gltf')
useGLTF.preload('/items/shield_badge_color.gltf')
useGLTF.preload('/items/spellbook_closed.gltf')
useGLTF.preload('/items/spellbook_open.gltf')
useGLTF.preload('/items/smokebomb.gltf')
useGLTF.preload('/items/1h-sword-upgrade-cv.glb')
useGLTF.preload('/items/1h-sword-upgrade-cs.glb')
useGLTF.preload('/items/2h-axe-upgrade-cv.glb')
useGLTF.preload('/items/2h-axe-upgrade-cs.glb')
useGLTF.preload('/items/staff-upgrade-cv.glb')
useGLTF.preload('/items/staff-upgrade-cs.glb')
useGLTF.preload('/items/dagger-upgrade-cv.glb')
useGLTF.preload('/items/dagger-upgrade-cs.glb')
useGLTF.preload('/items/shield-spiked-cv.glb')
useGLTF.preload('/items/shield-spiked-cs.glb')
useGLTF.preload('/items/shield-square-cv.glb')
useGLTF.preload('/items/shield-square-cs.glb')
