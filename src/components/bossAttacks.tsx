import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventBus, EVENTS } from '@/constants'
import { useGameStore, isGameFrozen } from '@/store'
import {
  createEnergyRingMaterial,
  createEnergyWallMaterial,
  createTelegraphFillMaterial,
  createTelegraphRimMaterial,
  type EnergyUniforms,
} from './vfx/energy'

// ============================================================================
// Boss arena VFX — telegraphs, the dodgeable shockwave wall, slam bursts.
// Also renders the mage meteor's ground telegraph (same fill+rim language).
//
// Telegraph reads (GroundFX / AoE refs, built on the slash's TSL language):
//   - dark flickering danger field that grows from the center toward the rim
//     as the windup completes, with a white-hot closing frontier
//   - rotating dashed rim marking the blast radius
// When the fill reaches the rim, the King lands.
//
// The shockwave is a wall of fire expanding from the boss: cross it with a
// dash (i-frames) or be outside its max radius.
// ============================================================================

type TelegraphColors = { field: string; edge: string; rim: string }

// Boss keeps the danger reds; meteor borrows the 'meteor-land' shockwave fire.
const BOSS_TELEGRAPH_COLORS: TelegraphColors = { field: '#c2130e', edge: '#ffd28a', rim: '#ff2d1a' }
const METEOR_TELEGRAPH_COLORS: TelegraphColors = { field: '#fb923c', edge: '#fde68a', rim: '#fb923c' }

type Telegraph = {
  id: number
  x: number
  z: number
  radius: number
  age: number
  duration: number
  colors: TelegraphColors
}

type Ring = {
  id: number
  x: number
  z: number
  age: number
  duration: number
  maxRadius: number
  damage: number
  hitDone: boolean
}

type Burst = {
  id: number
  x: number
  z: number
  age: number
  duration: number
  maxRadius: number
  delay: number
  colorA: string
  colorB: string
}

let nextId = 1

type RefEntry = { mesh: THREE.Mesh; u: EnergyUniforms }

