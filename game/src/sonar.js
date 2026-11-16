// The sonar ping: a short blanket of sound that reveals everything nearby and drowses every
// lure inside it, at the price of a cooldown. It is the answer to a wreck full of lures.

import { SONAR } from './config.js';

export function createSonar() {
  return { cooldown: 0, active: 0, pulses: 0, radius: SONAR.radius };
}

export function sonarRadius(refits) {
  return SONAR.radius * (1 + 0.45 * refits.sonarArray);
}

export function sonarCooldownFor(refits) {
  return SONAR.cooldown * (1 - 0.28 * refits.sonarArray);
}

/** Fire a ping; false when the set is still cooling down. */
export function ping(sonar, refits) {
  if (sonar.cooldown > 0) return false;
  sonar.active = SONAR.active;
  sonar.cooldown = sonarCooldownFor(refits);
  sonar.radius = sonarRadius(refits);
  sonar.pulses += 1;
  return true;
}

export function stepSonar(sonar, dt) {
  sonar.active = Math.max(0, sonar.active - dt);
  sonar.cooldown = Math.max(0, sonar.cooldown - dt);
}

export function sonarReady(sonar) {
  return sonar.cooldown <= 0;
}
