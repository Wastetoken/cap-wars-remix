// ============================================================================
// Game Performance & Issue Monitor
// ============================================================================
// A comprehensive monitoring engine that tracks frame performance, renderer
// stats, entity counts, gameplay state, and event bus activity. Detects and
// logs issues with context and explanations so they can be diagnosed and
// fixed systematically.
//
// Usage:
//   perfMonitor.install()          // call once at startup (hooks event bus)
//   perfMonitor.sample(data)       // call every frame from a useFrame probe
//   perfMonitor.getSnapshot()      // call from UI at ~5Hz to read state
//   perfMonitor.clearIssues()      // reset the issue log
//
// Exposed on window.__perfMonitor for ad-hoc debugging.
// ============================================================================

import { eventBus } from '../constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = 'info' | 'warning' | 'error' | 'critical'
export type Category =
  | 'performance'
  | 'gameplay'
  | 'rendering'
  | 'memory'
  | 'collision'
  | 'input'

export interface Issue {
  id: number
  time: number
  gameTime: number
  severity: Severity
  category: Category
  title: string
  description: string
  context: Record<string, unknown>
  suggestion?: string
  count: number
  firstSeen: number
}

export interface FrameData {
  delta: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  enemyCount: number
  colliderCount: number
  isCharging: boolean
  isDashing: boolean
  isSpinAttacking: boolean
  isAttackDashing: boolean
  isParrying: boolean
  isEvading: boolean
  isFury: boolean
  playerPos: { x: number; y: number; z: number }
  /** Unit vector the player's -Z axis faces in world space (getWorldDirection). */
  worldForward: { x: number; z: number }
  /** Unit vector toward the player's aim (sin(yaw), cos(yaw)). */
  aimForward: { x: number; z: number }
  gamePhase: string
  combo: number
  rage: number
  currentLevel: number
  currentWave: number
}

export interface MonitorSnapshot {
  fps: number
  avgFps: number
  minFps: number
  delta: number
  avgDelta: number
  maxDelta: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  enemyCount: number
  colliderCount: number
  totalFrames: number
  totalSpikes: number
  severeSpikes: number
  issues: Issue[]
  frameHistory: number[]
  eventCounts: Record<string, number>
  uptime: number
  worldForwardVsAim: number
  facingZMismatch: number
  isInstalled: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ISSUES = 200
const MAX_FRAME_HISTORY = 120
const SPIKE_THRESHOLD_MS = 33 // below 30 fps
const SEVERE_SPIKE_MS = 50 // below 20 fps
const GC_PAUSE_MS = 100

// How long a combat flag can stay true before it's "stuck" (ms)
const FLAG_TIMEOUTS: Record<string, number> = {
  isCharging: 6000,
  isDashing: 2500,
  isSpinAttacking: 6000,
  isAttackDashing: 2500,
  isParrying: 4000,
  isEvading: 1500,
}

// Dedup window: don't log the same issue category more often than this (ms)
const DEDUP_MS: Record<Severity, number> = {
  info: 10_000,
  warning: 5_000,
  error: 3_000,
  critical: 2_000,
}

// ---------------------------------------------------------------------------
// PerfMonitor singleton
// ---------------------------------------------------------------------------

class PerfMonitor {
  private issues: Issue[] = []
  private issueId = 0
  private startTime = 0
  private totalFrames = 0
  private totalSpikes = 0
  private severeSpikes = 0

  // Frame timing
  private frameHistory: number[] = []
  private avgDelta = 0
  private minFps = Infinity
  private maxDelta = 0
  private currentDelta = 0
  private currentFps = 60

  // Current stats
  private currentDrawCalls = 0
  private currentTriangles = 0
  private currentGeometries = 0
  private currentTextures = 0
  private currentEnemyCount = 0
  private currentColliderCount = 0

  // Stuck flag tracking
  private flagStartTimes: Record<string, number> = {}
  private loggedStuckFlags: Set<string> = new Set()

  // Dash tracking
  private wasDashing = false
  private dashStartPos = { x: 0, z: 0 }
  private dashStartFacing = { x: 0, z: 0 }
  private dashLogged = false

  // Attack knockback tracking
  private wasAttackDashing = false
  private attackDashStartPos = { x: 0, z: 0 }
  private attackDashStartFacing = { x: 0, z: 0 }
  private attackKnockbackLogged = false

