import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { eventBus, EVENTS } from '@/constants'
import { useGameStore } from '@/store'
import { COMBO_WINDOW_MS, COMBO_TIERS, comboTier } from '@/game/combo'

// ============================================================================
// Floating combat text — damage numbers over struck enemies (crits bigger,
// gold), combo-tier milestones, and a live combo counter over the player.
//
// Rendered as in-scene billboard sprites (canvas textures), NOT drei Html.
// The DOM overlay version had two failure modes: Html targets corrupted R3F's
// pointer math (aim flips), and stacks of translate3d DOM layers over the
// WebGPU canvas glitched compositing — the "FCT blocking the camera" bug.
// Sprites live inside the render pass, so neither can happen.
// ============================================================================

const TTL_MS = 950
const MAX_ITEMS = 40
const COUNTER_HEIGHT = 2.2

type SpriteKind = 'damage' | 'crit' | 'combo' | 'counter'

type ActiveSprite = {
  sprite: THREE.Sprite
  material: THREE.SpriteMaterial
  texture: THREE.CanvasTexture
  born: number
  baseY: number
  baseScaleX: number
  baseScaleY: number
}

const drawText = (
  text: string,
  opts: { color: string; fontSize: number; pill?: string }
): { texture: THREE.CanvasTexture; aspect: number } => {
  const { color, fontSize, pill } = opts
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = `900 ${fontSize}px Cinzel, serif`
  ctx.font = font
  const metrics = ctx.measureText(text)
  const padX = pill ? 44 : 16
  const padY = 20
  canvas.width = Math.ceil(metrics.width + padX * 2)
  canvas.height = fontSize + padY * 2

  // Canvas state resets on resize — re-apply
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const cx = canvas.width / 2
  const cy = canvas.height / 2

  if (pill) {
    const h = canvas.height - 6
    ctx.beginPath()
    ctx.roundRect(3, 3, canvas.width - 6, h, h / 2)
    ctx.fillStyle = 'rgba(10, 8, 20, 0.7)'
    ctx.fill()
    ctx.strokeStyle = pill
    ctx.lineWidth = 2
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'
  ctx.lineWidth = 5
  ctx.strokeText(text, cx, cy)
  ctx.fillStyle = color
  ctx.fillText(text, cx, cy)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { texture, aspect: canvas.width / canvas.height }
}

const KIND_STYLE: Record<SpriteKind, { color: string; fontSize: number; height: number }> = {
  damage: { color: '#f1f5f9', fontSize: 44, height: 0.42 },
  crit: { color: '#fbbf24', fontSize: 64, height: 0.62 },
  combo: { color: '#e2e8f0', fontSize: 42, height: 0.5 },
  counter: { color: '#e2e8f0', fontSize: 46, height: 0.44 },
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/** External handle so replay playback can wipe floating text on seek/exit */
export const combatTextApi = { clear: () => {} }

export const CombatText = () => {
  const scene = useThree((s) => s.scene)
  const items = useRef<ActiveSprite[]>([])
  const counter = useRef<ActiveSprite | null>(null)
  const counterCombo = useRef(-1)
  const prevCombo = useRef(0)

  const spawn = (
    text: string,
    kind: SpriteKind,
    pos: { x: number; y: number; z: number },
    colorOverride?: string
  ) => {
    const style = KIND_STYLE[kind]
    const { texture, aspect } = drawText(text, {
      color: colorOverride ?? style.color,
      fontSize: style.fontSize,
      pill: kind === 'combo' || kind === 'counter' ? (colorOverride ?? style.color) : undefined,
    })
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.renderOrder = 999
    sprite.position.set(pos.x, pos.y, pos.z)
    const baseScaleY = style.height
    const baseScaleX = style.height * aspect
    sprite.scale.set(baseScaleX, baseScaleY, 1)
    scene.add(sprite)
    items.current.push({
      sprite,
      material,
      texture,
      born: performance.now(),
      baseY: pos.y,
      baseScaleX,
      baseScaleY,
    })
    // Cap the pool — drop the oldest
    while (items.current.length > MAX_ITEMS) disposeItem(items.current.shift()!)
  }

  const disposeItem = (item: ActiveSprite) => {
    scene.remove(item.sprite)
    item.material.dispose()
    item.texture.dispose()
  }

  // Damage numbers from enemy hits
  useEffect(() => {
    const onDamageText = (p: { x: number; y: number; z: number; amount: number; crit: boolean }) => {
      spawn(
        p.crit ? `${p.amount}!` : String(p.amount),
        p.crit ? 'crit' : 'damage',
        { x: p.x + (Math.random() - 0.5) * 0.5, y: p.y, z: p.z }
      )
    }
    eventBus.on(EVENTS.DAMAGE_TEXT, onDamageText)
    return () => {
      eventBus.off(EVENTS.DAMAGE_TEXT, onDamageText)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  // Tear down every live sprite on unmount / scene swap
  useEffect(
    () => () => {
      for (const item of items.current) disposeItem(item)
      items.current = []
      if (counter.current) disposeItem(counter.current)
      counter.current = null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene]
  )

  // Replay playback wipes text on scrub/exit through this handle
  useEffect(() => {
    combatTextApi.clear = () => {
      for (const item of items.current) disposeItem(item)
      items.current = []
      if (counter.current) disposeItem(counter.current)
      counter.current = null
      counterCombo.current = -1
    }
    return () => {
      combatTextApi.clear = () => {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useFrame(() => {
    const now = performance.now()
    const s = useGameStore.getState()
    // Replay playback re-emits damage text from the recording; the live combo
    // counter/milestones read frozen store state, so suppress them there
    const replaying = s.replayPhase === 'playback'
    if (replaying && counter.current) {
      disposeItem(counter.current)
      counter.current = null
      counterCombo.current = -1
    }

    // Age out spent items, float up, pop in, fade out
    for (let i = items.current.length - 1; i >= 0; i--) {
      const item = items.current[i]
      const age = now - item.born
      if (age > TTL_MS) {
        disposeItem(item)
        items.current.splice(i, 1)
        continue
      }
      const t = age / TTL_MS
      item.sprite.position.y = item.baseY + easeOutCubic(t) * 0.9
      const pop = Math.min(1, t * 6)
      const scalePop = 0.7 + 0.3 * pop
      item.sprite.scale.set(item.baseScaleX * scalePop, item.baseScaleY * scalePop, 1)
      item.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
    }

    // Drop the combo after a quiet window
    if (s.combo > 0 && Date.now() - s.comboLastAt > COMBO_WINDOW_MS) s.breakCombo()

    // Combo-tier milestone pops over the player
    const tier = COMBO_TIERS.find((t) => prevCombo.current < t.at && s.combo >= t.at)
    if (tier && !replaying) {
      const p = s.playerPosition
      spawn(`${tier.label} — ${tier.bonus}`, 'combo', { x: p.x, y: 2.6, z: p.z }, tier.color)
    }
    prevCombo.current = s.combo

    // Live combo counter rides above the player's head — the texture is only
    // redrawn when the count or tier color changes, never per frame
    if (s.combo >= 2 && !replaying) {
      const activeTier = comboTier(s.combo)
      const sig = s.combo * 1000 + (activeTier ? COMBO_TIERS.indexOf(activeTier) : 0)
      if (sig !== counterCombo.current) {
        counterCombo.current = sig
        if (counter.current) disposeItem(counter.current)
        const style = KIND_STYLE.counter
        const color = activeTier?.color ?? style.color
        const { texture, aspect } = drawText(`×${s.combo}`, {
          color,
          fontSize: style.fontSize,
          pill: color,
        })
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        })
        const sprite = new THREE.Sprite(material)
        sprite.renderOrder = 999
        scene.add(sprite)
        counter.current = {
          sprite,
          material,
          texture,
          born: now,
          baseY: COUNTER_HEIGHT,
          baseScaleX: style.height * aspect,
          baseScaleY: style.height,
        }
      }
      const p = s.playerPosition
      counter.current!.sprite.position.set(p.x, COUNTER_HEIGHT, p.z)
      counter.current!.sprite.scale.set(
        counter.current!.baseScaleX,
        counter.current!.baseScaleY,
        1
      )
      counter.current!.material.opacity = 1
    } else if (counter.current) {
      disposeItem(counter.current)
      counter.current = null
      counterCombo.current = -1
    }
  })

  return null
}
