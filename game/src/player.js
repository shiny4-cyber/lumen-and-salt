// The bathyscaphe: ballast, thrust, drag, oxygen and hull. The player's whole control set
// lands here, and every upgrade the refit screen offers is a number this file reads.

import { OXYGEN, PLAYER, TRENCH } from './config.js';
import { cargoMass } from './salvage.js';
import { clamp } from './mathx.js';

export function createPlayer() {
  return {
    x: TRENCH.width * 0.5,
    y: 60,
    vx: 0,
    vy: 0,
    radius: PLAYER.radius,
    ballast: 0.5,
    oxygen: PLAYER.oxygen,
    oxygenMax: PLAYER.oxygen,
    hull: PLAYER.hull,
    hullMax: PLAYER.hull,
    lampOn: true,
    aim: 0,
    mercy: 0,
    hullFlash: 0,
    thrustLevel: 0,
    ballastLevel: 0,
    sinkLevel: 0,
    tetherPull: 0,
    depth: 0,
  };
}

/** Put the diver back on the surface with a full tank, keeping the refits. */
export function resetPlayerForDive(player, refits) {
  player.x = TRENCH.width * 0.5;
  player.y = 40;
  player.vx = 0;
  player.vy = 0;
  player.ballast = 0.5;
  player.oxygenMax = PLAYER.oxygen + refits.tank * 25;
  player.oxygen = player.oxygenMax;
  player.hullMax = PLAYER.hull + refits.plating * 25;
  player.hull = Math.min(player.hullMax, player.hull + refits.plating * 10);
  player.mercy = 1.2;
  player.hullFlash = 0;
  player.lampOn = true;
  player.depth = 0;
}

/**
 * Step the diver. `intent` is { thrust, ballast, tether:{x,y}, current:{x,y} }, all
 * accelerations already resolved by the world; `cargo` is what he is dragging up.
 */
export function stepPlayer(player, dt, intent, cargo, refits) {
  const mass = cargoMass(cargo);
  const clampFactor = clamp(1 - mass * PLAYER.cargoDrag * (1 - 0.4 * refits.clamps), 0.32, 1);

  // Ballast: holding W vents it (the diver rises), S floods it (the diver sinks).
  const pumpRate = PLAYER.ballastRate * (1 + 0.45 * refits.pump);
  player.ballast = clamp(player.ballast + intent.ballast * pumpRate * dt, 0, 1);

  let ax = 0;
  let ay = 0;
  ax += intent.thrust * PLAYER.thrust * clampFactor;
  player.thrustLevel = Math.abs(intent.thrust);
  ay += (player.ballast - 0.5) * PLAYER.buoyancy;
  player.ballastLevel = (player.ballast - 0.5) * 2;
  ay += mass * PLAYER.cargoSink * (1 - 0.4 * refits.clamps);
  player.sinkLevel = mass * PLAYER.cargoSink;
  ay += intent.tether.y;
  ax += intent.tether.x;
  player.tetherPull = Math.hypot(intent.tether.x, intent.tether.y);
  ay += intent.current.y;
  ax += intent.current.x;

  player.vx += ax * dt;
  player.vy += ay * dt;
  const damp = Math.exp(-PLAYER.drag * dt);
  player.vx *= damp;
  player.vy *= damp;
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > PLAYER.maxSpeed) {
    player.vx = (player.vx / speed) * PLAYER.maxSpeed;
    player.vy = (player.vy / speed) * PLAYER.maxSpeed;
  }
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // The trench walls and floor are solid; the surface is the top of the dive.
  const margin = player.radius + 8;
  if (player.x < margin) {
    player.x = margin;
    player.vx = Math.abs(player.vx) * 0.3;
  } else if (player.x > TRENCH.width - margin) {
    player.x = TRENCH.width - margin;
    player.vx = -Math.abs(player.vx) * 0.3;
  }
  if (player.y > TRENCH.floorY - margin) {
    player.y = TRENCH.floorY - margin;
    player.vy = -Math.abs(player.vy) * 0.25;
  }
  if (player.y < TRENCH.surfaceY + margin) {
    player.y = TRENCH.surfaceY + margin;
    player.vy = Math.max(0, player.vy);
  }

  player.depth = Math.max(0, player.y) / TRENCH.pxPerMetre;
  const drain = OXYGEN.drain + player.depth * OXYGEN.drainPerMetre;
  player.oxygen = Math.max(0, player.oxygen - drain * dt);
  player.mercy = Math.max(0, player.mercy - dt);
  player.hullFlash = Math.max(0, player.hullFlash - dt * 2.4);
}

export function damagePlayer(player, amount) {
  if (player.mercy > 0) return 0;
  const dealt = Math.max(0, amount);
  player.hull = Math.max(0, player.hull - dealt);
  player.mercy = PLAYER.mercy;
  player.hullFlash = 1;
  return dealt;
}

export function isAtSurface(player) {
  return player.y <= TRENCH.surfaceY + 95;
}
