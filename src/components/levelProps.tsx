import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useGameStore } from '@/store'

// ============================================================================
// Level props — per-level decorative dressing along the arena walls (outside
// the combat lane so nothing interferes with fights). Pulled from the user's
// Kenney packs (Survival / Castle / Fantasy Town / Nature).
// ============================================================================

const P = '/props/'

type PropPlacement = {
  url: string
  x: number
  z: number
  rotY?: number
  /** Target max dimension in world units */
  size: number
  /** Ember glow light + ember orb (campfires) */
  fire?: boolean
}

const C = 12.9 // corner offset
const E = 13.2 // edge offset

const corners = (url: string, size: number, fire = false): PropPlacement[] => [
  { url, x: -C, z: -C, rotY: Math.PI / 4, size, fire },
  { url, x: C, z: -C, rotY: -Math.PI / 4, size, fire },
  { url, x: C, z: C, rotY: Math.PI + Math.PI / 4, size, fire },
  { url, x: -C, z: C, rotY: Math.PI - Math.PI / 4, size, fire },
]

const edges = (url: string, size: number, fire = false): PropPlacement[] => [
  { url, x: 0, z: -E, size, fire },
  { url, x: E, z: 0, rotY: Math.PI / 2, size, fire },
  { url, x: 0, z: E, rotY: Math.PI, size, fire },
  { url, x: -E, z: 0, rotY: -Math.PI / 2, size, fire },
]

const LEVEL_PROPS: Record<number, PropPlacement[]> = {
  // I — Dungeon Hall: stored crates and a cart
  0: [
    ...edges(`${P}box-large.glb`, 1.6),
    { url: `${P}cart.glb`, x: -C, z: -C, rotY: Math.PI / 3, size: 2.4 },
    { url: `${P}box-large.glb`, x: C, z: C, rotY: 0.4, size: 1.4 },
  ],
  // II — Sunken Crypt: damp rock and mushrooms
  1: [
    ...corners(`${P}rock_largeB.glb`, 2.2),
    { url: `${P}mushroom_redTall.glb`, x: 0, z: -E, size: 1.4 },
    { url: `${P}mushroom_redTall.glb`, x: -E, z: 0, rotY: 2, size: 1.1 },
    { url: `${P}stone_largeA.glb`, x: E, z: 0, size: 1.5 },
  ],
  // III — Armory: crates and rubble
  2: [
    ...edges(`${P}box-large.glb`, 1.5),
    ...corners(`${P}rock-a.glb`, 1.8),
  ],
  // IV — Shadow Pit: jagged tall rocks
  3: [
    ...corners(`${P}rock_tallA.glb`, 3.4),
    ...edges(`${P}stone_largeA.glb`, 1.6),
  ],
  // V — Throne of the King: corner towers
  4: [...corners(`${P}tower-square.glb`, 4.6)],
  // VI — Frozen Sanctum: pale boulders
  5: [
    ...corners(`${P}rock_largeB.glb`, 2.6),
    ...edges(`${P}stone_largeA.glb`, 1.8),
  ],
  // VII — Ember Depths: burning campfires
  6: [
    ...edges(`${P}campfire-pit.glb`, 1.6, true),
    ...corners(`${P}rock-a.glb`, 2.0),
  ],
  // VIII — The King Returns: towers + fires
  7: [
    ...corners(`${P}tower-square.glb`, 4.6),
    ...edges(`${P}campfire-pit.glb`, 1.5, true),
  ],
}

/** Flickering ember light + glow orb for campfires */
const EmberGlow = ({ x, z }: { x: number; z: number }) => {
  const light = useRef<THREE.PointLight>(null)
  useFrame(({ elapsed }) => {
    if (!light.current) return
    light.current.intensity = 5.5 + Math.sin(elapsed * 7.3 + x) * 1.6 + Math.sin(elapsed * 13.1 + z) * 0.9
  })
  return (
    <group position={[x, 0.5, z]}>
      <pointLight ref={light} color="#ff7a2a" intensity={5.5} distance={7} decay={2} />
      <mesh>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshBasicMaterial color="#ff9c39" toneMapped={false} />
      </mesh>
    </group>
  )
}

const Prop = ({ url, x, z, rotY = 0, size }: PropPlacement) => {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => {
    const item = scene.clone(true)
    item.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    const box = new THREE.Box3().setFromObject(item)
    const dims = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(dims)
    box.getCenter(center)
    const maxDim = Math.max(dims.x, dims.y, dims.z) || 1
    // Center horizontally, sit on the floor
    item.position.set(-center.x, -box.min.y, -center.z)
    const group = new THREE.Group()
    group.add(item)
    group.scale.setScalar(size / maxDim)
    group.position.set(x, 0, z)
    group.rotation.y = rotY
    return group
  }, [scene, x, z, rotY, size])
  useEffect(() => () => {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.geometry.dispose()
    })
  }, [obj])
  return <primitive object={obj} />
}

export const LevelProps = () => {
  const currentLevel = useGameStore((s) => s.currentLevel)
  const runId = useGameStore((s) => s.runId)
  const placements = LEVEL_PROPS[currentLevel] ?? []
  return (
    <group key={`${currentLevel}-${runId}`}>
      {placements.map((p, i) => (
        <group key={i}>
          <Prop {...p} />
          {p.fire && <EmberGlow x={p.x} z={p.z} />}
        </group>
      ))}
    </group>
  )
}

useGLTF.preload(`${P}box-large.glb`)
useGLTF.preload(`${P}campfire-pit.glb`)
useGLTF.preload(`${P}cart.glb`)
useGLTF.preload(`${P}mushroom_redTall.glb`)
useGLTF.preload(`${P}rock-a.glb`)
useGLTF.preload(`${P}rock_largeB.glb`)
useGLTF.preload(`${P}rock_tallA.glb`)
useGLTF.preload(`${P}stone_largeA.glb`)
useGLTF.preload(`${P}tower-square.glb`)
