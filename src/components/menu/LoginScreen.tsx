import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGameStore } from '@/store'
import { supabase } from '@/supabaseClient'
import { fetchCloudSave } from '@/game/skills'
import loadingBgUrl from '@/Loading 2.png'

// ============================================================================
// LoginScreen — full-screen auth splash matching the reference layout:
// dark game background, Three.js ember field, top nav, centered title/form,
// side labels, corner frames, bottom bar. Supabase auth is unchanged.
// ============================================================================

const EMBER_COUNT = 100

export const LoginScreen = () => {
  const [view, setView] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const setGamePhase = useGameStore((s) => s.setGamePhase)
  const setAuthUser = useGameStore((s) => s.setAuthUser)
  const loadCloudSave = useGameStore((s) => s.loadCloudSave)
  const setLevelLoading = useGameStore((s) => s.setLevelLoading)

  const canvasContainerRef = useRef<HTMLDivElement>(null)

  // Three.js background — soft ember particles behind the splash
  useEffect(() => {
    const container = canvasContainerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50)
    camera.position.z = 8

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(EMBER_COUNT * 3)
    const velocities: { x: number; y: number; z: number }[] = []

    for (let i = 0; i < EMBER_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2
      velocities.push({
        x: (Math.random() - 0.5) * 0.3,
        y: Math.random() * 0.4 + 0.15,
        z: (Math.random() - 0.5) * 0.15,
      })
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const sprite = (() => {
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const ctx = canvas.getContext('2d')!
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.15, 'rgba(255,200,120,0.95)')
      gradient.addColorStop(0.4, 'rgba(255,100,30,0.5)')
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 32, 32)
      const texture = new THREE.CanvasTexture(canvas)
      texture.needsUpdate = true
      return texture
    })()

    const material = new THREE.PointsMaterial({
      size: 0.28,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      map: sprite,
    })

    const points = new THREE.Points(geometry, material)
    scene.add(points)

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    let animationId: number
    const animate = () => {
      animationId = requestAnimationFrame(animate)
      const pos = points.geometry.attributes.position.array as Float32Array

      for (let i = 0; i < EMBER_COUNT; i++) {
        const idx = i * 3
        pos[idx] += velocities[i].x * 0.015
        pos[idx + 1] += velocities[i].y * 0.015
        pos[idx + 2] += velocities[i].z * 0.015

        if (pos[idx + 1] > 7) pos[idx + 1] = -7
        if (Math.abs(pos[idx]) > 10) pos[idx] *= -0.9
      }

      points.geometry.attributes.position.needsUpdate = true
      points.rotation.y += 0.0008
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', handleResize)
      geometry.dispose()
      material.dispose()
      sprite.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    setLevelLoading(true)

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setErrorMsg(error.message)
      setLevelLoading(false)
      setLoading(false)
      return
    }
    if (data.user) {
      setAuthUser(data.user)
      const cloudSave = await fetchCloudSave(data.user.id)
      if (cloudSave) loadCloudSave(cloudSave)
      setGamePhase('menu')
      return
    }
    setErrorMsg('Failed to create account. Please try again.')
    setLevelLoading(false)
    setLoading(false)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    setLevelLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setErrorMsg(error.message)
      setLevelLoading(false)
      setLoading(false)
      return
    }
    if (data.user) {
      setAuthUser(data.user)
      const cloudSave = await fetchCloudSave(data.user.id)
      if (cloudSave) loadCloudSave(cloudSave)
      setGamePhase('menu')
      return
    }
    setErrorMsg('Login failed. Please try again.')
    setLevelLoading(false)
    setLoading(false)
  }

  const handleGuest = () => {
    setAuthUser(null)
    setLevelLoading(true)
    setGamePhase('menu')
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Background layers */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${loadingBgUrl}")` }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/70 via-[#0d122b]/80 to-black/80" />

      {/* Three.js ember canvas */}
      <div ref={canvasContainerRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* Corner frames */}
      <div className="frame-tl" />
      <div className="frame-br" />

      {/* Top bar */}
      <nav className="top-bar">
        <div className="logo">
          <span className="logo-dot" />
          NIGHTSHADE
        </div>
        <div className="nav-links">
          <button onClick={() => { setView('register'); setErrorMsg(''); }} className="nav-link">
            CREATE AN ACCOUNT
          </button>
          <button onClick={() => { setView('login'); setErrorMsg(''); }} className="nav-link">
            LOGIN
          </button>
          <button onClick={handleGuest} className="nav-link">
            PLAY WITHOUT ACCOUNT
          </button>
        </div>
      </nav>

      {/* Side labels */}
      <div className="side-label-left">
        <span className="side-num">N&ordm; 666</span>
      </div>
      <div className="side-label-right">
        <span>Guest progress stays on</span>
        <span>this device only</span>
      </div>

      {/* Horizontal rule */}
      <div className="h-rule" />

      {/* Center content */}
      <div className="title-block">
        <h1 className="title-text">NIGHTSHADE</h1>
        <div className="title-divider" />
        <p className="title-tagline">
          {view === 'login'
            ? 'Sign in to continue your descent'
            : 'Create an account to begin your journey'}
        </p>
      </div>

      {/* Form card */}
      <div className="form-card">
        {view === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              required
              autoComplete="email"
              className="input-field"
            />
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              required
              minLength={6}
              autoComplete="current-password"
              className="input-field"
            />
            {errorMsg && (
              <div className="error-box">{errorMsg}</div>
            )}
            <button
              disabled={loading}
              type="submit"
              className="btn-primary"
            >
              {loading ? 'Entering...' : 'Enter Dungeon'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              required
              autoComplete="email"
              className="input-field"
            />
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              required
              minLength={6}
              autoComplete="new-password"
              className="input-field"
            />
            {errorMsg && (
              <div className="error-box">{errorMsg}</div>
            )}
            <button
              disabled={loading}
              type="submit"
              className="btn-primary"
            >
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>
        )}

        <div className="form-footer">
          <button
            onClick={() => { setView(view === 'login' ? 'register' : 'login'); setErrorMsg(''); }}
            className="text-link"
          >
            {view === 'login'
              ? "Don't have an account? Create one"
              : 'Already have an account? Log in'}
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="bottom-bar">
        <div className="bottom-left">
          Caps Wars — Remixed
        </div>
        <div className="bottom-center" />
        <div className="bottom-right">
          Tip: Use landscape on mobile
        </div>
      </div>
    </div>
  )
}
