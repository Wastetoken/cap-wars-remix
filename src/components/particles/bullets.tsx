import { VFXParticles } from 'r3f-vfx'
import { PARTICLES } from '.'
import { SphereGeometry, TextureLoader } from 'three'
import { useLoader } from '@react-three/fiber'
import { color, float, Fn, texture, uv, vec4 } from 'three/tsl'
export const Bullets = () => {
  const text = useLoader(TextureLoader, './flare.png')
  return (
    <>
      <VFXParticles
        name={PARTICLES.BULLET_SPARKS}
        maxParticles={1000}
        autoStart={false}
        position={[0, 0, 0]}
        intensity={8}
        size={[0.01, 0.07]}
        fadeSize={[1, 0]}
        colorStart={['#ff2600', '#010101']}
        fadeOpacity={[1, 0]}
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
        rotation={[0, 0]}
        rotationSpeed={[0, 0]}
        appearance="gradient"
        blending={1}
        lighting="basic"
        emitterShape={1}
        emitterRadius={[0, 1]}
        emitterAngle={0.7853981633974483}
        emitterHeight={[0, 1]}
        emitterDirection={[0, 1, 0]}
      />
      <VFXParticles
        name={PARTICLES.BULLET_ENERGY}
        autoStart={false}
        geometry={new SphereGeometry(0.5, 16, 12)}
        maxParticles={10000}
        intensity={7}
        size={[0.02, 0.08]}
        colorStart={['#ff2600', '#010101']}
        fadeOpacity={[0, 1]}
        lifetime={[0.9, 0.95]}
        startPositionAsDirection={true}
        orientToDirection={true}
        stretchBySpeed={{
          factor: 2,
          maxStretch: 5,
        }}
        appearance="gradient"
        lighting="basic"
        emitterShape={2}
        emitterRadius={[0, 0.5]}
        attractToCenter={true}
      />
      <VFXParticles
        name={PARTICLES.BULLET_FLARE}
        delay={1.27}
        maxParticles={100}
        autoStart={false}
        // intensity={1}
        size={[0.89, 0.89]}
        fadeSizeCurve={{
          points: [
            {
              pos: [0, 0],
              handleOut: [0.0381536865234375, 0.3451702880859375],
            },
            {
              pos: [0.2781536865234375, 1],
              handleIn: [-0.31416000000000005, 3.847350384201326e-17],
              handleOut: [0.31416000000000005, 0],
            },
            {
              pos: [1, 0],
              handleIn: [-0.16132778701397404, 0.2878773091738455],
            },
          ],
        }}
        colorStart={['#ff2600']}
        speed={[0, 0]}
        lifetime={0.1}
        appearance="default"
        lighting="standard"
        rotation={[
          [0, 0],
          [-Math.PI * 2, Math.PI * 2],
          [0, 0],
        ]}
        emitterShape={1}
        // alphaMap={texture}
        colorNode={Fn(() => {
          const tex = texture(text, uv())
          return vec4(color('#fc7703').mul(float(20).mul(tex.a)), tex.a)
        })}
      />
    </>
  )
}
