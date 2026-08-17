// ============================================================================
// Mesh pool — pre-clone skinned GLB meshes so spawning doesn't block the
// render thread. Cloning a rigged KayKit character is expensive (skeleton
// rebuild + boneInverses copy + bind). By keeping a hot pool of ready clones
// per mob type, EnemyMesh can grab one instantly instead of cloning
// synchronously during React render.
//
// Pool keys are mob type strings (e.g. "mage", "knight", "boss-rogue") so
// clones with different show/hide configurations never cross-contaminate.
// ============================================================================

import * as THREE from 'three'
import { cloneRigged } from '@/game/cloneRigged'

export type MobType = string

const POOL_MAX = 8

const pools = new Map<MobType, THREE.Object3D[]>()

export const acquireClone = (mobType: MobType, sourceScene: THREE.Object3D): THREE.Object3D => {
  let pool = pools.get(mobType)
  if (!pool) {
    pool = []
    pools.set(mobType, pool)
  }
  if (pool.length > 0) {
    const clone = pool.pop()!
    resetClone(clone)
    clone.visible = true
    return clone
  }
  const fresh = cloneRigged(sourceScene)
  fresh.visible = true
  return fresh
}

export const releaseClone = (mobType: MobType, clone: THREE.Object3D) => {
  let pool = pools.get(mobType)
  if (!pool) {
    pool = []
    pools.set(mobType, pool)
  }
  if (pool.length < POOL_MAX) {
    resetClone(clone)
    pool.push(clone)
  }
}

export const prewarmPool = (mobType: MobType, sourceScene: THREE.Object3D, count: number) => {
  let pool = pools.get(mobType)
  if (!pool) {
    pool = []
    pools.set(mobType, pool)
  }
  while (pool.length < count) {
    pool.push(cloneRigged(sourceScene))
  }
}

const resetClone = (clone: THREE.Object3D) => {
  clone.position.set(0, 0, 0)
  clone.rotation.set(0, 0, 0)
  clone.scale.set(1, 1, 1)
  clone.visible = false
}
