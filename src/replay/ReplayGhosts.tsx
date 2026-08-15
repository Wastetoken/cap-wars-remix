import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useGameStore } from '@/store'
import { CHARACTERS } from '@/game/characters'
import { MOBS } from '@/game/mobs'
import { cloneRigged } from '@/game/cloneRigged'
import { registerGhost, unregisterGhost, GHOST_PLAYER_ID, ghostEnemyId } from './rigRegistry'
import { getRecordingMeta } from './session'

// ============================================================================
// ReplayGhosts — standalone rig clones used when playing back a recording
// loaded from disk. The recorded actors no longer exist in the live scene, so
// each one is recreated as a plain clone whose pose is driven entirely by the
// replay engine (registered in the ghost registry).
// ============================================================================

const GhostRig = ({
  id,
  model,
  scale,
  hide,
}: {
  id: string
  model: string
  scale: number
  hide: string[]
}) => {
  // '?replay' cache-busts useGLTF so the ghost never shares skeleton state
  // with the game/menu copies of the same model (the menu "no body" bug)
  const { scene, animations } = useGLTF(model + '?replay')
  const clone = useMemo(() => cloneRigged(scene), [scene])
  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone])
  const actions = useMemo(() => {
    const acts: Record<string, THREE.AnimationAction> = {}
    for (const clip of animations) acts[clip.name] = mixer.clipAction(clip)
    return acts
  }, [mixer, animations])
  const group = useRef<THREE.Group>(null)

  useEffect(() => {
    clone.traverse((obj) => {
      if (hide.includes(obj.name)) obj.visible = false
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.frustumCulled = false
        mesh.castShadow = true
      }
    })
  }, [clone, hide])

  useEffect(() => {
    if (!group.current) return
    registerGhost(id, { object: group.current, rig: { mixer, actions } })
    return () => unregisterGhost(id)
  }, [id, mixer, actions])

  return (
    <group ref={group} scale={scale}>
      <primitive object={clone} />
    </group>
  )
}

export const ReplayGhosts = () => {
  const active = useGameStore((s) => s.replayPhase === 'playback' && s.replayExternal)
  if (!active) return null
  const meta = getRecordingMeta()
  const charDef = CHARACTERS[meta.characterId as keyof typeof CHARACTERS] ?? CHARACTERS.knight
  return (
    <>
      <GhostRig id={GHOST_PLAYER_ID} model={charDef.model} scale={charDef.scale} hide={charDef.hide} />
      {Object.entries(meta.enemies).map(([id, mob]) => {
        const def = MOBS[mob as keyof typeof MOBS] ?? MOBS.mage
        return (
          <GhostRig key={id} id={ghostEnemyId(id)} model={def.model} scale={def.scale} hide={[]} />
        )
      })}
    </>
  )
}
