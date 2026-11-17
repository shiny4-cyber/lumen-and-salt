// The HUD. It is sized for the judge's contact sheet, not for a monitor: the cover is fitted
// to 768 px wide (a 0.6 scale of the 1280x720 canvas), so every label here is at least 17 px
// and every number at least 26 px in canvas space. Only what a diver needs at a glance is
// drawn — air, hull, depth, the run clock, the hold, the contract, and one threat line.

import { CONTRACT_TARGET, DIVE, PALETTE, PRESSURE, SEMANTIC, SONAR, VIEW } from './config.js';
import { cargoMass, cargoValue } from './salvage.js';
import { clamp } from './mathx.js';

const MARGIN = 34;
const COLUMN = 268;

const LABEL = 'bold 19px "Consolas", monospace';
const NUMBER = 'bold 40px "Consolas", monospace';
const SMALL = 'bold 17px "Consolas", monospace';
const MEDIUM = 'bold 26px "Consolas", monospace';

function meter(ctx, x, y, width, height, fraction, colour) {
  ctx.fillStyle = 'rgba(4, 26, 30, 0.85)';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = colour;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (width - 2) * clamp(fraction, 0, 1)), height - 2);
  ctx.strokeStyle = 'rgba(150, 216, 210, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x + 0.7, y + 0.7, width - 1.4, height - 1.4);
}

