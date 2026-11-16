// Boot and the one loop. Input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one) and the renderer paints the result. The game
// moves between six screens: title, play, paused, refit, game over and contract complete.
//
// Query flags, for the screenshot scenes and the browser tests:
//   ?seed=N            fixes the trench that this run builds
//   ?shot=cover|title|cut|over   stages that scene, paints it twice, sets window.__shotReady
//   ?muted=1           starts with the synthesiser muted

import { BEST_KEY, MUTE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { EVENT_ATTACH, EVENT_COLLAPSE, EVENT_CUT, EVENT_DEAD, EVENT_FIRE, EVENT_HIT, EVENT_RELEASE, EVENT_SALVAGE, EVENT_SURFACED, EVENT_WON, PHASE_DEAD, PHASE_SURFACED, PHASE_WON } from './world.js';
import { createRenderer } from './render.js';
import { ACTION_CHOOSE_1, ACTION_CHOOSE_2, ACTION_CHOOSE_3, ACTION_CONFIRM, ACTION_LAMP, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { drawHud } from './hud.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_REFIT, SCREEN_TITLE, SCREEN_WON, drawGameOver, drawPaused, drawRefit, drawTitle, drawWon } from './screens.js';
import { stageShot } from './shots.js';
import { applyRefit } from './upgrades.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
/** ?manual=1 stops the frame loop from stepping: the tests drive the fixed step themselves. */
const manual = params.get('manual') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const ctx = renderer.context();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Private windows keep the best haul for this visit only.
  }
}

