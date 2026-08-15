import { uv, vec2, vec4, step, float, color } from 'three/tsl'
import { VFXParticles } from 'r3f-vfx'
import { PlaneGeometry } from 'three/webgpu'
import { useEffect, useMemo } from 'react'
import { EVENTS, eventBus } from '@/constants'
import { useVFXEmitter, PARTICLES } from './index'

export const EnemyDeath = () => {
  const col = color('#fc6717')
  const { emit } = useVFXEmitter(PARTICLES.DEATH)
  const { emit: emitCircle } = useVFXEmitter(PARTICLES.DEATH_2)

  const colorNode = (progress: typeof float) => {
    const center = vec2(0.5)
    const dist = uv().mul(2).sub(1).length()
    const thickness = float(0.02)
    const circle = step(dist, float(0.9))
    const innerCircle = float(float(1).add(progress)).sub(dist).max(0)
    return vec4(col.mul(20), circle.sub(innerCircle))
  }

  useEffect(() => {
    eventBus.on(EVENTS.ENEMY_DEAD, (position) => {
      const { x, y, z } = position
      emit([x, y, z], 50)
      emitCircle([x, y, z], 1)
    })
  }, [emit, emitCircle])

  return (
    <>
      <VFXParticles
        curveTexturePath="./vfx/death.bin"
        name={PARTICLES.DEATH}
        autoStart={false}
        maxParticles={100}
        position={[0, 0, 0]}
        emitCount={100}
        delay={0.99}
        intensity={5}
        size={[0.04, 0.1]}
        fadeSize={[1, 0]}
        colorStart={['#ff2600']}
        fadeOpacity={[1, 0]}
        gravity={[0, -15, 0]}
        speed={[0, 4.47]}
        lifetime={[1, 3]}
        direction={[
          [-1, 1],
          [-1, 1],
          [-1, 1],
        ]}
        startPosition={[
          [0, 0],
          [0, 0],
          [0, 0],
        ]}
        rotation={[0, 0]}
        rotationSpeed={[0, 0]}
        appearance="circular"
        blending={2}
        lighting="basic"
        emitterShape={1}
        emitterRadius={[0, 1]}
        emitterAngle={0.7853981633974483}
        emitterHeight={[0, 1]}
        emitterDirection={[0, 1, 0]}
        collision={{
          plane: {
            y: -1,
          },
          bounce: 0.47,
          friction: 0.41,
          die: false,
          sizeBasedGravity: 0,
        }}
      />
      <VFXParticles
        curveTexturePath="./vfx/death-2.bin"
        name={PARTICLES.DEATH_2}
        autoStart={false}
        geometry={new PlaneGeometry(1, 1, 1, 1)}
        maxParticles={10}
        delay={1}
        size={5}
        fadeSize={[1, 0]}
        colorStart={['#ffffff']}
        fadeOpacity={[1, 0]}
        lifetime={0.3}
        friction={{
          intensity: 0,
          easing: 'linear',
        }}
        emitCount={1}
        rotation={[
          [-Math.PI / 2, -Math.PI / 2],
          [0, 0],
          [0, 0],
        ]}
        appearance="gradient"
        blending={2}
        lighting="basic"
        emitterShape={1}
        emitterRadius={[0, 1]}
        emitterAngle={0.7853981633974483}
        emitterHeight={[0, 1]}
        emitterDirection={[0, 1, 0]}
        colorNode={({ progress }) => colorNode(progress)}
      />
    </>
  )
}
