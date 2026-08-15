import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { eventBus, EVENTS } from '@/constants'
import { CHARACTER_VFX, type CharacterId } from '@/game/characters'
import { createEnergyWallMaterial, type EnergyUniforms } from './vfx/energy'
import {
  createDashStreakMaterial,
  createShadowVortexMaterial,
  createGroundBurstMaterial,
  type MobilityUniforms,
} from './vfx/mobilityFx'

// ============================================================================
// MobilityFX — slash-grade shader FX for the four class mobility moves.
// Listens for EVENTS.MOBILITY_CAST { kind, ox, oz, dx, dz, durationMs }:
//
//   dash (knight)      energy streak ribbon torn along the path
//   shadowstep (rogue) shadow portal closing at origin, opening at destination
//   blink (mage)       arcane beam pillar collapsing at origin, flaring at dest
//   leap (barbarian)   ground-crack burst at launch + landing, fire afterimage
//                      ribbons along the arc
// ============================================================================

type Geo = 'streak' | 'portal' | 'beam' | 'burst'

type Piece = {
  id: number
  geo: Geo
  x: number
  y: number
  z: number
  rotY: number
  /** streak ribbon length */
  len: number
  scaleFrom: number
  scaleTo: number
  delayMs: number
  lifeMs: number
  base: string
  edge: string
  mode: 'open' | 'close'
  bornAt: number
}

type MobilityPayload = {
  kind: 'dash' | 'shadowstep' | 'blink' | 'leap'
  ox: number
  oz: number
  dx: number
  dz: number
  durationMs: number
}

const KIND_TO_CHAR: Record<MobilityPayload['kind'], CharacterId> = {
  dash: 'knight',
  shadowstep: 'rogue',
  blink: 'mage',
  leap: 'barbarian',
}

let nextPieceId = 1

const buildPieces = (p: MobilityPayload): Piece[] => {
  const now = performance.now()
  const vfx = CHARACTER_VFX[KIND_TO_CHAR[p.kind]]
  const dirX = p.dx - p.ox
  const dirZ = p.dz - p.oz
  const len = Math.max(Math.hypot(dirX, dirZ), 0.001)
  // rotation.y that maps local +X onto the travel direction (ribbon head = dest)
  const streakYaw = Math.atan2(-dirZ, dirX)
  // rotation.y that faces a vertical disc across the path (a door you pass through)
  const doorYaw = Math.atan2(dirX, dirZ)
  const midX = (p.ox + p.dx) / 2
  const midZ = (p.oz + p.dz) / 2
  const mk = (partial: Omit<Piece, 'id' | 'bornAt'>): Piece => ({
    id: nextPieceId++,
    bornAt: now,
    ...partial,
  })

  switch (p.kind) {
    case 'dash':
      return [
        mk({
          geo: 'streak',
          x: midX,
          y: 0.8,
          z: midZ,
          rotY: streakYaw,
          len,
          scaleFrom: 1,
          scaleTo: 1,
          delayMs: 0,
          lifeMs: 420,
          base: vfx.ghost.color,
          edge: vfx.sparks.color,
          mode: 'open',
        }),
      ]

    case 'shadowstep':
      return [
        mk({
          geo: 'portal',
          x: p.ox,
          y: 0.95,
          z: p.oz,
          rotY: doorYaw,
          len: 1,
          scaleFrom: 1,
          scaleTo: 0.3,
          delayMs: 0,
          lifeMs: 380,
          base: '',
          edge: '',
          mode: 'close',
        }),
        mk({
          geo: 'portal',
          x: p.dx,
          y: 0.95,
          z: p.dz,
          rotY: doorYaw,
          len: 1,
          scaleFrom: 0.3,
          scaleTo: 1.05,
          delayMs: 60,
          lifeMs: 420,
          base: '',
          edge: '',
          mode: 'open',
        }),
        mk({
          geo: 'streak',
          x: midX,
          y: 0.7,
          z: midZ,
          rotY: streakYaw,
          len,
          scaleFrom: 1,
          scaleTo: 1,
          delayMs: 20,
          lifeMs: 300,
          base: '#3b0764',
          edge: vfx.sparks.color,
          mode: 'open',
        }),
      ]

    case 'blink':
      return [
        mk({
          geo: 'beam',
          x: p.ox,
          y: 1.15,
          z: p.oz,
          rotY: 0,
          len: 1,
          scaleFrom: 1,
          scaleTo: 0.05,
          delayMs: 0,
          lifeMs: 300,
          base: '',
          edge: '',
          mode: 'close',
        }),
        mk({
          geo: 'beam',
          x: p.dx,
          y: 1.15,
          z: p.dz,
          rotY: 0,
          len: 1,
          scaleFrom: 0.05,
          scaleTo: 1,
          delayMs: 40,
          lifeMs: 400,
          base: '',
          edge: '',
          mode: 'open',
        }),
      ]

    case 'leap': {
      const pieces: Piece[] = [
        mk({
          geo: 'burst',
          x: p.ox,
          y: 0.1,
          z: p.oz,
          rotY: 0,
          len: 1,
          scaleFrom: 0.4,
          scaleTo: 2.2,
          delayMs: 0,
          lifeMs: 500,
          base: vfx.ghost.color,
          edge: vfx.sparks.color,
          mode: 'open',
        }),
        mk({
          geo: 'burst',
          x: p.dx,
          y: 0.1,
          z: p.dz,
          rotY: 0,
          len: 1,
          scaleFrom: 0.5,
          scaleTo: 3.2,
          delayMs: p.durationMs,
          lifeMs: 650,
          base: vfx.ghost.color,
          edge: vfx.sparks.color,
          mode: 'open',
        }),
      ]
      // Fire afterimages along the arc
      for (const frac of [0.28, 0.55, 0.82]) {
        pieces.push(
          mk({
            geo: 'streak',
            x: p.ox + dirX * frac,
            y: 0.7 + Math.sin(Math.PI * frac) * 1.6,
            z: p.oz + dirZ * frac,
            rotY: streakYaw,
            len: len * 0.34,
            scaleFrom: 1,
            scaleTo: 1,
            delayMs: p.durationMs * frac,
            lifeMs: 260,
            base: '#7c2d12',
            edge: vfx.sparks.color,
            mode: 'open',
          })
        )
      }
      return pieces
    }
  }
}

