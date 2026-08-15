import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store'
import { eventBus, EVENTS } from '@/constants'
import { touchMove, resetTouchMove } from '@/game/touch'
import { getAbilityList } from '@/game/abilities'
import { isAbilityUnlocked } from '@/game/skills'
import { CHARACTERS } from '@/game/characters'

// ============================================================================
// Touch controls — virtual joystick (left) + thumb cluster (right).
// DOM overlay, only mounted on coarse-pointer devices while playing.
//
// Joystick is dynamic-origin: the stick spawns wherever the thumb lands in
// the left zone. All movement is applied via direct style mutation (no React
// re-renders at pointer-move frequency).
// ============================================================================

const STICK_RADIUS = 56

export const TouchControls = () => {
  const touchMode = useGameStore((s) => s.touchMode)
  const gamePhase = useGameStore((s) => s.gamePhase)
  const playerDead = useGameStore((s) => s.playerDead)
  const gameWon = useGameStore((s) => s.gameWon)

  if (!touchMode || gamePhase !== 'playing' || playerDead || gameWon) return null

  return (
    <div className="touch-ui">
      <JoystickZone />
      <div className="touch-cluster">
        <TouchAbilityButtons />
        <DashButton />
        <BlockButton />
        <AttackButton />
      </div>
      <PauseButton />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Virtual joystick
// ---------------------------------------------------------------------------

const JoystickZone = () => {
  const zoneRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const pointerId = useRef<number | null>(null)
  const origin = useRef({ x: 0, y: 0 })

  useEffect(() => () => resetTouchMove(), [])

  const show = (x: number, y: number) => {
    const base = baseRef.current
    if (!base) return
    base.style.display = 'block'
    base.style.left = `${x}px`
    base.style.top = `${y}px`
  }

  const moveThumb = (dx: number, dy: number) => {
    if (thumbRef.current) thumbRef.current.style.transform = `translate(${dx}px, ${dy}px)`
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (pointerId.current !== null) return
    pointerId.current = e.pointerId
    try {
      zoneRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic or stale pointer — capture is best-effort */
    }
    origin.current = { x: e.clientX, y: e.clientY }
    show(e.clientX, e.clientY)
    moveThumb(0, 0)
    touchMove.active = true
    touchMove.magnitude = 0
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerId.current) return
    let dx = e.clientX - origin.current.x
    let dy = e.clientY - origin.current.y
    const len = Math.hypot(dx, dy)
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS
      dy = (dy / len) * STICK_RADIUS
    }
    touchMove.x = dx / STICK_RADIUS
    touchMove.y = dy / STICK_RADIUS
    touchMove.magnitude = Math.min(1, len / STICK_RADIUS)
    touchMove.active = true
    moveThumb(dx, dy)
  }

  const release = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerId.current) return
    pointerId.current = null
    resetTouchMove()
    if (baseRef.current) baseRef.current.style.display = 'none'
  }

  return (
    <>
      <div
        ref={zoneRef}
        className="touch-joystick-zone"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
      />
      <div ref={baseRef} className="stick-base" style={{ display: 'none' }}>
        <div ref={thumbRef} className="stick-thumb" />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const AttackButton = () => (
  <div
    className="touch-btn touch-attack framed"
    onPointerDown={(e) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* best-effort */
      }
      eventBus.emit(EVENTS.TOUCH_ATTACK_START)
    }}
    onPointerUp={() => eventBus.emit(EVENTS.TOUCH_ATTACK_END)}
    onPointerCancel={() => eventBus.emit(EVENTS.TOUCH_ATTACK_END)}
  >
    <span className="touch-btn-disc">
      <img className="touch-btn-icon" src="/ui/icons/attack.png" alt="Attack" draggable={false} />
    </span>
  </div>
)

const BlockButton = () => (
  <div
    className="touch-btn touch-block framed"
    onPointerDown={(e) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* best-effort */
      }
      eventBus.emit(EVENTS.TOUCH_BLOCK_START)
    }}
    onPointerUp={() => eventBus.emit(EVENTS.TOUCH_BLOCK_END)}
    onPointerCancel={() => eventBus.emit(EVENTS.TOUCH_BLOCK_END)}
  >
    <span className="touch-btn-disc">
      <img className="touch-btn-icon" src="/ui/icons/block.png" alt="Block" draggable={false} />
    </span>
    <span className="touch-btn-sub">Block</span>
  </div>
)

const DashButton = () => {
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  const label = CHARACTERS[selectedCharacter].mobility.name
  const icon = `/ui/icons/${label.toLowerCase()}.png`
  return (
    <div
      className="touch-btn touch-dash framed"
      onPointerDown={() => eventBus.emit(EVENTS.TOUCH_DASH)}
    >
      <span className="touch-btn-disc">
        <img className="touch-btn-icon" src={icon} alt={label} draggable={false} />
      </span>
      <span className="touch-btn-sub">{label}</span>
    </div>
  )
}

const TouchAbilityButtons = () => {
  const skills = useGameStore((s) => s.skills)
  const rage = useGameStore((s) => s.rage)
  const cooldowns = useGameStore((s) => s.abilityCooldowns)
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  const triggerAbility = useGameStore((s) => s.triggerAbility)
  const [, setTick] = useState(0)

  // Cooldown sweep refresh
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 100)
    return () => window.clearInterval(t)
  }, [])

  const now = Date.now()
  const abilities = getAbilityList(selectedCharacter)
  const slots = ['slot1', 'slot2', 'slot3', 'slot4'] as const

  return (
    <>
      {abilities.map((ab, i) => {
        const unlocked = isAbilityUnlocked(skills, selectedCharacter, ab.id)
        const remaining = Math.max(0, cooldowns[ab.id] - now)
        const cdFraction = remaining / ab.cooldownMs
        const affordable = rage >= ab.rageCost

        return (
          <div
            key={ab.id}
            className={`touch-btn touch-ability touch-ab${i + 1} framed ${unlocked ? '' : 'locked'} ${
              affordable && unlocked ? '' : 'dim'
            }`}
            onPointerDown={() => {
              if (unlocked) triggerAbility(slots[i])
            }}
          >
            <span className="touch-btn-disc">
              <img className="touch-btn-icon" src={`/ui/icons/${ab.name.toLowerCase().replace(/\s+/g, '-')}.png`} alt={ab.name} draggable={false} />
            </span>
            {!unlocked && <img className="ability-chains" src="/ui/locked-chains.png" alt="" draggable={false} />}
            <span className="touch-ability-cost">{ab.rageCost}</span>
            {remaining > 0 && (
              <div
                className="touch-ability-cd"
                style={{
                  background: `conic-gradient(rgba(0,0,0,0.78) ${cdFraction * 360}deg, transparent 0deg)`,
                }}
              >
                {(remaining / 1000).toFixed(1)}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

const PauseButton = () => {
  const setGamePhase = useGameStore((s) => s.setGamePhase)
  return (
    <div className="touch-btn touch-pause" onPointerDown={() => setGamePhase('paused')}>
      ❚❚
    </div>
  )
}
