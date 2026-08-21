import * as THREE from 'three'
import { useRef, useEffect, useImperativeHandle, forwardRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { GLTFLoader } from 'three-stdlib'
import { cloneRigged } from '@/game/cloneRigged'
import type { ThreeElements } from '@react-three/fiber'
import { useGameStore } from '../store'
import { VFXEmitter, PARTICLES } from '../components/particles'
import { slashSparksName } from '../components/particles/slash'
import type { CapsHandle } from './types'
import { createSwordMaterial, swordGlowColor, swordRarityColor, swordRarityLevel } from './materials'
import { slashColorBase, slashColorGlow } from '../components/particles/slash'
import { useCapsController } from './useCapsController'
import { registerRig, unregisterRig, PLAYER_RIG_ID } from '@/replay/rigRegistry'
import { Energy } from '@/components/particles/energy'
import { applyInGameGear, computeGearVisual, bestGearRarity, RARITY_COLORS, resolveArmorMeshTargetBone } from '@/game/gear'
import { CHARACTERS, CHARACTER_LIST, CHARACTER_VFX, type CharacterId } from '@/game/characters'
import { createEnergyRingMaterial } from '@/components/vfx/energy'

// Debug flag for hitbox visualization
const DEBUG_HITBOX = false

// Blade center offset varies by weapon type
const WEAPON_CENTERS: Record<string, number> = {
  '1H_Sword': 0.55,
  '2H_Sword': 0.6,
  '2H_Axe': 0.65,
  'Knife': 0.3,
  '2H_Staff': 0.7,
}

export type CapsProps = ThreeElements['group']

// ---------------------------------------------------------------------------
// Worn-gear FX — the pieces of loot you can SEE beyond attachment swaps
// ---------------------------------------------------------------------------

/** Trinket — a rarity-colored charm orbiting the character's chest */
const TrinketOrbiter = ({ color }: { color: string }) => {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ elapsed }) => {
    if (!ref.current) return
    const t = elapsed
    ref.current.position.set(
      Math.cos(t * 1.5) * 0.9,
      1.3 + Math.sin(t * 2.1) * 0.12,
      Math.sin(t * 1.5) * 0.9
    )
    ref.current.rotation.y = t * 2.4
    ref.current.rotation.x = t * 1.1
  })
  return (
    <mesh ref={ref}>
      <octahedronGeometry args={[0.12]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  )
}

