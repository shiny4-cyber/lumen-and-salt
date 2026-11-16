// LUMEN & SALT — every tuning number, colour and display string in one place.
// The playfield is a fixed 1280x720 logical area that the renderer scales to the
// window, so no rule anywhere else in the game depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step: 60 updates a second, whatever the display does. */
export const STEP = 1 / 60;

/** The flooded trench: a vertical column, y is depth in pixels, 0 is the surface. */
export const TRENCH = {
  width: 1600,
  surfaceY: -120,
  floorY: 7200,
  pxPerMetre: 30,
};

export const PLAYER = {
  radius: 17,
  thrust: 1150,
  drag: 2.4,
  maxSpeed: 430,
  ballastRate: 0.62,
  /** Buoyancy pushes up when ballast is vented (0) and down when flooded (1). */
  buoyancy: 1000,
  /** Extra downward pull per unit of carried cargo mass. */
  cargoSink: 46,
  /** How much cargo mass slows the horizontal thrust (1 = none, 0 = stopped). */
  cargoDrag: 0.06,
  hull: 100,
  oxygen: 112,
  /** Seconds a hit of invulnerability lasts, so one lure cannot chain-hit. */
  mercy: 1.4,
};

export const OXYGEN = {
  drain: 0.5,
  drainPerMetre: 0.008,
  /** Surfacing refills the tank; this is the reserve taken on top for a fresh dive. */
  breathOnSurface: 0,
};

export const GRAPPLE = {
  speed: 1550,
  reach: 560,
  /** Tether rest length is the attach distance, clamped to this band. */
  minRest: 110,
  maxRest: 540,
  spring: 10.5,
  maxPull: 1250,
  /** A tether stretched this far past its rest length snaps. */
  snapSlack: 250,
  /** How much of the pull the wreck feels: the wreck is heavy, so a little. */
  wreckShare: 0.18,
};

export const CUT = {
  range: 170,
  /** The default is the copper coil's cut time; every salvage class sets its own. */
  seconds: 1.35,
  /** Cutting shakes the hull; each finished cut costs the wreck one integrity. */
  hullShake: 3.5,
};

export const WRECK = {
  minGap: 430,
  maxGap: 700,
  /** Below this integrity a cut wreck starts to buckle and then collapses. */
  collapseDelay: 2.1,
  collapseRadius: 190,
  collapseDamage: 26,
  collapseShake: 22,
  driftSpeed: 16,
  driftRange: 55,
};

export const LURE = {
  radius: 14,
  speed: 44,
  chaseSpeed: 96,
  /** The lamp cone wakes a lure this far away; the silent-propeller upgrade cuts it. */
  senseRange: 300,
  damage: 12,
  knockback: 240,
  /** A lure keeps chasing for this long after the lamp goes out. */
  memory: 1.8,
  /** After a hit the lure recoils and sulks, so a pack cannot chain-hit the diver. */
  stun: 2.4,
  glow: 26,
};

/** The roaming elite: a glassmaw that charges down a telegraphed lane. */
export const ELITE = {
  radius: 26,
  prowlSpeed: 58,
  windup: 1.25,
  dashSpeed: 520,
  dashTime: 0.62,
  recover: 1.9,
  laneLength: 420,
  damage: 22,
  knockback: 320,
  senseRange: 520,
  /** How far its patrol wanders from its spawn point. */
  roam: 260,
};

/** The chorus: a stationary ring-singer with a swelling tell. */
export const CHORUS = {
  radius: 22,
  senseRange: 430,
  swell: 1.3,
  ring: 1.15,
  rest: 2.2,
  core: 26,
  maxRadius: 300,
  band: 26,
  damage: 16,
};

/** The sonar ping: a short reveal that also drowses every lure inside it. */
export const SONAR = {
  radius: 620,
  active: 2.6,
  cooldown: 9,
  /** How long a lure stays asleep after the ping ends. */
  drowse: 2.2,
};

/** Ascent pressure: venting hard is fast, and fast is a bend. */
export const PRESSURE = {
  safeRate: 165,
  bendRate: 0.9,
  recoverRate: 0.55,
  damageAbove: 0.55,
  damageRate: 9,
};

export const CONTRACTS = {
  count: 3,
  /** Cash paid when a contract closes, as a multiple of its goal's scale. */
  rewardScale: 1,
};

export const CURRENT = {
  bandHeight: 620,
  strength: 210,
  push: 340,
};

