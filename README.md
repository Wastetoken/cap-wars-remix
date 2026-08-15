# Caps Wars — dungeon action game

A God-of-War-flavored wave-combat game built on React Three Fiber v10 (alpha) + three.js WebGPU/WebGL2. Fight through 3 dungeon levels of KayKit mobs, loot their souls, unlock abilities and build your skill tree — then kill the King.

## Getting started

```bash
npm install --legacy-peer-deps
npm run dev
```

Other scripts:

```bash
npm run build
npm run preview
npm run lint
```

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Left click | Sword combo (1H chop / slice) |
| Hold left click | Charge attack (glow → spin) |
| `Shift` | Dash / dodge |
| `1` | **Whirlwind** — 360° AoE spin (30 rage) |
| `2` | **Ground Slam** — leaping AoE slam (40 rage) |
| `3` | **Fury** — faster, harder swings for 8s (50 rage) |
| `Tab` or `K` | Talent tree |
| `Esc` | Close overlay / pause / resume |

## Menus & flow

- **Main menu** — the game boots into a menu over the live arena: Enter the Dungeon, Talents, Settings. Shows your player level, lifetime souls and unspent talent points.
- **Pause** — `Esc` freezes the world (AI, bullets, loot, damage) and opens the pause menu: Resume, Talents, Settings, Quit to Menu.
- **Settings** — camera shake (on/off), shadow quality (high/low/off) and particle density (full/reduced). All applied live and persisted separately from your save.
- **Death / victory** — death offers respawn or main menu; killing the King offers a new run or the menu.

## Game systems

- **3 dungeon levels** (`src/game/levels.ts`): Dungeon Hall → Sunken Crypt → Throne of the King, each with its own lighting/mood and 3 waves; the last ends in a **boss fight** against the King (giant Barbarian, 1400 HP).
- **4 mob types** (`src/game/mobs.ts`): Mage (ranged staff bolts), Rogue (fast dual-knife melee), Barbarian (heavy 2H axe), King (boss) — own model, stats, AI and soul value each.
- **Leveling** (`src/game/progression.ts`): souls are XP. Level-ups grant **1 talent point**, a 25% heal, a full rage bar, a gold shockwave and an announcement. Thresholds scale per level.
- **Talent tree** (`src/game/skills.ts`, press `Tab`): three branches with prerequisites — **Warrior** (Might → Whirlwind), **Fury** (Rageflow → Fury / Swift), **Guardian** (Vitality → Lifesteal / Ground Slam). Each rank costs 1 point; buying rank N of a talent requires rank N of its parent. Progress persists in localStorage (save v2 — v1 saves migrate automatically).
- **Loot orbs** (`src/components/pickups.tsx`): slain mobs burst into red **soul** orbs (XP), green **health** orbs and blue **rage** orbs that scatter then magnet to the player.
- **Abilities** (`src/game/abilities.ts`): Whirlwind / Ground Slam / Fury, unlocked and upgraded (rank 2: +40% radius & damage / +4s duration) in the talent tree. Rage is earned by hitting enemies.
- **Combat feel**: per-instance emissive hit flash, knockback, stun, camera shake, slam shockwave rings, sword glow while charging/fury, enemy health bars.
- **Flow**: clear all waves → exit portal opens → descend. Death restarts the run at level 1; level, talents and souls are kept.

## Tech notes

The v10 alpha APIs below are from the official features doc: [v10 New Features](https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/v10-features.md)

Other scripts:

```bash
npm run build
npm run preview
npm run lint
```

## Project structure

- `src/main.tsx` boots React and mounts the canvas.
- `src/App.tsx` is the root scene.
- `src/components/*` holds reusable scene components.
- `public/` contains static assets.

## Using React Three Fiber v10

The starter is compatible with the following v10 features and APIs. These are opt‑in examples you can copy into your scene components.

### Camera scene parenting

In v10, the default camera is automatically attached to the scene if it has no parent. This means camera‑attached UI (HUDs, reticles, cockpit meshes) will render correctly without extra plumbing. [v10 New Features](https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/v10-features.md)

```tsx
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

export function HUD() {
  const { camera } = useThree()
  const group = useRef<THREE.Group>(null)

  useEffect(() => {
    if (!group.current) return
    camera.add(group.current)
    return () => camera.remove(group.current)
  }, [camera])

  return (
    <group ref={group} position={[0, 0, -2]}>
      <mesh>
        <planeGeometry args={[0.5, 0.1]} />
        <meshBasicMaterial color="lime" transparent opacity={0.8} />
      </mesh>
    </group>
  )
}
```

### `useRenderTarget` for WebGL + WebGPU

