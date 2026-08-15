// ============================================================================
// Audio — tiny HTMLAudio manager. SFX are pooled per file, music crossfades.
// SFX files live in /public/audio; soundtrack tracks are bundled from
// src/soundtrack via ?url imports.
// ============================================================================

import ashesFallUrl from '@/soundtrack/Ashes-Fall.mp3?url'
import deathEvilUrl from '@/soundtrack/Death-Evil.wav?url'
import demolitionUrl from '@/soundtrack/Demolition.wav?url'
import enterDungeonUrl from '@/soundtrack/Enter-The-Dungeon.wav?url'
import headshotUrl from '@/soundtrack/Headshot.mp3?url'
import mainMenuLoopUrl from '@/soundtrack/Main-Menu-Loop.wav?url'
import monolithUrl from '@/soundtrack/I, Monolith.mp3?url'
import laughUrl from '@/soundtrack/Laugh.wav?url'
import riftUrl from '@/soundtrack/Rift.mp3?url'
import rotUrl from '@/soundtrack/Rot.mp3?url'
import theSilentUrl from '@/soundtrack/The-Silent.mp3?url'
import unbecomingUrl from '@/soundtrack/Unbecoming.wav?url'
import villainArcUrl from '@/soundtrack/Villain-Arc.mp3?url'

const BASE = '/audio/'

// ---------------------------------------------------------------------------
// D Drive foley pack — clips bundled from src/soundtrack, keyed by short name
// ---------------------------------------------------------------------------

import swordClash1Url from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/364529__christopherderp__swords-clash-high-quality-1.wav?url'
import swordClash2Url from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/364530__christopherderp__swords-clash-high-quality-2.wav?url'
import swordClash3Url from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/364531__christopherderp__swords-clash-high-quality-3.wav?url'
import boltHitArmorUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Prejectile, Bolt, Hitting Armor.wav?url'
import fireballLaunchedUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Fireball Launched.wav?url'
import swingSoftUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Blade, Cutting Through, Soft.wav?url'
import swingHardUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Blade, Cutting Through Object.wav?url'
import parryBraceUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Metal Bars - Impact.wav?url'
import puppetCollapseUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Puppet, Collapsing.wav?url'
import hurtMale3Url from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Hurt-Male3.wav?url'
import bodyFallUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Drop, Heavy Weight.wav?url'
import drumStrikeUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Large Drum Strike.wav?url'
import chimeUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Single Aluminum Chime.wav?url'
import gateRaiseUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Gate, Raise Up.wav?url'
import riftVacuumUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Vacuume Delivery Tube.wav?url'
import riftRumbleUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Rolling Thunder.wav?url'
import churchBellUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Bell, Church Tower.wav?url'
import fuseBurnUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Fuse Burn - 3 Second.wav?url'
import pickupItemUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Pickup Item.wav?url'
import tuningForkUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Tuning Fork Ring.wav?url'
import lockedDoorUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Door, Quiet Testing of Locked Door.wav?url'
import buttonPressUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Button Press.wav?url'
import heartbeatUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/heartbeat Quick 4 Cycle - Loopable.wav?url'
import chargeSharpenUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Blade, Sharpening, Loopable.wav?url'
import chargeReadyUrl from '@/soundtrack/Essential Game Design and Animation Sound Package V1.1.12 by D Drive - 425 - Wav/Bell, Servant Call.wav?url'

const PACK_SFX: Record<string, string> = {
  'sword-clash-1': swordClash1Url,
  'sword-clash-2': swordClash2Url,
  'sword-clash-3': swordClash3Url,
  'bolt-hit-armor': boltHitArmorUrl,
  'enemy-shoot': fireballLaunchedUrl,
  swing: swingSoftUrl,
  spin: swingHardUrl,
  parry: parryBraceUrl,
  'enemy-die': puppetCollapseUrl,
  'player-die-grunt': hurtMale3Url,
  'body-fall': bodyFallUrl,
  'wave-start': drumStrikeUrl,
  'wave-complete': chimeUrl,
  'portal-open': gateRaiseUrl,
  'portal-enter': riftVacuumUrl,
  'portal-rumble': riftRumbleUrl,
  'victory-bell': churchBellUrl,
  'meteor-fuse': fuseBurnUrl,
  'blink-out': BASE + 'MAGIC-Firefrost.wav',
  'item-pickup': pickupItemUrl,
  'talent-buy': tuningForkUrl,
  'talent-fail': lockedDoorUrl,
  'ui-click': buttonPressUrl,
  heartbeat: heartbeatUrl,
  'charge-sharpen': chargeSharpenUrl,
  'charge-ready': chargeReadyUrl,
}

