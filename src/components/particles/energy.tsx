import { VFXParticles } from 'r3f-vfx'
import { SphereGeometry } from 'three/webgpu'
import { PARTICLES } from './index'

export const Energy = () => {
  return (
    <>
      <VFXParticles
        name={PARTICLES.ENERGY}
        maxParticles={200}
        autoStart={false}
        intensity={10}
        size={[0.01, 0.07]}
        fadeSize={[1, 0]}
        colorStart={['#FF7139']}
        fadeOpacity={[0, 1]}
        gravity={[0, -0.7, 0]}
        speed={[0, 2]}
        lifetime={[1, 2]}
        friction={{
          intensity: 0,
          easing: 'linear',
        }}
        direction={[
          [-1, 1],
          [0, 1],
          [-1, 1],
        ]}
        startPosition={[
          [-0.3, 0.3],
          [-1, 1],
          [-0.3, 0.3],
        ]}
        appearance="gradient"
        blending={2}
        lighting="basic"
        emitterShape={1}
        emitterRadius={[0, 1]}
        emitterAngle={0.7853981633974483}
        emitterHeight={[0, 1]}
        emitterDirection={[0, 1, 0]}
      />
    </>
  )
}
