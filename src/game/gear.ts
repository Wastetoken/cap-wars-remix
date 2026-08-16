// ============================================================================
// Gear — run-scoped loot dropped by elites and bosses. Auto-equips on
// pickup, stacks for the rest of the run, lost on death. Rarity drives both
// the stat roll and the visuals (drop glow, weapon aura, HUD chip).
// ============================================================================

export type GearSlot = 'weapon' | 'armor' | 'boots' | 'trinket'
export type GearRarity = 'common' | 'rare' | 'epic' | 'legendary'

export type GearPiece = {
  id: number
  slot: GearSlot
  rarity: GearRarity
  /** Display name, e.g. "Epic Warblade" */
  name: string
  /** One-line stat summary for the pickup announcement */
  statLine: string
  damagePct: number
  hpFlat: number
  speedPct: number
  dashCdPct: number
  /** Crit chance % — trinkets only, so building crit is a real slot choice */
  critPct: number
}

export const RARITY_COLORS: Record<GearRarity, string> = {
  common: '#e5e7eb',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fbbf24',
}

/** Stat scale per rarity tier */
const RARITY_MULT: Record<GearRarity, number> = {
  common: 1,
  rare: 1.6,
  epic: 2.4,
  legendary: 3.6,
}

const RARITY_NAMES: Record<GearRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
}

const SLOT_DEFS: Record<
  GearSlot,
  { names: string[]; characterNames?: Record<string, string[]>; roll: (m: number) => Pick<GearPiece, 'damagePct' | 'hpFlat' | 'speedPct' | 'dashCdPct' | 'critPct' | 'statLine'> }
> = {
  weapon: {
    names: ['Warblade', 'Hexbrand', 'Kingslayer', 'Oathkeeper'],
    roll: (m) => {
      const damagePct = Math.round((8 + Math.random() * 6) * m)
      return { damagePct, hpFlat: 0, speedPct: 0, dashCdPct: 0, critPct: 0, statLine: `+${damagePct}% damage` }
    },
  },
  armor: {
    names: [
      'Bulwark Plate',
      'Gravemail',
      'Aegis of Dawn',
      'Stoneheart',
      'Barkhide Raiment',
      'Ornamental Oath',
      'Lavaweave Vestments',
      'Pinebound Leathers',
    ],
    characterNames: {
      knight: ['Ornamental Oath', 'Aegis of Dawn', 'Bulwark Plate', 'Stoneheart'],
      barbarian: ['Barkhide Raiment', 'Stoneheart', 'Gravemail', 'Bulwark Plate'],
      mage: ['Lavaweave Vestments', 'Aegis of Dawn', 'Gravemail', 'Stoneheart'],
      rogue: ['Pinebound Leathers', 'Stoneheart', 'Gravemail', 'Bulwark Plate'],
    },
    roll: (m) => {
      const hpFlat = Math.round((25 + Math.random() * 15) * m)
      return { damagePct: 0, hpFlat, speedPct: 0, dashCdPct: 0, critPct: 0, statLine: `+${hpFlat} max health` }
    },
  },
  boots: {
    names: ['Swiftstriders', 'Windrunners', 'Ashtreaders', 'Ghoststep'],
    roll: (m) => {
      const speedPct = Math.round((5 + Math.random() * 4) * m)
      return { damagePct: 0, hpFlat: 0, speedPct, dashCdPct: 0, critPct: 0, statLine: `+${speedPct}% move speed` }
    },
  },
  trinket: {
    names: ['Fate Charm', 'Void Locket', 'Ember Sigil', 'Moon Talisman'],
    roll: (m) => {
      const dashCdPct = Math.round((8 + Math.random() * 6) * m)
      // Trinkets are THE crit slot: common 5–8% … legendary 18–29%
      const critPct = Math.round((5 + Math.random() * 3) * m)
      return { damagePct: 0, hpFlat: 0, speedPct: 0, dashCdPct, critPct, statLine: `-${dashCdPct}% dash cooldown · +${critPct}% crit` }
    },
  },
}

const SLOTS: GearSlot[] = ['weapon', 'armor', 'boots', 'trinket']

const rollRarity = (luck: number): GearRarity => {
  // luck shifts the table upward (bosses roll with luck)
  const r = Math.random() - luck
  if (r < 0.04) return 'legendary'
  if (r < 0.17) return 'epic'
  if (r < 0.45) return 'rare'
  return 'common'
}

/**
 * Roll a gear drop for a slain mob. `souls` is the mob's soul value — used
 * as the tier proxy. Returns null when nothing drops.
 *   trash (souls < 4): 7%    elite (4–9): 16%    boss (60): 100% + luck
 */
