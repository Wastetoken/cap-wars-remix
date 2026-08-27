import { useMemo, memo } from 'react'
import { useGLTF } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import { useGameStore } from '@/store'
import { LEVELS } from '@/game/levels'

// ============================================================================
// Arena — KayKit Dungeon Remastered (CC0)
// https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0
//
// 7x7 large floor tiles (4u each) = 28x28 unit play area, ringed by walls
// with arches, corner pieces, pillars, wall torches, banners and props.
// ============================================================================

/** Gameplay clamp for player/enemy movement (inner wall face is at 13.5) */
export { ARENA_BOUND } from '@/constants'

const TILE = 4
const GRID = 7
const HALF = (GRID * TILE) / 2 // 14

type Vec3 = [number, number, number]

type Placement = {
  position: Vec3
  rotationY?: number
}

const PI = Math.PI
const PI_2 = Math.PI / 2

// ---------------------------------------------------------------------------
// Layout (deterministic — no per-frame random)
// ---------------------------------------------------------------------------

const range = (n: number) => Array.from({ length: n }, (_, i) => i - (n - 1) / 2)

const floorPlacements: Placement[] = range(GRID).flatMap((gx) =>
  range(GRID).map((gz) => ({
    position: [gx * TILE, -0.05, gz * TILE] as Vec3, // top surface ≈ y=0
    rotationY: (((gx * 7 + gz * 13) % 4) + 4) % 4 * PI_2, // quarter-turn variety
  }))
)

// Walls: plain sections at offsets -12,-4,4,12 — arches at -8,0,8
const wallPlacements: Placement[] = [-3, -1, 1, 3].flatMap((i) => [
  { position: [i * TILE, 0, -HALF] as Vec3, rotationY: 0 }, // north
  { position: [i * TILE, 0, HALF] as Vec3, rotationY: PI }, // south
  { position: [-HALF, 0, i * TILE] as Vec3, rotationY: PI_2 }, // west
  { position: [HALF, 0, i * TILE] as Vec3, rotationY: -PI_2 }, // east
])

const archPlacements: Placement[] = [-2, 0, 2].flatMap((i) => [
  { position: [i * TILE, 0, -HALF] as Vec3, rotationY: 0 },
  { position: [i * TILE, 0, HALF] as Vec3, rotationY: PI },
  { position: [-HALF, 0, i * TILE] as Vec3, rotationY: PI_2 },
  { position: [HALF, 0, i * TILE] as Vec3, rotationY: -PI_2 },
])

// Corners (corner piece arms extend -X and +Z, rotate per corner)
const cornerPlacements: Placement[] = [
  { position: [HALF, 0, -HALF], rotationY: 0 }, // NE
  { position: [HALF, 0, HALF], rotationY: -PI_2 }, // SE
  { position: [-HALF, 0, HALF], rotationY: PI }, // SW
  { position: [-HALF, 0, -HALF], rotationY: PI_2 }, // NW
]

const pillarPlacements: Placement[] = [
  { position: [10.5, 0, 10.5] },
  { position: [-10.5, 0, 10.5] },
  { position: [10.5, 0, -10.5] },
  { position: [-10.5, 0, -10.5] },
]

// Wall-mounted torches on the inner faces (torch sticks out +Z from mount)
const torchPlacements: Placement[] = [-8, 0, 8].flatMap((i) => [
  { position: [i, 2.3, -(HALF - 0.55)] as Vec3, rotationY: 0 }, // north
  { position: [i, 2.3, HALF - 0.55] as Vec3, rotationY: PI }, // south
  { position: [-(HALF - 0.55), 2.3, i] as Vec3, rotationY: PI_2 }, // west
  { position: [HALF - 0.55, 2.3, i] as Vec3, rotationY: -PI_2 }, // east
])

// Banners between torches on north & south walls
const bannerPlacements: Placement[] = [-4, 4].flatMap((i) => [
  { position: [i, 1.6, -(HALF - 0.6)] as Vec3, rotationY: 0 },
  { position: [i, 1.6, HALF - 0.6] as Vec3, rotationY: PI },
])

// Props in the corners
const propPlacements = {
  barrel: [
    { position: [12.1, 0, 11.5] as Vec3, rotationY: 0.4 },
    { position: [11.2, 0, 12.4] as Vec3, rotationY: 2.1 },
    { position: [-12.2, 0, -11.8] as Vec3, rotationY: 1.2 },
  ],
  crates: [{ position: [-11.9, 0, 12] as Vec3, rotationY: 0.2 }],
  chest: [{ position: [11.9, 0.17, -11.9] as Vec3, rotationY: -PI_2 * 0.5 }],
  candle: [{ position: [-12.1, 2.14, 11.9] as Vec3, rotationY: 0 }], // on the crates
}

// ---------------------------------------------------------------------------
// Piece renderer — clones a GLB scene per placement
// ---------------------------------------------------------------------------

const prepClone = (scene: THREE.Group) => {
  const c = SkeletonUtils.clone(scene)
  c.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return c
}

