import { useEffect } from 'react'
import { eventBus, EVENTS } from '@/constants'
import { PARTICLES, useVFXEmitter } from './particles'

/**
 * Successful-block burst — white flare + sparks where the hit was stopped.
 * Listens for PARRY_BLOCK (emitted by melee enemies and the bullet pool).
 */
export const ParryBlockFX = () => {
  const { burst: burstFlare } = useVFXEmitter(PARTICLES.IMPACT_FLARE)
  const { burst: burstSparks } = useVFXEmitter(PARTICLES.BULLET_SPARKS)

  useEffect(() => {
    const onBlock = (pos: { x: number; y: number; z: number }) => {
      const p = [pos.x, pos.y, pos.z]
      burstFlare(p, 3)
      burstSparks(p, 18)
    }
    eventBus.on(EVENTS.PARRY_BLOCK, onBlock)
    return () => {
      eventBus.off(EVENTS.PARRY_BLOCK, onBlock)
    }
  }, [burstFlare, burstSparks])

  return null
}