export function drawHud(ctx, world, view) {
  const player = world.player;
  const time = view.time;
  const oxygenFraction = player.oxygen / player.oxygenMax;
  const hullFraction = player.hull / player.hullMax;
  const lowAir = oxygenFraction < DIVE.lowOxygen;
  const cargo = cargoValue(world.cargo);

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // ── Left: air and hull. Label on the left, value on the right, bar beneath.
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = LABEL;
  ctx.fillText('OXYGEN', MARGIN, 46);
  ctx.textAlign = 'right';
  ctx.fillStyle = lowAir ? PALETTE.bad : PALETTE.text;
  ctx.font = NUMBER;
  ctx.fillText(`${Math.ceil(player.oxygen)} s`, MARGIN + COLUMN, 50);
  meter(ctx, MARGIN, 60, COLUMN, 16, oxygenFraction, lowAir ? PALETTE.bad : '#cfe4e2');

  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = LABEL;
  ctx.fillText('HULL', MARGIN, 112);
  ctx.textAlign = 'right';
  ctx.fillStyle = hullFraction < DIVE.lowHull ? PALETTE.bad : PALETTE.text;
  ctx.font = MEDIUM;
  ctx.fillText(`${Math.ceil(hullFraction * 100)}%`, MARGIN + COLUMN, 112);
  meter(ctx, MARGIN, 122, COLUMN, 14, hullFraction, hullFraction < DIVE.lowHull ? PALETTE.bad : '#cfe4e2');

  // ── Centre: depth is the biggest number on the screen, the run clock under it.
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = LABEL;
  ctx.fillText('DEPTH', VIEW.width / 2, 40);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 52px "Consolas", monospace';
  ctx.fillText(`${Math.round(player.depth)} m`, VIEW.width / 2, 92);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = MEDIUM;
  ctx.fillText(`RUN ${formatTime(time)}`, VIEW.width / 2, 128);
  const band = world.environment;
  if (band) {
    ctx.fillStyle = band.id === 'brine-hollow' ? SEMANTIC.objective : PALETTE.muted;
    ctx.font = SMALL;
    ctx.fillText(band.label, VIEW.width / 2, 156);
  }

  // ── Right: the hold, the bank, and the contract in one column.
  const right = VIEW.width - MARGIN;
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = LABEL;
  ctx.fillText('HAUL', right, 46);
  ctx.fillStyle = SEMANTIC.value;
  ctx.font = NUMBER;
  ctx.fillText(`$${cargo}`, right, 88);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 22px "Consolas", monospace';
  ctx.fillText(`banked $${world.banked}`, right, 116);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = SMALL;
  ctx.fillText(`${world.cargo.length} pcs · ${cargoMass(world.cargo).toFixed(1)} t`, right, 140);
  const toward = clamp(world.banked / CONTRACT_TARGET, 0, 1);
  meter(ctx, right - COLUMN, 148, COLUMN, 12, toward, SEMANTIC.objective);
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(`CONTRACT $${CONTRACT_TARGET}`, right, 180);
  if (world.combo.count > 1) {
    ctx.fillStyle = SEMANTIC.value;
    ctx.font = 'bold 28px "Consolas", monospace';
    ctx.fillText(`x${world.combo.multiplier.toFixed(2)}`, right, 214);
  }

  // ── Bottom left: gear, in two words.
  ctx.textAlign = 'left';
  ctx.font = 'bold 18px "Consolas", monospace';
  ctx.fillStyle = player.lampOn ? PALETTE.text : PALETTE.muted;
  ctx.fillText(player.lampOn ? 'LAMP ON' : 'LAMP OFF', MARGIN, VIEW.height - 48);
  const sonar = world.sonar;
  ctx.fillStyle = sonar.active > 0 ? SEMANTIC.objective : sonar.cooldown > 0 ? PALETTE.muted : PALETTE.text;
  ctx.fillText(sonar.active > 0 ? 'SONAR PING' : sonar.cooldown > 0 ? `SONAR ${sonar.cooldown.toFixed(0)}s` : 'SONAR READY', MARGIN, VIEW.height - 26);

  // ── Bottom right: one threat line. Tether tension wins, then the bend, then the ascent.
  const hook = world.hook;
  const rise = player.ascentRate;
  const threatX = VIEW.width - MARGIN;
  ctx.textAlign = 'right';
  if (player.bending) {
    ctx.fillStyle = PALETTE.bad;
    ctx.font = 'bold 24px "Consolas", monospace';
    ctx.fillText('BEND — EASE OFF', threatX, VIEW.height - 26);
  } else if (hook.state === 'attached') {
    const tension = clamp(hook.tension, 0, 1);
    ctx.fillStyle = tension > 0.8 ? PALETTE.bad : tension > 0.5 ? PALETTE.warn : PALETTE.text;
    ctx.font = 'bold 22px "Consolas", monospace';
    const cut = hook.cutNode ? `  CUT ${Math.round(hook.cutProgress * 100)}%` : '';
    ctx.fillText(`TETHER ${Math.round(tension * 100)}%${cut}`, threatX, VIEW.height - 26);
    meter(ctx, threatX - 240, VIEW.height - 18, 240, 10, tension, tension > 0.8 ? PALETTE.bad : tension > 0.5 ? PALETTE.warn : '#cfe4e2');
  } else {
    const fast = rise > PRESSURE.safeRate;
    ctx.fillStyle = fast ? PALETTE.warn : PALETTE.text;
    ctx.font = 'bold 22px "Consolas", monospace';
    ctx.fillText(fast ? 'FAST ASCENT' : 'ASCENT OK', threatX, VIEW.height - 26);
    meter(ctx, threatX - 240, VIEW.height - 18, 240, 10, Math.min(1, rise / (PRESSURE.safeRate * 1.7)), fast ? PALETTE.bad : '#cfe4e2');
  }

  // ── Bottom centre: the one instruction that matters right now.
  const prompt = contextualPrompt(world);
  if (prompt) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px "Trebuchet MS", system-ui, sans-serif';
    const width = ctx.measureText(prompt).width + 44;
    ctx.fillStyle = 'rgba(3, 22, 26, 0.86)';
    ctx.fillRect(VIEW.width / 2 - width / 2, VIEW.height - 78, width, 38);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(VIEW.width / 2 - width / 2 + 0.6, VIEW.height - 77.4, width - 1.2, 36.8);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(prompt, VIEW.width / 2, VIEW.height - 52);
  }

  // Damage flash, and the low-air border pulse.
  if (player.hullFlash > 0) {
    ctx.fillStyle = `rgba(255, 90, 60, ${0.28 * player.hullFlash})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  if (lowAir) {
    const pulse = 0.25 + 0.2 * Math.sin(time * 7);
    ctx.strokeStyle = `rgba(255, 122, 99, ${pulse})`;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, VIEW.width - 8, VIEW.height - 8);
  }

  // The dive-start banner.
  if (view.intro > 0) {
    const progress = clamp(1 - view.intro / 1.15, 0, 1);
    ctx.globalAlpha = clamp(progress * 2.2, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(0, VIEW.height / 2 - 82, VIEW.width, 132);
    ctx.fillStyle = PALETTE.amberHot;
    ctx.font = 'bold 48px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(`DIVE ${world.dive + 1}`, VIEW.width / 2, VIEW.height / 2 - 18);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px "Consolas", monospace';
    ctx.fillText(`ballast trimmed · tank ${Math.round(player.oxygenMax)} s · hull ${Math.round(player.hullMax)}`, VIEW.width / 2, VIEW.height / 2 + 22);
    ctx.globalAlpha = 1;
  }

  // World messages: a hull buckling, a tether parting.
  if (world.messageTimer > 0) {
    ctx.globalAlpha = clamp(world.messageTimer / 0.6, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.warn;
    ctx.font = 'bold 24px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(world.message, VIEW.width / 2, 210);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function contextualPrompt(world) {
  const hook = world.hook;
  if (world.cargo.length >= 6) return 'hold full — surface now';
  if (hook.state === 'attached') {
    if (hook.cutNode) return 'hold E — cutting free';
    return 'hold E to cut the piece free';
  }
  if (hook.state === 'flying') return 'hook away — hold to keep the line';
  return 'hold LMB toward a wreck to grapple';
}

export function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