  // Position tracking
  private lastPlayerPos = { x: 0, y: 0, z: 0 }
  private hasLastPos = false

  // Memory leak tracking
  private lastGeometries = 0
  private lastTextures = 0
  private geometryLeakLogged = false
  private textureLeakLogged = false
  private geometryHistory: number[] = []
  private textureHistory: number[] = []

  // Event tracking
  private eventCounts: Record<string, number> = {}
  private eventWindowStart = 0
  private loggedEventBursts: Set<string> = new Set()

  // Facing analysis
  private worldForwardVsAim = 0
  private facingZMismatch = 0

  // Installed state
  private installed = false
  private originalEmit: ((event: string, ...args: unknown[]) => boolean) | null = null

  // Dedup
  private lastIssueTime: Record<string, number> = {}

  // -----------------------------------------------------------------------
  // Installation — hooks the event bus to count events
  // -----------------------------------------------------------------------

  install() {
    if (this.installed) return
    this.startTime = performance.now()
    this.installed = true

    // Wrap eventBus.emit to count every event
    this.originalEmit = eventBus.emit.bind(eventBus)
    const self = this
    eventBus.emit = function (event: string, ...args: unknown[]) {
      self.trackEvent(event)
      return self.originalEmit!(event, ...args)
    } as typeof eventBus.emit
  }

  // -----------------------------------------------------------------------
  // Event tracking
  // -----------------------------------------------------------------------

  private trackEvent(event: string) {
    const now = performance.now()
    if (now - this.eventWindowStart > 1000) {
      // Reset window
      this.eventWindowStart = now
      this.eventCounts = {}
      this.loggedEventBursts.clear()
    }
    this.eventCounts[event] = (this.eventCounts[event] ?? 0) + 1

    // Detect event bursts (same event > 20 times in 1 second)
    if (this.eventCounts[event] > 20 && !this.loggedEventBursts.has(event)) {
      this.loggedEventBursts.add(event)
      this.addIssue({
        severity: 'warning',
        category: 'performance',
        title: `Event burst: "${event}"`,
        description: `${this.eventCounts[event]} "${event}" events fired in <1 second. Each event triggers listener callbacks — a burst can cause frame drops if listeners do expensive work (VFX spawns, damage checks, audio).`,
        context: { event, count: this.eventCounts[event] },
        suggestion: 'Check listeners on this event for per-call allocations or heavy logic. Consider batching or throttling.',
      })
    }
  }

  // -----------------------------------------------------------------------
  // Core sampling — called every frame from the R3F probe
  // -----------------------------------------------------------------------

  sample(data: FrameData) {
    if (!this.installed) return
    this.totalFrames++
    const now = performance.now()

    // --- Frame timing ---
    this.currentDelta = data.delta * 1000 // convert to ms
    this.currentFps = data.delta > 0 ? 1 / data.delta : 0

    this.frameHistory.push(this.currentDelta)
    if (this.frameHistory.length > MAX_FRAME_HISTORY) this.frameHistory.shift()

    // Rolling average (exponential moving average for efficiency)
    this.avgDelta = this.avgDelta === 0
      ? this.currentDelta
      : this.avgDelta * 0.95 + this.currentDelta * 0.05

    if (this.currentDelta > this.maxDelta) this.maxDelta = this.currentDelta
    const fps = data.delta > 0 ? 1 / data.delta : 0
    if (fps < this.minFps && fps > 0) this.minFps = fps

    // --- Renderer stats ---
    this.currentDrawCalls = data.drawCalls
    this.currentTriangles = data.triangles
    this.currentGeometries = data.geometries
    this.currentTextures = data.textures
    this.currentEnemyCount = data.enemyCount
    this.currentColliderCount = data.colliderCount

    // --- Facing analysis ---
    // getWorldDirection returns (sin(yaw), 0, -cos(yaw)).
    // The aim direction is (sin(yaw), 0, cos(yaw)).
    // The Z component is always flipped — that's the dash-backwards bug.
    this.worldForwardVsAim =
      data.worldForward.x * data.aimForward.x + data.worldForward.z * data.aimForward.z
    this.facingZMismatch = data.worldForward.z * data.aimForward.z

    // --- Only run detection during active gameplay ---
    const isPlaying = data.gamePhase === 'playing'

    if (isPlaying) {
      this.detectFrameSpikes(data, now)
      this.detectGCPause(data, now)
      this.detectHighDrawCalls(data, now)
      this.detectHighEntityCount(data, now)
      this.detectMemoryGrowth(data, now)
      this.detectStuckFlags(data, now)
      this.detectDashBackwards(data, now)
      this.detectAttackKnockback(data, now)
      this.detectNaNPosition(data, now)
      this.detectFacingMismatch(data, now)
    }

    // --- Position tracking for next frame ---
    this.lastPlayerPos = { ...data.playerPos }
    this.hasLastPos = true
    this.lastGeometries = data.geometries
    this.lastTextures = data.textures
  }

