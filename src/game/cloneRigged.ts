// ============================================================================
// cloneRigged — SkeletonUtils.clone is BROKEN for skinned meshes under
// three r182: the cloned skeleton's boneInverses come out stale, collapsing
// every skinned vertex to the origin (attachments parented to bones render,
// bodies don't — the "invisible character wearing gear" bug).
//
// Fix: after cloning, snap every skeleton back to bind pose, refresh world
// matrices, then re-bind with no explicit bindMatrix so three recomputes
// boneInverses from the actual bind-pose bone matrices.
// ============================================================================

import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'

export const cloneRigged = <T extends THREE.Object3D>(source: T): T => {
  const clone = SkeletonUtils.clone(source) as T

  // Skeleton.clone() passes the source's boneInverses array BY REFERENCE, and
  // three r182's calculateInverses() mutates that array in place
  // (boneInverses.length = 0 + push). The bind() below would otherwise
  // overwrite the SOURCE skeleton's boneInverses — shared mutable state
  // across every clone of the same GLTF (menu heroes, player, enemies,
  // loadout preview), so clones re-binding later corrupt clones bound
  // earlier. Give each cloned skeleton its own array + matrix copies first.
  const seen = new Set<THREE.Skeleton>()
  clone.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh
    if (!skinned.isSkinnedMesh || seen.has(skinned.skeleton)) return
    seen.add(skinned.skeleton)
    skinned.skeleton.boneInverses = skinned.skeleton.boneInverses.map((m) => m.clone())
  })

  clone.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh
    if (skinned.isSkinnedMesh) skinned.skeleton.pose()
  })
  clone.updateMatrixWorld(true)
  clone.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh
    if (skinned.isSkinnedMesh) skinned.bind(skinned.skeleton)
  })

  return clone
}