export const SALVAGE = {
  /** Eight classes: four from the first build, four for the deep water. */
  kinds: [
    { id: 'coil', label: 'copper coil', value: 19, mass: 1.0, cutTime: 1.35, colour: '#b7a184', radius: 9 },
    { id: 'glass', label: 'amber glass', value: 34, mass: 1.4, cutTime: 1.2, colour: '#e3d3a2', radius: 10 },
    { id: 'ingot', label: 'silver ingot', value: 56, mass: 2.2, cutTime: 1.6, colour: '#c3d7e4', radius: 11 },
    { id: 'relic', label: 'trench relic', value: 108, mass: 2.8, cutTime: 1.9, colour: '#8fe6cf', radius: 12 },
    { id: 'pearl', label: 'brine pearl', value: 47, mass: 0.7, cutTime: 0.85, colour: '#dff4ff', radius: 8 },
    { id: 'bloom', label: 'lumen bloom', value: 65, mass: 0.9, cutTime: 1.05, colour: '#9fe8b6', radius: 9 },
    { id: 'obsidian', label: 'obsidian shard', value: 84, mass: 3.2, cutTime: 2.45, colour: '#8f93bb', radius: 13 },
    { id: 'bell', label: 'drowned bell', value: 169, mass: 4.6, cutTime: 3.1, colour: '#e6d7b0', radius: 15 },
  ],
  defaultCutTime: 1.35,
  /** Fallback tables, by depth tier, for a wreck with no band table. */
  tiers: [
    ['coil', 'coil', 'coil', 'glass', 'glass', 'ingot'],
    ['coil', 'glass', 'glass', 'ingot', 'ingot', 'relic'],
    ['glass', 'ingot', 'ingot', 'ingot', 'relic', 'relic'],
    ['ingot', 'ingot', 'relic', 'relic', 'relic', 'relic'],
  ],
  /** Deeper tiers pay more for the same cut work. */
  tierValue: [1, 1.3, 1.7, 2.2],
};

/** The contract that ends the run in a win: surfacing with this much banked. */
export const CONTRACT_TARGET = 1800;

export const DIVE = {
  /** Wreck depth tiers start this far down and step by this much per dive. */
  tierDepth: 900,
  tierBonus: 420,
  /** Seconds of air warning: the HUD turns amber below this fraction. */
  lowOxygen: 0.25,
  lowHull: 0.3,
};

/** One colour per meaning, everywhere in the world and the HUD. */
export const SEMANTIC = {
  /** Anything the diver acts on: grapple line, target reticle, sonar reveals, contract marks. */
  objective: '#5ec8ff',
  /** Anything that hurts right now: live lures, vent blasts, well cores, charge lanes, rings. */
  hazard: '#ff5240',
  /** Something that is about to hurt: vent warning, well warning, elite windup, bend alert. */
  warn: '#ffb060',
  /** The diver's own gear: lamp, hull rim, HUD accents. */
  own: '#f6b45a',
  /** The bright edge every gameplay object carries against the dark water. */
  rim: '#e8fff8',
  /** Living threats: a third hue, so a hostile body never reads as a hazard line. */
  threat: '#ff9ad5',
  /** Money and value: neutral bright, so profit never borrows the hazard orange. */
  value: '#f4f7e6',
};

export const PALETTE = {
  abyss: '#03161a',
  deep: '#052229',
  mid: '#07303a',
  shallow: '#0a4150',
  surfaceGlow: '#1d6c7a',
  hull: '#2b3f47',
  hullLight: '#48626b',
  hullDark: '#141f25',
  amber: '#f6b45a',
  amberHot: '#ffd79a',
  lamp: 'rgba(255, 214, 150, 0.55)',
  bio: '#6ff0d0',
  bioDim: '#2f8f86',
  danger: '#ff6a52',
  silt: '#7fa7a3',
  ink: '#02100f',
  panel: 'rgba(3, 22, 26, 0.82)',
  panelEdge: 'rgba(120, 200, 195, 0.25)',
  text: '#e8f5f1',
  muted: '#8fb3b0',
  good: '#6ff0d0',
  warn: '#ffc266',
  bad: '#ff7a63',
};

export const FONT = {
  ui: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
  mono: '"Consolas", "DejaVu Sans Mono", monospace',
};

export const BEST_KEY = 'lumen-and-salt.best';
export const MUTE_KEY = 'lumen-and-salt.muted';

/** Every player-facing line, so the screenshot scenes and the loop say the same thing. */
export const TEXT = {
  title: 'LUMEN & SALT',
  subtitle: 'a tethered dive into the Halcyon Trench',
  start: 'press SPACE to dive',
  controls: [
    'A / D  lateral thrust',
    'W / S  vent and flood ballast',
    'hold LMB  fire the grapple',
    'hold E  cut salvage free',
    'F  lamp on or off      P  pause',
  ],
  contract: 'contract: surface with $1,800 banked',
  paused: 'PAUSED',
  resume: 'P or SPACE to resume',
  surfaced: 'SURFACED',
  chooseUpgrade: 'choose one refit',
};
