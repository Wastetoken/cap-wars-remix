import * as THREE from 'three/webgpu'
import { MeshBasicNodeMaterial, TextureLoader, RepeatWrapping } from 'three/webgpu'
import {
  abs,
  cameraPosition,
  float,
  Fn,
  length,
  Loop,
  mix,
  positionWorld,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl'
import type { EnergyUniforms } from './energy'

// ============================================================================
// Ice floor — deep parallax ice patch left on the ground by Ice Nova.
// Ported from vfx-ref/Ice-Floor.html (itself from rock-biter/ice-trails):
// a parallax-occlusion accumulation loop over a cracks texture, frost tint,
// radial edge alpha fade. TSL port: 32 steps instead of 50 for perf.
//
// The demo's uTrailMap was an unbound render target (read as black); here it
// is replaced by an analytic frost mask — a radial gradient that is frostiest
// at the center of the nova. UV space is 0..1 over the disc.
// ============================================================================

const cracksTexture = new TextureLoader().load('./vfx/ice-cracks.png')
cracksTexture.wrapS = cracksTexture.wrapT = RepeatWrapping

const perlinTexture = new TextureLoader().load('./vfx/ice-noise.png')
perlinTexture.wrapS = perlinTexture.wrapT = RepeatWrapping

type IceFloorMaterial = {
  material: MeshBasicNodeMaterial
  uniforms: EnergyUniforms
}

/** Frost mask standing in for the demo's uTrailMap: 1 at center → 0 at r≈0.9 */
const frostMask = Fn(([sampleUv]) =>
  smoothstep(float(0.9), float(0.3), length(sampleUv.sub(0.5).mul(2)))
)

export const createIceFloorMaterial = (): IceFloorMaterial => {
  const uTime = uniform(0)
  const uOpacity = uniform(1)
  const uParallaxDistance = uniform(1)

  const mat = new MeshBasicNodeMaterial()
  mat.transparent = true
  mat.depthWrite = false
  mat.side = THREE.DoubleSide

  // TSL assigns (toVar/addAssign/...) need a stack — the whole graph lives
  // inside one Fn body.
  const iceGraph = Fn(() => {
    const baseUv = uv().toVar()

    // Parallax offset: view dir in the tangent space of an axis-aligned XZ
    // ground plane — same hardcoded TBN as the demo:
    //   tangent (1,0,0), bitangent (0,0,-1), normal (0,1,0)
    const viewDir = positionWorld.sub(cameraPosition).normalize()
    const tbnViewDir = vec3(viewDir.x, viewDir.z.negate(), viewDir.y)
    const parallax = tbnViewDir.xy.mul(
      uParallaxDistance.div(tbnViewDir.z.negate().max(0.2))
    )

    const perlin = texture(perlinTexture, baseUv).r
    const perlinDetail = texture(
      perlinTexture,
      baseUv.mul(10).add(vec2(uTime.mul(0.015), uTime.mul(0.01)))
    ).r
    const baseCracks = texture(cracksTexture, baseUv.mul(4)).r
    const baseMask = frostMask(baseUv)

    const colorBlue = vec3(0.0, 0.2, 0.25)
    const colorDeepBlue = vec3(0.0, 0.01, 0.03)
    const colorGreen = vec3(0.1, 0.2, 0.35)

    // Parallax-occlusion accumulation: deeper steps sample cracks further along
    // the parallax vector, gated by the frost mask at their own depth.
    const cracks = baseCracks.toVar()
    const normalization = float(1).toVar()
    const accumulateFrosted = float(0).toVar()

    Loop(32, ({ i }) => {
      const fi = i.toFloat()
      const amplitude = float(70).sub(fi)
      const stepUv = baseUv.mul(4).add(parallax.mul(0.002).mul(fi.add(1)))
      const trailUv = baseUv.add(parallax.mul(0.0025).mul(fi.add(1)))

      const currCrack = float(1)
        .sub(texture(cracksTexture, stepUv).r)
        .mul(amplitude)
        .mul(step(0.7, float(1).sub(frostMask(trailUv).pow(0.7))))
        .toVar()

      cracks.addAssign(currCrack)
      normalization.addAssign(amplitude)
      accumulateFrosted.addAssign(frostMask(trailUv).mul(amplitude))
    })

    cracks.divAssign(normalization)
    accumulateFrosted.divAssign(normalization)

    // Crack boost where the frost gate is fully open
    cracks.addAssign(
      float(1)
        .sub(baseCracks)
        .pow(3)
        .mul(3)
        .mul(step(0.92, float(1).sub(baseMask.pow(0.6))))
    )

    const cracksParallax = texture(cracksTexture, baseUv.mul(2).add(parallax.mul(0.1)))

    // Demo's mix chain: frosted base → cracks color → parallax cracks blend → deep frost
    const frosted = colorBlue.mul(3).add(perlin.mul(0.6)).add(perlinDetail.mul(0.6))

    const cracksColor = mix(colorBlue, colorGreen, cracks).toVar()
    cracksColor.addAssign(cracks.mul(2))
    cracksColor.mulAssign(perlin.mul(8).mul(colorBlue))
    cracksColor.addAssign(cracks.mul(0.5))

    const prxCracksColor = mix(
      colorDeepBlue,
      colorBlue,
      float(1).sub(cracksParallax.r).pow(3).mul(10)
    ).toVar()
    prxCracksColor.mulAssign(perlin)

    cracksColor.assign(mix(cracksColor, prxCracksColor, 0.3))

    const deepColor = mix(
      vec3(0.1, 0.7, 0.7),
      vec3(0.0, 0.3, 1.0),
      float(1).sub(accumulateFrosted.pow(1.5))
    )
    cracksColor.assign(mix(cracksColor, deepColor, accumulateFrosted.pow(1.5)))

    const col = mix(cracksColor, frosted, baseMask.pow(0.5)).toVar()

    // Darken the rim
    const centeredUv = baseUv.sub(0.5).mul(2)
    col.assign(
      mix(col, vec3(0.0, 0.01, 0.02), smoothstep(float(0.2), float(1.0), length(abs(centeredUv))))
    )

    return col
  })()

  // Radial edge alpha fade (pure expression, no stack needed)
  const edgeDistance = length(uv().sub(0.5).mul(2))

  mat.colorNode = iceGraph
  mat.opacityNode = uOpacity.mul(
    float(1).sub(smoothstep(float(0.8), float(1.0), edgeDistance))
  )

  return { material: mat, uniforms: { uTime, uOpacity } }
}
