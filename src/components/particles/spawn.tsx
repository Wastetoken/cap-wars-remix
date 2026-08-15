import { VFXParticles } from 'r3f-vfx'
import { OctahedronGeometry } from 'three/webgpu'
import { PARTICLES } from './index'

export const Spawn = () => {
  return (
    <>
      <VFXParticles
        name={PARTICLES.SPAWN}
        curveTexturePath="/vfx/spawn.bin"
        autoStart={false}
        geometry={new OctahedronGeometry(0.5, 1)}
        maxParticles={100}
        position={[0, 0, 0]}
        emitCount={6}
        // delay={2}
        size={[0.08, 0.47]}
        fadeSize={[0.2, 1]}
        colorStart={['#ffffff', '#a4a4a4', '#323232']}
        fadeOpacity={[1, 0]}
        gravity={[0, 0, 0]}
        speed={[0.35, 1.43]}
        lifetime={1}
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
    </>
  )
}
