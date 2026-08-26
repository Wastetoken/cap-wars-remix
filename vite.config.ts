import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import fs from 'fs'

// Dev-only diagnostics sink: the game POSTs renderer/scene state here when an
// error boundary trips, when it detects a dead renderer mid-play, or on F9.
// Appended to diag.log in the project root for post-mortem analysis.
const diagSink = (): Plugin => ({
  name: 'diag-sink',
  configureServer(server) {
    server.middlewares.use('/__diag', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        try {
          fs.appendFileSync(path.resolve(__dirname, 'diag.log'), `${body}\n---\n`)
        } catch {
          /* never fail the request over logging */
        }
        res.statusCode = 204
        res.end()
      })
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), diagSink()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''),
  },
  server: {
    host: true,
    allowedHosts: true,
    watch: {
      // Native chokidar events keep dying on this Windows machine (stale
      // modules served after edits). Polling is slightly heavier but reliable.
      usePolling: true,
      interval: 300,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // Only scan the real app entry.
    entries: ['index.html'],
  },
})
