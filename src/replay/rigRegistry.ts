import type * as THREE from 'three'

/**
 * Registry of every animatable rig (player + each enemy) and every instanced
 * projectile pool, so the replay system can sample their state while
 * recording and drive their poses during playback — without going through
 * the gameplay state machines (which are frozen during playback).
 */

export type RigEntry = {
  mixer: THREE.AnimationMixer
  actions: Record<string, THREE.AnimationAction>
}

const rigs = new Map<string, RigEntry>()

export const registerRig = (id: string, entry: RigEntry) => {
  rigs.set(id, entry)
}
export const unregisterRig = (id: string) => {
  rigs.delete(id)
}
export const getRigs = () => rigs

export const PLAYER_RIG_ID = 'player'
export const enemyRigId = (entityId: string | number) => `enemy:${entityId}`

// ---------------------------------------------------------------------------
// Instanced projectile pools (bullets, player projectiles)
// ---------------------------------------------------------------------------

const pools = new Map<string, () => THREE.InstancedMesh | null>()

export const registerPool = (name: string, getMesh: () => THREE.InstancedMesh | null) => {
  pools.set(name, getMesh)
}
export const unregisterPool = (name: string) => {
  pools.delete(name)
}
export const getPools = () => pools

// ---------------------------------------------------------------------------
// Player object (owned by PlayerController, registered once on mount)
// ---------------------------------------------------------------------------

let playerObject: THREE.Object3D | null = null

export const registerPlayerObject = (obj: THREE.Object3D | null) => {
  playerObject = obj
}
export const getPlayerObject = () => playerObject

// ---------------------------------------------------------------------------
// Ghost rigs — standalone clones spawned by ReplayGhosts for playback of
// recordings loaded from disk (where the recorded actors no longer exist).
// ---------------------------------------------------------------------------

export type GhostEntry = { object: THREE.Object3D; rig: RigEntry }

const ghosts = new Map<string, GhostEntry>()

export const registerGhost = (id: string, entry: GhostEntry) => {
  ghosts.set(id, entry)
}
export const unregisterGhost = (id: string) => {
  ghosts.delete(id)
}
export const getGhosts = () => ghosts

export const GHOST_PLAYER_ID = 'ghost:player'
export const ghostEnemyId = (entityId: string | number) => `ghost:enemy:${entityId}`
