import { Canvas, useThree } from '@react-three/fiber'
import { Lights } from './components/lights'
import { KeyboardControls, Preload } from '@react-three/drei'
import { PostProcessing } from './components/postprocessing'
import { Arena } from './components/arena'
import { HalfFloatType } from 'three'
import * as THREE from 'three'
import { PlayerController } from './PlayerController'
import { Particles } from './components/particles'
import { Suspense, useEffect, Component, type ReactNode } from 'react'
import { EnemySystem } from './ecs/enemy'
import { Bullets } from './components/bullets'
import { ParryBlockFX } from './components/ParryBlockFX'
import { PlayerProjectiles } from './components/playerProjectiles'
import { Pickups } from './components/pickups'
import { Portal } from './components/portal'
import { Shockwaves } from './components/shockwave'
import { DaggerRain } from './components/daggerRain'
import { IceFloors } from './components/iceFloor'
import { BuffAura } from './components/buffAura'
import { MageShield } from './components/mageShield'
import { BossAttacks } from './components/bossAttacks'
import { MobilityFX } from './components/mobilityFx'
import { GearDrops } from './components/gearDrops'
import { LevelProps } from './components/levelProps'
import { CombatText } from './components/combatText'
import { AudioSystem } from './components/AudioSystem'
import { HUD } from './components/hud/HUD'
import { TouchControls } from './components/touch/TouchControls'
import { ReplaySystem } from './replay/ReplaySystem'
import { ReplayCamera } from './replay/ReplayCamera'
import { ReplayGhosts } from './replay/ReplayGhosts'
import { ReplayHUD } from './replay/ReplayHUD'
import { BootLoader } from './components/hud/BootLoader'
import { useGameStore } from './store'
import { detectTouch } from './game/touch'
import { installDiag, postDiag } from './diag'

/** Mobile devices render at a capped pixel ratio. R3F's default caps DPR at
 *  2, which on a 360px @3 phone means a 720px-wide WebGL surface — 4× the CSS
 *  pixels and a major source of GPU heat for a scene that draws many skinned
 *  enemies. Capping to 1.5 on touch devices cuts the fragment workload by
 *  ~44% with only a mild softening, and desktop keeps the crisp default. */
const MOBILE_DPR = detectTouch() ? 1.5 : undefined

/** Exposes the R3F scene + renderer as window.__scene / window.__renderer for
 *  browser verification probes and the dev diagnostics sink (src/diag.ts) */
const SceneProbe = () => {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    ;(window as any).__scene = scene
    ;(window as any).__renderer = gl
  }, [scene, gl])
  return null
}

/**
 * Surfaces scene-tree render errors instead of silently killing the Canvas.
 * A transient failure (e.g. one flaky GLB fetch) must not black-screen the
 * game forever, so the boundary retries the subtree a few times before
 * giving up.
 */
/**
 * Boundary ABOVE the Canvas. fiber v10 catches render-job exceptions (e.g. a
 * WebGPU writeBuffer failure) and rethrows them during CanvasImpl's own
 * render — above any boundary placed inside <Canvas>. Without this, React 19
 * unmounts the entire root: blank page while the music keeps playing.
 * Retries by remounting the Canvas; after 3 failed attempts it shows a
 * visible error with a reload button instead of a black screen.
 */
class CanvasErrorBoundary extends Component<
  { children: (canvasKey: number) => ReactNode },
  { error: Error | null; attempts: number }
> {
  state = { error: null as Error | null, attempts: 0 }
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    ;(window as any).__canvasError = String(error.stack || error)
    postDiag('canvas-boundary', { error: String(error.stack || error) })
    if (this.state.attempts < 3) {
      this.retryTimer = setTimeout(() => {
        this.setState((s) => ({ error: null, attempts: s.attempts + 1 }))
      }, 2000)
    }
  }
  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
  }
  render() {
    if (this.state.error && this.state.attempts >= 3) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: '#0b0b12',
            color: '#e8e8f0',
            fontFamily: 'sans-serif',
            zIndex: 100,
          }}
        >
          <p>The renderer crashed and could not recover.</p>
          <button
            style={{ padding: '8px 20px', cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      )
    }
    if (this.state.error) return null
    return this.props.children(this.state.attempts)
  }
}

