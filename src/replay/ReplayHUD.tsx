import { useEffect } from 'react'
import { useGameStore, isGameFrozen } from '@/store'
import { eventBus, EVENTS } from '@/constants'
import { seek, exitPlayback, exportRecording, startRecording, stopRecordingToPlayback } from './session'

// ============================================================================
// Replay overlay — REC indicator while recording, transport bar during
// playback (play/pause, scrubber, speed, exit). DOM sibling of the canvas.
// ============================================================================

const SPEEDS = [0.1, 0.25, 0.5, 1, 2]

const fmt = (t: number) => {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

const btn: React.CSSProperties = {
  background: 'rgba(38, 174, 255, 0.08)',
  border: '1px solid rgba(38, 174, 255, 0.35)',
  color: '#c8dde8',
  fontFamily: 'monospace',
  fontSize: 12,
  letterSpacing: '0.08em',
  padding: '5px 12px',
  cursor: 'pointer',
}

export const ReplayHUD = () => {
  const phase = useGameStore((s) => s.replayPhase)
  const external = useGameStore((s) => s.replayExternal)

  // Global replay keys — registered here, OUTSIDE the Canvas, so a WebGL
  // context loss (which remounts the whole scene tree) can never detach them.
  // Capture phase so Esc-in-playback beats the pause handler.
  // Primary toggle is Backquote (`) — F-keys are hardware-hijacked on many
  // laptops (F8 = airplane mode etc). F8 still works on desktops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const store = useGameStore.getState()
      if (e.code === 'Backquote' || e.code === 'F8') {
        e.preventDefault()
        if (store.replayPhase === 'idle' && store.gamePhase === 'playing' && !isGameFrozen(store)) {
          startRecording()
        } else if (store.replayPhase === 'recording') {
          stopRecordingToPlayback()
        } else if (store.replayPhase === 'playback') {
          exitPlayback()
        } else if (store.replayPhase === 'idle') {
          // Never fail silently — tell the player why the key did nothing.
          const reason = store.gamePhase !== 'playing'
            ? 'Start a run first'
            : 'Unavailable while paused'
          eventBus.emit(EVENTS.ANNOUNCE, 'Replay', reason)
        }
        return
      }
      if (e.code === 'Escape' && store.replayPhase === 'playback') {
        e.preventDefault()
        e.stopPropagation()
        exitPlayback()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const time = useGameStore((s) => s.replayTime)
  const duration = useGameStore((s) => s.replayDuration)
  const speed = useGameStore((s) => s.replaySpeed)
  const playing = useGameStore((s) => s.replayPlaying)
  const setReplaySpeed = useGameStore((s) => s.setReplaySpeed)
  const setReplayPlaying = useGameStore((s) => s.setReplayPlaying)

  // Playback keyboard transport: Space = play/pause, arrows = seek
  useEffect(() => {
    if (phase !== 'playback') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        useGameStore.getState().setReplayPlaying(!useGameStore.getState().replayPlaying)
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault()
        const step = (e.shiftKey ? 1 : 0.1) * (e.code === 'ArrowLeft' ? -1 : 1)
        seek(useGameStore.getState().replayTime + step)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  if (phase === 'idle') return null

  if (phase === 'recording') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 20,
          zIndex: 70,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: 'monospace',
          fontSize: 13,
          letterSpacing: '0.15em',
          color: '#f87171',
          background: 'rgba(6, 10, 15, 0.7)',
          border: '1px solid rgba(248, 113, 113, 0.4)',
          padding: '8px 14px',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#ef4444',
            boxShadow: '0 0 8px #ef4444',
            animation: 'replayRecBlink 1.1s infinite',
          }}
        />
        REC — ` TO STOP & REVIEW
        <style>{`@keyframes replayRecBlink { 0%,100% { opacity: 1 } 50% { opacity: 0.15 } }`}</style>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 18,
        transform: 'translateX(-50%)',
        zIndex: 70,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
        background: 'rgba(6, 10, 15, 0.85)',
        border: '1px solid rgba(38, 174, 255, 0.25)',
        padding: '10px 16px',
        minWidth: 520,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <button style={btn} onClick={() => setReplayPlaying(!playing)}>
          {playing ? '❚❚' : '▶'}
        </button>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#7ab8d4', minWidth: 96 }}>
          {fmt(time)} / {fmt(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={time}
          onChange={(e) => seek(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#26aeff', cursor: 'pointer' }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            style={{
              ...btn,
              color: speed === sp ? '#26aeff' : btn.color,
              borderColor: speed === sp ? '#26aeff' : (btn.border as string).slice(0),
              boxShadow: speed === sp ? '0 0 10px rgba(38,174,255,0.35)' : 'none',
            }}
            onClick={() => setReplaySpeed(sp)}
          >
            {sp}×
          </button>
        ))}
        <button
          style={{ ...btn, marginLeft: 14, borderColor: 'rgba(239,68,68,0.45)', color: '#ef4444' }}
          onClick={exitPlayback}
        >
          EXIT (`)
        </button>
        {!external && (
          <button
            style={{ ...btn, borderColor: 'rgba(74,222,128,0.45)', color: '#4ade80' }}
            onClick={exportRecording}
          >
            SAVE
          </button>
        )}
      </div>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 10,
          letterSpacing: '0.12em',
          color: 'rgba(160, 184, 204, 0.5)',
          textTransform: 'uppercase',
        }}
      >
        drag = orbit · WASD + Q/E = move · wheel = zoom · shift = fast · F = follow · space = play · ←/→ = seek
      </div>
    </div>
  )
}
