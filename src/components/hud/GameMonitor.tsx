import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { useGameStore, isGameFrozen } from '@/store'
import { useCollisionStore, Layer } from '@/collision'
import { perfMonitor, type MonitorSnapshot, type Issue, type Severity, type Category } from '@/game/perf-monitor'

// ============================================================================
// GameMonitorProbe — lives inside <Canvas>, samples the engine every frame
// ============================================================================

const _euler = new THREE.Euler()
const _dir = new THREE.Vector3()

export const GameMonitorProbe = () => {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)

  useFrame((_, delta) => {
    const store = useGameStore.getState()
    const colliderMap = useCollisionStore.getState().getColliderMap()

    // Count enemies from colliders
    let enemyCount = 0
    let colliderCount = 0
    colliderMap.forEach((c) => {
      colliderCount++
      if (c.layer === Layer.ENEMY) enemyCount++
    })

    // Find player group in scene
    const playerGroup = scene.getObjectByName('player')
    let worldForward = { x: 0, z: -1 }
    let aimForward = { x: 0, z: -1 }
    let playerPos = { x: 0, y: 0, z: 0 }

    if (playerGroup) {
      playerPos = {
        x: playerGroup.position.x,
        y: playerGroup.position.y,
        z: playerGroup.position.z,
      }
      playerGroup.getWorldDirection(_dir)
      worldForward = { x: _dir.x, z: _dir.z }

      // Compute aim forward from yaw: (sin(yaw), cos(yaw))
      _euler.setFromQuaternion(playerGroup.quaternion, 'YXZ')
      const yaw = _euler.y
      aimForward = { x: Math.sin(yaw), z: Math.cos(yaw) }
    } else {
      // Fallback: use store position
      playerPos = {
        x: store.playerPosition.x,
        y: store.playerPosition.y,
        z: store.playerPosition.z,
      }
    }

    perfMonitor.sample({
      delta,
      drawCalls: gl?.info?.render?.calls ?? 0,
      triangles: gl?.info?.render?.triangles ?? 0,
      geometries: gl?.info?.memory?.geometries ?? 0,
      textures: gl?.info?.memory?.textures ?? 0,
      enemyCount,
      colliderCount,
      isCharging: store.isCharging,
      isDashing: store.isDashing,
      isSpinAttacking: store.isSpinAttacking,
      isAttackDashing: store.isAttackDashing,
      isParrying: store.isParrying,
      isEvading: store.isEvading,
      isFury: store.isFury,
      playerPos,
      worldForward,
      aimForward,
      gamePhase: store.gamePhase,
      combo: store.combo,
      rage: store.rage,
      currentLevel: store.currentLevel,
      currentWave: store.currentWave,
    })
  })

  return null
}

// ============================================================================
// GameMonitor — DOM overlay (outside <Canvas>) that displays the monitor
// ============================================================================

const SEVERITY_COLORS: Record<Severity, string> = {
  info: '#5b9bd5',
  warning: '#e8a838',
  error: '#e85d5d',
  critical: '#ff2a2a',
}

const SEVERITY_BG: Record<Severity, string> = {
  info: 'rgba(91,155,213,0.12)',
  warning: 'rgba(232,168,56,0.12)',
  error: 'rgba(232,93,93,0.15)',
  critical: 'rgba(255,42,42,0.18)',
}

const CATEGORY_LABELS: Record<Category, string> = {
  performance: 'PERF',
  gameplay: 'GAME',
  rendering: 'RENDER',
  memory: 'MEM',
  collision: 'COLLIDE',
  input: 'INPUT',
}

function fmtTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${s}s`
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// --- Stat card ---
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 9, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: color ?? '#e8e8f0', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}

// --- Frame time bar chart ---
function FrameChart({ history }: { history: number[] }) {
  const maxBar = 66 // ms cap for chart
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 32, width: '100%' }}>
      {history.slice(-60).map((ms, i) => {
        const h = Math.min(100, (ms / maxBar) * 100)
        const color = ms >= 50 ? '#ff2a2a' : ms >= 33 ? '#e8a838' : ms >= 20 ? '#5b9bd5' : '#3ad17a'
        return (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 1,
              height: `${Math.max(2, h)}%`,
              background: color,
              borderRadius: 1,
              opacity: 0.85,
            }}
          />
        )
      })}
    </div>
  )
}

// --- Issue card ---
function IssueCard({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(false)
  const color = SEVERITY_COLORS[issue.severity]
  const bg = SEVERITY_BG[issue.severity]

  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      style={{
        background: bg,
        border: `1px solid ${color}40`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 4,
        padding: '6px 8px',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2,
          background: color, color: '#0b0b12', letterSpacing: 0.5,
        }}>
          {issue.severity.toUpperCase()}
        </span>
        <span style={{ fontSize: 8, opacity: 0.5, fontWeight: 600 }}>
          {CATEGORY_LABELS[issue.category]}
        </span>
        {issue.count > 1 && (
          <span style={{
            fontSize: 8, padding: '1px 4px', borderRadius: 2,
            background: '#ffffff15', color: '#e8a8f0',
          }}>
            ×{issue.count}
          </span>
        )}
        <span style={{ fontSize: 8, opacity: 0.4, marginLeft: 'auto' }}>
          {fmtTime(issue.gameTime)}
        </span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 3 }}>
        {issue.title}
      </div>
      {expanded && (
        <div style={{ marginTop: 6, fontSize: 10, lineHeight: 1.5, color: '#c8c8d0' }}>
          <div>{issue.description}</div>
          {issue.suggestion && (
            <div style={{ marginTop: 4, padding: '4px 6px', background: '#ffffff08', borderRadius: 3, border: '1px solid #ffffff10' }}>
              <span style={{ color: '#3ad17a', fontWeight: 700 }}>FIX: </span>
              {issue.suggestion}
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: 9, opacity: 0.4, fontFamily: 'monospace' }}>
            {JSON.stringify(issue.context, null, 0).slice(0, 300)}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Main monitor panel ---
export const GameMonitor = () => {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null)
  const [filter, setFilter] = useState<Severity | 'all'>('all')
  const pollRef = useRef<number>(0)

  // Install the monitor on mount
  useEffect(() => {
    perfMonitor.install()
  }, [])

  // Toggle with F10 or backtick
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F10' || e.code === 'Backquote') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Poll the monitor at 5Hz for the UI
  useEffect(() => {
    if (!open) return
    const poll = () => {
      setSnapshot(perfMonitor.getSnapshot())
    }
    poll()
    pollRef.current = window.setInterval(poll, 200)
    return () => window.clearInterval(pollRef.current)
  }, [open])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          top: 8,
          right: 8,
          zIndex: 200,
          background: 'rgba(11,11,18,0.85)',
          color: '#3ad17a',
          border: '1px solid #3ad17a40',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 10,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 0.5,
        }}
      >
        ◉ MON
      </button>
    )
  }

  const snap = snapshot
  const fps = snap?.fps ?? 0
  const fpsColor = fps >= 55 ? '#3ad17a' : fps >= 30 ? '#e8a838' : '#ff2a2a'
  const issues = snap?.issues ?? []
  const filtered = filter === 'all' ? issues : issues.filter((i) => i.severity === filter)
  const errorCount = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length
  const warnCount = issues.filter((i) => i.severity === 'warning').length

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: 'min(380px, 100vw)',
      height: '100vh',
      background: 'rgba(8,8,14,0.92)',
      backdropFilter: 'blur(8px)',
      borderLeft: '1px solid #ffffff15',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#e8e8f0',
      pointerEvents: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid #ffffff10',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5 }}>🎮 Game Monitor</span>
        <span style={{ fontSize: 9, opacity: 0.4, marginLeft: 'auto' }}>
          {snap ? fmtTime(snap.uptime) : '—'}
        </span>
        <button
          onClick={() => perfMonitor.clearIssues()}
          style={{
            background: '#ffffff10', border: 'none', color: '#e8a8f0',
            borderRadius: 3, padding: '2px 6px', fontSize: 9, cursor: 'pointer',
          }}
        >
          Clear
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: '#ffffff10', border: 'none', color: '#e8e8f0',
            borderRadius: 3, padding: '2px 6px', fontSize: 11, cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>

      {/* Stats grid */}
      {snap && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #ffffff10' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <Stat label="FPS" value={fps.toFixed(0)} color={fpsColor} />
            <Stat label="Avg FPS" value={snap.avgFps.toFixed(0)} color={snap.avgFps >= 55 ? '#3ad17a' : snap.avgFps >= 30 ? '#e8a838' : '#ff2a2a'} />
            <Stat label="Frame" value={`${snap.delta.toFixed(0)}ms`} color={snap.delta <= 16 ? '#3ad17a' : snap.delta <= 33 ? '#e8a838' : '#ff2a2a'} />
            <Stat label="Min FPS" value={snap.minFps > 0 ? snap.minFps.toFixed(0) : '—'} color={snap.minFps >= 30 ? '#3ad17a' : '#ff2a2a'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 6 }}>
            <Stat label="Draws" value={String(snap.drawCalls)} color={snap.drawCalls > 150 ? '#ff2a2a' : snap.drawCalls > 100 ? '#e8a838' : '#e8e8f0'} />
            <Stat label="Tris" value={fmtNum(snap.triangles)} />
            <Stat label="Geos" value={String(snap.geometries)} color={snap.geometries > 100 ? '#e8a838' : '#e8e8f0'} />
            <Stat label="Tex" value={String(snap.textures)} color={snap.textures > 100 ? '#e8a838' : '#e8e8f0'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 6 }}>
            <Stat label="Enemies" value={String(snap.enemyCount)} color={snap.enemyCount > 20 ? '#e8a838' : '#e8e8f0'} />
            <Stat label="Colliders" value={String(snap.colliderCount)} />
            <Stat label="Spikes" value={String(snap.totalSpikes)} color={snap.totalSpikes > 10 ? '#e8a838' : '#e8e8f0'} />
            <Stat label="Severe" value={String(snap.severeSpikes)} color={snap.severeSpikes > 0 ? '#ff2a2a' : '#e8e8f0'} />
          </div>

          {/* Frame time chart */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 9, opacity: 0.4, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Frame Time (last 60 frames)
            </div>
            <FrameChart history={snap.frameHistory} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, opacity: 0.3, marginTop: 2 }}>
              <span>0ms</span>
              <span style={{ color: '#e8a838' }}>33ms</span>
              <span style={{ color: '#ff2a2a' }}>66ms+</span>
            </div>
          </div>

          {/* Facing mismatch indicator */}
          {snap.facingZMismatch < -0.3 && (
            <div style={{
              marginTop: 6, padding: '4px 6px', borderRadius: 3,
              background: 'rgba(255,42,42,0.12)', border: '1px solid #ff2a2a40',
              fontSize: 9, color: '#ff5a5a',
            }}>
              ⚠ Dash Z-axis inverted: getWorldDirection().z is flipped vs aim — dashes go backwards when aiming up/down
            </div>
          )}

          {/* Event counts */}
          {Object.keys(snap.eventCounts).length > 0 && (
            <div style={{ marginTop: 6, fontSize: 8, opacity: 0.5, lineHeight: 1.6 }}>
              <span style={{ opacity: 0.6 }}>Events/s: </span>
              {Object.entries(snap.eventCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([event, count]) => `${event}=${count}`)
                .join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Issue log header + filters */}
      <div style={{
        padding: '6px 10px',
        borderBottom: '1px solid #ffffff10',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>
          Issues ({filtered.length})
        </span>
        {errorCount > 0 && (
          <span style={{ fontSize: 9, color: '#ff5a5a' }}>● {errorCount} errors</span>
        )}
        {warnCount > 0 && (
          <span style={{ fontSize: 9, color: '#e8a838' }}>● {warnCount} warnings</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
          {(['all', 'critical', 'error', 'warning', 'info'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? '#ffffff20' : 'transparent',
                border: '1px solid #ffffff10',
                color: filter === f ? '#e8e8f0' : '#888',
                borderRadius: 2,
                padding: '1px 5px',
                fontSize: 8,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Issue log (scrollable) */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 20, fontSize: 11, opacity: 0.3,
          }}>
            No issues detected yet. Play the game — spikes, stuck flags, and
            gameplay bugs will appear here with explanations.
            <br /><br />
            Press F10 or backtick (`) to toggle this panel.
          </div>
        ) : (
          filtered.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '4px 10px',
        borderTop: '1px solid #ffffff10',
        fontSize: 8,
        opacity: 0.3,
        textAlign: 'center',
      }}>
        F10 / ` to toggle · Click an issue to expand · window.__perfMonitor for console access
      </div>
    </div>
  )
}
