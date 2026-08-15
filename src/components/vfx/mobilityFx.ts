import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  abs,
  atan,
  ceil,
  clamp,
  color,
  exp,
  float,
  floor,
  Fn,
  fract,
  length,
  log,
  Loop,
  mix,
  mod,
  pow,
  sin,
  smoothstep,
  sqrt,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl'
import { noiseTexture } from '../textures/noiseTexture'
import { voronoiTexture } from '../textures/voronoiTexture'
import type { EnergyUniforms } from './energy'

// ============================================================================
// Mobility VFX materials — slash-grade TSL for dash / shadowstep / blink /
// leap. Same language as the slash: noise streaks, voronoi breakup, sweep
// reveals, HDR hot edges that feed bloom.
// ============================================================================

export type MobilityUniforms = EnergyUniforms & {
  /** 0→1 sweep reveal (dash streak head) */
  uProgress: { value: number }
}

type MobilityMaterial = {
  material: MeshBasicNodeMaterial
  uniforms: MobilityUniforms
}

const makeUniforms = () => ({
  uTime: uniform(0),
  uOpacity: uniform(1),
  uProgress: uniform(0),
})

const makeBase = () => {
  const mat = new MeshBasicNodeMaterial()
  mat.transparent = true
  mat.blending = THREE.AdditiveBlending
  mat.depthWrite = false
  mat.side = THREE.DoubleSide
  return mat
}

/**
 * Dash streak — vertical ribbon along the travel path (PlaneGeometry,
 * uv.x: 0 tail → 1 head). A white-hot head sweeps the path, the body is
 * speed-streaked noise, ends taper to nothing.
 */
export const createDashStreakMaterial = (
  base: string,
  edge: string,
  hdr = 8
): MobilityMaterial => {
  const u = makeUniforms()
  const mat = makeBase()

  // Streaks racing tail-ward along the ribbon
  const streaks = texture(
    noiseTexture,
    vec2(uv().x.mul(2.5).sub(u.uTime.mul(3.2)), uv().y.mul(1.4))
  ).r
  const cells = texture(
    voronoiTexture,
    vec2(uv().x.mul(1.8).sub(u.uTime.mul(1.1)), uv().y.mul(2.2))
  ).r

  // Bright center line, soft ribbon edges
  const core = smoothstep(float(0.0), float(0.42), uv().y).mul(
    smoothstep(float(1.0), float(0.58), uv().y)
  )
  // Tapered ends
  const taper = smoothstep(float(0.0), float(0.14), uv().x).mul(
    smoothstep(float(1.0), float(0.9), uv().x)
  )
  // Head sweep: revealed where uv.x < uProgress
  const reveal = smoothstep(u.uProgress, u.uProgress.sub(0.1), uv().x)
  // Hottest at the leading head
  const head = smoothstep(u.uProgress.sub(0.22), u.uProgress, uv().x).mul(reveal)

  const energy = streaks.mul(0.75).add(pow(cells, float(3)).mul(1.5))
  mat.colorNode = mix(color(base), color(edge), head.mul(0.9).add(core.mul(0.25))).mul(
    float(hdr).mul(energy.mul(0.7).add(0.3)).mul(head.mul(1.6).add(0.6))
  )
  mat.opacityNode = u.uOpacity
    .mul(taper)
    .mul(reveal)
    .mul(core.mul(0.75).add(0.25))
    .mul(energy.mul(0.6).add(0.4))

  return { material: mat, uniforms: u }
}

/**
 * Shadowstep vortex — face-on purple logarithmic-spiral portal disc
 * (CircleGeometry), ported 1:1 from the Shadow-Portal-Animation demo:
 * fbm over smooth value noise, spiral bands via log-sqrt radius, deep
 * purple col/rz blowout toward the core, cubic radial alpha falloff.
 * The demo's exp(mod(t*2, PI)) inward zoom pops at every wrap, so two
 * layers offset by PI/2 are crossfaded with a triangle weight — each
 * layer has zero weight exactly when its own zoom wraps.
 */
