import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF, Html } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useGameStore } from '@/store'
import { CHARACTERS, CHARACTER_LIST, type CharacterId } from '@/game/characters'
import { levelForSouls } from '@/game/progression'
import { cloneRigged } from '@/game/cloneRigged'
import mainMenuUrl from '@/main-menu.glb?url'

// ============================================================================
// MenuScene — full-screen 3D home screen in the owner's main-menu diorama
// (medieval door / crypt). The four heroes stand where the diorama's embedded
// static character meshes were placed (those are hidden on load); clicking a
// hero selects them. Gold ring marks the chosen one.
// ============================================================================

const ENV_URL = mainMenuUrl

/** Diorama node names that are placeholder statues/rigs — hidden on load */
const EMBEDDED_RE = /^(Barbarian_|Knight_|Mage_|Rogue_|Rig_Medium|root_n3d)/

/** Where each hero stands — the embedded static character's spot in the GLB.
 *  rotY = azimuth from hero toward the camera home position. */
const CAM_HOME: [number, number, number] = [-0.5, 3.0, 15.2]
const azimuthToCam = (pos: [number, number, number]) =>
  Math.atan2(CAM_HOME[0] - pos[0], CAM_HOME[2] - pos[2])

const STAGE: Record<CharacterId, { pos: [number, number, number]; rotY: number }> = {
  knight: { pos: [-2.91, 0, 4.61], rotY: azimuthToCam([-2.91, 0, 4.61]) },
  barbarian: { pos: [-5.21, 0.07, 6.49], rotY: azimuthToCam([-5.21, 0.07, 6.49]) },
  rogue: { pos: [3.0, -0.01, 4.95], rotY: azimuthToCam([3.0, -0.01, 4.95]) },
  mage: { pos: [0.28, 0.1, 5.57], rotY: azimuthToCam([0.28, 0.1, 5.57]) },
}

const HERO_SCALE = 1

/** Patch a material so its base map is sampled world-space triplanar
 *  (matches the Blender "Box / Global" mapping the gate wall was designed with) */
const applyTriplanar = (mat: THREE.MeshStandardMaterial, scale: number) => {
  if (!mat.map || mat.userData.triplanar) return
  mat.userData.triplanar = true
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTriScale = { value: scale }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;'
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTriNormal = normalize(mat3(modelMatrix) * objectNormal);'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTriPos;
varying vec3 vTriNormal;
uniform float uTriScale;
vec4 triSample(sampler2D t, vec3 p, vec3 n) {
  vec3 an = pow(abs(n), vec3(4.0));
  an /= (an.x + an.y + an.z);
  vec3 tp = p * uTriScale;
  vec4 cx = texture2D(t, tp.zy);
  vec4 cy = texture2D(t, tp.xz);
  vec4 cz = texture2D(t, tp.xy);
  return cx * an.x + cy * an.y + cz * an.z;
}`
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
vec4 sampledDiffuseColor = triSample(map, vTriPos, vTriNormal);
diffuseColor *= sampledDiffuseColor;
#endif`
      )
  }
  mat.needsUpdate = true
}

/** Neutral studio IBL so specular/transmission materials render as designed */
const MenuEnvMap = () => {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = tex
    scene.environmentIntensity = 0.25
    return () => {
      scene.environment = null
      tex.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

const Environment = () => {
  const { scene } = useGLTF(ENV_URL)
  useEffect(() => {
    scene.traverse((obj) => {
      if (EMBEDDED_RE.test(obj.name)) obj.visible = false
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.frustumCulled = false
        mesh.castShadow = false
        mesh.receiveShadow = true
        const mat = mesh.material as THREE.MeshStandardMaterial
        // The ground plane's node transform flips it, leaving world normals
        // facing down — the key light hits nothing and hero shadows have no
        // direct light to darken. Flip them back up (material is DoubleSide,
        // so visibility/winding are unaffected).
        if (mat?.name === 'stylized_mud_pebbles_grass_ground_material' && !mesh.geometry.userData.normalsFlipped) {
          const normals = mesh.geometry.attributes.normal
          for (let i = 0; i < normals.count; i++) {
            normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i))
          }
          normals.needsUpdate = true
          mesh.geometry.userData.normalsFlipped = true
        }
        // Only the 3 gate-wall pieces were designed with triplanar mapping —
        // everything else keeps its authored UVs
        if (mat?.name === 'castle_main_gate_material2' && !mat.userData.triplanar) {
          applyTriplanar(mat, 0.5)
        }
      }
    })
  }, [scene])
  return <primitive object={scene} />
}