export const MobilityFX = () => {
  const [pieces, setPieces] = useState<Piece[]>([])
  const refs = useRef(new Map<number, { mesh: THREE.Mesh; u: MobilityUniforms | EnergyUniforms }>())

  useEffect(() => {
    const onCast = (p: MobilityPayload) => {
      setPieces((prev) => [...prev, ...buildPieces(p)])
    }
    eventBus.on(EVENTS.MOBILITY_CAST, onCast)
    return () => {
      eventBus.off(EVENTS.MOBILITY_CAST, onCast)
    }
  }, [])

  useFrame((_, delta) => {
    const now = performance.now()
    // Debug surface always reflects live state, including "empty"
    ;(window as any).__mobFx = pieces
      .filter((p) => now - p.bornAt - p.delayMs >= 0)
      .map((p) => p.geo)
    if (pieces.length === 0) return
    const expired: number[] = []

    for (const piece of pieces) {
      const age = now - piece.bornAt - piece.delayMs
      if (age < 0) continue
      const t = Math.min(age / piece.lifeMs, 1)
      if (t >= 1) {
        expired.push(piece.id)
        continue
      }
      const entry = refs.current.get(piece.id)
      if (!entry) continue
      const { mesh, u } = entry
      mesh.visible = true // born — delayed pieces stay hidden until now
      const eased = 1 - Math.pow(1 - t, 3)
      u.uTime.value += delta

      switch (piece.geo) {
        case 'streak': {
          const mu = u as MobilityUniforms
          mu.uProgress.value = Math.min(age / 130, 1)
          mu.uOpacity.value = 1 - t
          break
        }
        case 'portal': {
          const s = THREE.MathUtils.lerp(piece.scaleFrom, piece.scaleTo, eased)
          mesh.scale.set(s * 0.75, s * 1.05, 1)
          u.uOpacity.value =
            piece.mode === 'close' ? 1 - t : Math.min(age / 90, 1) * (1 - t)
          break
        }
        case 'beam': {
          const s = THREE.MathUtils.lerp(piece.scaleFrom, piece.scaleTo, eased)
          mesh.scale.set(s, 1, s)
          u.uOpacity.value =
            piece.mode === 'close' ? (1 - t) * 0.95 : Math.min(age / 70, 1) * (1 - t)
          break
        }
        case 'burst': {
          const s = THREE.MathUtils.lerp(piece.scaleFrom, piece.scaleTo, eased)
          mesh.scale.set(s, s, 1)
          u.uOpacity.value = 1 - t
          break
        }
      }
    }

    if (expired.length > 0) {
      for (const id of expired) refs.current.delete(id)
      setPieces((prev) => prev.filter((x) => !expired.includes(x.id)))
    }
  })

  return (
    <>
      {pieces.map((piece) => (
        <FxMesh
          key={piece.id}
          piece={piece}
          register={(m, u) => {
            if (m) refs.current.set(piece.id, { mesh: m, u })
            else refs.current.delete(piece.id)
          }}
        />
      ))}
    </>
  )
}

const FxMesh = ({
  piece,
  register,
}: {
  piece: Piece
  register: (m: THREE.Mesh | null, u: MobilityUniforms | EnergyUniforms) => void
}) => {
  const { material, uniforms } = useMemo(() => {
    switch (piece.geo) {
      case 'streak':
        return createDashStreakMaterial(piece.base, piece.edge)
      case 'portal':
        return createShadowVortexMaterial()
      case 'beam':
        return createEnergyWallMaterial('#38bdf8', '#e0e7ff', 8)
      case 'burst':
        return createGroundBurstMaterial(piece.base, piece.edge)
    }
    // Keyed by identity-defining fields only — pieces are immutable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.geo, piece.base, piece.edge])
  useEffect(() => () => material.dispose(), [material])

  const rotation: [number, number, number] =
    piece.geo === 'burst' ? [-Math.PI / 2, 0, 0] : [0, piece.rotY, 0]

  return (
    <mesh
      ref={(m: THREE.Mesh | null) => register(m, uniforms)}
      position={[piece.x, piece.y, piece.z]}
      rotation={rotation}
      material={material}
      visible={false}
    >
      {piece.geo === 'streak' && <planeGeometry args={[piece.len, 1.15]} />}
      {piece.geo === 'portal' && <circleGeometry args={[1, 48]} />}
      {piece.geo === 'beam' && <cylinderGeometry args={[0.55, 0.75, 2.3, 48, 1, true]} />}
      {piece.geo === 'burst' && <circleGeometry args={[1, 48]} />}
    </mesh>
  )
}
