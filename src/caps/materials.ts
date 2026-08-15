import { MeshStandardNodeMaterial } from 'three/webgpu'
import * as THREE from 'three'
import { color, mix, texture, uniform } from 'three/tsl'

// ============================================================================
// Exported Uniforms
// ============================================================================

// Sword glow uniform - 0 = no glow, 1 = full glow
export const swordGlowUniform = uniform(0)
/** Per-class charge glow tint — mutated live on character switch (Caps.tsx) */
export const swordGlowColor = uniform(new THREE.Color('#FF7139'))
/** Best gear rarity this run — drives the weapon's rarity sheen (0 = none) */
export const swordRarityLevel = uniform(0)
export const swordRarityColor = uniform(new THREE.Color('#ffffff'))

// ============================================================================
// Materials
// ============================================================================

export const createSwordMaterial = (source?: THREE.Material) => {
  const mat = new MeshStandardNodeMaterial()
  // Keep the weapon's authored texture when the GLTF material has one —
  // the flat cream is only a fallback for texture-less meshes
  const srcMap = (source as THREE.MeshStandardMaterial | undefined)?.map
  const baseColor = srcMap ? texture(srcMap).rgb : color('#FCFBE6')
  const glowColor = swordGlowColor.mul(10)
  // Rarity sheen: a whisper for common, a beacon for legendary
  const sheen = swordRarityColor.mul(swordRarityLevel.mul(1.6))
  mat.colorNode = mix(baseColor, glowColor, swordGlowUniform).add(sheen)
  return mat
}