export const createShadowVortexMaterial = (): MobilityMaterial => {
  const u = makeUniforms()
  const mat = makeBase()

  // Demo advances iTime by 0.01/frame ≈ 0.6/s at 60fps
  const t = u.uTime.mul(0.6)

  const random = Fn(([p]) => fract(sin(p).mul(10000)))

  const noise = Fn(([p]) => {
    const tn = fract(t.div(2000))
    return random(p.x.mul(14).add(p.y.mul(sin(tn).mul(0.5))))
  })

  const smoothNoise = Fn(([p]) => {
    const inter = smoothstep(vec2(0, 0), vec2(1, 1), fract(p))
    const s = mix(
      noise(vec2(floor(p.x), floor(p.y))),
      noise(vec2(ceil(p.x), floor(p.y))),
      inter.x
    )
    const n = mix(
      noise(vec2(floor(p.x), ceil(p.y))),
      noise(vec2(ceil(p.x), ceil(p.y))),
      inter.x
    )
    return mix(s, n, inter.y)
  })

  const circ = Fn(([p]) => {
    const r = log(sqrt(length(p)))
    return abs(mod(r.mul(4), float(Math.PI * 2)).sub(Math.PI)).mul(3).add(0.2)
  })

  const fbm = Fn(([pIn]) => {
    const p = pIn.toVar()
    const z = float(2).toVar()
    const rz = float(0).toVar()
    Loop(5, () => {
      rz.addAssign(abs(smoothNoise(p).sub(0.5).mul(2)).div(z))
      z.mulAssign(2)
      p.mulAssign(2)
    })
    return rz
  })

  // One zoom layer: fbm stays fixed, spiral rings zoom inward via p / exp(phase)
  const vortexLayer = Fn(([phase]) => {
    const p = uv().sub(vec2(0.5, 0.5)).mul(8) // demo aspect = 1 (square plane)
    const pz = p.div(exp(phase))
    return fbm(p).mul(pow(abs(float(0.1).sub(circ(pz))), float(0.9)))
  })

  // Triangle crossfade between the phase-offset layers hides the zoom wrap
  const phase = mod(t.mul(2), float(Math.PI))
  const phaseB = mod(t.mul(2).add(Math.PI / 2), float(Math.PI))
  const weight = float(1).sub(abs(phase.div(Math.PI).mul(2).sub(1)))
  const rz = mix(vortexLayer(phaseB), vortexLayer(phase), weight)

  const len = length(uv().sub(vec2(0.5, 0.5))).mul(2)

  mat.colorNode = vec3(0.2, 0.1, 0.643).div(rz)
  mat.opacityNode = u.uOpacity.mul(clamp(float(1).sub(pow(len, float(3))), 0, 1))

  return { material: mat, uniforms: u }
}

/**
 * Ground-crack burst — radial spokes of fire tearing outward
 * (CircleGeometry on the ground, mesh scales up over life).
 */
export const createGroundBurstMaterial = (
  base = '#ff7a2a',
  edge = '#ffd28a',
  hdr = 8
): MobilityMaterial => {
  const u = makeUniforms()
  const mat = makeBase()

  const p = uv().sub(vec2(0.5, 0.5)).mul(2)
  const radial = length(p)
  const angle = atan(p.y, p.x)

  const spokes = texture(
    noiseTexture,
    vec2(angle.mul(1.9), radial.mul(1.3).sub(u.uTime.mul(2.6)))
  ).r
  const cells = texture(
    voronoiTexture,
    vec2(angle.mul(0.9), radial.mul(2.2).sub(u.uTime.mul(1.7)))
  ).r

  const cracks = pow(spokes, float(2.6)).add(pow(cells, float(4)).mul(1.4))
  const body = smoothstep(float(0.12), float(0.55), radial).mul(
    smoothstep(float(1.0), float(0.75), radial)
  )
  const rimFlash = smoothstep(float(0.72), float(0.95), radial)

  mat.colorNode = mix(color(base), color(edge), rimFlash.mul(0.8).add(cracks.mul(0.2))).mul(
    float(hdr).mul(cracks.mul(0.85).add(0.25))
  )
  mat.opacityNode = u.uOpacity.mul(body).mul(cracks.mul(0.75).add(rimFlash.mul(0.3)))

  return { material: mat, uniforms: u }
}