  // -----------------------------------------------------------------------
  // Detection rules
  // -----------------------------------------------------------------------

  private dedupKey(category: string, title: string): string {
    return `${category}:${title}`
  }

  private shouldLog(severity: Severity, key: string, now: number): boolean {
    const last = this.lastIssueTime[key] ?? 0
    if (now - last < DEDUP_MS[severity]) return false
    this.lastIssueTime[key] = now
    return true
  }

  private addIssue(params: {
    severity: Severity
    category: Category
    title: string
    description: string
    context: Record<string, unknown>
    suggestion?: string
  }) {
    const now = performance.now()
    const key = this.dedupKey(params.category, params.title)

    // Dedup: if we've seen this issue recently, increment count instead of adding
    if (!this.shouldLog(params.severity, key, now)) {
      // Find existing issue and increment
      for (let i = this.issues.length - 1; i >= 0; i--) {
        if (this.dedupKey(this.issues[i].category, this.issues[i].title) === key) {
          this.issues[i].count++
          this.issues[i].time = now
          // Move to end (most recent)
          const issue = this.issues.splice(i, 1)[0]
          this.issues.push(issue)
          return
        }
      }
      return
    }

    const issue: Issue = {
      id: ++this.issueId,
      time: now,
      gameTime: (now - this.startTime) / 1000,
      severity: params.severity,
      category: params.category,
      title: params.title,
      description: params.description,
      context: params.context,
      suggestion: params.suggestion,
      count: 1,
      firstSeen: now,
    }

    this.issues.push(issue)
    if (this.issues.length > MAX_ISSUES) this.issues.shift()
  }

  // --- Frame spikes ---
  private detectFrameSpikes(data: FrameData, now: number) {
    const deltaMs = data.delta * 1000
    if (deltaMs >= SEVERE_SPIKE_MS) {
      this.totalSpikes++
      this.severeSpikes++
      this.addIssue({
        severity: 'critical',
        category: 'performance',
        title: `Severe frame spike: ${deltaMs.toFixed(0)}ms`,
        description: `Frame took ${deltaMs.toFixed(0)}ms (${(1000 / deltaMs).toFixed(0)} fps). This is the most common cause of "lag" — the game loop stalled. The spike happened while: ${this.describeGameState(data)}`,
        context: this.snapshotContext(data),
        suggestion: this.suggestSpikeCause(data),
      })
    } else if (deltaMs >= SPIKE_THRESHOLD_MS) {
      this.totalSpikes++
      this.addIssue({
        severity: 'warning',
        category: 'performance',
        title: `Frame spike: ${deltaMs.toFixed(0)}ms`,
        description: `Frame took ${deltaMs.toFixed(0)}ms (${(1000 / deltaMs).toFixed(0)} fps). Noticeable stutter. Happened while: ${this.describeGameState(data)}`,
        context: this.snapshotContext(data),
        suggestion: this.suggestSpikeCause(data),
      })
    }
  }

  // --- GC pause ---
  private detectGCPause(data: FrameData, now: number) {
    const deltaMs = data.delta * 1000
    if (deltaMs >= GC_PAUSE_MS && this.frameHistory.length >= 3) {
      // Check preceding frames were normal (not a sustained slowdown)
      const prev = this.frameHistory[this.frameHistory.length - 2]
      const prev2 = this.frameHistory[this.frameHistory.length - 3]
      if (prev < 25 && prev2 < 25) {
        this.addIssue({
          severity: 'error',
          category: 'performance',
          title: `GC pause: ${deltaMs.toFixed(0)}ms`,
          description: `A ${deltaMs.toFixed(0)}ms pause after two normal frames (~${prev.toFixed(0)}ms, ~${prev2.toFixed(0)}ms) is characteristic of a JavaScript garbage collection sweep. The engine paused to free memory, freezing all gameplay.`,
          context: { ...this.snapshotContext(data), prevFrames: [prev2, prev] },
          suggestion: 'Reduce per-frame allocations (Vector3.clone(), new objects, array spreads). Look for `.clone()`, `new `, spread operators, and `Array.from()` in hot paths.',
        })
      }
    }
  }

