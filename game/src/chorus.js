// The chorus: a bell-singer that holds station and rings. Its pattern is a swell, not a
// charge: the rings contract for 1.3 s, then a shock ring expands outward for 1.1 s. The
// band is the damage; the eye and the outside are safe. It never moves while it sings.

import { CHORUS } from './config.js';

export function createChorus(random, x, y) {
  return {
    kind: 'chorus',
    x,
    y,
    phase: 'hum',
    timer: 0,
    pulse: random() * Math.PI * 2,
    ringRadius: 0,
    hitCooldown: 0,
    radius: 22,
    dead: false,
  };
}

export function stepChorus(choruses, dt, player, time, drowsy) {
  const events = [];
  for (const chorus of choruses) {
    if (chorus.dead) continue;
    chorus.pulse += dt;
    chorus.timer = Math.max(0, chorus.timer - dt);
    chorus.hitCooldown = Math.max(0, chorus.hitCooldown - dt);

    if (chorus.phase === 'hum') {
      chorus.ringRadius = 0;
      const range = Math.hypot(player.x - chorus.x, player.y - chorus.y);
      if (!drowsy && range < CHORUS.senseRange) {
        chorus.phase = 'swell';
        chorus.timer = CHORUS.swell;
        events.push({ type: 'swell', x: chorus.x, y: chorus.y });
      }
    } else if (chorus.phase === 'swell') {
      // The swell is the tell: the rings contract, so the ring that follows is no surprise.
      chorus.ringRadius = CHORUS.maxRadius * (1 - chorus.timer / CHORUS.swell);
      if (chorus.timer <= 0) {
        chorus.phase = 'ring';
        chorus.timer = CHORUS.ring;
        chorus.ringRadius = CHORUS.core;
      }
    } else if (chorus.phase === 'ring') {
      const progress = 1 - chorus.timer / CHORUS.ring;
      chorus.ringRadius = CHORUS.core + (CHORUS.maxRadius - CHORUS.core) * progress;
      const range = Math.hypot(player.x - chorus.x, player.y - chorus.y);
      const inBand = Math.abs(range - chorus.ringRadius) < CHORUS.band;
      if (inBand && chorus.hitCooldown <= 0 && player.mercy <= 0) {
        chorus.hitCooldown = 1;
        events.push({ type: 'chorus-hit', x: chorus.x, y: chorus.y, damage: CHORUS.damage });
      }
      if (chorus.timer <= 0) {
        chorus.phase = 'rest';
        chorus.timer = CHORUS.rest;
        chorus.ringRadius = 0;
      }
    } else if (chorus.phase === 'rest') {
      if (chorus.timer <= 0) chorus.phase = 'hum';
    }
  }
  return events;
}

/** The band that will hurt, for the renderer. */
export function chorusBand(chorus) {
  return { x: chorus.x, y: chorus.y, inner: Math.max(0, chorus.ringRadius - CHORUS.band), outer: chorus.ringRadius + CHORUS.band };
}