v10 introduces `useRenderTarget`, which returns the correct render target class for the active renderer. This keeps your post‑processing and portal effects compatible across WebGL and WebGPU builds. [v10 New Features](https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/v10-features.md)

```tsx
import { useFrame, useRenderTarget } from '@react-three/fiber'

function Portal() {
  const fbo = useRenderTarget(512, 512, { samples: 4 })

  useFrame(({ gl, scene, camera }) => {
    gl.setRenderTarget(fbo)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
  })

  return (
    <mesh>
      <planeGeometry />
      <meshBasicMaterial map={fbo.texture} />
    </mesh>
  )
}
```

### Visibility events

v10 adds visibility events that fire on state changes, not every frame. Use them to pause animations, stream assets, or run analytics. [v10 New Features](https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/v10-features.md)

```tsx
function FrustumAware() {
  return (
    <mesh
      onFramed={(inView) => {
        console.log(inView ? 'entered view' : 'left view')
      }}>
      <boxGeometry />
      <meshStandardMaterial />
    </mesh>
  )
}
```

### Camera frustum access

The root state exposes a synchronized `THREE.Frustum`, useful for custom culling or LOD logic. [v10 New Features](https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/v10-features.md)

```tsx
import { useFrame, useThree } from '@react-three/fiber'

function VisibilityController({ objects }: { objects: THREE.Object3D[] }) {
  const { frustum } = useThree()

  useFrame(() => {
    for (const obj of objects) {
      obj.visible = frustum.intersectsObject(obj)
    }
  })

  return null
}
```

## Notes

- This starter targets `@react-three/fiber` `^10.0.0-alpha.1` and `three` `^0.182.0`.
- For WebGPU experiments, use the `@react-three/fiber/webgpu` entry in your imports if you want to force WebGPU builds.

## Credits

React Three Fiber by pmndrs. See the v10 features doc for the complete list of additions and migration guidance. [v10 New Features](https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/v10-features.md)

## Player character

The player is the **Knight**, mobs are the **Mage / Rogue / Barbarian** (the boss is a scaled Barbarian), and the arena is built from the **KayKit Dungeon Remastered** pack — all by Kay Lousberg (CC0):

- `public/character/Knight.glb` — player, 75 embedded animations ([Adventurers pack](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0))
- `public/character/Mage.glb`, `Rogue.glb`, `Barbarian.glb` — mobs, 75-76 embedded animations each (same pack)
- `public/arena/*.glb` — modular arena pieces ([Dungeon Remastered](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0))

Player animation mapping in `src/caps/types.ts`:

| Game action | KayKit clip |
| --- | --- |
| stance / idle | `Idle` |
| run (locomotion) | `Running_A` |
| attack 1 / 2 | `1H_Melee_Attack_Chop` / `1H_Melee_Attack_Slice_Diagonal` |
| spin attack | `2H_Melee_Attack_Spin` |
| dash attack | `1H_Melee_Attack_Stab` |
| parry | `Block` / `Block_Attack` |

Unused weapon/shield attachments that ship inside the GLB are hidden at load; the 1H sword keeps the charge-glow node material and drives the hitbox + spark emitters.

## Enemies & arena

Mobs (`src/ecs/enemy/Enemy.tsx`) are driven by their mob definition: ranged mages carry the 2H staff (staff tip anchors the spell-charge VFX and bullet spawn), rogues dual-wield knives, barbarians and the King swing a 2H axe. Melee AI chases and holds at weapon range before swinging; ranged AI strafes around the player at its ideal distance. Hit reactions play `Hit_A`/`Hit_B` with a per-instance emissive flash, locomotion crossfades `Idle` ↔ `Running_A`, and range attacks play `Spellcast_Shoot`.

The arena (`src/components/arena.tsx`) is a 28×28 dungeon hall: 7×7 large floor tiles (stone in level 1, dirt in the crypt), wall ring with arched sections, corner pieces, pillars, wall torches, banners and props. `ARENA_BOUND` (13, exported from `src/constants.ts`) clamps both player movement/dashes and enemy movement so nobody walks through walls.

## Architecture

- `src/game/` — pure game data + logic: `mobs.ts`, `levels.ts`, `skills.ts`, `abilities.ts`, `useLevelManager.ts` (wave/level orchestration)
- `src/store.ts` — zustand game state: HP/rage/souls/skills/cooldowns/level flow
- `src/ecs/enemy/` — koota ECS: traits (data), actions (spawn/damage), systems (AI + movement), `Enemy.tsx` (rendering)
- `src/components/` — arena, lights (per-level mood), bullets, pickups (loot orbs), portal, shockwave rings, particles (r3f-vfx), HUD
- `src/collision/` — circle-collider registry; `dealDamageInArea` powers sword arcs and ability AoE
- All combat events flow through the `eventBus` in `src/constants.ts`
