import { useState } from 'react'
import { useGameStore } from '@/store'
import { supabase } from '@/supabaseClient'
import { fetchCloudSave } from '@/game/skills'
import loadingBgUrl from '@/Loading 2.png'

export const LoginScreen = () => {
  const [view, setView] = useState<'login' | 'register'>('register')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Form states
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const setGamePhase = useGameStore((s) => s.setGamePhase)
  const setAuthUser = useGameStore((s) => s.setAuthUser)
  const loadCloudSave = useGameStore((s) => s.loadCloudSave)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    
    // Create the auth user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username,
        }
      }
    })

    if (error) {
      setErrorMsg(error.message)
    } else {
      if (data.user) {
        setAuthUser(data.user)
        const cloudSave = await fetchCloudSave(data.user.id)
        if (cloudSave) {
          loadCloudSave(cloudSave)
        }
        setGamePhase('menu')
      } else {
        setErrorMsg('Check your email to verify your account.')
      }
    }
    setLoading(false)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email: username, // For simplicity, we assume they use email to login here as requested by default supabase auth
      password,
    })

    if (error) {
      setErrorMsg(error.message)
    } else if (data.user) {
      setAuthUser(data.user)
      const cloudSave = await fetchCloudSave(data.user.id)
      if (cloudSave) {
        loadCloudSave(cloudSave)
      }
      setGamePhase('menu')
    }
    setLoading(false)
  }

  const handleGuest = () => {
    // Continue without an account
    setAuthUser(null)
    setGamePhase('menu')
  }

  return (
    <div className="font-body text-parchment flex items-center justify-center min-h-screen p-4 bg-void fixed inset-0 z-50">
      <main className="rounded-2xl shadow-2xl shadow-black/60 flex w-full max-w-5xl overflow-hidden bg-stone border border-stone-border">
        {/* Left panel: hero art from the dungeon encounter, with torch ambience */}
        <div className="hidden md:flex flex-1 flex-col p-8 relative">
          <div className="absolute inset-0 z-0">
            <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url("${loadingBgUrl}")` }}></div>
            {/* torch glow accents */}
            <div className="ember-glow absolute left-6 top-1/3 w-40 h-40 rounded-full bg-ember/20 blur-3xl"></div>
            <div className="ember-glow-delay absolute right-10 bottom-1/4 w-48 h-48 rounded-full bg-ember/15 blur-3xl"></div>
            {/* readability gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/40"></div>
          </div>

          <div className="relative z-10 flex flex-col h-full">
            <header className="flex justify-between items-center">
              <span className="font-display text-2xl tracking-[0.15em] text-parchment">NIGHTSHADE</span>
              <button onClick={handleGuest} className="bg-white/10 border border-white/15 text-xs py-1.5 px-3 rounded-full flex items-center gap-2 backdrop-blur-sm hover:bg-white/20 transition-colors">
                Play as Guest
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </header>

            <div className="mt-auto">
              <p className="text-xs uppercase tracking-[0.3em] text-spell/80 mb-3">The dungeon remembers</p>
              <h1 className="font-display text-3xl md:text-4xl leading-tight text-parchment">
                Your run carries<br/>between worlds.
              </h1>
              <p className="text-sm text-ash mt-4 max-w-xs">
                Create an account and your character, loot, and progress sync across desktop and mobile.
              </p>
            </div>
          </div>
        </div>

        {/* Right panel: forms */}
        <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center bg-stone-panel">
          
          {view === 'register' ? (
            <div id="register-section">
              <h2 className="font-display text-3xl font-semibold text-parchment">Create an account</h2>
              <p className="text-sm text-ash mt-2">Already have an account? <button onClick={() => { setView('login'); setErrorMsg(''); }} className="text-spell font-semibold hover:underline">Log in</button></p>
              <form onSubmit={handleRegister} className="mt-8 space-y-5">
                <input value={username} onChange={e => setUsername(e.target.value)} type="text" placeholder="Username" required className="spell-focus w-full bg-stone-input border border-stone-border rounded-lg py-3 px-4 text-parchment placeholder-ash outline-none transition-all" />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email for verification" required className="spell-focus w-full bg-stone-input border border-stone-border rounded-lg py-3 px-4 text-parchment placeholder-ash outline-none transition-all" />
                <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Enter your password" required className="spell-focus w-full bg-stone-input border border-stone-border rounded-lg py-3 px-4 text-parchment placeholder-ash outline-none transition-all" />
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="terms" required className="h-5 w-5 appearance-none border-2 border-ash rounded-md checked:bg-spell checked:border-transparent focus:outline-none" />
                  <label htmlFor="terms" className="text-sm text-ash">I agree to the <a href="#" className="text-spell hover:underline">Terms & Conditions</a></label>
                </div>
                {errorMsg && <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-center text-sm text-red-300">{errorMsg}</div>}
                <button disabled={loading} type="submit" className="cast-btn w-full bg-spell text-void font-bold py-3 rounded-lg hover:bg-spell/90 transition-all disabled:opacity-50">{loading ? 'Casting...' : 'Create account'}</button>
              </form>
            </div>
          ) : (
            <div id="login-section">
              <h2 className="font-display text-3xl font-semibold text-parchment">Log in to your account</h2>
              <p className="text-sm text-ash mt-2">Don't have an account? <button onClick={() => { setView('register'); setErrorMsg(''); }} className="text-spell font-semibold hover:underline">Create one</button></p>
              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <input value={username} onChange={e => setUsername(e.target.value)} type="text" placeholder="Email" required className="spell-focus w-full bg-stone-input border border-stone-border rounded-lg py-3 px-4 text-parchment placeholder-ash outline-none transition-all" />
                <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Enter your password" required className="spell-focus w-full bg-stone-input border border-stone-border rounded-lg py-3 px-4 text-parchment placeholder-ash outline-none transition-all" />
                <div className="flex justify-end"><a href="#" className="text-sm text-spell hover:underline">Forgot password?</a></div>
                {errorMsg && <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-center text-sm text-red-300">{errorMsg}</div>}
                <button disabled={loading} type="submit" className="cast-btn w-full bg-spell text-void font-bold py-3 rounded-lg hover:bg-spell/90 transition-all disabled:opacity-50">{loading ? 'Casting...' : 'Log in'}</button>
              </form>
            </div>
          )}

          {/* divider */}
          <div className="flex items-center my-8">
            <hr className="w-full border-stone-border" />
            <span className="px-4 text-sm text-ash">Or</span>
            <hr className="w-full border-stone-border" />
          </div>

          {/* Guest mode */}
          <div className="mt-2 pt-6 border-t border-stone-border">
            <button onClick={handleGuest} type="button" className="guest-link w-full text-center text-sm font-semibold text-ash hover:text-spell border border-transparent hover:border-stone-border rounded-lg py-2.5 transition-all">
              Continue without an account
            </button>
            <p className="text-xs text-ash/70 text-center mt-2 max-w-sm mx-auto">
              Guest progress stays on this device only. It won't sync to mobile, and it may be lost if you clear your browser data.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