export type TrackKey =
  | 'menu'
  | 'laugh'
  | 'rift'
  | 'rot'
  | 'demolition'
  | 'headshot'
  | 'villain-arc'
  | 'monolith'
  | 'ashes-fall'
  | 'unbecoming'
  | 'the-silent'
  | 'enter-dungeon'
  | 'death-evil'

export const TRACK_URLS: Record<TrackKey, string> = {
  menu: mainMenuLoopUrl,
  laugh: laughUrl,
  rift: riftUrl,
  rot: rotUrl,
  demolition: demolitionUrl,
  headshot: headshotUrl,
  'villain-arc': villainArcUrl,
  monolith: monolithUrl,
  'ashes-fall': ashesFallUrl,
  unbecoming: unbecomingUrl,
  'the-silent': theSilentUrl,
  'enter-dungeon': enterDungeonUrl,
  'death-evil': deathEvilUrl,
}

/** Level index → track. Boss levels get the Laugh sting on entry. */
export const LEVEL_TRACKS: TrackKey[] = [
  'rift',
  'rot',
  'demolition',
  'the-silent',
  'headshot',
  'villain-arc',
  'monolith',
  'ashes-fall',
]

// Start buffering the menu track the moment the module loads — the first
// user gesture then starts playback instantly instead of fetching cold.
let menuPreload: HTMLAudioElement | null = null
if (typeof window !== 'undefined') {
  menuPreload = new Audio(TRACK_URLS.menu)
  menuPreload.preload = 'auto'
  menuPreload.load()
}

// ---------------------------------------------------------------------------
// Volume settings — pushed live from the settings menu
// ---------------------------------------------------------------------------

let musicVolume = 0.55
let sfxVolume = 0.85

export const setMusicVolume = (v: number) => {
  musicVolume = Math.min(1, Math.max(0, v))
  if (current && fadeTimer === null) current.volume = musicVolume
}

export const setSfxVolume = (v: number) => {
  sfxVolume = Math.min(1, Math.max(0, v))
  for (const el of loops.values()) el.volume = el.dataset.base ? Number(el.dataset.base) * sfxVolume : sfxVolume
}

// ---------------------------------------------------------------------------
// SFX pool — reuse paused elements, clone when all busy
// ---------------------------------------------------------------------------

const pools = new Map<string, HTMLAudioElement[]>()

// Dev-only ring buffer of recently played SFX (see __audioDebug below)
const sfxLog: string[] | null = import.meta.env.DEV ? [] : null

// Replay recorder tap — src/replay/session.ts installs this to log every SFX
// and sting with a timestamp so playback reproduces the exact audio.
type AudioLogEntry =
  | { kind: 'sfx'; name: string; opts: { volume?: number; rate?: number; vary?: number } }
  | { kind: 'sting'; key: string }
let audioRecorder: ((entry: AudioLogEntry) => void) | null = null
export const setAudioRecorder = (fn: ((entry: AudioLogEntry) => void) | null) => {
  audioRecorder = fn
}

export const sfx = (
  name: string,
  opts: { volume?: number; rate?: number; vary?: number } = {}
) => {
  audioRecorder?.({ kind: 'sfx', name, opts: { ...opts } })
  sfxLog?.push(name)
  if (sfxLog && sfxLog.length > 50) sfxLog.shift()
  const { volume = 1, rate = 1, vary = 0.06 } = opts
  let pool = pools.get(name)
  if (!pool) {
    pool = []
    pools.set(name, pool)
  }
  let el = pool.find((a) => a.paused || a.ended)
  if (!el) {
    if (pool.length >= 6) return // cap concurrent copies of one sound
    el = new Audio(PACK_SFX[name] ?? `${BASE}${name}.wav`)
    pool.push(el)
  }
  el.volume = Math.min(1, volume * sfxVolume)
  el.playbackRate = rate * (1 + (Math.random() * 2 - 1) * vary)
  el.currentTime = 0
  el.play().catch(() => {})
}

// ---------------------------------------------------------------------------
// Loop channel — persistent ambient loops (e.g. low-HP heartbeat)
// ---------------------------------------------------------------------------

const loops = new Map<string, HTMLAudioElement>()

