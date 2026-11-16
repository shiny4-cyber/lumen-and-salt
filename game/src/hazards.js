// Hazards with predictable behaviour: lures that drift on a fixed patrol and only turn
// toward the diver when the lamp wakes them, and current bands that shove everything in
// one direction. Nothing here is random per frame, so a diver can learn the pattern.

import { LURE } from './config.js';
import { clamp, distance } from './mathx.js';

export function createLure(random, x, y) {
  return {
    x,
    y,
    homeX: x,
    homeY: y,
    phase: random() * Math.PI * 2,
    patrolRadius: 55 + random() * 85,
    vx: 0,
    vy: 0,
    awake: 0,
    hitCooldown: 0,
    stun: 0,
    pulse: random() * Math.PI * 2,
    radius: LURE.radius,
    dead: false,
  };
}

/**
 * Step every lure. `lampOn` and the player's position decide whether a lure wakes: the
 * lamp cone is what it hunts, and the silent-propeller refit shortens its reach.
 */
export function stepLures(lures, dt, time, player, lampOn, senseScale) {
  const events = [];
  for (const lure of lures) {
    if (lure.dead) continue;
    lure.pulse += dt * 2.4;
    lure.hitCooldown = Math.max(0, lure.hitCooldown - dt);
    lure.stun = Math.max(0, lure.stun - dt);
    const toPlayer = distance(lure.x, lure.y, player.x, player.y);
    const sense = LURE.senseRange * senseScale;
    if (lampOn && toPlayer < sense) lure.awake = LURE.memory;
    else lure.awake = Math.max(0, lure.awake - dt);

    let ax = 0;
    let ay = 0;
    if (lure.stun > 0) {
      // Recoiling after a hit: it drifts away and will not chase for a moment.
      ax = (lure.x - player.x) * 0.4 - lure.vx;
      ay = (lure.y - player.y) * 0.4 - lure.vy;
    } else if (lure.awake > 0) {
      const dx = player.x - lure.x;
      const dy = player.y - lure.y;
      const length = Math.hypot(dx, dy) || 1;
      const speed = LURE.chaseSpeed * clamp(toPlayer / 90, 0.25, 1);
      ax = (dx / length) * speed - lure.vx;
      ay = (dy / length) * speed - lure.vy;
    } else {
      // A slow figure-eight around its home, entirely deterministic.
      const targetX = lure.homeX + Math.cos(time * 0.32 + lure.phase) * lure.patrolRadius;
      const targetY = lure.homeY + Math.sin(time * 0.47 + lure.phase) * lure.patrolRadius * 0.6;
      ax = (targetX - lure.x) * 0.9 - lure.vx;
      ay = (targetY - lure.y) * 0.9 - lure.vy;
    }
    lure.vx += ax * Math.min(1, dt * (lure.awake > 0 ? 3.4 : 1.6));
    lure.vy += ay * Math.min(1, dt * (lure.awake > 0 ? 3.4 : 1.6));
    lure.x += lure.vx * dt;
    lure.y += lure.vy * dt;

    const hit = distance(lure.x, lure.y, player.x, player.y) < lure.radius + player.radius;
    if (hit && lure.hitCooldown <= 0 && player.mercy <= 0 && lure.stun <= 0) {
      lure.hitCooldown = 0.8;
      lure.stun = LURE.stun;
      lure.awake = 0;
      lure.vx += (lure.x - player.x) * 3;
      lure.vy += (lure.y - player.y) * 3;
      events.push({ type: 'hit', x: lure.x, y: lure.y, damage: LURE.damage });
    }
  }
  return events;
}
