import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store'
import { supabase } from '@/supabaseClient'
import { fetchCloudSave } from '@/game/skills'
import loadingBgUrl from '@/Loading 2.png'
import { ErosionBackground } from '@/components/effects/ErosionBackground'

// ============================================================================
// LoginScreen — full-screen auth splash matching the reference layout:
// dark game background, top nav, centered title/form, side labels,
// corner frames, bottom bar. No particles. Supabase auth unchanged.
// ============================================================================

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
    <div className="login-splash">
      {/* Background: erosion particle effect */}
      <ErosionBackground theme="ember" fallbackImage={loadingBgUrl} />

      {/* Gradient overlay for readability */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/50 via-black/20 to-black/70" />

      {/* Corner frames */}
      <div className="frame-tl" />
      <div className="frame-br" />

      {/* Top bar */}
      <nav className="top-bar">
        <div className="logo">
          <span className="logo-dot" />
          CAPS WARS
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

      {/* Centered scrollable login body */}
      <div className="login-body">
        <div className="h-rule" />

        {/* Center title */}
        <div className="title-block">
          <h1 className="title-text">CAPS WARS</h1>
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
