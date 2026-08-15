import * as THREE from 'three/webgpu'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Fn,
  Loop,
  abs,
  acos,
  clamp,
  dot,
  float,
  floor,
  fract,
  frontFacing,
  max,
  min,
  mix,
  mx_noise_float,
  normalView,
  normalize,
  positionLocal,
  positionViewDirection,
  select,
  sin,
  smoothstep,
  step,
  uniform,
  uniformArray,
  vec2,
  vec3,
} from 'three/tsl'

// ============================================================================
// Mage force shield — TSL port of the owner's "Shield Siege" demo (hex energy
// bubble). Hex cells projected on the sphere's dominant face, fresnel rim,
// two-octave animated flow noise, per-cell twinkle, and an expanding impact
// ring + hex flash wherever a blocked hit lands (up to MAX_HITS concurrent).
// GLSL simplex noise is swapped for MaterialX Perlin (mx_noise_float) — same
// ballpark range, none of the 60-line port.
// The demo's uLife tint (blue→red as shield HP drops) is pinned to full life —
// blocking has no HP pool in-game. The bottom alpha fade (uFadeStart=-1 in the
// demo) is a degenerate smoothstep and is omitted.
// Drive uTime/uReveal from useFrame; poke hits via registerHit().
// ============================================================================

export const SHIELD_RADIUS = 1.35
const MAX_HITS = 6

// Demo "default" preset values
const CFG = {
  color: '#26aeff',
  opacity: 0.76,
  hexScale: 4.0, // demo: 3.0 @ R=1.8 — scaled to keep cell count at R=1.35
  hexOpacity: 0.13,
  edgeWidth: 0.06,
  fresnelPower: 1.8,
  fresnelStrength: 1.75,
  flashSpeed: 0.6,
  flashIntensity: 0.11,
  noiseScale: 1.3,
  noiseEdgeColor: '#26aeff',
  noiseEdgeWidth: 0.02,
  noiseEdgeIntensity: 10.0,
  noiseEdgeSmoothness: 0.5,
  flowScale: 2.4,
  flowSpeed: 1.13,
  flowIntensity: 4.0,
  hitRingSpeed: 1.75,
  hitRingWidth: 0.12,
  hitMaxRadius: 0.85,
  hitDuration: 1.8,
  hitIntensity: 4.1,
  hitImpactRadius: 0.3,
}

export type MageShieldUniforms = {
  uTime: { value: number }
  /** 1 = fully hidden, 0 = fully deployed (demo reveal semantics) */
  uReveal: { value: number }
}

export type MageShieldMaterial = {
  material: MeshBasicNodeMaterial
  uniforms: MageShieldUniforms
  /** Register an impact at a world-space point — spawns ring + hex flash. */
  registerHit: (worldPoint: THREE.Vector3, shieldCenter: THREE.Vector3) => void
}

