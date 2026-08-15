import { VFXParticles } from 'r3f-vfx'
import { SphereGeometry } from 'three/webgpu'
import { TextureLoader } from 'three/webgpu'
import { texture, uv, vec4 } from 'three/tsl'
import { PARTICLES } from './index'

export const Impact = () => {
  const flareTexture = new TextureLoader().load('/flare.png')
  return (
    <>
      <VFXParticles
        curveTexturePath="/vfx/impact.bin"
        name={PARTICLES.IMPACT}
        autoStart={false}
        geometry={new SphereGeometry(0.5, 16, 12)}
        maxParticles={30}
        position={[0, 0, 0]}
        emitCount={30}
        delay={0.5}
        intensity={6}
        size={[0.01, 0.2]}
        fadeSize={[1, 0]}
        colorStart={['#FF4810', '#37C6FF']}
        fadeOpacity={[1, 0]}
        gravity={[0, 0, 0]}
        speed={[10, 50]}
        lifetime={[0.1, 0.8]}
        startPositionAsDirection={true}
        rotation={[0, 0]}
        rotationSpeed={[0, 0]}
        orientToDirection={true}
        orientAxis="y"
        stretchBySpeed={{
          factor: 5,
          maxStretch: 10,
        }}
        appearance="default"
        blending={1}
        lighting="basic"
        emitterShape={2}
        emitterRadius={[0, 0.01]}
        emitterAngle={0.7853981633974483}
        emitterHeight={[0, 1]}
        emitterDirection={[0, 1, 0]}
        turbulence={{
          intensity: 400,
          frequency: 2.7,
          speed: 1,
        }}
      />
      <VFXParticles
        curveTexturePath="/vfx/impact-flare.bin"
        // geometry={new PlaneGeometry(1, 1, 1, 1)}
        depthTest={false}
        renderOrder={9999}
        maxParticles={500}
        position={[0, 0, 0]}
        autoStart={false}
        name={PARTICLES.IMPACT_FLARE}
        emitCount={20}
        intensity={3}
        // delay={1}
        size={[0.1, 1]}
        fadeSize={[1, 0]}
        colorStart={['#ffffff']}
        fadeOpacity={[1, 0]}
        gravity={[0, 0, 0]}
        speed={[0, 0]}
        lifetime={[0.2, 0.2]}
        friction={{
          intensity: 0,
          easing: 'linear',
        }}
        direction={[
          [-1, 1],
          [0, 1],
          [-1, 1],
        ]}
        rotation={[
          [-Math.PI / 2, Math.PI / 2],
          [-Math.PI / 2, Math.PI / 2],
          [-Math.PI / 2, Math.PI / 2],
        ]}
        rotationSpeed={[0, 0]}
        appearance="gradient"
        // blending={1}
        lighting="basic"
        blending={2}
        emitterShape={2}
        emitterRadius={[0, 0.5]}
        emitterAngle={0.7853981633974483}
        emitterHeight={[0, 1]}
        emitterDirection={[0, 1, 0]}
        colorNode={() => {
          const color = vec4(texture(flareTexture, uv().xy))
          return vec4(color.rgb.mul(10), color.a)
        }}
      />
    </>
  )
}