class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; attempts: number }
> {
  state = { error: null as Error | null, attempts: 0 }
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    ;(window as any).__sceneError =
      String(error.stack || error) + '\n---COMPONENT STACK---' + (info.componentStack || '')
    postDiag('scene-boundary', { error: (window as any).__sceneError })
    if (this.state.attempts < 3) {
      this.retryTimer = setTimeout(() => {
        this.setState((s) => ({ error: null, attempts: s.attempts + 1 }))
      }, 2000)
    }
  }
  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
  }
  render() {
    if (this.state.error) return null
    return this.props.children
  }
}

function App() {
  // Dev diagnostics: F9 snapshot + renderer watchdog, posts to diag.log.
  useEffect(() => {
    installDiag()
  }, [])
  // Touch mode: immediate for coarse pointers, on for a real touch, and back
  // off the moment a real mouse moves — a stray brush of a touchscreen can
  // never latch the game into touch controls (which bypass mouse aiming).
  useEffect(() => {
    if (detectTouch()) useGameStore.getState().setTouchMode(true)
    const onTouch = () => useGameStore.getState().setTouchMode(true)
    const onMouse = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && useGameStore.getState().touchMode)
        useGameStore.getState().setTouchMode(false)
    }
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('pointermove', onMouse, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('pointermove', onMouse)
    }
  }, [])
  const keyboardMap = [
    { name: 'up', keys: ['KeyW', 'ArrowUp'] },
    { name: 'down', keys: ['KeyS', 'ArrowDown'] },
    { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
    { name: 'right', keys: ['KeyD', 'ArrowRight'] },
    { name: 'dash', keys: ['ShiftLeft'] },
  ]
  const gamePhase = useGameStore((s) => s.gamePhase)
  const showGameCanvas = gamePhase === 'playing' || gamePhase === 'paused'
  // Replay playback is a spectator/cinematic mode — hide the gameplay HUD
  const replayPlayback = useGameStore((s) => s.replayPhase === 'playback')
  return (
    <>
      {showGameCanvas && (
        <CanvasErrorBoundary>
          {(canvasKey) => (
            <Canvas
              key={canvasKey}
              shadows
              dpr={MOBILE_DPR}
              renderer={{
                antialias: false,
                depth: false,
                stencil: false,
                alpha: false,
                forceWebGL: false,
                outputType: HalfFloatType,
              }}
            >
              <SceneErrorBoundary>
                {/* Input + lights stay outside the model-loading Suspense so a slow
                    or failed GLB can never freeze player movement. */}
                <Lights />
                <KeyboardControls map={keyboardMap}>
                  <PlayerController />
                </KeyboardControls>
                <Suspense fallback={null}>
                  <Arena />
                  <PostProcessing />
                  <Particles />
                  {/*<OrbitControls /> */}
                  <Bullets />
                  <ParryBlockFX />
                  <PlayerProjectiles />
                  <Pickups />
                  <Portal />
                  <Shockwaves />
                  <DaggerRain />
                  <IceFloors />
                  <BuffAura />
                  <MageShield />
                  <BossAttacks />
                  <MobilityFX />
                  <GearDrops />
                  <LevelProps />
                  <CombatText />
  
                  <EnemySystem />
                  <ReplayGhosts />
                  <Preload all />
                </Suspense>
                <SceneProbe />
                <ReplaySystem />
                <ReplayCamera />
              </SceneErrorBoundary>
            </Canvas>
          )}
        </CanvasErrorBoundary>
      )}
      {!replayPlayback && <HUD />}
      {!replayPlayback && <TouchControls />}
      <AudioSystem />
      <ReplayHUD />
      <BootLoader />
    </>
  )
}

export default App
