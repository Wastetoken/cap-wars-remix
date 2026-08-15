import { VFXParticles } from 'r3f-vfx'
import { OctahedronGeometry } from 'three/webgpu'
import { PARTICLES } from './index'

/** Arcane rift shards — violet/cyan octahedra, additive, emitted at
 *  orbiting positions by the Portal each frame (the swirl). */
export const Rift = () => {
  return (
    <VFXParticles
      name={PARTICLES.RIFT}
      curveTexturePath="/vfx/spawn.bin"
      autoStart={false}
      geometry={new OctahedronGeometry(0.5, 1)}
      maxParticles={220}
      position={[0, 0, 0]}
      emitCount={4}
      size={[0.05, 0.3]}
      fadeSize={[0.2, 1]}
      colorStart={['#e0f2fe', '#a855f7', '#6366f1']}
      fadeOpacity={[1, 0]}
      gravity={[0, 0.6, 0]}
      speed={[0.15, 0.6]}
      lifetime={1.4}
      startPosition={[
        [0, 0],
        [0, 0],
        [0, 0],
      ]}
      startPositionAsDirection={true}
      rotation={[
        [-3.4, 6.7],
        [-7.6, 6.7],
        [-5.4, 6.4],
      ]}
      rotationSpeed={[
        [-6.3, 5.9],
        [-5.9, 6],
        [-6.6, 6],
      ]}
      appearance="gradient"
      blending={1}
      lighting="basic"
      emitterShape={4}
      emitterRadius={[0, 0.03]}
      emitterAngle={0.7853981633974483}
      emitterHeight={[0, 1]}
      emitterDirection={[0, 1, 0]}
      emitterSurfaceOnly={true}
    />
  )
}
