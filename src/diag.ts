// ============================================================================
// Dev-only diagnostics sink. Ships renderer/scene state to the Vite dev server
// (POST /__diag → diag.log) when something breaks mid-play:
//   - either error boundary tripping (render crash)
//   - the renderer going silent while the game is playing (dead frame loop)
//   - NaN / runaway-scale objects appearing in the scene
//   - the player pressing F9 ("it just went weird")
// Never throws, never touches gameplay, no-op in production builds.
// ============================================================================

const w = window as any

const scanScene = () => {
  const scene = w.__scene
  if (!scene) return null
  let meshes = 0
  let points = 0
  let skinned = 0
  const anomalies: unknown[] = []
  let anomalyCount = 0
  scene.traverse((o: any) => {
    if (o.isMesh) meshes++
    if (o.isPoints) points++
    if (o.isSkinnedMesh) skinned++
    const vals = [o.position.x, o.position.y, o.position.z, o.scale.x, o.scale.y, o.scale.z]
    const nan = vals.some((v) => !Number.isFinite(v))
    const huge = Math.abs(o.scale.x) > 50 || Math.abs(o.scale.y) > 50 || Math.abs(o.scale.z) > 50
    const far =
      Math.abs(o.position.x) > 300 || Math.abs(o.position.y) > 300 || Math.abs(o.position.z) > 300
    if (nan || huge || far) {
      anomalyCount++
      if (anomalies.length < 20)
        anomalies.push({
          name: o.name || o.type,
          parent: o.parent?.name || o.parent?.type || null,
          nan,
          huge,
          far,
          pos: [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(2)),
          scale: [o.scale.x, o.scale.y, o.scale.z].map((v) => +v.toFixed(3)),
        })
    }
  })
  return { meshes, points, skinned, anomalyCount, anomalies }
}

export const postDiag = (reason: string, extra?: unknown) => {
  if (import.meta.env.PROD) return
  try {
    const s = w.__gameStore?.getState?.()
    const gl = w.__renderer
    const payload = {
      reason,
      at: new Date().toISOString(),
      sceneError: w.__sceneError ?? null,
      canvasError: w.__canvasError ?? null,
      game: s
        ? {
            phase: s.gamePhase,
            char: s.selectedCharacter,
            combo: s.combo,
            level: s.currentLevel,
            wave: s.currentWave,
            playerLevel: s.playerLevel,
            hp: s.playerHealth,
            dead: s.playerDead,
            touchMode: s.touchMode,
          }
        : null,
      canvases: [...document.querySelectorAll('canvas')].map((c) => {
        const r = c.getBoundingClientRect()
        return {
          css: [r.width | 0, r.height | 0, r.left | 0, r.top | 0],
          attr: [c.width, c.height],
          cls: c.className,
        }
      }),
      renderer: gl
        ? {
            calls: gl.info?.render?.calls ?? null,
            triangles: gl.info?.render?.triangles ?? null,
            geometries: gl.info?.memory?.geometries ?? null,
            textures: gl.info?.memory?.textures ?? null,
          }
        : null,
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
      scene: scanScene(),
      extra: extra ?? null,
    }
    fetch('/__diag', { method: 'POST', body: JSON.stringify(payload) }).catch(() => {})
  } catch {
    /* diagnostics must never break the game */
  }
}

export const installDiag = () => {
  if (import.meta.env.PROD) return

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F9') postDiag('manual-F9')
  })

  // Watchdog: while playing, the renderer should draw every frame. Zero draw
  // calls with a live scene = dead renderer (the "screen went weird" state).
  // Also catches stray extra canvases and scene anomalies. Posts at most once
  // per minute per reason to avoid flooding the log.
  const lastPost: Record<string, number> = {}
  setInterval(() => {
    try {
      const s = w.__gameStore?.getState?.()
      if (!s || s.gamePhase !== 'playing') return
      const gl = w.__renderer
      const scan = scanScene()
      let reason: string | null = null
      if (gl && (gl.info?.render?.calls ?? 1) === 0) reason = 'renderer-silent'
      else if (scan && scan.anomalyCount > 0) reason = 'scene-anomaly'
      if (!reason) return
      const now = Date.now()
      if (now - (lastPost[reason] ?? 0) < 60_000) return
      lastPost[reason] = now
      postDiag(reason)
    } catch {
      /* ignore */
    }
  }, 3000)
}
