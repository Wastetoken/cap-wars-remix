# Base44 Dev Environment

## What this is
Caps Wars — a dungeon action game built with Vite + React 19 + React Three Fiber v10 (alpha) + three.js WebGPU/WebGL2. Frontend-only; no backend or database.

## Running it
- `docker compose -f docker-compose.base44.yml up -d` brings up the Vite dev server on host port 3000 (container port 5173).
- Dependencies install at container startup via `npm install --legacy-peer-deps` (the `.npmrc` sets `legacy-peer-deps=true`; the R3F v10 alpha packages have peer-dep conflicts that require this).
- Live reload is on: Vite runs with `--host 0.0.0.0`, polling watch (chokidar `usePolling`) is enabled because bind mounts often miss native FS events.

## Vite config notes
- `vite.config.ts` sets `server.host: true` and `server.allowedHosts: true` so the preview's external hostname is accepted. Do not remove these or the preview will be blocked.
- A dev-only `/__diag` middleware logs renderer/scene diagnostics to `diag.log` on error boundaries / dead renderer / F9.

## Secrets
- Supabase (`@supabase/supabase-js`) is used for optional cloud auth/saves in `src/supabaseClient.ts`, `src/components/menu/LoginScreen.tsx`, and `src/game/skills.ts`. The client falls back to placeholder values, and the game persists saves to localStorage, so **no secrets are required to boot**. If cloud login/saves are wanted, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the config also accepts `NEXT_PUBLIC_*` variants).

## Verifying it works
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/` returns the HTML document.
- Logs should show `VITE v7.x ready` and `Network: http://<ip>:5173/`.
