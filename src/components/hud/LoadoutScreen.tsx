import { useGameStore } from '@/store'
import { CHARACTERS } from '@/game/characters'
import {
  gearDamageMult,
  gearSpeedMult,
  gearDashCdMult,
  RARITY_COLORS,
  type GearPiece,
  type GearSlot,
} from '@/game/gear'
import { soulsProgress } from '@/game/progression'
import { cycleLabel } from '@/game/cycle'
import { CharacterPreviewCanvas } from './CharacterPreview'

// ============================================================================
// LoadoutScreen — WoW-style character sheet: live 3D model wearing the run's
// gear, rarity-bordered slot cards flanking it, aggregate stats panel.
// ============================================================================

const SLOTS: GearSlot[] = ['weapon', 'armor', 'boots', 'trinket']
const SLOT_LABELS: Record<GearSlot, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  boots: 'Boots',
  trinket: 'Trinket',
}

const bestInSlot = (gear: GearPiece[], slot: GearSlot): GearPiece | null => {
  const rank = { common: 0, rare: 1, epic: 2, legendary: 3 } as const
  return gear
    .filter((g) => g.slot === slot)
    .reduce<GearPiece | null>(
      (best, g) => (best === null || rank[g.rarity] > rank[best.rarity] ? g : best),
      null
    )
}

// ---------------------------------------------------------------------------
// Slot card — rarity border, item name + stat line, count of extras
// ---------------------------------------------------------------------------

const SlotCard = ({ slot, gear }: { slot: GearSlot; gear: GearPiece[] }) => {
  const piece = bestInSlot(gear, slot)
  const extras = gear.filter((g) => g.slot === slot).length - 1

  return (
    <div
      className={`loadout-slot ${piece ? piece.rarity : 'empty'}`}
      style={piece ? { borderColor: RARITY_COLORS[piece.rarity] } : undefined}
    >
      <div className="loadout-slot-label">{SLOT_LABELS[slot]}</div>
      {piece ? (
        <>
          <div className="loadout-slot-name" style={{ color: RARITY_COLORS[piece.rarity] }}>
            {piece.name}
          </div>
          <div className="loadout-slot-stat">{piece.statLine}</div>
          {extras > 0 && <div className="loadout-slot-extras">+{extras} more stacked</div>}
        </>
      ) : (
        <div className="loadout-slot-empty">—</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stats panel — what the run's gear adds up to
// ---------------------------------------------------------------------------

const StatsPanel = () => {
  const gear = useGameStore((s) => s.gear)
  const souls = useGameStore((s) => s.souls)
  const playerMaxHealth = useGameStore((s) => s.playerMaxHealth)
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  const cycle = useGameStore((s) => s.cycle)

  const xp = soulsProgress(souls)
  const charDef = CHARACTERS[selectedCharacter]
  const dmg = gearDamageMult(gear)
  const spd = gearSpeedMult(gear)
  const cd = gearDashCdMult(gear)

  const rows: [string, string][] = [
    ['Damage', dmg > 1 ? `×${dmg.toFixed(2)}` : 'base'],
    ['Max health', `${playerMaxHealth}`],
    ['Move speed', spd > 1 ? `+${Math.round((spd - 1) * 100)}%` : 'base'],
    [`${charDef.mobility.name} cooldown`, cd < 1 ? `−${Math.round((1 - cd) * 100)}%` : 'base'],
    ['Level', `${xp.level}`],
    ['Souls', `${souls}`],
  ]
  if (cycle > 0) rows.push(['Cycle', cycleLabel(cycle)])

  return (
    <div className="loadout-stats">
      <div className="loadout-stats-title">Stats</div>
      {rows.map(([label, value]) => (
        <div className="loadout-stat-row" key={label}>
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const LoadoutScreen = () => {
  const setLoadoutOpen = useGameStore((s) => s.setLoadoutOpen)
  const gear = useGameStore((s) => s.gear)
  const selectedCharacter = useGameStore((s) => s.selectedCharacter)
  const touchMode = useGameStore((s) => s.touchMode)
  const charDef = CHARACTERS[selectedCharacter]

  return (
    <div className="overlay loadout-overlay">
      <div className="loadout-panel">
        <div className="loadout-header">
          <h2>{charDef.name} — Loadout</h2>
          <button className="hud-button small" onClick={() => setLoadoutOpen(false)}>
            Close{touchMode ? '' : ' (C)'}
          </button>
        </div>

        <div className="loadout-body">
          <div className="loadout-column">
            <SlotCard slot="weapon" gear={gear} />
            <SlotCard slot="armor" gear={gear} />
          </div>

          <CharacterPreviewCanvas className="loadout-canvas" />

          <div className="loadout-column">
            <SlotCard slot="boots" gear={gear} />
            <SlotCard slot="trinket" gear={gear} />
            <StatsPanel />
          </div>
        </div>

        <div className="loadout-footer">
          Gear drops from elites and bosses — it stacks for the run and is lost on death
        </div>
      </div>
    </div>
  )
}