  // --- High draw calls ---
  private detectHighDrawCalls(data: FrameData, now: number) {
    if (data.drawCalls > 200) {
      this.addIssue({
        severity: 'error',
        category: 'rendering',
        title: `High draw calls: ${data.drawCalls}`,
        description: `${data.drawCalls} draw calls in a single frame. Each draw call is a CPU→GPU round trip. On mobile, >150 calls per frame causes significant overhead. ${data.triangles.toLocaleString()} triangles across ${data.geometries} geometries.`,
        context: this.snapshotContext(data),
        suggestion: 'Merge static meshes, use instanced rendering for repeated geometry, reduce particle emitter count. Check if post-processing passes add extra draw calls.',
      })
    } else if (data.drawCalls > 120) {
      this.addIssue({
        severity: 'warning',
        category: 'rendering',
        title: `Elevated draw calls: ${data.drawCalls}`,
        description: `${data.drawCalls} draw calls. Approaching the mobile performance ceiling (~150). ${data.triangles.toLocaleString()} triangles, ${data.geometries} geometries, ${data.textures} textures.`,
        context: this.snapshotContext(data),
        suggestion: 'Monitor as enemy/particle counts grow. Consider instancing for enemy meshes.',
      })
    }
  }

  // --- High entity count ---
  private detectHighEntityCount(data: FrameData, now: number) {
    if (data.enemyCount > 25) {
      this.addIssue({
        severity: 'warning',
        category: 'collision',
        title: `High enemy count: ${data.enemyCount}`,
        description: `${data.enemyCount} enemies active with ${data.colliderCount} colliders. The spatial grid collision system is O(n) per query, but enemy-enemy separation is O(n²) in dense clusters. Each enemy also runs AI behavior, velocity damping, and mesh sync per frame.`,
        context: this.snapshotContext(data),
        suggestion: 'Consider capping concurrent enemies or reducing separation frequency for distant mobs.',
      })
    }
  }

  // --- Memory growth (geometry/texture leaks) ---
  private detectMemoryGrowth(data: FrameData, now: number) {
    this.geometryHistory.push(data.geometries)
    this.textureHistory.push(data.textures)
    if (this.geometryHistory.length > 300) this.geometryHistory.shift()
    if (this.textureHistory.length > 300) this.textureHistory.shift()

    // Check for sustained growth over ~5 seconds
    if (this.geometryHistory.length >= 300 && !this.geometryLeakLogged) {
      const old = this.geometryHistory[0]
      const recent = this.geometryHistory[this.geometryHistory.length - 1]
      if (recent > old + 10 && recent > 50) {
        this.geometryLeakLogged = true
        this.addIssue({
          severity: 'error',
          category: 'memory',
          title: `Geometry count growing: ${old} → ${recent}`,
          description: `Geometry count increased from ${old} to ${recent} over ~5 seconds. This indicates GPU geometries are being created but not disposed — a memory leak that will eventually crash the tab.`,
          context: { oldCount: old, newCount: recent, current: data.geometries },
          suggestion: 'Check for meshes/particles that are removed from the scene without calling .dispose() on their geometry. Look at enemy death, wave transitions, and character switching.',
        })
      }
    }

    if (this.textureHistory.length >= 300 && !this.textureLeakLogged) {
      const old = this.textureHistory[0]
      const recent = this.textureHistory[this.textureHistory.length - 1]
      if (recent > old + 10 && recent > 50) {
        this.textureLeakLogged = true
        this.addIssue({
          severity: 'error',
          category: 'memory',
          title: `Texture count growing: ${old} → ${recent}`,
          description: `Texture count increased from ${old} to ${recent} over ~5 seconds. GPU textures are being created but not disposed — a memory leak.`,
          context: { oldCount: old, newCount: recent, current: data.textures },
          suggestion: 'Check for textures created per-frame or per-spawn without disposal. Particle systems and dynamic textures are common culprits.',
        })
      }
    }
  }