/** Boots / mage armor — a pulsing energy ward ring at the feet */
const WardRing = ({ color }: { color: string }) => {
  const { material, uniforms } = useMemo(
    () => createEnergyRingMaterial(color, '#ffffff', 3),
    [color]
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame((_, delta) => {
    uniforms.uTime.value += delta
    uniforms.uOpacity.value = 0.22 + Math.sin(uniforms.uTime.value * 2.4) * 0.08
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} material={material}>
      <ringGeometry args={[0.55, 0.75, 48]} />
    </mesh>
  )
}

export const Caps = forwardRef<CapsHandle, CapsProps>(({ ...props }, ref) => {
  // Refs
  const group = useRef<THREE.Group>(null)
  const swordRef2 = useRef<THREE.Group>(null)
  const target = useRef<THREE.Mesh>(null)
  const externalWeaponGroup = useRef<THREE.Group>(null)
  const armorGroup = useRef<THREE.Group>(null)
  const slashEmitterRef = useRef<{ emit: (overrides?: Record<string, unknown>) => void } | null>(
    null
  )
  const sparkEmitterRef = useRef<{ emit: (overrides?: Record<string, unknown>) => void } | null>(
    null
  )
  // One emitter per class pool, mounted permanently. Routing the shared
  // sparkEmitterRef to the current class avoids keyed remounts, whose buffer
  // disposal freezes the WebGPU canvas ("used in submit while destroyed").
  const sparkEmitters = useRef<
    Partial<Record<CharacterId, { emit: (overrides?: Record<string, unknown>) => void } | null>>
  >({})

  // Store
  const updateSwordHitbox = useGameStore((s) => s.updateSwordHitbox)
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  const charDef = CHARACTERS[selectedCharacter]

  // Route the shared sparkEmitterRef to the current class's pool emitter
  useEffect(() => {
    sparkEmitterRef.current = sparkEmitters.current[selectedCharacter] ?? null
  }, [selectedCharacter])

  // Apply the class's VFX identity to the live TSL uniforms (slash arc tint,
  // weapon charge glow). Uniforms are shared singletons — mutate, no rebuild.
  useEffect(() => {
    const vfx = CHARACTER_VFX[selectedCharacter]
    slashColorBase.value.set(vfx.slash.base)
    slashColorGlow.value.set(vfx.slash.glow)
    swordGlowColor.value.set(vfx.swordGlow)
    ;(window as any).__classVfx = { character: selectedCharacter, ...vfx }
  }, [selectedCharacter])

  // Weapon rarity sheen follows the best gear collected this run
  const gear = useGameStore((s) => s.gear)
  useEffect(() => {
    const best = bestGearRarity(gear)
    const levels = { common: 0.35, rare: 0.6, epic: 0.85, legendary: 1.15 } as const
    swordRarityLevel.value = best ? levels[best] : 0
    if (best) swordRarityColor.value.set(RARITY_COLORS[best])
  }, [gear])

  // Temp vectors for world transform extraction (avoid GC)
  const worldPos = useMemo(() => new THREE.Vector3(), [])
  const worldQuat = useMemo(() => new THREE.Quaternion(), [])

  // GLTF — load the selected character's model
  const { scene, animations } = useGLTF(charDef.model)
  const clone = useMemo(() => cloneRigged(scene), [scene])

  // ---------------------------------------------------------------------------
  // MANUAL ANIMATION SETUP — bypasses drei v11 alpha useAnimations ref bug.
  // useAnimations binds clips in a layout effect; if the group ref is null on
  // first run (which it always is), it never re-runs because effects don't
  // watch ref mutations. Actions never get created → T-Pose forever.
  // ---------------------------------------------------------------------------
  const [actions, setActions] = useState<Record<string, THREE.AnimationAction>>({})
  const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null)

  useEffect(() => {
    if (!clone) return

    const m = new THREE.AnimationMixer(clone)
    setMixer(m)

    const acts: Record<string, THREE.AnimationAction> = {}
    for (const clip of animations) {
      acts[clip.name] = m.clipAction(clip)
    }
    setActions(acts)
    registerRig(PLAYER_RIG_ID, { mixer: m, actions: acts })

    // Play stance immediately so we never see T-Pose
    const stance = acts[charDef.anims.stance]
    if (stance) {
      stance.reset().fadeIn(0.1).play()
    }

    return () => {
      unregisterRig(PLAYER_RIG_ID)
      m.stopAllAction()
      for (const a of Object.values(acts)) a.stop()
      setMixer(null)
      setActions({})
    }
  }, [clone, animations, charDef.anims.stance])

  useFrame((_, delta) => {
    // During replay playback the replay engine drives poses directly
    if (useGameStore.getState().replayPhase === 'playback') return
    mixer?.update(delta)
  })

  // One-time scene setup: hide unused attachments, shadows, grab the weapon node
  const [weapon, setWeapon] = useState<THREE.Object3D | null>(null)
  const weaponRef = useRef<THREE.Mesh | null>(null)
  useEffect(() => {
    let weaponNode: THREE.Object3D | null = null
    clone.traverse((obj) => {
      if (charDef.hide.includes(obj.name)) obj.visible = false
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
      if (obj.name === charDef.weapon) {
        mesh.material = createSwordMaterial(Array.isArray(mesh.material) ? undefined : mesh.material)
        weaponNode = obj
        weaponRef.current = mesh
      }
    })
    setWeapon(weaponNode)
  }, [clone, charDef])

  // Gear visuals — uses the shared pipeline so menu, game, and preview all match
  const [gearVisual, setGearVisual] = useState(() =>
    computeGearVisual(selectedCharacter, [], charDef.weapon)
  )
  useEffect(() => {
    const visual = computeGearVisual(selectedCharacter, gear, charDef.weapon)
    setGearVisual(visual)
    applyInGameGear(
      clone,
      selectedCharacter,
      charDef,
      gear,
      charDef.weapon,
      externalWeaponGroup.current
    )
  }, [clone, selectedCharacter, gear, charDef.weapon])

  // Full armor
  useEffect(() => {
    const group = armorGroup.current
    if (!group) return
    group.clear()

    const armorPath = gearVisual.fullArmor
    if (!armorPath) return

    const loader = new GLTFLoader()
    loader.load(
      armorPath,
      (gltf) => {
        const armorScene = gltf.scene.clone(true)

        clone.updateWorldMatrix(true, false)

        const bones = new Map<string, THREE.Bone>()
        clone.traverse((obj) => {
          if (obj.isBone) bones.set(obj.name, obj)
        })

        const matchedBones = new Set<string>()
        const unmatchedMeshes: string[] = []

        armorScene.traverse((child) => {
          if (!child.isMesh) return

          child.material = Array.isArray(child.material)
            ? child.material.map((m) => m.clone())
            : child.material.clone()

          const targetBoneName = resolveArmorMeshTargetBone(child.name)
          const bone = targetBoneName ? bones.get(targetBoneName) : null
          if (bone) {
            matchedBones.add(child.name)
            child.position.set(0, 0, 0)
            child.rotation.set(0, 0, 0)
            child.scale.set(1, 1, 1)
            child.updateMatrix()
            bone.add(child)
          } else {
            unmatchedMeshes.push(child.name)
            child.applyMatrix4(new THREE.Matrix4())
            group.add(child)
          }
        })

        if (unmatchedMeshes.length > 0) {
          console.warn('[FullArmor] Unmatched meshes (no bone found):', unmatchedMeshes)
          console.warn('[FullArmor] Available bones:', Array.from(bones.keys()))
        }
      },
      undefined,
      (err) => {
        console.error('Failed to load full armor:', armorPath, err)
      }
    )

    return () => {
      group.clear()
    }
  }, [clone, gearVisual.fullArmor])

  // Controller hook - handles all animation logic with character-specific clips
  const controller = useCapsController({
    actions,
    mixer,
    weapon,
    swordRef2,
    group,
    slashEmitterRef,
    sparkEmitterRef,
    anims: charDef.anims,
    characterId: charDef.id,
    ranged: charDef.ranged ?? false,
  })

  const { onMouseDown, onMouseUp, onRightClick, onRightRelease, isAttacking } = controller

  // Update sword hitbox world transform in store (for hit detection)
  useFrame(() => {
    if (target.current) {
      target.current.updateWorldMatrix(true, false)
      target.current.getWorldPosition(worldPos)
      target.current.getWorldQuaternion(worldQuat)
      updateSwordHitbox(worldPos, worldQuat)
    }
  })

  useImperativeHandle(ref, () => ({ onMouseDown, onMouseUp, onRightClick, onRightRelease }), [
    onMouseDown,
    onMouseUp,
    onRightClick,
    onRightRelease,
  ])

  const bladeCenter = WEAPON_CENTERS[weapon?.name ?? charDef.weapon] ?? 0.55

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <group ref={swordRef2}>
        <mesh ref={target} position={[0, bladeCenter, 0]}>
          <planeGeometry args={[0.5, 1.7]} />
          <meshStandardMaterial color="red" visible={false} />
          {CHARACTER_LIST.map((id) => (
            <VFXEmitter
              key={id}
              name={slashSparksName(id)}
              ref={(r) => {
                sparkEmitters.current[id] = r
              }}
              autoStart={false}
              position={[0, -0.2, 0]}
              localDirection={true}
              emitCount={1}
            />
          ))}
          <Energy />
          {DEBUG_HITBOX && (
            <mesh rotation={[0, 0, 0]}>
              <circleGeometry args={[1.02, 32]} />
              <meshBasicMaterial
                color={isAttacking ? '#ff4444' : '#44ff44'}
                transparent
                opacity={isAttacking ? 0.4 : 0.1}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </mesh>
      </group>

      <VFXEmitter
        name={PARTICLES.SLASH}
        ref={slashEmitterRef}
        position={[0, 0, 0.6]}
        autoStart={false}
        localDirection={true}
        delay={1}
        direction={[
          [1, 1],
          [0, 0],
          [0, 0],
        ]}
      />

      <group ref={group} {...props} dispose={null} scale={charDef.scale}>
        <primitive object={clone} />
        {gearVisual.trinketColor && <TrinketOrbiter color={gearVisual.trinketColor} />}
        {gearVisual.wardColor && <WardRing color={gearVisual.wardColor} />}
        <group ref={externalWeaponGroup} />
        <group ref={armorGroup} />
      </group>
    </>
  )
})

// Preload all character models
useGLTF.preload('/character/Knight.glb')
useGLTF.preload('/character/Barbarian.glb')
useGLTF.preload('/character/Rogue.glb')
useGLTF.preload('/character/Mage.glb')

// Preload full armor sets
useGLTF.preload('/items/knight-armor-full-ornamental.glb')
useGLTF.preload('/items/barbarian-full-bark.glb')
useGLTF.preload('/items/rogue-full-pine.glb')
useGLTF.preload('/items/mage-full-lava.glb')

// Preload external weapon upgrades
useGLTF.preload('/items/1h-sword-upgrade-cv.glb')
useGLTF.preload('/items/1h-sword-upgrade-cs.glb')
useGLTF.preload('/items/2h-axe-upgrade-cv.glb')
useGLTF.preload('/items/2h-axe-upgrade-cs.glb')
useGLTF.preload('/items/staff-upgrade-cv.glb')
useGLTF.preload('/items/staff-upgrade-cs.glb')
useGLTF.preload('/items/dagger-upgraded-v1.glb')
useGLTF.preload('/items/dagger-upgraded-v2-x2-scale.glb')