export const rollGearDrop = (id: number, souls: number, characterId?: string): GearPiece | null => {
  const isBoss = souls >= 60
  const isElite = souls >= 4
  const chance = isBoss ? 1 : isElite ? 0.16 : 0.07
  if (Math.random() >= chance) return null

  const luck = isBoss ? 0.18 : isElite ? 0.05 : 0
  const rarity = rollRarity(luck)
  const slot = SLOTS[Math.floor(Math.random() * SLOTS.length)]
  const def = SLOT_DEFS[slot]
  const rolled = def.roll(RARITY_MULT[rarity])
  const namePool = characterId && def.characterNames?.[characterId] ? def.characterNames[characterId] : def.names
  const rawName = namePool[Math.floor(Math.random() * namePool.length)]
  const isFullArmor = slot === 'armor' && rawName.includes('-full-')
  const isCv = rawName.includes('-cv')
  const isCs = rawName.includes('-cs')
  const finalRarity = isFullArmor ? 'legendary' : isCv ? 'epic' : isCs ? 'legendary' : rarity
  const name = `${RARITY_NAMES[finalRarity]} ${rawName}`

  return { id, slot, rarity: finalRarity, name, ...rolled }
}

// ---------------------------------------------------------------------------
// Aggregate multipliers over the run's collected gear
// ---------------------------------------------------------------------------

export const gearDamageMult = (gear: GearPiece[]) =>
  gear.reduce((m, g) => m * (1 + g.damagePct / 100), 1)

export const gearSpeedMult = (gear: GearPiece[]) =>
  gear.reduce((m, g) => m * (1 + g.speedPct / 100), 1)

/** Multiplies cooldowns — gear reduces them */
export const gearDashCdMult = (gear: GearPiece[]) =>
  gear.reduce((m, g) => m * (1 - g.dashCdPct / 100), 1)

export const gearHpFlat = (gear: GearPiece[]) => gear.reduce((s, g) => s + g.hpFlat, 0)

/** Total crit chance as a fraction — diminishing returns: each trinket's
 *  crit% is a separate independent roll (1 − ∏(1 − p)), so stacking always
 *  helps but there's no hard cap wall to hit */
export const gearCritChance = (gear: GearPiece[]) =>
  1 - gear.reduce((m, g) => m * (1 - g.critPct / 100), 1)

const RARITY_RANK: Record<GearRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }

/** Best rarity collected this run — drives the weapon aura */
export const bestGearRarity = (gear: GearPiece[]): GearRarity | null =>
  gear.length === 0
    ? null
    : gear.reduce((a, b) => (RARITY_RANK[b.rarity] > RARITY_RANK[a.rarity] ? b : a)).rarity

// ---------------------------------------------------------------------------
// Worn visuals — gear you can SEE on the character
// ---------------------------------------------------------------------------
//
// Weapon & armor pieces swap KayKit attachments on the model (attachment
// names verified against the class hide lists). Boots get a ward ring at
// the feet, trinkets an orbiting charm — those live in Caps.tsx.

export type GearVisual = {
  /** Attachment names to force visible */
  show: string[]
  /** Attachment names to force hidden (e.g. base weapon when upgraded) */
  hide: string[]
  /** The node that should carry the sword aura material */
  weaponNode: string | null
  /** Ward ring color at the feet (boots, or mage's armor ward) */
  wardColor: string | null
  /** Orbiting trinket charm color */
  trinketColor: string | null
  /** Full armor override meshes (helmet/chest/arms/legs/cape) */
  fullArmor: string | null
}

const rarityRank = (r: GearRarity) => RARITY_RANK[r]

const bestInSlot = (gear: GearPiece[], slot: GearSlot): GearPiece | null =>
  gear
    .filter((g) => g.slot === slot)
    .reduce<GearPiece | null>(
      (best, g) => (best === null || rarityRank(g.rarity) > rarityRank(best.rarity) ? g : best),
      null
    )

/** Per-class attachment loadout for a given weapon/armor rarity */
const WEAPON_ATTACHMENTS: Record<
  string,
  Partial<Record<GearRarity, { show: string[]; hide: string[]; node: string }>>
> = {
  knight: {
    common: { show: ['1H_Sword'], hide: [], node: '1H_Sword' },
    rare: { show: ['1H_Sword', '1H_Sword_Offhand'], hide: [], node: '1H_Sword' },
    epic: { show: ['2H_Sword'], hide: ['1H_Sword', '1H_Sword_Offhand'], node: '2H_Sword' },
    legendary: { show: ['2H_Sword'], hide: ['1H_Sword', '1H_Sword_Offhand'], node: '2H_Sword' },
  },
  barbarian: {
    rare: { show: ['1H_Axe_Offhand'], hide: [], node: '2H_Axe' },
    epic: { show: ['1H_Axe_Offhand'], hide: [], node: '2H_Axe' },
    legendary: { show: ['1H_Axe_Offhand'], hide: [], node: '2H_Axe' },
  },
  mage: {
    rare: { show: ['Spellbook'], hide: [], node: '2H_Staff' },
    epic: { show: ['Spellbook_open'], hide: ['Spellbook'], node: '2H_Staff' },
    legendary: { show: ['Spellbook_open'], hide: ['Spellbook'], node: '2H_Staff' },
  },
  // rogue: dual knives already — the aura carries the upgrade
}