  // --- Stuck combat flags ---
  private detectStuckFlags(data: FrameData, now: number) {
    const flags: Array<keyof typeof FLAG_TIMEOUTS> = [
      'isCharging',
      'isDashing',
      'isSpinAttacking',
      'isAttackDashing',
      'isParrying',
      'isEvading',
    ]

    for (const flag of flags) {
      const active = data[flag] as boolean
      if (active) {
        if (this.flagStartTimes[flag] === undefined) {
          this.flagStartTimes[flag] = now
        }
        const elapsed = now - this.flagStartTimes[flag]
        if (elapsed > FLAG_TIMEOUTS[flag] && !this.loggedStuckFlags.has(flag)) {
          this.loggedStuckFlags.add(flag)
          this.addIssue({
            severity: 'error',
            category: 'gameplay',
            title: `Stuck flag: ${flag} (${(elapsed / 1000).toFixed(1)}s)`,
            description: `${flag} has been true for ${(elapsed / 1000).toFixed(1)}s — far longer than its expected duration. This pins the player's speed multiplier to 0 (or evading), making the player unable to move. The flag was likely latched by a missed animation 'finished' event or a mouseup that was lost (e.g. released outside the window).`,
            context: { ...this.snapshotContext(data), flag, elapsedMs: elapsed },
            suggestion: `Check the ${flag} lifecycle: is there a watchdog timer that clears it? Was the mouse released outside the window (blur handler)? Is a shared animation clip consuming the 'finished' event?`,
          })
        }
      } else {
        this.flagStartTimes[flag] = undefined
        this.loggedStuckFlags.delete(flag)
      }
    }
  }

  // --- Dash backwards ---
  private detectDashBackwards(data: FrameData, now: number) {
    // Detect when dashing starts
    if (data.isDashing && !this.wasDashing) {
      this.dashStartPos = { x: data.playerPos.x, z: data.playerPos.z }
      this.dashStartFacing = { x: data.aimForward.x, z: data.aimForward.z }
      this.dashLogged = false
    }

    // During dash, check if movement is opposite to aim direction
    if (data.isDashing && !this.dashLogged && this.hasLastPos) {
      const dx = data.playerPos.x - this.dashStartPos.x
      const dz = data.playerPos.z - this.dashStartPos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > 0.5) {
        // Normalize movement direction
        const mx = dx / dist
        const mz = dz / dist
        // Dot product with aim direction
        const dot = mx * this.dashStartFacing.x + mz * this.dashStartFacing.z
        if (dot < -0.3) {
          this.dashLogged = true
          this.addIssue({
            severity: 'critical',
            category: 'gameplay',
            title: 'Dash went backwards',
            description: `The player dashed ${dist.toFixed(1)} units in the direction (${mx.toFixed(2)}, ${mz.toFixed(2)}), which is OPPOSITE to the aim direction (${this.dashStartFacing.x.toFixed(2)}, ${this.dashStartFacing.z.toFixed(2)}). Dot product: ${dot.toFixed(2)}. This happens because dash code uses getWorldDirection() which returns the -Z axis, but the player's aim is set via atan2(dx, dz) which orients +Z toward the cursor — so getWorldDirection points AWAY from the cursor.`,
            context: {
              ...this.snapshotContext(data),
              dashDir: [mx, mz],
              aimDir: [this.dashStartFacing.x, this.dashStartFacing.z],
              dot,
              distance: dist,
            },
            suggestion: 'In PlayerController.tsx, the spinAttackDash and dash functions use playerRef.current.getWorldDirection() as the dash direction. getWorldDirection returns -Z, but the player faces +Z (toward the aim). Fix: negate the direction, or use a custom forward computed from the quaternion yaw: new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).',
          })
        }
      }
    }

    this.wasDashing = data.isDashing
  }

