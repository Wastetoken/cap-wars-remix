import * as THREE from 'three/webgpu'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Fn,
  Loop,
  abs,
  clamp,
  cos,
  cross,
  dot,
  float,
  length,
  max,
  normalize,
  sin,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl'

// ============================================================================
// Buff aura — TSL port of the Green-Aura Shadertoy raymarch (twisted cosine
// DE field, 100-step march) re-anchored from fragCoord to quad UV:
//   FC  = vec3(uv * planeSize * vec2(aspect, 1), t)      (virtual viewport)
//   ray = normalize(FC.rgb * 2 - r.xyy),  r.xyy = (w, h, h)
// The demo is opaque black-backed; here alpha comes from the accumulated
// luminance so the dark swirl falls off to transparent around the nucleus.
// Drive uTime/uOpacity from useFrame like the energy.ts materials.
// ============================================================================

export type BuffAuraUniforms = {
  uTime: { value: number }
  uOpacity: { value: number }
}

type BuffAuraMaterial = {
  material: MeshBasicNodeMaterial
  uniforms: BuffAuraUniforms
}

// Green-teal nucleus glow — the demo's vec4(3.0, 8.0, z, 0.0).
// A per-class recolor is a one-line change here.
const AURA_COLOR = { r: 3.0, g: 8.0 }

// Virtual Shadertoy viewport in raymarch units — sizes the DE nucleus to
// fill the aura quad (the quad is square, so aspect is 1).
const AURA_VIEWPORT = 6.0
// March steps (the demo runs 100 fullscreen; 56 holds up in-scene).
const AURA_STEPS = 56

export const createBuffAuraMaterial = (): BuffAuraMaterial => {
  const uTime = uniform(0)
  const uOpacity = uniform(1)
  const mat = new MeshBasicNodeMaterial()
  mat.transparent = true
  mat.blending = THREE.AdditiveBlending
  mat.depthWrite = false
  mat.side = THREE.DoubleSide

  const aura = Fn(() => {
    const w = float(AURA_VIEWPORT)
    const h = float(AURA_VIEWPORT)
    const t = uTime
    const fc = vec3(uv().x.mul(w), uv().y.mul(h), t)
    const ray = normalize(
      vec3(fc.x.mul(2).sub(w), fc.y.mul(2).sub(h), fc.z.mul(2).sub(h))
    )

    const o = vec4(0).toVar()
    const z = float(0).toVar()
    const d = float(0).toVar()

    Loop(AURA_STEPS, () => {
      const p = z.mul(ray).toVar()
      const a = normalize(cos(vec3(4.0, 2.0, 0.0).add(t).sub(d.mul(10.0)))).toVar()
      p.z.addAssign(8.0)
      a.assign(a.mul(dot(a, p)).sub(cross(a, p)))
      Loop({ start: 1, end: 5 }, ({ i }) => {
        const k = i.toFloat()
        a.addAssign(sin(a.mul(k).add(t)).yzx.div(k))
      })
      d.assign(abs(length(a).sub(5.0)).div(6.0))
      z.addAssign(d)
      o.addAssign(vec4(AURA_COLOR.r, AURA_COLOR.g, z, 0.0).div(max(d, 1e-4)).div(9e4))
    })

    return o
  })()

  const luma = aura.rgb.dot(vec3(0.2126, 0.7152, 0.0722))
  mat.colorNode = aura.rgb
  mat.opacityNode = uOpacity.mul(clamp(luma, 0.0, 1.0))

  return { material: mat, uniforms: { uTime, uOpacity } }
}
