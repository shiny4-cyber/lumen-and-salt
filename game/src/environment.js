// Environment bands: the trench changes character with depth. Each band owns its water
// palette, its hazard mix, its wreck density, its current strength and its salvage table.
// Nothing here touches the DOM; the renderer reads the palette it names.

import { TRENCH } from './config.js';
import { clamp } from './mathx.js';

export const BANDS = [
  {
    id: 'upper-trench',
    label: 'UPPER TRENCH',
    minDepth: 0,
    currentScale: 1,
    wreckDensity: 1,
    salvageScale: 1,
    ventChance: 0,
    wellChance: 0,
    eliteChance: 0,
    palette: {
      tint: null,
      accent: '#6ff0d0',
      haze: 'rgba(12, 74, 88, 0.10)',
      sun: 1,
    },
    salvageTable: ['coil', 'coil', 'coil', 'glass', 'glass', 'ingot'],
  },
  {
    id: 'black-shelf',
    label: 'BLACK SHELF',
    minDepth: 75,
    currentScale: 1.55,
    wreckDensity: 1.42,
    salvageScale: 1.34,
    ventChance: 0.72,
    wellChance: 0.58,
    eliteChance: 0,
    palette: {
      tint: 'rgba(66, 34, 96, 0.13)',
      accent: '#c3a6ff',
      haze: 'rgba(72, 40, 96, 0.14)',
      sun: 0.25,
    },
    salvageTable: ['glass', 'ingot', 'ingot', 'relic', 'pearl', 'obsidian'],
  },
  {
    id: 'brine-hollow',
    label: 'BRINE HOLLOW',
    minDepth: 150,
    currentScale: 1.9,
    wreckDensity: 1.75,
    salvageScale: 1.8,
    ventChance: 0.85,
    wellChance: 0.8,
    eliteChance: 0.6,
    palette: {
      tint: 'rgba(96, 52, 26, 0.11)',
      accent: '#ffb060',
      haze: 'rgba(96, 60, 30, 0.10)',
      sun: 0,
    },
    salvageTable: ['bloom', 'obsidian', 'obsidian', 'bell', 'bell', 'relic'],
  },
];

/** Kept for callers that used the old name. */
export const ENVIRONMENTS = BANDS;

export function bandIndexForDepth(depthMetres) {
  if (depthMetres >= BANDS[2].minDepth) return 2;
  if (depthMetres >= BANDS[1].minDepth) return 1;
  return 0;
}

export function environmentForDepth(depthMetres) {
  return BANDS[bandIndexForDepth(depthMetres)];
}

export function environmentForY(y) {
  return environmentForDepth(Math.max(0, y) / TRENCH.pxPerMetre);
}

/** Wreck spacing for a band: denser water puts wrecks closer together. */
export function spawnGap(environment, random) {
  const density = environment?.wreckDensity ?? 1;
  const base = 430 + random() * 270;
  return clamp(base / density, 270, 720);
}

export function tierForDepth(y, dive) {
  return clamp(Math.floor(y / 900 + dive * 0.5), 0, 3);
}

export function isDeepEnvironment(environment) {
  return environment?.id === 'brine-hollow';
}