  // --- Attack knockback (attack dash sends player backwards) ---
  private detectAttackKnockback(data: FrameData, now: number) {
    if (data.isAttackDashing && !this.wasAttackDashing) {
      this.attackDashStartPos = { x: data.playerPos.x, z: data.playerPos.z }
      this.attackDashStartFacing = { x: data.aimForward.x, z: data.aimForward.z }
      this.attackKnockbackLogged = false
    }

    if (data.isAttackDashing && !this.attackKnockbackLogged && this.hasLastPos) {
      const dx = data.playerPos.x - this.attackDashStartPos.x
      const dz = data.playerPos.z - this.attackDashStartPos.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > 0.3) {
        const mx = dx / dist
        const mz = dz / dist
        const dot = mx * this.attackDashStartFacing.x + mz * this.attackDashStartFacing.z
        if (dot < -0.3) {
          this.attackKnockbackLogged = true
          this.addIssue({
            severity: 'error',
            category: 'gameplay',
            title: 'Attack dash sent player backwards',
            description: `The attack lunge moved the player ${dist.toFixed(1)} units backwards (away from aim). The attackDash function in PlayerController uses the same getWorldDirection() direction as the spin dash, which points opposite to the cursor.`,
            context: {
              ...this.snapshotContext(data),
              lungeDir: [mx, mz],
              aimDir: [this.attackDashStartFacing.x, this.attackDashStartFacing.z],
              dot,
              distance: dist,
            },
            suggestion: 'Same root cause as the backwards dash. The attackDash trigger in useCapsController.tsx calls triggerAttackDash() which is handled in PlayerController useFrame using getWorldDirection(). Fix the forward direction computation.',
          })
        }
      }
    }

