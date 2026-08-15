// ============================================================================
// Levels — themed arenas with scripted wave compositions and a boss finale.
// Now with 5 levels and new enemy types: Knight, Berserker, Assassin.
// ============================================================================

import type { MobType } from './mobs'

export type WaveSpawn = Partial<Record<MobType, number>>

export type LevelConfig = {
  name: string
  subtitle: string
  floor: 'stone' | 'dirt'
  /** Directional light tint + intensity for mood */
  lightColor: string
  lightIntensity: number
  ambientIntensity: number
  /** Scene background color */
  background: string
  waves: WaveSpawn[]
  delayBetweenWavesMs: number
}

export const LEVELS: LevelConfig[] = [
  {
    name: 'Level I — Dungeon Hall',
    subtitle: 'Something stirs in the dark',
    floor: 'stone',
    lightColor: '#ffffff',
    lightIntensity: 3,
    ambientIntensity: 0.2,
    background: '#1b1b1b',
    waves: [
      { rogue: 2, mage: 1 },
      { rogue: 3, mage: 2 },
      { rogue: 3, mage: 2, knight: 1 },
    ],
    delayBetweenWavesMs: 2500,
  },
  {
    name: 'Level II — Sunken Crypt',
    subtitle: 'The earth below is not empty',
    floor: 'dirt',
    lightColor: '#9fd8b0',
    lightIntensity: 2.2,
    ambientIntensity: 0.14,
    background: '#101a12',
    waves: [
      { rogue: 3, mage: 2, knight: 1 },
      { berserker: 2, mage: 2, knight: 2 },
      { berserker: 3, mage: 3, knight: 2 },
    ],
    delayBetweenWavesMs: 2500,
  },
  {
    name: 'Level III — Armory of the Fallen',
    subtitle: 'The Nightshade stalks the armory',
    floor: 'stone',
    lightColor: '#b8c5e0',
    lightIntensity: 2.6,
    ambientIntensity: 0.16,
    background: '#151a22',
    waves: [
      { knight: 3, mage: 2 },
      { knight: 3, berserker: 2, mage: 2 },
      { 'boss-rogue': 1, knight: 3, berserker: 2 },
    ],
    delayBetweenWavesMs: 2800,
  },
  {
    name: 'Level IV — Shadow Pit',
    subtitle: 'They move faster than your eyes',
    floor: 'dirt',
    lightColor: '#c49fd8',
    lightIntensity: 1.8,
    ambientIntensity: 0.1,
    background: '#1a1018',
    waves: [
      { assassin: 2, mage: 2 },
      { assassin: 3, berserker: 2, knight: 2 },
      { assassin: 3, rogue: 3, barbarian: 2 },
    ],
    delayBetweenWavesMs: 2800,
  },
  {
    name: 'Level V — Throne of the King',
    subtitle: 'The Barbarian King awaits',
    floor: 'stone',
    lightColor: '#ff9a7a',
    lightIntensity: 2.4,
    ambientIntensity: 0.12,
    background: '#1a0f0d',
    waves: [
      { barbarian: 2, mage: 2, knight: 1 },
      { assassin: 3, berserker: 2, barbarian: 1 },
      { boss: 1, assassin: 2, mage: 2 },
    ],
    delayBetweenWavesMs: 3000,
  },
  {
    name: 'Level VI — Frozen Sanctum',
    subtitle: 'The cold keeps the dead awake',
    floor: 'stone',
    lightColor: '#9ecfff',
    lightIntensity: 2.2,
    ambientIntensity: 0.14,
    background: '#0d141f',
    waves: [
      { knight: 3, mage: 3 },
      { assassin: 3, knight: 3, mage: 2 },
      { knight: 4, mage: 4, berserker: 2 },
    ],
    delayBetweenWavesMs: 2600,
  },
  {
    name: 'Level VII — Ember Depths',
    subtitle: 'The Hexweaver stokes the embers',
    floor: 'dirt',
    lightColor: '#ff7a5a',
    lightIntensity: 2.0,
    ambientIntensity: 0.1,
    background: '#1c0d08',
    waves: [
      { berserker: 4, mage: 2 },
      { barbarian: 2, berserker: 3, assassin: 2 },
      { 'boss-mage': 1, barbarian: 2, berserker: 2, mage: 2 },
    ],
    delayBetweenWavesMs: 2400,
  },
  {
    name: 'Level VIII — The Last Oath',
    subtitle: 'The Oathbreaker holds the final gate',
    floor: 'stone',
    lightColor: '#ffd28a',
    lightIntensity: 2.6,
    ambientIntensity: 0.1,
    background: '#191008',
    waves: [
      { knight: 3, assassin: 3, mage: 2 },
      { barbarian: 2, berserker: 3, assassin: 3 },
      { 'boss-knight': 1, knight: 2, assassin: 2, mage: 2 },
    ],
    delayBetweenWavesMs: 3000,
  },
]

export const FINAL_LEVEL_INDEX = LEVELS.length - 1