const Piece = memo(({
  scene,
  placement,
}: {
  scene: THREE.Group
  placement: Placement
}) => {
  const obj = useMemo(() => prepClone(scene), [scene])

  useEffect(() => {
    return () => {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          mesh.geometry?.dispose()
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose())
          } else {
            mesh.material?.dispose()
          }
        }
      })
    }
  }, [obj])

  return (
      <primitive
        object={obj}
        position={placement.position}
        rotation={[0, placement.rotationY ?? 0, 0]}
        dispose={null}
      />
    )
  })

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

export const Arena = () => {
  const currentLevel = useGameStore((s) => s.currentLevel)
  const levelConfig = LEVELS[currentLevel] ?? LEVELS[0]

  const floorStone = useGLTF('/arena/floor_tile_large.gltf.glb')
  const floorDirt = useGLTF('/arena/floor_dirt_large.gltf.glb')

  // Pre-clone BOTH floor tile sets once at mount. Levels swap floors by
  // toggling visibility — the old code re-cloned all 49 tiles mid-frame on
  // every level change, causing a visible hitch at the portal transition.
  // Clones share geometry/materials with the source, so the extra set is
  // cheap (a few dozen scene-graph nodes, no extra GPU memory).
  const stoneTiles = useMemo(() => floorPlacements.map(() => prepClone(floorStone.scene)), [floorStone.scene])
  const dirtTiles = useMemo(() => floorPlacements.map(() => prepClone(floorDirt.scene)), [floorDirt.scene])
  const useDirt = levelConfig.floor === 'dirt'

  const wall = useGLTF('/arena/wall.gltf.glb')
  const wallArch = useGLTF('/arena/wall_arched.gltf.glb')
  const wallCorner = useGLTF('/arena/wall_corner.gltf.glb')
  const pillar = useGLTF('/arena/pillar.gltf.glb')
  const torch = useGLTF('/arena/torch_mounted.gltf.glb')
  const banner = useGLTF('/arena/banner_patternA_red.gltf.glb')
  const barrel = useGLTF('/arena/barrel_large.gltf.glb')
  const crates = useGLTF('/arena/crates_stacked.gltf.glb')
  const chest = useGLTF('/arena/chest_gold.glb')
  const candle = useGLTF('/arena/candle_triple.gltf.glb')

  return (
    <group>
      <group visible={!useDirt}>
        {stoneTiles.map((obj, i) => (
          <primitive
            key={`floor-stone-${i}`}
            object={obj}
            position={floorPlacements[i].position}
            rotation={[0, floorPlacements[i].rotationY ?? 0, 0]}
            dispose={null}
          />
        ))}
      </group>
      <group visible={useDirt}>
        {dirtTiles.map((obj, i) => (
          <primitive
            key={`floor-dirt-${i}`}
            object={obj}
            position={floorPlacements[i].position}
            rotation={[0, floorPlacements[i].rotationY ?? 0, 0]}
            dispose={null}
          />
        ))}
      </group>
      {wallPlacements.map((p, i) => (
        <Piece key={`wall-${i}`} scene={wall.scene} placement={p} />
      ))}
      {archPlacements.map((p, i) => (
        <Piece key={`arch-${i}`} scene={wallArch.scene} placement={p} />
      ))}
      {cornerPlacements.map((p, i) => (
        <Piece key={`corner-${i}`} scene={wallCorner.scene} placement={p} />
      ))}
      {pillarPlacements.map((p, i) => (
        <Piece key={`pillar-${i}`} scene={pillar.scene} placement={p} />
      ))}
      {torchPlacements.map((p, i) => (
        <Piece key={`torch-${i}`} scene={torch.scene} placement={p} />
      ))}
      {bannerPlacements.map((p, i) => (
        <Piece key={`banner-${i}`} scene={banner.scene} placement={p} />
      ))}
      {propPlacements.barrel.map((p, i) => (
        <Piece key={`barrel-${i}`} scene={barrel.scene} placement={p} />
      ))}
      {propPlacements.crates.map((p, i) => (
        <Piece key={`crates-${i}`} scene={crates.scene} placement={p} />
      ))}
      {propPlacements.chest.map((p, i) => (
        <Piece key={`chest-${i}`} scene={chest.scene} placement={p} />
      ))}
      {propPlacements.candle.map((p, i) => (
        <Piece key={`candle-${i}`} scene={candle.scene} placement={p} />
      ))}
    </group>
  )
}

useGLTF.preload('/arena/floor_tile_large.gltf.glb')
useGLTF.preload('/arena/floor_dirt_large.gltf.glb')
useGLTF.preload('/arena/wall.gltf.glb')
useGLTF.preload('/arena/wall_arched.gltf.glb')
useGLTF.preload('/arena/wall_corner.gltf.glb')
useGLTF.preload('/arena/pillar.gltf.glb')
useGLTF.preload('/arena/torch_mounted.gltf.glb')
useGLTF.preload('/arena/banner_patternA_red.gltf.glb')
useGLTF.preload('/arena/barrel_large.gltf.glb')
useGLTF.preload('/arena/crates_stacked.gltf.glb')
useGLTF.preload('/arena/chest_gold.glb')
useGLTF.preload('/arena/candle_triple.gltf.glb')