const MenuHero = ({ id }: { id: CharacterId }) => {
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  const setSelectedCharacter = useGameStore((s) => s.setSelectedCharacter)
  // Per-character progression: each hero displays their own level + souls
  const souls = useGameStore((s) => s.characterSouls[id] ?? 0)
  const heroLevel = levelForSouls(souls)
  const charDef = CHARACTERS[id]
  // Load the menu's OWN copy of the model ('?menu' cache-busts useGLTF).
  // Sharing the game canvas's cached scene couples the two renderers through
  // shared skeleton state and kills skinned draws (the "no body" bug).
  const { scene, animations } = useGLTF(charDef.model + '?menu')
  const clone = useMemo(() => cloneRigged(scene), [scene])
  // DEBUG render-phase stash (diagnosing effect/module staleness)
  ;((window as unknown as { __heroes?: Record<string, THREE.Object3D> }).__heroes ??= {})[id] = clone
  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone])
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const isSelected = selectedCharacter === id

  useEffect(() => {
    ;((window as unknown as { __heroes?: Record<string, THREE.Object3D> }).__heroes ??= {})[id] = clone
    clone.traverse((obj) => {
      if (charDef.hide.includes(obj.name)) obj.visible = false
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.frustumCulled = false
        mesh.castShadow = true
      }
    })
  }, [clone, charDef])

  useEffect(() => {
    const stance = animations.find((c) => c.name === charDef.anims.stance)
    if (!stance) return
    const action = mixer.clipAction(stance)
    action.reset().fadeIn(0.2).play()
    // Desync heroes so they don't idle in lockstep
    action.time = Math.random() * stance.duration
    return () => {
      action.stop()
      mixer.stopAllAction()
    }
  }, [mixer, animations, charDef.anims.stance])

  useFrame((_, delta) => {
    mixer.update(delta)
    const target = isSelected ? 1.06 : hovered ? 1.03 : 1
    if (group.current) {
      const s = THREE.MathUtils.lerp(group.current.scale.x / (charDef.scale * HERO_SCALE) || 1, target, 0.12)
      group.current.scale.setScalar(charDef.scale * HERO_SCALE * s)
    }
    if (ring.current) {
      const mat = ring.current.material as THREE.MeshBasicMaterial
      const targetOpacity = isSelected ? 0.85 : hovered ? 0.45 : 0
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.15)
      ring.current.rotation.z += delta * (isSelected ? 0.6 : 0.2)
    }
  })

  const stage = STAGE[id]
  return (
    <group position={stage.pos} rotation-y={stage.rotY}>
      <group ref={group} scale={charDef.scale * HERO_SCALE}>
        <primitive object={clone} />
      </group>
      {/* Click target: a tight invisible cylinder over the hero. */}
      <mesh
        position={[0, 1.2, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          setSelectedCharacter(id)
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = ''
        }}
      >
        <cylinderGeometry args={[0.7, 0.7, 2.4, 12]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {/* selection ring on the ground */}
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
        <ringGeometry args={[1.05, 1.3, 48]} />
        <meshBasicMaterial color="#ffd98a" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Html position={[0, 2.2, 0]} center distanceFactor={5} zIndexRange={[20, 0]}>
        <button
          className={`hero-nameplate ${isSelected ? 'selected' : ''}`}
          onClick={() => setSelectedCharacter(id)}
        >
          {charDef.name}
          <span className="hero-level">
            Lv {heroLevel} · {souls} souls
          </span>
        </button>
      </Html>
    </group>
  )
}

/** Slow cinematic sway around the hero lineup */
const CameraRig = () => {
  const sway = useRef(Math.random() * 10)
  useFrame((state, delta) => {
    sway.current += delta * 0.15
    const t = sway.current
    const cam = state.camera
    cam.position.set(
      CAM_HOME[0] + Math.sin(t) * 0.5,
      CAM_HOME[1] + Math.sin(t * 0.7) * 0.2,
      CAM_HOME[2] + Math.cos(t * 0.85) * 0.4
    )
    cam.lookAt(-1.1, 1.3, 5)
  })
  return null
}

export const MenuScene = () => (
  <div className="menu-scene">
    <Canvas
      camera={{ fov: 38, position: CAM_HOME, near: 0.1, far: 1000 }}
      dpr={[1, 2]}
      frameloop="always"
      shadows
      gl={{ antialias: true }}
      onCreated={(s) => { (window as unknown as { __menu?: unknown }).__menu = s }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[11, 8, 9]}
        intensity={2.8}
        color="#ffe3b3"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-10, 6, -6]} intensity={0.45} color="#8b9dff" />
      <Suspense fallback={null}>
        <Environment />
        {CHARACTER_LIST.map((id) => (
          <MenuHero key={id} id={id} />
        ))}
      </Suspense>
      <MenuEnvMap />
      <CameraRig />
    </Canvas>
  </div>
)
