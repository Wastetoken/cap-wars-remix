import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGameStore } from '@/store'
import { supabase } from '@/supabaseClient'
import { fetchCloudSave } from '@/game/skills'

// ============================================================================
// LoginScreen — full-screen auth with interactive Three.js ember background.
// Background is mounted only while login is visible and destroyed on exit.
// ============================================================================

const EMBER_COUNT = 120

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
  const mouseRef = useRef({ x: 0, y: 0 })

  // Three.js background — ember particles that drift and react to mouse
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

    // Ember particles
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(EMBER_COUNT * 3)
    const velocities: { x: number; y: number; z: number }[] = []

    for (let i = 0; i < EMBER_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2
      velocities.push({
        x: (Math.random() - 0.5) * 0.4,
        y: Math.random() * 0.5 + 0.2,
        z: (Math.random() - 0.5) * 0.2,
      })
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      size: 0.25,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      map: (() => {
        const canvas = document.createElement('canvas')
        canvas.width = 32
        canvas.height = 32
        const ctx = canvas.getContext('2d')!
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
        gradient.addColorStop(0, 'rgba(255,255,255,1)')
        gradient.addColorStop(0.2, 'rgba(255,180,100,0.9)')
        gradient.addColorStop(0.5, 'rgba(255,100,30,0.4)')
        gradient.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, 32, 32)
        const texture = new THREE.CanvasTexture(canvas)
        texture.needsUpdate = true
        return texture
      })(),
    })

    const points = new THREE.Points(geometry, material)
    scene.add(points)

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener('mousemove', handleMouseMove)

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
      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      for (let i = 0; i < EMBER_COUNT; i++) {
        const idx = i * 3
        pos[idx] += (velocities[i].x + mx * 0.3) * 0.02
        pos[idx + 1] += velocities[i].y * 0.02
        pos[idx + 2] += velocities[i].z * 0.02

        // Wrap around
        if (pos[idx + 1] > 6) pos[idx + 1] = -6
        if (Math.abs(pos[idx]) > 9) pos[idx] *= -0.9
      }

      points.geometry.attributes.position.needsUpdate = true
      points.rotation.y += 0.001
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) {
      setErrorMsg(error.message)
      setLevelLoading(false)
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
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      setErrorMsg(error.message)
      setLevelLoading(false)
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
  }

  const handleGuest = () => {
    setAuthUser(null)
    setLevelLoading(true)
    setGamePhase('menu')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Three.js ember background */}
      <div ref={canvasContainerRef} className="absolute inset-0 z-0" />

      {/* Dark overlay */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="rounded-2xl shadow-2xl shadow-black/60 border border-stone-border/50 bg-stone/90 backdrop-blur-xl p-8 md:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-parchment tracking-wider mb-2">
              NIGHTSHADE
            </h1>
            <p className="text-sm text-ash/80 tracking-wide">
              {view === 'login' ? 'Welcome back, adventurer' : 'Begin your journey'}
            </p>
          </div>

          {/* Form */}
          {view === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  placeholder="Email"
                  required
                  autoComplete="email"
                  className="w-full bg-stone-input border border-stone-border rounded-lg py-3 px-4 text-parchment placeholder-ash/50 outline-none transition-all focus:border-spell/60 focus:ring-1 focus:ring-spell/30"
                />
              </div>
              <div>
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type="password"
                  placeholder="Password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  className="w-full bg-stone-input border border-stone-border rounded-lg py-3 px-4 text-parchment placeholder-ash/50 outline-none transition-all focus:border-spell/60 focus:ring-1 focus:ring-spell/30"
                />
              </div>
              {errorMsg && (
                <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-center text-sm text-red-300">
                  {errorMsg}
                </div>
              )}
              <button
                disabled={loading}
                type="submit"
                className="w-full bg-spell text-void font-bold py-3.5 rounded-lg hover:bg-spell/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base tracking-wide"
              >
                {loading ? 'Entering...' : 'Enter Dungeon'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  placeholder="Email"
                  required
                  autoComplete="email"
                  className="w-full bg-stone-input border border-stone-border rounded-lg py-3 px-4 text-parchment placeholder-ash/50 outline-none transition-all focus:border-spell/60 focus:ring-1 focus:ring-spell/30"
                />
              </div>
              <div>
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type="password"
                  placeholder="Password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full bg-stone-input border border-stone-border rounded-lg py-3 px-4 text-parchment placeholder-ash/50 outline-none transition-all focus:border-spell/60 focus:ring-1 focus:ring-spell/30"
                />
              </div>
              {errorMsg && (
                <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-center text-sm text-red-300">
                  {errorMsg}
                </div>
              )}
              <button
                disabled={loading}
                type="submit"
                className="w-full bg-spell text-void font-bold py-3.5 rounded-lg hover:bg-spell/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base tracking-wide"
              >
                {loading ? 'Creating...' : 'Create Account'}
              </button>
            </form>
          )}

          {/* Toggle between login/register */}
          <div className="mt-6 text-center">
            <button
              onClick={() => { setView(view === 'login' ? 'register' : 'login'); setErrorMsg(''); }}
              className="text-sm text-ash hover:text-spell transition-colors underline underline-offset-4 decoration-stone-border hover:decoration-spell/50"
            >
              {view === 'login' ? "Don't have an account? Create one" : 'Already have an account? Log in'}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center my-6">
            <hr className="flex-1 border-stone-border/50" />
            <span className="px-4 text-xs text-ash/60 uppercase tracking-widest">or</span>
            <hr className="flex-1 border-stone-border/50" />
          </div>

          {/* Guest button */}
          <button
            onClick={handleGuest}
            type="button"
            className="w-full text-center text-sm font-semibold text-ash hover:text-parchment border border-stone-border/50 hover:border-ember/40 rounded-lg py-3 transition-all hover:bg-white/5"
          >
            Continue without an account
          </button>
          <p className="text-xs text-ash/50 text-center mt-3 leading-relaxed">
            Guest progress stays on this device only. It won't sync to mobile, and it may be lost if you clear your browser data.
          </p>
        </div>
      </div>
    </div>
  )
}
