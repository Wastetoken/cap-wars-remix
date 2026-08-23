import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  uv,
  vec2,
  vec3,
  smoothstep,
  mix,
  texture,
  color,
  float,
  screenUV,
  viewportSharedTexture,
  uniform,
  positionLocal,
  normalWorld,
} from 'three/tsl'
import { noiseTexture } from '../textures/noiseTexture'
import { useGLTF } from '@react-three/drei'
import { voronoiTexture } from '../textures/voronoiTexture'
import { VFXParticles } from 'r3f-vfx'
import { PARTICLES, type ParticleType } from './index'
import { CHARACTER_LIST, CHARACTER_VFX, type CharacterId } from '@/game/characters'

export const vortexColorBase = uniform(new THREE.Color('#7dd3fc'))
export const vortexColorGlow = uniform(new THREE.Color('#c4b5fd'))

type GLTFResult = ReturnType<typeof useGLTF> & {
  nodes: { Ribbon: { geometry: THREE.BufferGeometry } }
}

export const Vortex = () => {
  const { nodes } = useGLTF('/vfx/ribbon.glb') as GLTFResult

  const vortexNodes = ({ progress }: { progress: any }) => {
    const pos = positionLocal
    const worldPos = pos.add(float(0.5))
    
    // Ground-up reveal based on Y position
    const revealProgress = progress.mul(1.2).clamp(0, 1)
    const revealCutoff = float(1).sub(revealProgress)
    const revealMask = smoothstep(
      revealCutoff.sub(0.1),
      revealCutoff.add(0.1),
      worldPos.y
    )

    // Swirling vortex: rotate UVs around center over time
    const center = vec2(0.5, 0.5)
    const uvFromCenter = uv().sub(center)
    const dist = uvFromCenter.length()
    const angle = uvFromCenter.angle()
    const swirlSpeed = float(4.0).add(dist.mul(6.0))
    const swirlAngle = angle.add(progress.mul(swirlSpeed.mul(6.28)))
    const swirlUv = vec2(
      center.x.add(dist.mul(swirlAngle.cos())),
      center.y.add(dist.mul(swirlAngle.sin()))
    )

    // Cracked/jagged dissolve using noise + voronoi
    const vor = texture(voronoiTexture, swirlUv.mul(2.0).add(progress.mul(0.5)))
    const noise = texture(noiseTexture, swirlUv.mul(3.0).add(progress.mul(0.8)))
    const crackPattern = vor.r.add(noise.r.mul(0.5))
    const dissolveThreshold = progress.mul(1.3)
    const dissolveMask = smoothstep(
      dissolveThreshold.sub(0.08),
      dissolveThreshold.add(0.08),
      crackPattern
    )

    // Pulsing color between dark base and hot glow
    const pulse = progress.mul(6.28).sin().mul(0.5).add(0.5)
    const baseColor = vortexColorBase.mul(8)
    const glowColor = vortexColorGlow.mul(20)
    const pulsedColor = mix(baseColor, glowColor, pulse)

    // Dissolve edge glow
    const edgeDist = crackPattern.sub(dissolveThreshold).abs()
    const edgeGlow = float(1).sub(smoothstep(0.0, 0.1, edgeDist)).mul(dissolveMask)

    // Screen distortion/heat-warp radiating outward
    const vUv = screenUV
    const toCenter = vUv.sub(vec2(0.5, 0.5))
    const centerDist = toCenter.length()
    const warpStrength = float(0.04).mul(pulse).mul(revealMask)
    const warpDir = toCenter.div(centerDist.max(1e-4))
    const distortion = warpDir.mul(warpStrength)

    const distortedUvR = vUv.add(distortion.mul(1.3))
    const distortedUvG = vUv.add(distortion)
    const distortedUvB = vUv.add(distortion.mul(0.7))

    const r = viewportSharedTexture(distortedUvR).r
    const g = viewportSharedTexture(distortedUvG).g
    const b = viewportSharedTexture(distortedUvB).b
    const distortedBackdrop = vec3(r, g, b)

    const finalColor = mix(pulsedColor, glowColor.mul(2), edgeGlow)
    const backdropWithVortex = mix(distortedBackdrop, finalColor, revealMask.mul(dissolveMask))

    const o = revealMask.mul(dissolveMask).mul(progress.oneMinus())

    return { backdrop: backdropWithVortex, o }
  }

  return (
    <VFXParticles
      autoStart={false}
      geometry={nodes.Ribbon.geometry}
      name={PARTICLES.VORTEX}
      maxParticles={10}
      position={[0, 0, 0]}
      delay={1}
      size={3.5}
      fadeSize={[0.5, 2.5]}
      colorStart={['#ffffff']}
      fadeOpacity={[1, 0]}
      speed={[0, 0]}
      lifetime={[1.5, 1.5]}
      friction={{
        intensity: 0,
        easing: 'linear',
      }}
      orientToDirection={false}
      blending={1}
      lighting="basic"
      emitterShape={1}
      emitterRadius={[0, 1.5]}
      emitterAngle={0}
      emitterHeight={[0, 0.1]}
      emitterDirection={[0, 1, 0]}
      backdropNode={({ progress }) => vortexNodes({ progress }).backdrop}
      opacityNode={({ progress }) => vortexNodes({ progress }).o}
    />
  )
}

export const vortexSparksName = (id: CharacterId) => `vortex-${id}` as ParticleType

export const VortexSparks = () => {
  return (
    <>
      {CHARACTER_LIST.map((id) => (
        <VFXParticles
          key={id}
          curveTexturePath="./vfx/slash-sparks.bin"
          name={vortexSparksName(id)}
          maxParticles={800}
          position={[0, 0, 0]}
          autoStart={false}
          intensity={30}
          size={[0.02, 0.12]}
          fadeSize={[1, 0]}
          colorStart={CHARACTER_VFX[id].vortex}
          fadeOpacity={[1, 0]}
          gravity={[0, 0.2, 0]}
          speed={[0, 2.5]}
          lifetime={[0.4, 0.9]}
          friction={{
            intensity: 0,
            easing: 'linear',
          }}
          direction={[
            [-1, 1],
            [0, 1],
            [-1, 1],
          ]}
          appearance="gradient"
          blending={1}
          lighting="basic"
          emitterShape={2}
          emitterRadius={[0, 0.5]}
          emitterAngle={0.5}
          emitterHeight={[0, 1.5]}
          emitterDirection={[0, 1, 0]}
          emitterSurfaceOnly={true}
        />
      ))}
    </>
  )
}