export const BossAttacks = () => {
  const telegraphs = useRef<Telegraph[]>([])
  const rings = useRef<Ring[]>([])
  const bursts = useRef<Burst[]>([])
  const [, force] = useState(0)

  const fillRefs = useRef(new Map<number, RefEntry>())
  const rimRefs = useRef(new Map<number, RefEntry>())
  const wallRefs = useRef(new Map<number, RefEntry>())
  const groundRingRefs = useRef(new Map<number, RefEntry>())
  const burstRefs = useRef(new Map<number, RefEntry>())

  useEffect(() => {
    const onTelegraph = (p: { x: number; z: number; radius: number; durationMs: number }) => {
      telegraphs.current.push({
        id: nextId++,
        x: p.x,
        z: p.z,
        radius: p.radius,
        age: 0,
        duration: p.durationMs,
        colors: BOSS_TELEGRAPH_COLORS,
      })
      force((n) => n + 1)
    }

    const onMeteorTelegraph = (p: { x: number; z: number; radius: number; durationMs: number }) => {
      telegraphs.current.push({
        id: nextId++,
        x: p.x,
        z: p.z,
        radius: p.radius,
        age: 0,
        duration: p.durationMs,
        colors: METEOR_TELEGRAPH_COLORS,
      })
      force((n) => n + 1)
    }

    const onRing = (p: { x: number; z: number; maxRadius: number; damage: number; durationMs: number }) => {
      rings.current.push({
        id: nextId++,
        x: p.x,
        z: p.z,
        age: 0,
        duration: p.durationMs,
        maxRadius: p.maxRadius,
        damage: p.damage,
        hitDone: false,
      })
      force((n) => n + 1)
    }

    const onSlamLand = (p: { x: number; z: number }) => {
      bursts.current.push(
        { id: nextId++, x: p.x, z: p.z, age: 0, duration: 550, maxRadius: 6.6, delay: 0, colorA: '#ff7733', colorB: '#fff3d6' },
        { id: nextId++, x: p.x, z: p.z, age: 0, duration: 480, maxRadius: 4.4, delay: 60, colorA: '#ffd28a', colorB: '#ffffff' }
      )
      force((n) => n + 1)
    }

    eventBus.on(EVENTS.BOSS_TELEGRAPH, onTelegraph)
    eventBus.on(EVENTS.METEOR_TELEGRAPH, onMeteorTelegraph)
    eventBus.on(EVENTS.BOSS_RING, onRing)
    eventBus.on(EVENTS.BOSS_SLAM_LAND, onSlamLand)
    return () => {
      eventBus.off(EVENTS.BOSS_TELEGRAPH, onTelegraph)
      eventBus.off(EVENTS.METEOR_TELEGRAPH, onMeteorTelegraph)
      eventBus.off(EVENTS.BOSS_RING, onRing)
      eventBus.off(EVENTS.BOSS_SLAM_LAND, onSlamLand)
    }
  }, [])

  useFrame((_, delta) => {
    if (isGameFrozen(useGameStore.getState())) return
    const dtMs = delta * 1000
    let changed = false

    // --- Telegraphs -------------------------------------------------------
    for (const tg of telegraphs.current) {
      tg.age += dtMs
      const t = Math.min(tg.age / tg.duration, 1)

      const fill = fillRefs.current.get(tg.id)
      if (fill) {
        const r = Math.max(tg.radius * t, 0.001)
        fill.mesh.scale.set(r, r, 1)
        fill.u.uTime.value += delta
        fill.u.uOpacity.value = 1
      }
      const rim = rimRefs.current.get(tg.id)
      if (rim) {
        // dashes spin up as the slam approaches
        rim.u.uTime.value += delta * (1 + t * 3.5)
        rim.u.uOpacity.value = 0.55 + 0.45 * t
      }
    }
    const tgAlive = telegraphs.current.filter((tg) => tg.age < tg.duration)
    if (tgAlive.length !== telegraphs.current.length) {
      for (const tg of telegraphs.current) {
        if (tg.age >= tg.duration) {
          fillRefs.current.delete(tg.id)
          rimRefs.current.delete(tg.id)
        }
      }
      telegraphs.current = tgAlive
      changed = true
    }

    // --- Shockwave rings (dodgeable) --------------------------------------
    const store = useGameStore.getState()
    const pp = store.playerPosition
    for (const ring of rings.current) {
      ring.age += dtMs
      const t = Math.min(ring.age / ring.duration, 1)
      const r = Math.max(t * ring.maxRadius, 0.001)

      const wall = wallRefs.current.get(ring.id)
      if (wall) {
        wall.mesh.scale.set(r, 1, r)
        wall.u.uTime.value += delta
        wall.u.uOpacity.value = (1 - t) * 0.85
      }
      const ground = groundRingRefs.current.get(ring.id)
      if (ground) {
        ground.mesh.scale.set(r, r, 1)
        ground.u.uTime.value += delta
        ground.u.uOpacity.value = (1 - t)
      }

      // Band collision: the wall hits when its radius passes the player.
      // Dash i-frames / evasion are honored inside damagePlayer.
      if (!ring.hitDone && !store.playerDead) {
        const dist = Math.hypot(pp.x - ring.x, pp.z - ring.z)
        if (Math.abs(dist - r) < 0.8) {
          ring.hitDone = true
          store.damagePlayer(ring.damage)
          eventBus.emit(EVENTS.CAMERA_SHAKE)
        }
      }
    }
    const ringsAlive = rings.current.filter((r) => r.age < r.duration)
    if (ringsAlive.length !== rings.current.length) {
      for (const r of rings.current) {
        if (r.age >= r.duration) {
          wallRefs.current.delete(r.id)
          groundRingRefs.current.delete(r.id)
        }
      }
      rings.current = ringsAlive
      changed = true
    }

    // --- Slam bursts --------------------------------------------------------
    for (const b of bursts.current) {
      b.age += dtMs
      const local = b.age - b.delay
      if (local < 0) continue
      const t = Math.min(local / b.duration, 1)
      const entry = burstRefs.current.get(b.id)
      if (entry) {
        const eased = 1 - Math.pow(1 - t, 3)
        entry.mesh.scale.setScalar(0.2 + eased * b.maxRadius)
        entry.u.uTime.value += delta
        entry.u.uOpacity.value = (1 - t) * 0.9
      }
    }
    const burstsAlive = bursts.current.filter((b) => b.age < b.duration + b.delay)
    if (burstsAlive.length !== bursts.current.length) {
      for (const b of bursts.current) {
        if (b.age >= b.duration + b.delay) burstRefs.current.delete(b.id)
      }
      bursts.current = burstsAlive
      changed = true
    }

    if (changed) force((n) => n + 1)
  })

  return (
    <>
      {telegraphs.current.map((tg) => (
        <group key={tg.id} position={[tg.x, 0, tg.z]}>
          {/* growing danger field with white-hot closing frontier */}
          <ShaderMesh
            position={[0, 0.06, 0]}
            scale={[0.001, 0.001, 1]}
            create={() => createTelegraphFillMaterial(tg.colors.field, tg.colors.edge)}
            register={(e) => {
              if (e) fillRefs.current.set(tg.id, e)
              else fillRefs.current.delete(tg.id)
            }}
          >
            <circleGeometry args={[1, 48]} />
          </ShaderMesh>
          {/* rotating dashed rim marking the blast radius */}
          <ShaderMesh
            position={[0, 0.08, 0]}
            scale={[tg.radius, tg.radius, 1]}
            create={() => createTelegraphRimMaterial(tg.colors.rim)}
            register={(e) => {
              if (e) rimRefs.current.set(tg.id, e)
              else rimRefs.current.delete(tg.id)
            }}
          >
            <ringGeometry args={[0.94, 1, 64]} />
          </ShaderMesh>
        </group>
      ))}

      {rings.current.map((ring) => (
        <group key={ring.id} position={[ring.x, 0, ring.z]}>
          {/* wall of fire */}
          <ShaderMesh
            position={[0, 0.7, 0]}
            flat={false}
            create={() => createEnergyWallMaterial()}
            register={(e) => {
              if (e) wallRefs.current.set(ring.id, e)
              else wallRefs.current.delete(ring.id)
            }}
          >
            <cylinderGeometry args={[1, 1, 1.4, 64, 1, true]} />
          </ShaderMesh>
          {/* hot ground line at the wall's base */}
          <ShaderMesh
            position={[0, 0.08, 0]}
            create={() => createEnergyRingMaterial('#ff5a1a', '#ffd28a', 8)}
            register={(e) => {
              if (e) groundRingRefs.current.set(ring.id, e)
              else groundRingRefs.current.delete(ring.id)
            }}
          >
            <ringGeometry args={[0.85, 1, 64]} />
          </ShaderMesh>
        </group>
      ))}

      {bursts.current.map((b) => (
        <ShaderMesh
          key={b.id}
          position={[b.x, 0.09, b.z]}
          create={() => createEnergyRingMaterial(b.colorA, b.colorB, 8)}
          register={(e) => {
            if (e) burstRefs.current.set(b.id, e)
            else burstRefs.current.delete(b.id)
          }}
        >
          <ringGeometry args={[0.8, 1, 64]} />
        </ShaderMesh>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Small helper: a ground-plane mesh bound to an energy material, registered
// into the parent's ref maps for per-frame uniform updates.
// ---------------------------------------------------------------------------

const ShaderMesh = ({
  create,
  register,
  position,
  scale,
  flat = true,
  children,
}: {
  create: () => { material: THREE.Material; uniforms: EnergyUniforms }
  register: (entry: RefEntry | null) => void
  position: [number, number, number]
  scale?: [number, number, number]
  /** true = ground plane (rotated -90° X); false = upright (cylinder wall) */
  flat?: boolean
  children: React.ReactNode
}) => {
  const { material, uniforms } = useMemo(create, [])
  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh
      ref={(m: THREE.Mesh | null) => register(m ? { mesh: m, u: uniforms } : null)}
      position={position}
      scale={scale}
      rotation={flat ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
      material={material}
    >
      {children}
    </mesh>
  )
}
