import { EnemyDeath } from './enemyDeath'
import { Energy } from './energy'
import { Impact } from './impact'
import { Mobility } from './mobility'
import { Rift } from './rift'
import { Slash } from './slash'
import { Spawn } from './spawn'
import { Vortex, VortexSparks } from './vortex'
import { BoxGeometry } from 'three'
import { useVFXEmitter as useVFXEmitterOriginal, VFXEmitter as VFXEmitterOriginal } from 'r3f-vfx'
import type { VFXEmitterProps as VFXEmitterPropsOriginal } from 'r3f-vfx'
import { Bullets } from './bullets'
import { particleScale } from '@/game/skills'
import { useGameStore } from '@/store'

export const PARTICLES = {
  SLASH: 'slash',
  SPARKS: 'sparks',
  SPARKS_KNIGHT: 'sparks-knight',
  SPARKS_BARBARIAN: 'sparks-barbarian',
  SPARKS_ROGUE: 'sparks-rogue',
  SPARKS_MAGE: 'sparks-mage',
  MOBILITY_SPARKS_KNIGHT: 'mobility-sparks-knight',
  MOBILITY_SPARKS_BARBARIAN: 'mobility-sparks-barbarian',
  MOBILITY_SPARKS_ROGUE: 'mobility-sparks-rogue',
  MOBILITY_SPARKS_MAGE: 'mobility-sparks-mage',
  BULLET_SPARKS: 'bullet-sparks',
  BULLET_ENERGY: 'bullet-energy',
  BULLET_FLARE: 'bullet-flare',
  IMPACT: 'impact',
  IMPACT_FLARE: 'impact-flare',
  SPAWN: 'spawn',
  RIFT: 'rift',
  VORTEX: 'vortex',
  DEATH: 'death',
  DEATH_2: 'death-2',
  ENERGY: 'energy',
} as const

export type ParticleType = (typeof PARTICLES)[keyof typeof PARTICLES]

/**
 * Type-safe VFX emitter hook.
 * Emission counts are scaled by the particle-density setting.
 * @example
 * const { start, stop, emit } = useVFXEmitter(PARTICLES.ENERGY)
 */
export const useVFXEmitter = (name: ParticleType) => {
  const api = useVFXEmitterOriginal(name)
  const scaleCount = (count?: number) => {
    if (count === undefined) return count
    const scale = particleScale(useGameStore.getState().settings)
    return Math.max(1, Math.round(count * scale))
  }
  return {
    ...api,
    emit: (position?: number[], count?: number, overrides?: null) =>
      api.emit(position, scaleCount(count), overrides),
    burst: (position?: number[], count?: number, overrides?: null) =>
      api.burst(position, scaleCount(count), overrides),
  }
}

export type VFXEmitterProps = Omit<VFXEmitterPropsOriginal, 'name'> & {
  name: ParticleType
}

/**
 * Type-safe VFX emitter component
 * @example
 * <VFXEmitter name={PARTICLES.SLASH} ref={slashEmitterRef} />
 */
export const VFXEmitter = VFXEmitterOriginal as React.ForwardRefExoticComponent<
  VFXEmitterProps & React.RefAttributes<{ emit: (overrides?: Record<string, unknown>) => void }>
>

export const Particles = () => {
  return (
    <>
      <Slash />
      <Mobility />
      <Impact />
      <Spawn />
      <Rift />
      <EnemyDeath />
      <Energy />
      <Bullets />
      <Vortex />
      <VortexSparks />
    </>
  )
}
