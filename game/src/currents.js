// Current bands: generated per dive and sampled as an acceleration. Pure maths, no
// creature behaviour, so the hazard file keeps one job and this one keeps another.

import { CURRENT } from './config.js';

/** Current bands for a dive: alternating shove, drawn as streaks in the renderer. */
export function createCurrents(random, fromY, toY) {
  const bands = [];
  for (let y = fromY; y < toY; y += CURRENT.bandHeight) {
    const strength = CURRENT.strength * (0.55 + random() * 0.9);
    const vertical = random() < 0.35;
    const sign = random() < 0.5 ? -1 : 1;
    bands.push({
      y,
      height: CURRENT.bandHeight * (0.45 + random() * 0.5),
      x: sign,
      strength: vertical ? strength * 1.1 : strength,
      vertical,
      phase: random() * Math.PI * 2,
    });
  }
  return bands;
}

/** The band the diver is inside, or null. */
export function currentAt(bands, y) {
  for (const band of bands) {
    if (y >= band.y && y <= band.y + band.height) return band;
  }
  return null;
}

/** Current force on the diver, in acceleration units. */
export function currentForce(band, time) {
  if (!band) return { x: 0, y: 0 };
  const flutter = 0.75 + Math.sin(time * 1.7 + band.phase) * 0.25;
  if (band.vertical) return { x: band.x * band.strength * 0.14 * flutter, y: band.strength * flutter };
  return { x: band.x * band.strength * flutter, y: band.strength * 0.06 * flutter };
}
