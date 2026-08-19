import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { cloneRigged } from '@/game/cloneRigged'
import { useGameStore } from '@/store'
import { CHARACTERS } from '@/game/characters'
import { applyPreviewGear } from '@/game/gear'

// ============================================================================
// CharacterPreview — live 3D character used by the menu character select and
// the loadout sheet. Wears the run's gear (menu shows the base kit, gear is
// run-scoped and empty there).
// ============================================================================

export const CharacterPreview = ({ spin = true }: { spin?: boolean }) => {
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  const gear = useGameStore((s) => s.gear)
  const charDef = CHARACTERS[selectedCharacter]
  // Own copy of the model ('?menu' cache-bust) — never share the game
  // canvas's cached scene (cross-renderer skinning corruption).
  const { scene, animations } = useGLTF(charDef.model + '?menu')
  const clone = useMemo(() => cloneRigged(scene), [scene])
  const group = useRef<THREE.Group>(null)

  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone])

  useEffect(() => {
    const stance = animations.find((c) => c.name === charDef.anims.stance)
    if (!stance) return
    const action = mixer.clipAction(stance)
    action.reset().fadeIn(0.15).play()
    return () => {
      action.stop()
      mixer.stopAllAction()
    }
  }, [mixer, animations, charDef.anims.stance])

  // Base hides + gear visuals — uses the shared pipeline so menu, game,
  // and preview all match.
  useEffect(() => {
    applyPreviewGear(clone, selectedCharacter, gear, charDef.weapon)
  }, [clone, selectedCharacter, gear, charDef.weapon])

  useFrame((state, delta) => {
    mixer.update(delta)
    if (spin && group.current) group.current.rotation.y += delta * 0.5
    ;(window as any).__previewDebug = {
      group: group.current,
      camera: state.camera,
      size: state.size,
      viewport: state.viewport,
      gl: state.gl,
      scene: state.scene,
    }
  })

  return (
    <group ref={group} scale={charDef.scale} position={[0, -0.85, 0]}>
      <primitive object={clone} />
    </group>
  )
}

/** Drop-in canvas with menu-grade lighting.
 *  Mount-gated on real container size: R3F v10 can snapshot a stale size when
 *  the canvas mounts during a layout transition (the "giant clipped model"
 *  bug), so we only create the Canvas once the box has final dimensions. */
export const CharacterPreviewCanvas = ({
  className,
  fov = 30,
}: {
  className?: string
  fov?: number
}) => {
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r && r.width > 8 && r.height > 8) setReady(true)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className={className} ref={host}>
      {ready && (
        <Canvas
          camera={{ fov, position: [0, 0.1, 4.4] }}
          dpr={[1, 2]}
          frameloop="always"
          onCreated={(state) => state.camera.lookAt(0, 0, 0)}
        >
          <ambientLight intensity={1.1} />
          <directionalLight position={[2.5, 4, 3]} intensity={2.2} />
          <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#8b9dff" />
          <Suspense fallback={null}>
            <CharacterPreview />
          </Suspense>
        </Canvas>
      )}
    </div>
  )
}