function readMuted() {
  if (params.get('muted') === '1') return true;
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Paint one frame: the scene, the HUD on a dive, then the screen's own overlay. */
function paint(view) {
  renderer.draw(world, { camera: view.camera });
  if (view.screen === SCREEN_PLAY || view.screen === SCREEN_REFIT) drawHud(ctx, world, view);
  if (view.screen === SCREEN_TITLE) drawTitle(ctx, world, view);
  else if (view.screen === SCREEN_PAUSED) drawPaused(ctx, world, view);
  else if (view.screen === SCREEN_REFIT) drawRefit(ctx, world, view);
  else if (view.screen === SCREEN_OVER) drawGameOver(ctx, world, view);
  else if (view.screen === SCREEN_WON) drawWon(ctx, world, view);
}

function runShot(name) {
  const scene = stageShot(name, world);
  const view = { screen: scene.screen === SCREEN_OVER ? SCREEN_OVER : scene.screen, camera: scene.camera, time: world.time, best: scene.best, reason: scene.reason, muted: true, newBest: scene.newBest ?? false };
  audio.setMuted(true);
  let painted = 0;
  function paintShot() {
    paint(view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paintShot);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintShot);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let muted = readMuted();
  audio.setMuted(muted);
  let accumulator = 0;
  let last = performance.now();
  let camera = renderer.camera(world);
  let cameraY = camera.y;
  let cameraX = camera.x;
  let deathReason = 'hull';
  let newBest = false;
  let aim = { x: world.player.x + 220, y: world.player.y };
  let override = null;
  let uiTime = 0;

  world.reset(seed);
  world.titleScene();

  function announce(message) {
    status.textContent = message;
  }

  function startRun(nextSeed) {
    world.reset(Number.isInteger(nextSeed) ? nextSeed : Math.floor(Math.random() * 4294967296));
    accumulator = 0;
    cameraY = renderer.camera(world).y;
    cameraX = renderer.camera(world).x;
    screen = SCREEN_PLAY;
    announce('Dive started.');
  }

  function endRun(won) {
    audio.play(won ? 'win' : 'dead');
    if (world.banked > best) {
      best = world.banked;
      newBest = true;
      saveBest(best);
    }
    screen = won ? SCREEN_WON : SCREEN_OVER;
    announce(won ? `Contract complete. Banked ${world.banked}.` : `Run over. Banked ${world.banked}.`);
  }

  function choose(index) {
    const offer = world.offers[index];
    if (!offer) return;
    applyRefit(world.refits, offer.id);
    audio.play('refit');
    world.startDive();
    accumulator = 0;
    cameraY = renderer.camera(world).y;
    screen = SCREEN_PLAY;
    announce(`Refit: ${offer.name}. Next dive.`);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Storage off: the mute lasts this visit.
      }
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (screen === SCREEN_TITLE && (actions & IMPORTANT_ACTIONS)) startRun();
    else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      if (actions & ACTION_LAMP) {
        world.toggleLamp();
        audio.play('ui');
        announce(world.player.lampOn ? 'Lamp on.' : 'Lamp off.');
      }
    } else if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (screen === SCREEN_REFIT) {
      if (actions & ACTION_CHOOSE_1) choose(0);
      else if (actions & ACTION_CHOOSE_2) choose(1);
      else if (actions & ACTION_CHOOSE_3) choose(2);
    } else if (screen === SCREEN_OVER || screen === SCREEN_WON) {
      if (actions & ACTION_CONFIRM) {
        newBest = false;
        startRun();
      }
    }
  }

  const IMPORTANT_ACTIONS = ACTION_CONFIRM;

  function currentIntent() {
    if (override) return override;
    const pointer = input.pointer();
    if (pointer.inside) aim = renderer.pointerToWorld(pointer.x, pointer.y, { x: cameraX, y: cameraY });
    return {
      thrust: input.thrust(),
      ballast: input.ballast(),
      grapple: input.grappleHeld(),
      cut: input.cutHeld(),
      aimX: aim.x,
      aimY: aim.y,
    };
  }

  function tick(dt) {
    uiTime += dt;
    if (screen === SCREEN_TITLE) {
      world.idle(dt);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const intent = currentIntent();
    world.player.aim = Math.atan2(intent.aimY - world.player.y, intent.aimX - world.player.x);
    const result = world.step(dt, intent);
    audio.setThruster(intent.ballast, intent.thrust, true);
    audio.setDepth(world.player.depth / 200);

    if (result.mask & EVENT_FIRE) audio.play('fire');
    if (result.mask & EVENT_ATTACH) {
      audio.play('attach');
      announce('Grapple attached.');
    }
    if (result.mask & EVENT_RELEASE) audio.play('release');
    if (result.mask & EVENT_SALVAGE) {
      audio.play('salvage');
      announce('Salvage cut free.');
    }
    if (result.mask & EVENT_COLLAPSE) {
      audio.play('collapse');
      announce('A hull collapsed.');
    }
    if (result.mask & EVENT_HIT) {
      audio.play('damage');
      announce(`Hull hit. ${Math.ceil(world.player.hull)} percent left.`);
    }
    if (result.cutting && Math.random() < 0.25) audio.play('cut');

    if (world.phase === PHASE_DEAD) {
      deathReason = world.player.oxygen <= 0 ? 'oxygen' : 'hull';
      endRun(false);
    } else if (world.phase === PHASE_WON) {
      endRun(true);
    } else if (world.phase === PHASE_SURFACED) {
      audio.play('surface');
      screen = SCREEN_REFIT;
      announce(`Surfaced. Banked ${world.banked}. Choose a refit with 1, 2 or 3.`);
    }
  }

  function followCamera(dt) {
    const target = renderer.camera(world);
    const rate = 1 - Math.exp(-6 * dt);
    cameraY += (target.y - cameraY) * rate;
    cameraX += (target.x - cameraX) * rate;
    camera = { x: cameraX, y: cameraY };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += elapsed;
    if (manual) {
      paint({
        screen,
        camera: screen === SCREEN_TITLE ? renderer.camera(world) : camera,
        time: screen === SCREEN_TITLE ? uiTime : world.time,
        best,
        reason: deathReason,
        muted,
        newBest,
      });
      return;
    }
    const actions = input.takeActions();
    handleActions(actions);
    while (accumulator >= STEP) {
      tick(STEP);
      accumulator -= STEP;
    }
    followCamera(elapsed);
    paint({
      screen,
      camera: screen === SCREEN_TITLE ? renderer.camera(world) : camera,
      time: screen === SCREEN_TITLE ? uiTime : world.time,
      best,
      reason: deathReason,
      muted,
      newBest,
    });
    audio.setThruster(0, 0, screen === SCREEN_PLAY);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // Refit cards are clickable as well as numbered.
  canvas.addEventListener('pointerdown', (event) => {
    if (screen !== SCREEN_REFIT) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 1280;
    if (x < 300) choose(0);
    else if (x < 660) choose(1);
    else choose(2);
  });

  announce('Lumen and Salt. Press Space to dive.');
  requestAnimationFrame(frame);

  // Test scaffolding: the browser tests step the real simulation through these hooks.
  window.__lumen = {
    world,
    screen: () => screen,
    setScreen: (value) => {
      screen = value;
    },
    debug: () => ({
      screen,
      phase: world.phase,
      dive: world.dive,
      time: Number(world.time.toFixed(2)),
      oxygen: Number(world.player.oxygen.toFixed(2)),
      hull: Number(world.player.hull.toFixed(2)),
      depth: Number(world.player.depth.toFixed(2)),
      x: Number(world.player.x.toFixed(1)),
      y: Number(world.player.y.toFixed(1)),
      vx: Number(world.player.vx.toFixed(1)),
      vy: Number(world.player.vy.toFixed(1)),
      ballast: Number(world.player.ballast.toFixed(3)),
      lamp: world.player.lampOn,
      cargo: world.cargo.length,
      cargoValue: world.banked + world.cargo.reduce((sum, item) => sum + item.value, 0),
      banked: world.banked,
      hook: world.hook.state,
      tension: Number(world.hook.tension.toFixed(2)),
      cut: Number(world.hook.cutProgress.toFixed(2)),
      wrecks: world.wrecks.length,
      lures: world.lures.length,
      stats: { ...world.stats },
      best,
      offers: world.offers.map((offer) => offer.id),
    }),
    advance: (seconds) => {
      handleActions(input.takeActions());
      const steps = Math.max(1, Math.round(seconds / STEP));
      for (let index = 0; index < steps; index += 1) tick(STEP);
      followCamera(seconds);
      paint({ screen, camera, time: world.time, best, reason: deathReason, muted, newBest });
    },
    setIntent: (intent) => {
      override = { thrust: 0, ballast: 0, grapple: false, cut: false, aimX: world.player.x, aimY: world.player.y + 100, ...override, ...intent };
    },
    clearIntent: () => {
      override = null;
    },
    start: () => startRun(),
    chooseRefit: (index) => choose(index),
    press: (action) => handleActions(action),
    teleport: (x, y) => {
      world.player.x = x;
      world.player.y = y;
      world.player.vx = 0;
      world.player.vy = 0;
      cameraX = renderer.camera(world).x;
      cameraY = renderer.camera(world).y;
    },
    nearestNode: () => {
      let wreck = world.wrecks[0] ?? null;
      let bestDist = Infinity;
      for (const candidate of world.wrecks) {
        const dist = Math.hypot(candidate.x - world.player.x, candidate.y - world.player.y);
        if (dist < bestDist) {
          bestDist = dist;
          wreck = candidate;
        }
      }
      if (!wreck) return null;
      const node = wreck.nodes.find((entry) => !entry.free);
      if (!node) return null;
      return { x: wreck.x + node.ox, y: wreck.y + node.oy, wreckX: wreck.x, wreckY: wreck.y };
    },
    /** Sampled canvas colours, so a test can prove the frame was actually painted. */
    samplePixels: (grid = 8) => {
      const out = [];
      const stepX = Math.max(1, Math.floor(canvas.width / grid));
      const stepY = Math.max(1, Math.floor(canvas.height / grid));
      for (let row = 0; row < grid; row += 1) {
        for (let column = 0; column < grid; column += 1) {
          const data = ctx.getImageData(column * stepX + (stepX >> 1), row * stepY + (stepY >> 1), 1, 1).data;
          out.push([data[0], data[1], data[2]]);
        }
      }
      return out;
    },
    nearestWreck: () => {
      const list = world.wrecks.filter((wreck) => !wreck.dead);
      if (list.length === 0) return null;
      let bestWreck = list[0];
      let bestDist = Infinity;
      for (const wreck of list) {
        const dist = Math.hypot(wreck.x - world.player.x, wreck.y - world.player.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestWreck = wreck;
        }
      }
      return { id: bestWreck.id, x: bestWreck.x, y: bestWreck.y, tier: bestWreck.tier, nodes: bestWreck.nodes.length, free: bestWreck.nodes.filter((node) => node.free).length, dead: bestWreck.dead };
    },
  };
}

if (shot) runShot(shot);
else runGame();
