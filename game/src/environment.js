// Environment bands: the trench changes character as depth increases. The deep band
// tightens wreck spacing, strengthens currents, and makes salvage richer.

import { TRENCH } from './config.js';
import { clamp } from './mathx.js';

export const ENVIRONMENTS = [
  {
    id: 'upper-trench',
    label: 'UPPER TRENCH',
    minDepth: 0,
    currentScale: 1,
    wreckDensity: 1,
    salvageScale: 1,
    ventChance: 0,
    wellChance: 0,
    palette: 'teal',
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
    palette: 'violet',
  },
];

export function environmentForDepth(depthMetres) {
  return depthMetres >= ENVIRONMENTS[1].minDepth ? ENVIRONMENTS[1] : ENVIRONMENTS[0];
}

export function environmentForY(y) {
  return environmentForDepth(Math.max(0, y) / TRENCH.pxPerMetre);
}

export function spawnGap(environment, random) {
  const density = environment?.wreckDensity ?? 1;
  const base = 430 + random() * 270;
  return clamp(base / density, 280, 700);
}

export function tierForDepth(y, dive) {
  return clamp(Math.floor(y / 900 + dive * 0.5), 0, 3);
}

export function isDeepEnvironment(environment) {
  return environment?.id === 'black-shelf';
}