const FULL_ARMOR_GLBS: Record<string, string> = {
  'barkhide raiment': '/items/barbarian-full-bark.glb',
  'ornamental oath': '/items/knight-armor-full-ornamental.glb',
  'lavaweave vestments': '/items/mage-full-lava.glb',
  'pinebound leathers': '/items/rogue-full-pine.glb',
}

const FULL_ARMOR_ALIASES: Record<string, string> = {
  'barkhide': 'barkhide raiment',
  'ornamental': 'ornamental oath',
  'lavaweave': 'lavaweave vestments',
  'pinebound': 'pinebound leathers',
}

export const resolveFullArmorGlb = (name: string): string | null => {
  const lower = name.toLowerCase()
  for (const [alias, key] of Object.entries(FULL_ARMOR_ALIASES)) {
    if (lower.includes(alias)) {
      return FULL_ARMOR_GLBS[key] ?? null
    }
  }
  return null
}

const ARMOR_ATTACHMENTS: Record<string, Partial<Record<GearRarity, { show: string[] }>>> = {
  knight: {
    common: { show: ['Round_Shield'] },
    rare: { show: ['Rectangle_Shield'] },
    epic: { show: ['Spike_Shield'] },
    legendary: { show: ['Badge_Shield'] },
  },
  barbarian: {
    common: { show: ['Barbarian_Round_Shield'] },
    rare: { show: ['Barbarian_Round_Shield'] },
    epic: { show: ['Barbarian_Round_Shield'] },
    legendary: { show: ['Barbarian_Round_Shield'] },
  },
  rogue: {
    common: { show: ['Throwable'] },
    rare: { show: ['Throwable'] },
    epic: { show: ['Throwable'] },
    legendary: { show: ['Throwable'] },
  },
  // mage: no shield attachment — armor shows as a ward ring instead
}

const KNIGHT_SHIELDS = ['Round_Shield', 'Rectangle_Shield', 'Spike_Shield', 'Badge_Shield', 'Square_Shield']

/** Every attachment gear can touch — used to reset worn state before re-applying */
export const GEAR_ATTACHMENT_NAMES = [
  '1H_Sword',
  '1H_Sword_Offhand',
  '2H_Sword',
  '1H_Axe_Offhand',
  'Spellbook',
  'Spellbook_open',
  ...KNIGHT_SHIELDS,
  'Barbarian_Round_Shield',
  'Throwable',
]

/** Resolve everything the model should wear for the current gear */
export const computeGearVisual = (
  characterId: string,
  gear: GearPiece[],
  baseWeapon: string
): GearVisual => {
  const show: string[] = []
  const hide: string[] = []
  let weaponNode: string | null = null
  let wardColor: string | null = null
  let trinketColor: string | null = null
  let fullArmor: string | null = null

  const weapon = bestInSlot(gear, 'weapon')
  if (weapon) {
    const table = WEAPON_ATTACHMENTS[characterId]?.[weapon.rarity]
    if (table) {
      show.push(...table.show)
      hide.push(...table.hide)
      weaponNode = table.node
    }
    // A weapon piece always at least tints the aura on the base weapon
    if (!weaponNode) weaponNode = baseWeapon
  }

  const armor = bestInSlot(gear, 'armor')
  if (armor) {
    const fullArmorGlb = resolveFullArmorGlb(armor.name)
    if (fullArmorGlb) {
      fullArmor = fullArmorGlb
      if (characterId === 'knight') {
        hide.push(...KNIGHT_SHIELDS)
      } else if (characterId === 'barbarian') {
        hide.push('Barbarian_Round_Shield')
      }
    } else {
      const table = ARMOR_ATTACHMENTS[characterId]?.[armor.rarity]
      if (table) {
        // Knight shields are tiered — hide the lower tiers
        if (characterId === 'knight') hide.push(...KNIGHT_SHIELDS.filter((s) => !table.show.includes(s)))
        show.push(...table.show)
      } else {
        // No attachment for this class — armor becomes a ward ring
        wardColor = RARITY_COLORS[armor.rarity]
      }
    }
  } else if (characterId === 'knight') {
    show.push('Round_Shield')
  } else if (characterId === 'barbarian') {
    show.push('Barbarian_Round_Shield')
  }

  const boots = bestInSlot(gear, 'boots')
  if (boots) {
    // Best of boots / armor-ward wins the feet ring
    wardColor = RARITY_COLORS[boots.rarity]
  }

  const trinket = bestInSlot(gear, 'trinket')
  if (trinket) trinketColor = RARITY_COLORS[trinket.rarity]

  return { show, hide, weaponNode, wardColor, trinketColor, fullArmor }
}