export const startLoop = (name: string, volume = 0.5) => {
  if (loops.has(name)) return
  const el = new Audio(PACK_SFX[name] ?? `${BASE}${name}.wav`)
  el.loop = true
  el.dataset.base = String(volume)
  el.volume = volume * sfxVolume
  el.play().catch(() => {})
  loops.set(name, el)
}

export const stopLoop = (name: string) => {
  const el = loops.get(name)
  if (!el) return
  el.pause()
  el.currentTime = 0
  loops.delete(name)
}

// ---------------------------------------------------------------------------
// Music — one track at a time, real crossfade between tracks
// ---------------------------------------------------------------------------

const CROSSFADE_MS = 1200
const FADE_STEP_MS = 50

let current: HTMLAudioElement | null = null
let currentKey: TrackKey | null = null
let fadeTimer: number | null = null
const fadingOut = new Set<HTMLAudioElement>()

const clearFade = () => {
  if (fadeTimer !== null) {
    window.clearInterval(fadeTimer)
    fadeTimer = null
  }
}

const fadeOutElement = (el: HTMLAudioElement, ms = CROSSFADE_MS) => {
  if (fadingOut.has(el)) return
  fadingOut.add(el)
  const startVol = el.volume
  const steps = Math.max(1, Math.round(ms / FADE_STEP_MS))
  let n = 0
  const timer = window.setInterval(() => {
    n += 1
    el.volume = Math.max(0, startVol * (1 - n / steps))
    if (n >= steps) {
      el.pause()
      el.currentTime = 0
      el.src = ''
      fadingOut.delete(el)
      window.clearInterval(timer)
    }
  }, FADE_STEP_MS)
}

/** Fade out whatever is playing and stop it. */
export const stopTrack = (fadeMs = 700) => {
  if (!current) return
  const old = current
  current = null
  currentKey = null
  clearFade()
  fadeOutElement(old, fadeMs)
}

/**
 * Play a looping track, crossfading from whatever is currently playing.
 * Safe to call repeatedly with the same key — it's a no-op if already active.
 */
export const playTrack = (key: TrackKey) => {
  // No-op if already active — but a paused-at-0 element means autoplay was
  // blocked, so fall through and retry on the next user gesture.
  if (currentKey === key && current && (!current.paused || current.currentTime > 0)) return
  if (current) fadeOutElement(current)
  clearFade()
  // Reuse the eagerly-buffered menu element on first play, if still fresh
  const el = key === 'menu' && menuPreload ? menuPreload : new Audio(TRACK_URLS[key])
  if (key === 'menu') menuPreload = null
  el.loop = true
  el.volume = 0
  el.play().catch(() => {})
  current = el
  currentKey = key
  // Fade in to the target volume
  const steps = Math.max(1, Math.round(CROSSFADE_MS / FADE_STEP_MS))
  let n = 0
  fadeTimer = window.setInterval(() => {
    n += 1
    el.volume = Math.min(musicVolume, musicVolume * (n / steps))
    if (n >= steps) {
      el.volume = musicVolume
      clearFade()
    }
  }, FADE_STEP_MS)
}

/** Pause the music (e.g. while an overlay menu is open). */
export const pauseTrack = () => {
  clearFade()
  if (current) {
    current.volume = musicVolume
    current.pause()
  }
}

/** Resume a paused track. */
export const resumeTrack = () => {
  if (current && current.paused && current.currentTime > 0) {
    current.volume = musicVolume
    current.play().catch(() => {})
  }
}

/**
 * One-shot sting layered over the music (the Laugh on boss-level entry).
 * Independent channel — never paused by overlays, never interrupts music.
 */
export const playSting = (key: TrackKey) => {
  audioRecorder?.({ kind: 'sting', key })
  const el = new Audio(TRACK_URLS[key])
  el.loop = false
  el.volume = Math.min(1, musicVolume + 0.15)
  el.play().catch(() => {})
  lastSting = { key, el }
}

let lastSting: { key: TrackKey; el: HTMLAudioElement } | null = null

export const trackName = () => currentKey

// Dev-only debug handle for automated verification (mirrors __gameStore)
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__audioDebug = {
    trackName,
    sfxLog,
    state: () => ({
      key: currentKey,
      playing: !!current && !current.paused,
      volume: current?.volume ?? 0,
      fadingOut: fadingOut.size,
      fadingOutVolumes: [...fadingOut].map((a) => a.volume),
      sting: lastSting
        ? { key: lastSting.key, playing: !lastSting.el.paused && !lastSting.el.ended }
        : null,
      loops: [...loops.keys()],
      musicVolume,
      sfxVolume,
    }),
  }
}
