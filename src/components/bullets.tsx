import { useEffect, useMemo, useRef } from 'react'
import { MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu'
import { Instances as InstancedMesh, type InstancesRef } from './instanceEcs'
import { useGLTF } from '@react-three/drei'
import { color, dot, normalView, positionViewDirection, pow, vec4 } from 'three/tsl'
import { eventBus, EVENTS } from '@/constants'
import { useFrame } from '@react-three/fiber'
import { PARTICLES, useVFXEmitter } from './particles'
import { useGameStore, isGameFrozen } from '@/store'
import { cycleDamageMult, levelDamageMult } from '@/game/cycle'
import { dealDamageInArea } from '@/collision'
import { registerPool, unregisterPool } from '@/replay/rigRegistry'

/** Damage a ricocheted bolt deals back to enemies */
const REFLECT_DAMAGE = 30

export const Bullets = () => {
  const { nodes } = useGLTF('/projectile-transformed.glb') as any
  const { emit } = useVFXEmitter(PARTICLES.BULLET_SPARKS)
  const ref = useRef<InstancesRef>(null!)
  const col = color('#ff8426')
  const speed = 15
  const geometry = nodes.Sphere.geometry
  const { emit: emitFlare } = useVFXEmitter(PARTICLES.BULLET_FLARE)
  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial()
    mat.transparent = true
    const fresnel = pow(dot(positionViewDirection, normalView).abs(), 10)

    mat.colorNode = vec4(col.mul(4), fresnel)
    return mat
  }, [])

  useEffect(() => {
    const handleShoot = (pos: Vector3, quat: Quaternion) => {
      // Guard: a remounted pool (error-boundary retry, HMR) can receive an
      // event before its ref is attached again.
      if (!ref.current) return
      const zRotation = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
      const dir = new Vector3(0, 0, 1).applyQuaternion(quat).negate().normalize()
      emitFlare([pos.x, pos.y, pos.z], 5)
      ref.current.addInstances(1, (obj) => {
        obj.position.set(pos.x, pos.y, pos.z)
        obj.quaternion.copy(quat).multiply(zRotation)
        obj.scale.set(0.3, 0.3, 0.3)
        obj.direction = dir
        obj.lifetime = 0
        obj.reflected = false
      })
    }
    eventBus.on(EVENTS.SHOOT, handleShoot)
    return () => {
      eventBus.off(EVENTS.SHOOT, handleShoot)
    }
  }, [])

  // Replay recorder snapshots this pool's instance matrices
  useEffect(() => {
    registerPool('bullets', () => ref.current?.mesh ?? null)
    return () => unregisterPool('bullets')
  }, [])

  useFrame(({ delta }) => {
    if (ref.current) {
      const store = useGameStore.getState()
      if (isGameFrozen(store)) return
      const playerPos = store.playerPosition

      ref.current.updateInstances((obj: any) => {
        obj.position.addScaledVector(obj.direction, speed * (obj.reflected ? 1.4 : 1) * delta)
        emit([obj.position.x, obj.position.y, obj.position.z], 1, {
          emitterShape: 2,
          emitterRadius: [0, 0.01],
        } as any)

        // A blocked bolt flies back at the enemy side and damages them
        if (obj.reflected) {
          const hits = dealDamageInArea(
            obj.position.x,
            obj.position.z,
            0.5,
            REFLECT_DAMAGE,
            'player',
            obj.position.y
          )
          if (hits.length > 0) {
            eventBus.emit(EVENTS.ENEMY_HIT, 'bolt')
            obj.remove()
            return
          }
        }

        // Hit the player (circle check on the XZ plane, generous Y band)
        if (!store.playerDead && !obj.reflected) {
          const dx = obj.position.x - playerPos.x
          const dz = obj.position.z - playerPos.z
          if (dx * dx + dz * dz < 0.45 * 0.45 && obj.position.y < 2.4) {
            if (store.isParrying) {
              // Blocked — ricochet the bolt straight back at the mage
              obj.direction.negate()
              obj.reflected = true
              obj.lifetime = 0
              obj.scale.set(0.45, 0.45, 0.45)
              emitFlare([obj.position.x, obj.position.y, obj.position.z], 12)
              eventBus.emit(EVENTS.PARRY_BLOCK, {
                x: obj.position.x,
                y: obj.position.y,
                z: obj.position.z,
              })
            } else {
              store.damagePlayer(Math.round(10 * cycleDamageMult(store.cycle) * levelDamageMult(store.playerLevel)))
              eventBus.emit(EVENTS.PLAYER_HIT, obj.position.clone())
              obj.remove()
            }
            return
          }
        }

        obj.lifetime += delta
        if (obj.lifetime > 5) obj.remove()
      })
    }
  })

  return <InstancedMesh ref={ref} args={[geometry, material, 2000]} />
}
