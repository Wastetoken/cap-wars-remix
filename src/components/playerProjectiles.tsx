import { useEffect, useMemo, useRef } from 'react'
import { MeshBasicNodeMaterial, Vector3 } from 'three/webgpu'
import { Instances as InstancedMesh, type InstancesRef } from './instanceEcs'
import { useGLTF } from '@react-three/drei'
import { color, dot, normalView, positionViewDirection, pow, vec4 } from 'three/tsl'
import { eventBus, EVENTS, ARENA_BOUND } from '@/constants'
import { useFrame } from '@react-three/fiber'
import { dealDamageInArea } from '@/collision'
import { useGameStore, isGameFrozen } from '@/store'
import { registerPool, unregisterPool } from '@/replay/rigRegistry'

const BOLT_SPEED = 18
const BOLT_RADIUS = 0.7
const BOLT_LIFETIME = 2

/**
 * Player-cast projectiles (Mage). Mirrors the enemy Bullets system but
 * damages enemies through the shared collision store instead of the player.
 *
 * Listens for: eventBus.emit(EVENTS.PLAYER_SHOOT, origin: Vector3, dir: Vector3, damage: number)
 */
export const PlayerProjectiles = () => {
  const { nodes } = useGLTF('/projectile-transformed.glb') as any
  const ref = useRef<InstancesRef>(null!)
  const col = color('#a78bfa')
  const geometry = nodes.Sphere.geometry

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial()
    mat.transparent = true
    const fresnel = pow(dot(positionViewDirection, normalView).abs(), 10)
    mat.colorNode = vec4(col.mul(4), fresnel)
    return mat
  }, [])

  useEffect(() => {
    const onShoot = (pos: Vector3, dir: Vector3, damage: number) => {
      const direction = dir.clone().setY(0).normalize()
      if (direction.lengthSq() === 0) return
      ref.current.addInstances(1, (obj) => {
        obj.position.set(pos.x, pos.y, pos.z)
        obj.scale.set(0.28, 0.28, 0.28)
        obj.direction = direction
        obj.damage = damage
        obj.hitSet = new Set<string>()
        obj.lifetime = 0
      })
    }
    eventBus.on(EVENTS.PLAYER_SHOOT, onShoot)
    return () => {
      eventBus.off(EVENTS.PLAYER_SHOOT, onShoot)
    }
  }, [])

  // Replay recorder snapshots this pool's instance matrices
  useEffect(() => {
    registerPool('playerProjectiles', () => ref.current?.mesh ?? null)
    return () => unregisterPool('playerProjectiles')
  }, [])

  useFrame(({ delta }) => {
    if (!ref.current) return
    if (isGameFrozen(useGameStore.getState())) return

    ref.current.updateInstances((obj: any) => {
      obj.position.addScaledVector(obj.direction, BOLT_SPEED * delta)

      // Hit enemies — one hit per enemy per bolt
      const newHits = dealDamageInArea(
        obj.position.x,
        obj.position.z,
        BOLT_RADIUS,
        obj.damage,
        'player',
        obj.position.y,
        obj.hitSet
      )
      if (newHits.length > 0) {
        eventBus.emit(EVENTS.ENEMY_HIT, 'bolt')
        obj.remove()
        return
      }

      obj.lifetime += delta
      if (
        obj.lifetime > BOLT_LIFETIME ||
        Math.abs(obj.position.x) > ARENA_BOUND + 1 ||
        Math.abs(obj.position.z) > ARENA_BOUND + 1
      ) {
        obj.remove()
      }
    })
  })

  return <InstancedMesh ref={ref} args={[geometry, material, 500]} />
}

useGLTF.preload('/projectile-transformed.glb')
