import { VFXParticles } from 'r3f-vfx'
import { CHARACTER_LIST, CHARACTER_VFX, type CharacterId } from '@/game/characters'
import type { ParticleType } from './index'

// ============================================================================
// Mobility spark sprays — one pool per class so Dash / Shadowstep / Blink /
// Leap accents read in the class's color language. Gravity direction is part
// of the identity: embers rise, shadow wisps drift up, arcane motes hang
// weightless, the knight's gold falls.
//
// The body of each move (streak ribbon / shadow portals / arcane beams /
// ground-crack bursts) lives in components/mobilityFx.tsx — these pools are
// the particle accents on top.
// ============================================================================

/** Pool name for a class's mobility sparks */
export const mobilitySparksName = (id: CharacterId) =>
  `mobility-sparks-${id}` as ParticleType

const SparksSystem = ({ id }: { id: CharacterId }) => {
  const vfx = CHARACTER_VFX[id]
  return (
    <VFXParticles
      name={mobilitySparksName(id)}
      maxParticles={120}
      autoStart={false}
      position={[0, 0, 0]}
      intensity={5}
      size={[0.02, 0.09]}
      fadeSize={[1, 0]}
      colorStart={[vfx.sparks.color, vfx.sparks.secondary]}
      fadeOpacity={[1, 0]}
      gravity={[0, vfx.sparks.gravity, 0]}
      speed={[0.5, 2.5]}
      lifetime={[0.4, 0.9]}
      friction={{ intensity: 0, easing: 'linear' }}
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
      blending={2}
      lighting="basic"
      emitterShape={1}
      emitterRadius={[0, 1]}
      emitterAngle={0.7853981633974483}
      emitterHeight={[0, 1]}
      emitterDirection={[0, 1, 0]}
    />
  )
}

export const Mobility = () => (
  <>
    {CHARACTER_LIST.map((id) => (
      <SparksSystem key={`s-${id}`} id={id} />
    ))}
  </>
)
