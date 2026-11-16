// The HUD: oxygen, depth, cargo value, hull, the run clock and the contract total. It reads
// the world and paints over the scene; it holds no state of its own beyond animation time.

import { CONTRACT_TARGET, DIVE, PALETTE, VIEW } from './config.js';
import { cargoMass, cargoValue } from './salvage.js';
import { clamp } from './mathx.js';

function bar(ctx, x, y, width, height, fraction, colour, label, valueText) {
  ctx.fillStyle = 'rgba(4, 26, 30, 0.8)';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = colour;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (width - 2) * clamp(fraction, 0, 1)), height - 2);
  ctx.strokeStyle = 'rgba(140, 210, 205, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '12px "Consolas", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 7);
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = 'right';
  ctx.fillText(valueText, x + width, y - 7);
  ctx.textAlign = 'left';
}

export function drawHud(ctx, world, view) {
  const player = world.player;
  const time = view.time;
  const oxygenFraction = player.oxygen / player.oxygenMax;
  const hullFraction = player.hull / player.hullMax;
  const cargo = cargoValue(world.cargo);
  const mass = cargoMass(world.cargo);

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Left: life support and hull.
  bar(ctx, 26, 44, 218, 13, oxygenFraction, oxygenFraction < DIVE.lowOxygen ? PALETTE.bad : PALETTE.bio, 'OXYGEN', `${Math.ceil(player.oxygen)} s`);
  bar(ctx, 26, 82, 218, 13, hullFraction, hullFraction < DIVE.lowHull ? PALETTE.bad : PALETTE.amber, 'HULL', `${Math.ceil(player.hull)}%`);

  // Centre: depth and the run clock.
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 30px "Consolas", monospace';
  ctx.fillText(`${Math.round(player.depth)} m`, VIEW.width / 2, 50);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '12px "Consolas", monospace';
  ctx.fillText(`DEPTH   deepest ${Math.round(world.depthMax)} m`, VIEW.width / 2, 68);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 22px "Consolas", monospace';
  ctx.fillText(formatTime(time), VIEW.width / 2, 100);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '12px "Consolas", monospace';
  ctx.fillText(`RUN ${formatTime(time)}   DIVE ${world.dive + 1}`, VIEW.width / 2, 116);

  // Right: the hold and the contract.
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '12px "Consolas", monospace';
  ctx.fillText(`CARGO  ${world.cargo.length} piece${world.cargo.length === 1 ? '' : 's'}  ${mass.toFixed(1)} t`, VIEW.width - 26, 38);
  ctx.fillStyle = PALETTE.amberHot;
  ctx.font = 'bold 30px "Consolas", monospace';
  ctx.fillText(`$${cargo}`, VIEW.width - 26, 68);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '16px "Consolas", monospace';
  ctx.fillText(`banked $${world.banked}`, VIEW.width - 26, 92);
  const toward = clamp(world.banked / CONTRACT_TARGET, 0, 1);
  ctx.fillStyle = 'rgba(4, 26, 30, 0.8)';
  ctx.fillRect(VIEW.width - 244, 104, 218, 8);
  ctx.fillStyle = PALETTE.bio;
  ctx.fillRect(VIEW.width - 243, 105, 216 * toward, 6);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '11px "Consolas", monospace';
  ctx.fillText(`contract $${CONTRACT_TARGET}`, VIEW.width - 26, 126);

  // The depth band the diver is in, named, so the environment change is legible.
  const band = world.environment;
  if (band) {
    const deep = band.id === 'black-shelf';
    ctx.textAlign = 'center';
    ctx.fillStyle = deep ? PALETTE.bio : PALETTE.muted;
    ctx.font = 'bold 12px "Consolas", monospace';
    ctx.fillText(band.label, VIEW.width / 2, 136);
    // Combo: the multiplier, and how long it has left before it lapses.
    if (world.combo.count > 1) {
      const left = clamp(world.combo.timer / 7.5, 0, 1);
      ctx.fillStyle = PALETTE.amberHot;
      ctx.font = 'bold 18px "Consolas", monospace';
      ctx.fillText(`COMBO x${world.combo.multiplier.toFixed(2)}`, VIEW.width / 2, 164);
      ctx.fillStyle = 'rgba(4, 26, 30, 0.8)';
      ctx.fillRect(VIEW.width / 2 - 70, 172, 140, 6);
      ctx.fillStyle = PALETTE.amber;
      ctx.fillRect(VIEW.width / 2 - 69, 173, 138 * left, 4);
    }
  }

  // Tether tension, only while a line is out.
  const hook = world.hook;
  if (hook.state === 'attached') {
    const tension = clamp(hook.tension, 0, 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px "Consolas", monospace';
    ctx.fillText('TETHER', 26, 128);
    ctx.fillStyle = 'rgba(4, 26, 30, 0.8)';
    ctx.fillRect(26, 134, 140, 8);
    ctx.fillStyle = tension > 0.8 ? PALETTE.bad : tension > 0.5 ? PALETTE.warn : PALETTE.bio;
    ctx.fillRect(27, 135, 138 * tension, 6);
    if (hook.cutNode) {
      ctx.fillStyle = PALETTE.amberHot;
      ctx.fillText(`cutting ${Math.round(hook.cutProgress * 100)}%`, 26, 160);
    }
  }

  // Contextual prompt: the next thing the diver should do.
  const prompt = contextualPrompt(world);
  if (prompt) {
    ctx.textAlign = 'center';
    ctx.font = '15px "Trebuchet MS", system-ui, sans-serif';
    const width = ctx.measureText(prompt).width + 34;
    ctx.fillStyle = 'rgba(3, 22, 26, 0.78)';
    ctx.fillRect(VIEW.width / 2 - width / 2, VIEW.height - 74, width, 30);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.strokeRect(VIEW.width / 2 - width / 2 + 0.5, VIEW.height - 73.5, width - 1, 29);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(prompt, VIEW.width / 2, VIEW.height - 53);
  }

  // Lamp state and mute in the corner.
  ctx.textAlign = 'left';
  ctx.font = '12px "Consolas", monospace';
  ctx.fillStyle = player.lampOn ? PALETTE.amber : PALETTE.muted;
  ctx.fillText(player.lampOn ? 'LAMP ON  ·  lures can see it' : 'LAMP OFF  ·  the dark hides you', 26, VIEW.height - 24);
  ctx.fillStyle = PALETTE.muted;
  ctx.textAlign = 'left';
  ctx.fillText(view.muted ? 'M mute (off)' : 'M mute   F lamp   P pause', 26, 176);

  // Damage flash and low-oxygen pulse, drawn over everything.
  if (player.hullFlash > 0) {
    ctx.fillStyle = `rgba(255, 90, 60, ${0.28 * player.hullFlash})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  if (oxygenFraction < DIVE.lowOxygen) {
    const pulse = 0.25 + 0.2 * Math.sin(time * 7);
    ctx.strokeStyle = `rgba(255, 122, 99, ${pulse})`;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, VIEW.width - 8, VIEW.height - 8);
  }

  // The dive-start sequence: a short banner over a frozen frame, then the diver is released.
  if (view.intro > 0) {
    const progress = clamp(1 - view.intro / 1.15, 0, 1);
    ctx.globalAlpha = clamp(progress * 2.2, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(0, VIEW.height / 2 - 74, VIEW.width, 116);
    ctx.fillStyle = PALETTE.amberHot;
    ctx.font = 'bold 40px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(`DIVE ${world.dive + 1}`, VIEW.width / 2, VIEW.height / 2 - 18);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '16px "Consolas", monospace';
    ctx.fillText(`ballast trimmed  ·  tank ${Math.round(player.oxygenMax)} s  ·  hull ${Math.round(player.hullMax)}`, VIEW.width / 2, VIEW.height / 2 + 16);
    ctx.globalAlpha = 1;
  }

  // The world's short messages (a hull buckling, a tether snapping) sit above the prompt.
  if (world.messageTimer > 0) {
    ctx.globalAlpha = clamp(world.messageTimer / 0.6, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.warn;
    ctx.font = '18px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(world.message, VIEW.width / 2, 190);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function contextualPrompt(world) {
  const hook = world.hook;
  if (world.cargo.length >= 6) return 'hold is full — surface before the air runs out';
  if (hook.state === 'attached') {
    if (hook.cutNode) return 'keep E held — the piece is coming free';
    return 'hold E near a lit piece to cut it free';
  }
  if (hook.state === 'flying') return 'the hook is flying — hold to keep the line';
  return 'hold LMB toward a wreck to grapple';
}

export function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

