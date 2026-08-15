import EventEmitter from 'eventemitter3'

export const eventBus = new EventEmitter()

/** Gameplay clamp for player/enemy movement (inner wall face is at 13.5) */
export const ARENA_BOUND = 13

export const EVENTS = {
  PLAYER_HIT: 'playerHit',
  SHOOT: 'shoot',
  PLAYER_SHOOT: 'playerShoot',
  ENEMY_HIT: 'enemyHit',
  ENEMY_DEAD: 'enemyDead',
  ENEMY_SPAWN: 'enemySpawn',
  ENEMY_ATTACK: 'enemyAttack',
  ENEMY_DAMAGE: 'enemyDamage',
  ENEMY_KNOCKBACK: 'enemyKnockback',
  CAMERA_SHAKE: 'cameraShake',
  ATTACK_END: 'attackEnd',
  WAVE_START: 'waveStart',
  WAVE_COMPLETE: 'waveComplete',
  // Progression
  LEVEL_START: 'levelStart',
  LEVEL_CLEARED: 'levelCleared',
  LEVEL_EXIT: 'levelExit',
  GAME_WON: 'gameWon',
  LEVEL_UP: 'levelUp',
  // Combat feedback
  PLAYER_DIED: 'playerDied',
  ANNOUNCE: 'announce',
  ABILITY_CAST: 'abilityCast',
  /** Loot + progression pickups */
  ITEM_PICKUP: 'itemPickup',
  /** Talent purchase result — payload: success boolean */
  TALENT_BUY: 'talentBuy',
  /** Successful block — payload { x, y, z } for VFX placement */
  PARRY_BLOCK: 'parryBlock',
  /** Floating combat text — payload { x, y, z, amount, crit } */
  DAMAGE_TEXT: 'damageText',
  /** Class mobility moves — slash-grade FX payload { kind, ox, oz, dx, dz, durationMs } */
  MOBILITY_CAST: 'mobilityCast',
  /** Mage meteor ground telegraph — payload { x, z, radius, durationMs } */
  METEOR_TELEGRAPH: 'meteorTelegraph',
  // Boss choreography
  BOSS_ANIM: 'bossAnim',
  BOSS_TELEGRAPH: 'bossTelegraph',
  BOSS_SLAM_LAND: 'bossSlamLand',
  BOSS_RING: 'bossRing',
  BOSS_SUMMON: 'bossSummon',
  // Touch controls
  TOUCH_DASH: 'touchDash',
  TOUCH_ATTACK_START: 'touchAttackStart',
  TOUCH_ATTACK_END: 'touchAttackEnd',
  TOUCH_BLOCK_START: 'touchBlockStart',
  TOUCH_BLOCK_END: 'touchBlockEnd',
}

// Exposed for debugging / e2e probes
if (typeof window !== 'undefined') {
  ;(window as any).__eventBus = eventBus
}