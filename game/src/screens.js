// The overlay screens: title, pause, the refit choice, death and the completed contract.
// They take the same logical 1280x720 space the scene paints into, so the layout reads at
// any window size.

import { CONTRACT_TARGET, PALETTE, TEXT, VIEW } from './config.js';
import { REFITS } from './upgrades.js';
import { TOOLS, toolCount } from './loadout.js';
import { formatTime } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_REFIT = 'refit';
export const SCREEN_OVER = 'over';
export const SCREEN_WON = 'won';
export const SCREEN_BRIEFING = 'briefing';
export const SCREEN_LOADOUT = 'loadout';

function panel(ctx, x, y, width, height, alpha = 0.82) {
  ctx.fillStyle = `rgba(7, 34, 40, ${alpha})`;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

function centred(ctx, text, x, y, font, colour, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

export function drawTitle(ctx, world, view) {
  // Darken the live scene behind the title, then lay the wordmark over it.
  ctx.fillStyle = 'rgba(2, 14, 18, 0.42)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  const glow = ctx.createRadialGradient(VIEW.width / 2, 196, 30, VIEW.width / 2, 220, 420);
  glow.addColorStop(0, 'rgba(255, 196, 120, 0.20)');
  glow.addColorStop(1, 'rgba(255, 176, 96, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, VIEW.width, 480);

  centred(ctx, TEXT.title, VIEW.width / 2, 208, 'bold 76px "Trebuchet MS", system-ui, sans-serif', PALETTE.amberHot);
  centred(ctx, TEXT.subtitle, VIEW.width / 2, 244, '26px "Trebuchet MS", system-ui, sans-serif', PALETTE.muted);
  ctx.strokeStyle = 'rgba(246, 180, 90, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(VIEW.width / 2 - 250, 266);
  ctx.lineTo(VIEW.width / 2 + 250, 266);
  ctx.stroke();

  panel(ctx, VIEW.width / 2 - 300, 300, 600, 208, 0.72);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.text;
  ctx.font = '22px "Trebuchet MS", system-ui, sans-serif';
  TEXT.controls.forEach((line, index) => {
    ctx.fillText(line, VIEW.width / 2 - 272, 334 + index * 27);
  });
  ctx.fillStyle = PALETTE.amber;
  ctx.font = 'bold 21px "Consolas", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(TEXT.contract, VIEW.width / 2, 486);

  const pulse = 0.55 + 0.45 * Math.sin(view.time * 3.4);
  centred(ctx, TEXT.start, VIEW.width / 2, 566, 'bold 31px "Trebuchet MS", system-ui, sans-serif', PALETTE.text, 0.5 + pulse * 0.5);
  if (view.best > 0) {
    centred(ctx, `best haul  $${view.best}`, VIEW.width / 2, 606, '21px "Consolas", monospace', PALETTE.bio);
  }
  centred(ctx, 'made for make.fun best-game-01 — original art, sound and code', VIEW.width / 2, VIEW.height - 30, '17px "Consolas", monospace', 'rgba(143, 179, 176, 0.6)');
}

export function drawBriefing(ctx, world, view) {
  ctx.fillStyle = 'rgba(2, 12, 16, 0.82)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  centred(ctx, 'THE YARD BRIEFING', VIEW.width / 2, 96, 'bold 34px "Trebuchet MS", system-ui, sans-serif', PALETTE.amberHot);
  centred(ctx, 'Halcyon salvage contract · your boat, your air, your call', VIEW.width / 2, 128, '20px "Consolas", monospace', PALETTE.muted);

  panel(ctx, VIEW.width / 2 - 430, 150, 860, 380, 0.92);
  const lines = [
    ['THE LOOP', 'Grapple a wreck, hold E to cut a piece free, carry it up and surface. Every dive banks its hold.'],
    ['THE CLOCK', 'Oxygen is the run clock, and it burns faster the deeper you are. Surface early, or not at all.'],
    ['THE ASCENT', 'Vented ballast rises fast. Above 165 px/s the bend builds and the hull pays for it: keep the gauge green.'],
    ['THE RISK', 'Below 75 m the Black Shelf pays more and bites harder. Below 150 m the Brine Hollow pays best and hunts.'],
    ['THE JOB', 'Three yard contracts run beside the main one: bank $1,500 and the contract closes.'],
  ];
  lines.forEach(([head, body], index) => {
    const y = 186 + index * 68;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.amber;
    ctx.font = 'bold 17px "Consolas", monospace';
    ctx.fillText(head, VIEW.width / 2 - 400, y);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '18px "Trebuchet MS", system-ui, sans-serif';
    wrapText(ctx, body, VIEW.width / 2 + 60, y, 440, 25, '18px "Trebuchet MS", system-ui, sans-serif', PALETTE.text);
  });
  const pulse = 0.6 + 0.4 * Math.sin(view.time * 3.2);
  centred(ctx, 'press SPACE for the loadout', VIEW.width / 2, 570, 'bold 29px "Trebuchet MS", system-ui, sans-serif', PALETTE.text, pulse);
  centred(ctx, 'W/S ballast · A/D thrust · hold LMB grapple · hold E cut · F lamp · Q sonar · P pause', VIEW.width / 2, 606, '17px "Consolas", monospace', PALETTE.muted);
}

export function drawLoadout(ctx, world, view) {
  ctx.fillStyle = 'rgba(2, 12, 16, 0.7)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  centred(ctx, 'LOADOUT', VIEW.width / 2, 118, 'bold 40px "Trebuchet MS", system-ui, sans-serif', PALETTE.amberHot);
  const ramp = world.ramp;
  centred(ctx, `dive ${world.dive + 1}${ramp ? `  ·  ${ramp.label}  ·  ${ramp.brief}` : ''}`, VIEW.width / 2, 150, '18px "Consolas", monospace', PALETTE.muted);
  centred(ctx, `fit two of three  ·  ${toolCount(world.tools)} selected`, VIEW.width / 2, 194, 'bold 23px "Trebuchet MS", system-ui, sans-serif', PALETTE.text);

  const cardWidth = 330;
  const gap = 24;
  const total = TOOLS.length * cardWidth + (TOOLS.length - 1) * gap;
  const startX = (VIEW.width - total) / 2;
  TOOLS.forEach((tool, index) => {
    const x = startX + index * (cardWidth + gap);
    const y = 230;
    const fitted = world.tools[tool.id];
    panel(ctx, x, y, cardWidth, 178, fitted ? 0.96 : 0.72);
    ctx.strokeStyle = fitted ? PALETTE.amber : PALETTE.panelEdge;
    ctx.lineWidth = fitted ? 2.4 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cardWidth - 1, 177);
    centred(ctx, `${index + 1}`, x + cardWidth / 2, y + 40, 'bold 31px "Consolas", monospace', fitted ? PALETTE.amberHot : PALETTE.muted);
    centred(ctx, tool.name, x + cardWidth / 2, y + 78, 'bold 27px "Trebuchet MS", system-ui, sans-serif', fitted ? PALETTE.text : PALETTE.muted);
    wrapText(ctx, tool.blurb, x + cardWidth / 2, y + 108, cardWidth - 30, 22, '18px "Trebuchet MS", system-ui, sans-serif', PALETTE.muted);
    centred(ctx, fitted ? 'FITTED' : 'left at the dock', x + cardWidth / 2, y + 158, '16px "Consolas", monospace', fitted ? PALETTE.bio : PALETTE.bioDim);
  });
  centred(ctx, '1 / 2 / 3 or click to fit    ·    SPACE to dive', VIEW.width / 2, 448, 'bold 25px "Trebuchet MS", system-ui, sans-serif', PALETTE.text);
  const contracts = world.contracts.filter((contract) => !contract.done);
  if (contracts.length > 0) {
    centred(ctx, contracts.map((contract) => contract.title).join('   ·   '), VIEW.width / 2, 486, '17px "Consolas", monospace', PALETTE.bioDim);
  }
}

export function drawPaused(ctx, world, view) {
  ctx.fillStyle = 'rgba(2, 12, 16, 0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  panel(ctx, VIEW.width / 2 - 220, 250, 440, 190, 0.88);
  centred(ctx, TEXT.paused, VIEW.width / 2, 318, 'bold 46px "Trebuchet MS", system-ui, sans-serif', PALETTE.amberHot);
  centred(ctx, TEXT.resume, VIEW.width / 2, 360, '23px "Trebuchet MS", system-ui, sans-serif', PALETTE.text);
  centred(ctx, 'the trench waits', VIEW.width / 2, 396, '18px "Consolas", monospace', PALETTE.muted);
}

export function drawRefit(ctx, world, view) {
  ctx.fillStyle = 'rgba(2, 14, 18, 0.52)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  centred(ctx, TEXT.surfaced, VIEW.width / 2, 118, 'bold 44px "Trebuchet MS", system-ui, sans-serif', PALETTE.bio);
  centred(ctx, `banked $${world.banked} of $${CONTRACT_TARGET}`, VIEW.width / 2, 152, '23px "Consolas", monospace', PALETTE.text);
  centred(ctx, TEXT.chooseUpgrade, VIEW.width / 2, 206, 'bold 26px "Trebuchet MS", system-ui, sans-serif', PALETTE.amberHot);

  const cards = world.offers;
  const cardWidth = 320;
  const gap = 26;
  const totalWidth = cards.length * cardWidth + (cards.length - 1) * gap;
  const startX = (VIEW.width - totalWidth) / 2;
  cards.forEach((card, index) => {
    const x = startX + index * (cardWidth + gap);
    const y = 240;
    panel(ctx, x, y, cardWidth, 190, 0.92);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.strokeRect(x + 0.5, y + 0.5, cardWidth - 1, 189);
    centred(ctx, `${index + 1}`, x + cardWidth / 2, y + 44, 'bold 26px "Consolas", monospace', PALETTE.amber);
    centred(ctx, card.name, x + cardWidth / 2, y + 86, 'bold 29px "Trebuchet MS", system-ui, sans-serif', PALETTE.text);
    wrapText(ctx, card.blurb, x + cardWidth / 2, y + 120, cardWidth - 34, 24, '20px "Trebuchet MS", system-ui, sans-serif', PALETTE.muted);
    const level = world.refits[card.id] ?? 0;
    centred(ctx, `fitted ${level} time${level === 1 ? '' : 's'}`, x + cardWidth / 2, y + 174, '16px "Consolas", monospace', PALETTE.bioDim);
  });
  centred(ctx, 'press 1, 2 or 3 — or click a card', VIEW.width / 2, 470, '22px "Trebuchet MS", system-ui, sans-serif', PALETTE.text);
  centred(ctx, `deepest this run ${Math.round(world.depthMax)} m   ·   dives ${world.stats.dives}`, VIEW.width / 2, 504, '18px "Consolas", monospace', PALETTE.muted);
  const fitted = REFITS.filter((refit) => (world.refits[refit.id] ?? 0) > 0).map((refit) => `${refit.name.toLowerCase()} ×${world.refits[refit.id]}`);
  if (fitted.length > 0) {
    centred(ctx, fitted.join('   ·   '), VIEW.width / 2, 518, '17px "Consolas", monospace', PALETTE.bioDim);
  }

  // The dive just ended: what it earned, what it cost, what the yard paid for the contracts.
  const summary = world.summary;
  if (summary) {
    panel(ctx, VIEW.width / 2 - 290, 548, 580, 108, 0.86);
    centred(ctx, `LAST DIVE ${summary.dive}`, VIEW.width / 2, 574, 'bold 17px "Consolas", monospace', PALETTE.muted);
    const cells = [
      ['earned', `$${summary.earned}`],
      ['tonnage', `${summary.mass} t`],
      ['lost to hulls', `${summary.lost}`],
      ['contracts paid', `$${summary.contracts}`],
    ];
    cells.forEach(([label, value], index) => {
      const x = VIEW.width / 2 - 250 + index * 170;
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '14px "Consolas", monospace';
      ctx.fillText(label, x, 602);
      ctx.fillStyle = index === 0 ? PALETTE.amberHot : PALETTE.text;
      ctx.font = 'bold 23px "Consolas", monospace';
      ctx.fillText(value, x, 628);
    });
    ctx.textAlign = 'center';
    const open = world.contracts.filter((contract) => !contract.done).length;
    centred(ctx, open === 0 ? 'all three contracts closed' : `${open} contract${open === 1 ? '' : 's'} still open`, VIEW.width / 2, 650, '16px "Consolas", monospace', open === 0 ? PALETTE.bio : PALETTE.bioDim);
  }
}

export function drawGameOver(ctx, world, view) {
  ctx.fillStyle = 'rgba(26, 8, 10, 0.42)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const title = view.reason === 'oxygen' ? 'OUT OF AIR' : 'HULL BREACH';
  const sub = view.reason === 'oxygen' ? 'the tank ran dry in the dark' : 'the pressure found the seams';
  centred(ctx, title, VIEW.width / 2, 176, 'bold 58px "Trebuchet MS", system-ui, sans-serif', PALETTE.bad);
  centred(ctx, sub, VIEW.width / 2, 210, '23px "Trebuchet MS", system-ui, sans-serif', PALETTE.muted);

  panel(ctx, VIEW.width / 2 - 290, 244, 580, 196, 0.94);
  const rows = [
    ['banked hauls', `$${world.banked}`],
    ['deepest dive', `${Math.round(world.depthMax)} m`],
    ['pieces brought up', `${world.stats.items}`],
    ['dives made', `${world.stats.dives}`],
    ['time in the trench', formatTime(view.time)],
  ];
  rows.forEach(([label, value], index) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '21px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(label, VIEW.width / 2 - 258, 282 + index * 34);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 23px "Consolas", monospace';
    ctx.fillText(value, VIEW.width / 2 + 258, 282 + index * 34);
  });
  if (view.best > 0) {
    centred(ctx, view.newBest ? `new best haul  $${view.best}` : `best haul  $${view.best}`, VIEW.width / 2, 470, '23px "Consolas", monospace', PALETTE.bio);
  }
  const pulse = 0.6 + 0.4 * Math.sin(view.time * 4);
  centred(ctx, 'press SPACE to dive again', VIEW.width / 2, 516, 'bold 31px "Trebuchet MS", system-ui, sans-serif', PALETTE.text, pulse);
  centred(ctx, 'the contract is still open — bank $1,800 before the hull or the air gives out', VIEW.width / 2, 552, '18px "Trebuchet MS", system-ui, sans-serif', PALETTE.muted);
}

export function drawWon(ctx, world, view) {
  ctx.fillStyle = 'rgba(2, 22, 20, 0.48)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const glow = ctx.createRadialGradient(VIEW.width / 2, 200, 20, VIEW.width / 2, 220, 460);
  glow.addColorStop(0, 'rgba(111, 240, 208, 0.18)');
  glow.addColorStop(1, 'rgba(111, 240, 208, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, VIEW.width, 460);
  centred(ctx, 'CONTRACT COMPLETE', VIEW.width / 2, 188, 'bold 54px "Trebuchet MS", system-ui, sans-serif', PALETTE.bio);
  centred(ctx, `$${world.banked} of salvage signed over to the Halcyon yard`, VIEW.width / 2, 224, '23px "Trebuchet MS", system-ui, sans-serif', PALETTE.text);

  panel(ctx, VIEW.width / 2 - 290, 258, 580, 190, 0.9);
  const rows = [
    ['banked hauls', `$${world.banked}`],
    ['deepest dive', `${Math.round(world.depthMax)} m`],
    ['pieces brought up', `${world.stats.items}`],
    ['dives made', `${world.stats.dives}`],
    ['time in the trench', formatTime(view.time)],
  ];
  rows.forEach(([label, value], index) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '21px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(label, VIEW.width / 2 - 258, 296 + index * 32);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 23px "Consolas", monospace';
    ctx.fillText(value, VIEW.width / 2 + 258, 296 + index * 32);
  });
  centred(ctx, 'press SPACE to sign another contract', VIEW.width / 2, 490, 'bold 29px "Trebuchet MS", system-ui, sans-serif', PALETTE.amberHot);
  if (view.best > 0) centred(ctx, `best haul  $${view.best}`, VIEW.width / 2, 526, '21px "Consolas", monospace', PALETTE.bio);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, font, colour) {
  ctx.fillStyle = colour;
  ctx.font = font;
  ctx.textAlign = 'center';
  const words = text.split(' ');
  let line = '';
  let offset = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + offset);
      line = word;
      offset += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y + offset);
}
