// ============================================================================
// Loot orb simulation — pure logic, no React/THREE deps (Node-testable).
// Red = souls (XP), Green = health, Blue = rage.
// Orbs scatter on drop, then magnet-fly to the player and collect on contact.
// ============================================================================

export type OrbKind = 'soul' | 'health' | 'rage'

export type OrbState = {
  id: number
  kind: OrbKind
  value: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  bornAt: number
}

export type Point3 = { x: number; y: number; z: number }

/** XZ distance at which an orb starts flying to the player */
export const MAGNET_RADIUS = 2.6
/**
 * XZ distance at which an orb is collected.
 * Measured in the horizontal plane only — the fly target hovers ~0.8u above
 * the player's feet, so a 3D distance check would never reach a small radius
 * and orbs would orbit the player forever without collecting.
 */
export const COLLECT_RADIUS = 0.9
export const FLY_SPEED = 14
export const MAX_ORBS = 120
/** Ballistic scatter duration after spawning */
export const SCATTER_MS = 500
/** Orbs ignore the magnet briefly so the scatter reads visually */
export const MAGNET_DELAY_MS = 400
/** Height above the player's feet the orbs fly toward */
export const FLY_TARGET_HEIGHT = 0.8
/** Resting hover height on the floor */
export const IDLE_HEIGHT = 0.5

/**
 * Build the drop list for a slain mob: one soul orb per soul point (capped),
 * plus a chance of a health and/or rage orb.
 */
export function spawnDrops(
  position: { x: number; z: number },
  souls: number,
  startId: number,
  now: number,
  rand: () => number = Math.random
): OrbState[] {
  const drops: OrbState[] = []
  let id = startId

  const spawn = (kind: OrbKind, value: number) => {
    const angle = rand() * Math.PI * 2
    drops.push({
      id: id++,
      kind,
      value,
      x: position.x,
      y: 0.6,
      z: position.z,
      vx: Math.cos(angle) * 2,
      vy: 3 + rand() * 2,
      vz: Math.sin(angle) * 2,
      bornAt: now,
    })
  }

  const soulOrbs = Math.min(souls, 10)
  for (let i = 0; i < soulOrbs; i++) spawn('soul', 1)
  if (rand() < 0.35) spawn('health', 15)
  if (rand() < 0.3) spawn('rage', 15)

  return drops
}

/**
 * Advance one orb by `delta` seconds.
 * Returns true when the orb reached the player and should be collected.
 * Collection is an XZ check: the fly target is above the player's feet, so
 * horizontal proximity is the reliable "touched the player" signal.
 */
export function stepOrb(orb: OrbState, player: Point3, delta: number, now: number): boolean {
  const age = now - orb.bornAt

  // Scatter phase: brief ballistic hop, then settle on the floor
  if (age < SCATTER_MS) {
    orb.vy -= 12 * delta
    orb.x += orb.vx * delta
    orb.y += orb.vy * delta
    orb.z += orb.vz * delta
    if (orb.y < IDLE_HEIGHT) {
      orb.y = IDLE_HEIGHT
      orb.vy = Math.abs(orb.vy) * 0.4
      orb.vx *= 0.7
      orb.vz *= 0.7
    }
  }

  const dx = player.x - orb.x
  const dz = player.z - orb.z
  const distXZ = Math.hypot(dx, dz)

  // Magnet phase: home toward a point slightly above the player's feet
  if (distXZ < MAGNET_RADIUS && age > MAGNET_DELAY_MS) {
    const tx = player.x
    const ty = player.y + FLY_TARGET_HEIGHT
    const tz = player.z
    const ddx = tx - orb.x
    const ddy = ty - orb.y
    const ddz = tz - orb.z
    const len = Math.hypot(ddx, ddy, ddz) || 1
    const step = FLY_SPEED * delta
    orb.x += (ddx / len) * step
    orb.y += (ddy / len) * step
    orb.z += (ddz / len) * step
  }

  // Idle bob while waiting for the player to come close
  if (distXZ >= MAGNET_RADIUS && age >= SCATTER_MS) {
    orb.y = IDLE_HEIGHT + Math.sin(now * 0.004 + orb.id) * 0.12
  }

  // Collect on horizontal contact (see COLLECT_RADIUS note above)
  return distXZ < COLLECT_RADIUS
}