    this.wasAttackDashing = data.isAttackDashing
  }

  // --- NaN position ---
  private detectNaNPosition(data: FrameData, now: number) {
    const { x, y, z } = data.playerPos
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      this.addIssue({
        severity: 'critical',
        category: 'gameplay',
        title: 'NaN in player position',
        description: `Player position contains non-finite values: (${x}, ${y}, ${z}). This will break all collision, aim, and movement calculations and cascade into every system.`,
        context: this.snapshotContext(data),
        suggestion: 'Check for division by zero in movement code, or a dash tween with a zero-length direction vector. Look at dash() in PlayerController.tsx — if dir.length() === 0 the code returns, but normalize() on a near-zero vector can produce NaN.',
      })
    }
  }

  // --- Facing mismatch (persistent check) ---
  private detectFacingMismatch(data: FrameData, now: number) {
    // getWorldDirection() returns (sin(yaw), 0, -cos(yaw)).
    // The aim forward is (sin(yaw), 0, cos(yaw)).
    // The Z component is always flipped — dashes go backwards when aiming
    // along the Z axis (up/down on screen). Check the Z component specifically.
    const zMismatch = data.worldForward.z * data.aimForward.z
    if (zMismatch < -0.3 && !this.loggedStuckFlags.has('__facing_mismatch__')) {
      this.loggedStuckFlags.add('__facing_mismatch__')
      this.addIssue({
        severity: 'error',
        category: 'gameplay',
        title: 'Dash direction Z-axis is inverted',
        description: `getWorldDirection() returns (${data.worldForward.x.toFixed(2)}, ${data.worldForward.z.toFixed(2)}) but the player's aim forward is (${data.aimForward.x.toFixed(2)}, ${data.aimForward.z.toFixed(2)}). The Z component is flipped: getWorldDirection returns -cos(yaw) while the aim uses +cos(yaw). This means dashes, spin attacks, and dash attacks go BACKWARDS whenever the player aims along the Z axis (up/down on screen). Aiming left/right (X axis) works correctly because sin(yaw) matches in both vectors.`,
        context: {
          worldForward: [data.worldForward.x, data.worldForward.z],
          aimForward: [data.aimForward.x, data.aimForward.z],
          zMismatch,
          fullDot: this.worldForwardVsAim,
        },
        suggestion: 'In PlayerController.tsx, replace getWorldDirection() in dash/spinAttackDash/attackDash with a forward computed from the yaw: const e = new THREE.Euler().setFromQuaternion(playerRef.current.quaternion, "YXZ"); const forward = new THREE.Vector3(Math.sin(e.y), 0, Math.cos(e.y)); — this gives the correct aim-aligned forward. Alternatively, negate the Z component of getWorldDirection.',
      })
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private describeGameState(data: FrameData): string {
    const parts: string[] = []
    if (data.isCharging) parts.push('charging')
    if (data.isDashing) parts.push('dashing')
    if (data.isSpinAttacking) parts.push('spin attacking')
    if (data.isAttackDashing) parts.push('attack dashing')
    if (data.isParrying) parts.push('parrying')
    if (data.isEvading) parts.push('evading')
    if (data.isFury) parts.push('fury active')
    if (parts.length === 0) parts.push('idle/moving')
    parts.push(`${data.enemyCount} enemies`)
    parts.push(`${data.drawCalls} draw calls`)
    return parts.join(', ')
  }

  private snapshotContext(data: FrameData): Record<string, unknown> {
    return {
      deltaMs: +(data.delta * 1000).toFixed(1),
      fps: data.delta > 0 ? +(1 / data.delta).toFixed(0) : 0,
      drawCalls: data.drawCalls,
      triangles: data.triangles,
      geometries: data.geometries,
      textures: data.textures,
      enemyCount: data.enemyCount,
      colliderCount: data.colliderCount,
      isCharging: data.isCharging,
      isDashing: data.isDashing,
      isSpinAttacking: data.isSpinAttacking,
      isAttackDashing: data.isAttackDashing,
      isParrying: data.isParrying,
      isEvading: data.isEvading,
      isFury: data.isFury,
      combo: data.combo,
      rage: data.rage,
      level: data.currentLevel,
      wave: data.currentWave,
      pos: [+data.playerPos.x.toFixed(2), +data.playerPos.y.toFixed(2), +data.playerPos.z.toFixed(2)],
    }
  }

  private suggestSpikeCause(data: FrameData): string {
    const causes: string[] = []
    if (data.isSpinAttacking) causes.push('spin attack ticks dealDamageInArea() every 0.4s — iterates all enemy colliders')
    if (data.isAttackDashing) causes.push('attack dash uses GSAP tween + collision resolution')
    if (data.isCharging) causes.push('charging state runs energy particle emitter')
    if (data.enemyCount > 15) causes.push(`${data.enemyCount} enemies each running AI + collision separation`)
    if (data.drawCalls > 100) causes.push(`${data.drawCalls} draw calls — CPU overhead`)
    if (data.triangles > 100000) causes.push(`${data.triangles.toLocaleString()} triangles — high fragment load`)
    if (data.colliderCount > 30) causes.push(`${data.colliderCount} colliders — spatial grid rebuild + queries`)
    if (causes.length === 0) causes.push('no obvious gameplay cause — may be GC, asset loading, or browser background tab throttling')
    return causes.join('; ') + '.'
  }

  // -----------------------------------------------------------------------
  // Public API for the UI
  // -----------------------------------------------------------------------

  getSnapshot(): MonitorSnapshot {
    return {
      fps: this.currentFps,
      avgFps: this.avgDelta > 0 ? 1000 / this.avgDelta : 0,
      minFps: this.minFps === Infinity ? 0 : this.minFps,
      delta: this.currentDelta,
      avgDelta: this.avgDelta,
      maxDelta: this.maxDelta,
      drawCalls: this.currentDrawCalls,
      triangles: this.currentTriangles,
      geometries: this.currentGeometries,
      textures: this.currentTextures,
      enemyCount: this.currentEnemyCount,
      colliderCount: this.currentColliderCount,
      totalFrames: this.totalFrames,
      totalSpikes: this.totalSpikes,
      severeSpikes: this.severeSpikes,
      issues: [...this.issues].reverse(), // most recent first
      frameHistory: [...this.frameHistory],
      eventCounts: { ...this.eventCounts },
      uptime: this.startTime > 0 ? (performance.now() - this.startTime) / 1000 : 0,
      worldForwardVsAim: this.worldForwardVsAim,
      facingZMismatch: this.facingZMismatch,
      isInstalled: this.installed,
    }
  }

  clearIssues() {
    this.issues = []
    this.lastIssueTime = {}
    this.loggedStuckFlags.clear()
    this.loggedEventBursts.clear()
    this.geometryLeakLogged = false
    this.textureLeakLogged = false
    this.totalSpikes = 0
    this.severeSpikes = 0
    this.minFps = Infinity
    this.maxDelta = 0
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const perfMonitor = new PerfMonitor()

if (typeof window !== 'undefined') {
  ;(window as any).__perfMonitor = perfMonitor
}
