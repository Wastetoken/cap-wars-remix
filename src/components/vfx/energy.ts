import * as THREE from 'three/webgpu'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  atan,
  clamp,
  color,
  cos,
  dot,
  exp,
  float,
  floor,
  Fn,
  fract,
  length,
  Loop,
  mat2,
  max,
  min,
  mix,
  normalize,
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

// ============================================================================
// Energy VFX materials — TSL node materials in the spirit of the slash:
// layered noise/voronoi breakup, hot HDR edges that feed bloom, no flat
// MeshBasicMaterial rings.
//
// All materials expose uniforms via `uniforms` — drive uTime/uOpacity from
// useFrame. UV space is the geometry bounding box centered at (0.5, 0.5):
//   p      = uv * 2 - 1   (unit circle)
//   radial = length(p)    (0..1 on CircleGeometry, 0.85..1 on ring bands)
//   angle  = atan(p.y, p.x)
// ============================================================================

export type EnergyUniforms = {
  uTime: { value: number }
  uOpacity: { value: number }
}

type EnergyMaterial = {
  material: MeshBasicNodeMaterial
  uniforms: EnergyUniforms
}

const centeredPolar = () => {
  const p = uv().sub(vec2(0.5, 0.5)).mul(2)
  return { p, radial: length(p), angle: atan(p.y, p.x) }
}

const makeBase = () => {
  const mat = new MeshBasicNodeMaterial()
  mat.transparent = true
  mat.blending = THREE.AdditiveBlending
  mat.depthWrite = false
  mat.side = THREE.DoubleSide
  return mat
}

/**
 * Expanding energy ring — meant for RingGeometry bands (~0.8..1).
 * Rotating noise streaks + voronoi cells, hottest at the outer edge.
 */
export const createEnergyRingMaterial = (
  base: string,
  edge: string,
  hdr = 7
): EnergyMaterial => {
  const uTime = uniform(0)
  const uOpacity = uniform(1)
  const mat = makeBase()

  const { radial, angle } = centeredPolar()

  // Streaks racing around the ring + drifting voronoi cells
  const streaks = texture(
    noiseTexture,
    vec2(angle.mul(1.2), radial.mul(2).sub(uTime.mul(2.2)))
  ).r
  const cells = texture(
    voronoiTexture,
    vec2(angle.mul(0.8).add(uTime.mul(0.12)), radial.mul(1.6).sub(uTime.mul(1.1)))
  ).r

  const band = smoothstep(float(0.78), float(0.88), radial)
  const edgeGlow = smoothstep(float(0.88), float(1.0), radial)
  const energy = streaks.mul(0.7).add(cells.pow(3).mul(1.6))

  mat.colorNode = mix(color(base), color(edge), edgeGlow).mul(
    float(hdr).mul(energy.mul(0.8).add(0.35))
  )
  mat.opacityNode = uOpacity.mul(band).mul(edgeGlow.mul(0.9).add(0.4)).mul(energy.mul(0.6).add(0.45))

  return { material: mat, uniforms: { uTime, uOpacity } }
}

/**
 * Boss slam telegraph fill — CircleGeometry, mesh scales outward with the
 * windup so uv-radial ≈ 1 is always the live frontier.
 * Dark flickering danger field + white-hot closing edge.
 */
export const createTelegraphFillMaterial = (
  field = '#c2130e',
  edge = '#ffd28a'
): EnergyMaterial => {
  const uTime = uniform(0)
  const uOpacity = uniform(1)
  const mat = makeBase()

  const { p, radial } = centeredPolar()

  const flicker = texture(noiseTexture, p.mul(2.5).add(uTime.mul(0.6))).r
  const cells = texture(voronoiTexture, p.mul(1.8).sub(uTime.mul(0.25))).r
  const pulse = sin(uTime.mul(9)).mul(0.5).add(0.5)
  const frontier = smoothstep(float(0.86), float(1.0), radial)

  const fieldColor = color(field).mul(float(1.6).mul(flicker.mul(0.7).add(0.5)).mul(pulse.mul(0.5).add(0.7)))
  const hotEdge = color(edge).mul(float(10).mul(cells.mul(0.6).add(0.7)))

  mat.colorNode = mix(fieldColor, hotEdge, frontier)
  mat.opacityNode = uOpacity.mul(
    float(0.16).add(flicker.mul(0.1)).add(frontier.mul(0.75))
  )

  return { material: mat, uniforms: { uTime, uOpacity } }
}

/**
 * Telegraph rim — RingGeometry band 0.94..1 with rotating dashes that spin
 * faster as uTime accumulates. Pure warning red by default.
 */
export const createTelegraphRimMaterial = (rim = '#ff2d1a'): EnergyMaterial => {
  const uTime = uniform(0)
  const uOpacity = uniform(1)
  const mat = makeBase()

  const { radial, angle } = centeredPolar()

  const dashes = smoothstep(
    float(0.44),
    float(0.46),
    fract(angle.div(Math.PI * 2).mul(20).sub(uTime.mul(0.7)))
  )
  const band = smoothstep(float(0.93), float(0.96), radial).mul(
    smoothstep(float(1.0), float(0.985), radial)
  )
  const spark = texture(noiseTexture, vec2(angle.mul(2), uTime.mul(1.5))).r

  mat.colorNode = color(rim).mul(float(8).mul(spark.mul(0.7).add(0.6)))
  mat.opacityNode = uOpacity.mul(band).mul(dashes).mul(0.9)

  return { material: mat, uniforms: { uTime, uOpacity } }
}

/**
 * Boss shockwave wall — cylinder side (open-ended). uv.x wraps around,
 * uv.y runs bottom→top. Rising fire streaks, fades at both rims, hottest
 * at the base.
 */
