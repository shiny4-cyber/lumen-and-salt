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
  floorY: 4600,
  pxPerMetre: 20,
};

export const PLAYER = {
  radius: 17,
  thrust: 1150,
  drag: 2.4,
  maxSpeed: 430,
  ballastRate: 0.62,
  /** Buoyancy pushes up when ballast is vented (0) and down when flooded (1). */
  buoyancy: 900,
  /** Extra downward pull per unit of carried cargo mass. */
  cargoSink: 46,
  /** How much cargo mass slows the horizontal thrust (1 = none, 0 = stopped). */
  cargoDrag: 0.06,
  hull: 100,
  oxygen: 100,
  /** Seconds a hit of invulnerability lasts, so one lure cannot chain-hit. */
  mercy: 1.15,
};

export const OXYGEN = {
  drain: 0.62,
  drainPerMetre: 0.0125,
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
  chaseSpeed: 122,
  /** The lamp cone wakes a lure this far away; the silent-propeller upgrade cuts it. */
  senseRange: 380,
  damage: 17,
  knockback: 240,
  /** A lure keeps chasing for this long after the lamp goes out. */
  memory: 2.4,
  glow: 26,
};

export const CURRENT = {
  bandHeight: 620,
  strength: 210,
  push: 340,
};

export const SALVAGE = {
  kinds: [
    { id: 'coil', label: 'copper coil', value: 30, mass: 1.0, colour: '#e08b3c', radius: 9 },
    { id: 'glass', label: 'amber glass', value: 55, mass: 1.4, colour: '#f2b33d', radius: 10 },
    { id: 'ingot', label: 'silver ingot', value: 95, mass: 2.2, colour: '#bfd7e6', radius: 11 },
    { id: 'relic', label: 'trench relic', value: 180, mass: 2.8, colour: '#7ef0c8', radius: 12 },
  ],
  /** Which kinds a wreck of each depth tier carries, with weights. */
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
export const CONTRACT_TARGET = 1500;

export const DIVE = {
  /** Wreck depth tiers start this far down and step by this much per dive. */
  tierDepth: 900,
  tierBonus: 420,
  /** Seconds of air warning: the HUD turns amber below this fraction. */
  lowOxygen: 0.25,
  lowHull: 0.3,
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
  contract: 'contract: surface with $1,500 banked',
  paused: 'PAUSED',
  resume: 'P or SPACE to resume',
  surfaced: 'SURFACED',
  chooseUpgrade: 'choose one refit',
};
