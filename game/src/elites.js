// The glassmaw: one roaming elite per deep band. It prowls a slow home circuit, then locks a
// lane toward the diver and charges down it. The windup is the tell: 1.25 s of a drawn lane
// before the dash, then 1.9 s of recovery where it cannot hurt anyone.

import { ELITE } from './config.js';
import { distance } from './mathx.js';

export function createElite(random, x, y) {
  return {
    x,
    y,
    homeX: x,
    homeY: y,
    phase: 'prowl',
    timer: 0,
    angle: random() * Math.PI * 2,
    routePhase: random() * Math.PI * 2,
    dirX: 1,
    dirY: 0,
    laneX: 0,
    laneY: 0,
    laneStartX: x,
    laneStartY: y,
    hitCooldown: 0,
    pulse: random() * Math.PI * 2,
    radius: ELITE.radius,
    dead: false,
  };
}

/**
 * Step the elites. `drowsy` is the sonar ping: while it lasts nothing new is aimed at the
 * diver, which is the escape the ability is for.
 */
export function stepElites(elites, dt, player, time, drowsy) {
  const events = [];
  for (const elite of elites) {
    if (elite.dead) continue;
    elite.pulse += dt;
    elite.timer = Math.max(0, elite.timer - dt);
    elite.hitCooldown = Math.max(0, elite.hitCooldown - dt);

    if (elite.phase === 'prowl') {
      const targetX = elite.homeX + Math.cos(time * 0.22 + elite.routePhase) * ELITE.roam;
      const targetY = elite.homeY + Math.sin(time * 0.31 + elite.routePhase) * ELITE.roam * 0.6;
      const dx = targetX - elite.x;
      const dy = targetY - elite.y;
      const length = Math.hypot(dx, dy) || 1;
      elite.x += (dx / length) * ELITE.prowlSpeed * dt;
      elite.y += (dy / length) * ELITE.prowlSpeed * dt;
      elite.dirX = dx / length;
      elite.dirY = dy / length;
      elite.angle = Math.atan2(dy, dx);
      const range = distance(elite.x, elite.y, player.x, player.y);
      if (!drowsy && range < ELITE.senseRange) {
        elite.phase = 'windup';
        elite.timer = ELITE.windup;
        const lx = player.x - elite.x;
        const ly = player.y - elite.y;
        const lLength = Math.hypot(lx, ly) || 1;
        elite.laneX = lx / lLength;
        elite.laneY = ly / lLength;
        elite.laneStartX = elite.x;
        elite.laneStartY = elite.y;
        elite.angle = Math.atan2(elite.laneY, elite.laneX);
        events.push({ type: 'windup', x: elite.x, y: elite.y });
      }
    } else if (elite.phase === 'windup') {
      if (elite.timer <= 0) {
        elite.phase = 'dash';
        elite.timer = ELITE.dashTime;
      }
    } else if (elite.phase === 'dash') {
      elite.x += elite.laneX * ELITE.dashSpeed * dt;
      elite.y += elite.laneY * ELITE.dashSpeed * dt;
      const hit = distance(elite.x, elite.y, player.x, player.y) < elite.radius + player.radius;
      if (hit && elite.hitCooldown <= 0 && player.mercy <= 0) {
        elite.hitCooldown = 0.9;
        events.push({ type: 'elite-hit', x: elite.x, y: elite.y, damage: ELITE.damage, dirX: elite.laneX, dirY: elite.laneY });
        elite.phase = 'recover';
        elite.timer = ELITE.recover;
      }
      if (elite.timer <= 0) {
        elite.phase = 'recover';
        elite.timer = ELITE.recover;
      }
    } else if (elite.phase === 'recover') {
      elite.angle += dt * 0.8;
      if (elite.timer <= 0) {
        elite.phase = 'prowl';
        elite.timer = 0;
        elite.homeX = elite.x;
        elite.homeY = elite.y;
      }
    }
  }
  return events;
}

/** Where the telegraphed dash will go, for the renderer's danger lane. */
export function eliteLane(elite) {
  return {
    x1: elite.laneStartX,
    y1: elite.laneStartY,
    x2: elite.laneStartX + elite.laneX * ELITE.laneLength,
    y2: elite.laneStartY + elite.laneY * ELITE.laneLength,
  };
}