export const createEnergyWallMaterial = (
  base = '#ff5a1a',
  edge = '#ffd28a',
  hdr = 7
): EnergyMaterial => {
  const uTime = uniform(0)
  const uOpacity = uniform(1)
  const mat = makeBase()

  const streaks = texture(
    noiseTexture,
    vec2(uv().x.mul(7), uv().y.mul(1.4).sub(uTime.mul(2.6)))
  ).r
  const cells = texture(
    voronoiTexture,
    vec2(uv().x.mul(4), uv().y.mul(2).sub(uTime.mul(1.4)))
  ).r

  const baseHeat = smoothstep(float(0.45), float(0.0), uv().y)
  const vertFade = smoothstep(float(0.0), float(0.12), uv().y).mul(
    smoothstep(float(1.0), float(0.5), uv().y)
  )
  const energy = streaks.mul(0.8).add(cells.pow(3).mul(1.4))

  mat.colorNode = mix(color(base), color(edge), baseHeat).mul(
    float(hdr).mul(energy.mul(0.8).add(0.3))
  )
  mat.opacityNode = uOpacity.mul(vertFade).mul(energy.mul(0.55).add(0.35))

  return { material: mat, uniforms: { uTime, uOpacity } }
}

/**
 * Exit portal fire disc — face-on churning voronoi fire/smoke
 * (CircleGeometry), ported 1:1 from the Fire-Smoke-Portal-Animation demo:
 * 3D voronoi with the z-slice trick, 5 noise layers scrolling in z, slow
 * rotation + wobble, black-body fire palette (1400K→2700K), quadratic
 * radial alpha falloff.
 */
export const createFirePortalMaterial = (cold = false): EnergyMaterial => {
  const uTime = uniform(0)
  const uOpacity = uniform(1)
  const mat = makeBase()

  // Demo advances iTime by 0.01/frame ≈ 0.6/s at 60fps
  const t = uTime.mul(0.6)

  const firePalette = Fn(([i]) => {
    const T = float(1400).add(i.mul(1300)) // Temperature range (in Kelvin)
    const L = vec3(7.4, 5.6, 4.4).toVar() // Red, green, blue wavelengths (in hundreds of nanometers)
    L.assign(
      pow(L, vec3(5, 5, 5)).mul(exp(float(1.43876719683e5).div(T.mul(L))).sub(1))
    )
    return float(1).sub(exp(float(-5e8).div(L))) // Exposure level
  })

  const hash33 = Fn(([p]) => {
    const n = sin(dot(p, vec3(7, 157, 113)))
    return fract(vec3(2097152, 262144, 32768).mul(n))
  })

  const voronoi = Fn(([pIn]) => {
    const g = floor(pIn).toVar()
    const p = fract(pIn).toVar()
    const d = float(1).toVar()
    Loop(3, ({ i: j }) => {
      Loop(3, ({ i }) => {
        // z-slice trick: same xy cell checked at z = -1, 0, 1
        const checkSlice = (z: number) => {
          const b = vec3(float(i).sub(1), float(j).sub(1), z)
          const r = b.sub(p).add(hash33(g.add(b)))
          d.assign(min(d, dot(r, r)))
        }
        checkSlice(-1)
        checkSlice(0)
        checkSlice(1)
      })
    })
    return d
  })

  const noiseLayers = Fn(([pIn]) => {
    const p = pIn.toVar()
    const tOff = vec3(0, 0, pIn.z.add(t.mul(1.5))).toVar()
    const tot = float(0).toVar()
    const sum = float(0).toVar()
    const amp = float(1).toVar()
    Loop(5, () => {
      tot.addAssign(voronoi(p.add(tOff)).mul(amp))
      p.mulAssign(2)
      tOff.mulAssign(1.5)
      sum.addAssign(amp)
      amp.mulAssign(0.5)
    })
    return tot.div(sum)
  })

  const len = length(uv().sub(vec2(0.5, 0.5))).mul(2)
  const uvWobble = uv()
    .sub(vec2(0.5, 0.5))
    .mul(2)
    .add(vec2(sin(t.mul(0.5)).mul(0.25), cos(t.mul(0.5)).mul(0.125)))

  const rdRaw = normalize(vec3(uvWobble.x, uvWobble.y, Math.PI / 8))
  const cs = cos(t.mul(0.25))
  const si = sin(t.mul(0.25))
  const rdXy = rdRaw.xy.mul(mat2(cs, si.negate(), si, cs))
  const rd = vec3(rdXy, rdRaw.z)

  const c0 = max(
    noiseLayers(rd.mul(2)).add(
      dot(hash33(rd).mul(2).sub(1), vec3(0.015, 0.015, 0.015))
    ),
    0
  )
  const c = c0.mul(sqrt(c0).mul(1.5)) // Contrast

  const palette = firePalette(c)
  const dispersion = min(pow(dot(rd.xy, rd.xy).mul(1.2), float(1.5)), 1)
  const col = pow(
    mix(palette, palette.zyx.mul(0.15).add(c.mul(0.85)), dispersion),
    vec3(1.25, 1.25, 1.25)
  )

  const base = sqrt(clamp(col, 0, 1))
  // cold: swap fire orange → arcane cyan/blue, then push toward violet —
  // an arcane rift instead of a fire portal
  mat.colorNode = cold ? base.zyx.mul(vec3(1.05, 0.8, 1.7)) : base
  mat.opacityNode = uOpacity.mul(clamp(float(1).sub(pow(len, float(2))), 0, 1))

  return { material: mat, uniforms: { uTime, uOpacity } }
}