export const createMageShieldMaterial = (): MageShieldMaterial => {
  const uTime = uniform(0)
  const uReveal = uniform(1)
  const uColor = uniform(new THREE.Color(CFG.color))
  const uNoiseEdgeColor = uniform(new THREE.Color(CFG.noiseEdgeColor))

  const hitPositions = Array.from({ length: MAX_HITS }, () => new THREE.Vector3(0, 1, 0))
  const hitTimes = new Array<number>(MAX_HITS).fill(-999)
  let hitCursor = 0
  const uHitPos = uniformArray(hitPositions, 'vec3')
  const uHitTime = uniformArray(hitTimes, 'float')

  const registerHit = (worldPoint: THREE.Vector3, shieldCenter: THREE.Vector3) => {
    const idx = hitCursor % MAX_HITS
    hitCursor += 1
    hitPositions[idx]
      .copy(worldPoint)
      .sub(shieldCenter)
      .normalize()
      .multiplyScalar(SHIELD_RADIUS)
    hitTimes[idx] = uTime.value as number
  }

  // -- hex grid on the sphere's dominant face --------------------------------
  const hexPattern = Fn(([pRaw]) => {
    const p = pRaw as any
    const s = vec2(1.0, 1.7320508)
    const ps = p.mul(CFG.hexScale)
    const hC1 = floor(ps.div(s)).add(0.5)
    const hC2 = floor(ps.sub(vec2(0.5, 1.0)).div(s)).add(0.5)
    const h1 = ps.sub(hC1.mul(s))
    const h2 = ps.sub(hC2.add(0.5).mul(s))
    const cell = abs(select(dot(h1, h1).lessThan(dot(h2, h2)), h1, h2)) as any
    return smoothstep(
      float(0.5).sub(CFG.edgeWidth),
      0.5,
      dot(cell, s.mul(0.5)).max(cell.x)
    )
  })

  const hexCellId = Fn(([pRaw]) => {
    const p = pRaw as any
    const s = vec2(1.0, 1.7320508)
    const ps = p.mul(CFG.hexScale)
    const hC1 = floor(ps.div(s)).add(0.5)
    const hC2 = floor(ps.sub(vec2(0.5, 1.0)).div(s)).add(0.5)
    const h1 = ps.sub(hC1.mul(s))
    const h2 = ps.sub(hC2.add(0.5).mul(s))
    return select(dot(h1, h1).lessThan(dot(h2, h2)), hC1, hC2.add(0.5)) as any
  })

  // Per-cell pseudo-random twinkle
  const cellFlash = Fn(([cIdRaw]) => {
    const cId = cIdRaw as any
    const r = fract(sin(dot(cId, vec2(127.1, 311.7))).mul(43758.5453))
    return smoothstep(
      0.6,
      1.0,
      sin(uTime.mul(CFG.flashSpeed).mul(r.mul(1.5).add(0.5)).add(r.mul(6.2831)))
    ).mul(CFG.flashIntensity)
  })

  const noise = mx_noise_float(positionLocal.mul(CFG.noiseScale)).mul(0.5).add(0.5)

  // Reveal mask — uReveal sweeps 1→0, dissolving the shield in along noise
  const revealMask = smoothstep(
    uReveal.sub(CFG.noiseEdgeWidth),
    uReveal,
    noise
  ).toVar()
  const innerFade = mix(0.98, 0.15, CFG.noiseEdgeSmoothness)
  const edgeLow = smoothstep(
    uReveal.sub(CFG.noiseEdgeWidth),
    uReveal.sub(innerFade.mul(CFG.noiseEdgeWidth)),
    noise
  )
  const edgeHigh = smoothstep(uReveal.sub(CFG.noiseEdgeWidth * 0.15), uReveal, noise)
  const revealEdge = edgeLow.mul(edgeHigh.oneMinus())

  // Fresnel rim (back faces flip their normal, matching the demo's DoubleSide)
  const faceNormal = frontFacing.select(normalView, normalView.negate())
  const fresnel = float(1)
    .sub(abs(dot(faceNormal, positionViewDirection)))
    .pow(CFG.fresnelPower)
    .mul(CFG.fresnelStrength)

  // Animated flow noise — two octaves drifting through the volume
  const t = uTime.mul(CFG.flowSpeed)
  const fn1 = mx_noise_float(positionLocal.mul(CFG.flowScale).add(vec3(t, t.mul(0.6), t.mul(0.4))))
  const fn2 = mx_noise_float(
    positionLocal.mul(CFG.flowScale * 2.1).add(vec3(t.mul(-0.5), t.mul(0.9), t.mul(0.3)))
  )
  const flowNoise = fn1.mul(0.6).add(fn2.mul(0.4)).mul(0.5).add(0.5)

  // Hex projection fades near the 45° seams between dominant faces
  const normPos = normalize(positionLocal)
  const absN = abs(normPos)
  const hexFade = smoothstep(0.65, 0.85, max(absN.x, max(absN.y, absN.z)))
  const faceUV = select(
    absN.x.greaterThanEqual(absN.y).and(absN.x.greaterThanEqual(absN.z)),
    positionLocal.yz,
    select(absN.y.greaterThanEqual(absN.z), positionLocal.xz, positionLocal.xy)
  )
  const hex = hexPattern(faceUV).mul(hexFade)
  const flash = cellFlash(hexCellId(faceUV)).mul(hexFade)

  // Impact rings — expanding great-circle ripples from each registered hit
  const ringContrib = float(0).toVar()
  const hexHitBoost = float(0).toVar()
  Loop(MAX_HITS, ({ i }) => {
    const ht = uHitTime.element(i) as any
    const elapsed = uTime.sub(ht)
    const isActive = step(0, ht)
      .mul(step(0, elapsed))
      .mul(step(elapsed, CFG.hitDuration))
    const dist = acos(clamp(dot(normPos, normalize(uHitPos.element(i) as any)), -1, 1))
    const ringR = min(elapsed.mul(CFG.hitRingSpeed), CFG.hitMaxRadius)
    const noiseD = mx_noise_float(normPos.mul(5).add(vec3(elapsed.mul(2)))).mul(0.05)
    const ring = smoothstep(CFG.hitRingWidth, 0, abs(dist.add(noiseD).sub(ringR)))
    const fade = float(1).sub(smoothstep(CFG.hitDuration * 0.5, CFG.hitDuration, elapsed))
    const radialFade = float(1).sub(
      smoothstep(CFG.hitMaxRadius * 0.75, CFG.hitMaxRadius, ringR)
    )
    ringContrib.addAssign(ring.mul(fade).mul(radialFade).mul(isActive))
    hexHitBoost.addAssign(
      smoothstep(CFG.hitImpactRadius, 0, dist)
        .mul(float(1).sub(smoothstep(0, CFG.hitDuration * 0.35, elapsed)))
        .mul(isActive)
    )
  })
  // Clamp AFTER the loop as plain nodes — .assign() outside a Fn/Loop stack
  // is illegal TSL ("No stack defined for assign operation")
  const ringTotal = min(ringContrib, 2)
  const boostTotal = min(hexHitBoost, 1)

  // Final composition (life pinned to 1.0 → lifeColor === uColor)
  const effHex = float(CFG.hexOpacity).add(boostTotal.mul(CFG.hitIntensity))
  const intensity = hex
    .mul(effHex)
    .mul(fresnel.mul(0.7).add(0.3))
    .add(fresnel.mul(0.4))
    .add(flash)
  const shieldColor = uColor
    .mul(intensity.mul(2))
    .add(uColor.mul(flowNoise.mul(fresnel).mul(CFG.flowIntensity)))
    .add(uColor.mul(ringTotal.mul(CFG.hitIntensity)))
  const edgeGlow = uNoiseEdgeColor.mul(revealEdge.mul(CFG.noiseEdgeIntensity))
  const alpha = clamp(
    intensity.mul(CFG.opacity).mul(revealMask).add(revealEdge.mul(CFG.noiseEdgeIntensity)),
    0,
    1
  )

  const mat = new MeshBasicNodeMaterial()
  mat.transparent = true
  mat.blending = THREE.AdditiveBlending
  mat.depthWrite = false
  mat.side = THREE.DoubleSide
  mat.colorNode = shieldColor.add(edgeGlow)
  mat.opacityNode = alpha

  return { material: mat, uniforms: { uTime, uReveal }, registerHit }
}
