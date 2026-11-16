// The screenshot scenes behind ?shot=cover|title|cut|over. Each one builds a real world with
// the real rules and stages it deterministically, so the same seed always paints the same
// frame — and everything in the frame exists in the simulation, never painted in by hand.

import { VIEW } from './config.js';
import { environmentForY } from './environment.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './screens.js';

function settle(world, seconds, intent) {
  const steps = Math.round(seconds * 60);
  for (let index = 0; index < steps; index += 1) {
    world.step(1 / 60, intent ?? { thrust: 0, ballast: 0, grapple: false, cut: false, aimX: world.player.x + 200, aimY: world.player.y });
  }
}

/** Put the diver at (x, y) and aim him at a world point. */
function place(world, x, y, aimX, aimY) {
  world.player.x = x;
  world.player.y = y;
  world.player.vx = 0;
  world.player.vy = 0;
  world.player.ballast = 0.5;
  world.player.aim = Math.atan2(aimY - y, aimX - x);
  world.depthMax = Math.max(world.depthMax, y / 20);
}

function attachTo(world, wreck, anchorIndex) {
  const hook = world.hook;
  const anchor = wreck.anchors[anchorIndex];
  hook.state = 'attached';
  hook.wreck = wreck;
  hook.anchorIndex = anchorIndex;
  hook.rest = 210;
  hook.x = wreck.x + anchor.ox;
  hook.y = wreck.y + anchor.oy;
  hook.tension = 0.35;
  hook.cutProgress = 0;
}

/**
 * Build the named scene into `world` and return the screen to paint over it, plus the
 * values the overlay screens read. Any unknown name falls back to the cover.
 */
export function stageShot(name, world) {
  world.reset(20261116);
  const player = world.player;

  if (name === 'title') {
    // A quiet deep backdrop behind the title: wrecks and lures drifting, no diver on screen.
    world.wrecks = [];
    world.lures = [];
    world.spawnWreckAt(420, 1460, 2);
    world.spawnWreckAt(1170, 1980, 1);
    world.spawnLureAt(760, 1560);
    world.spawnLureAt(1080, 1720);
    place(world, 1800, 2200, 1600, 2100);
    world.toggleLamp();
    for (let index = 0; index < 180; index += 1) world.particles.step(1 / 60, 700, 1500, 60);
    world.player.oxygen = world.player.oxygenMax * 0.72;
    world.player.hull = 84;
    return { screen: SCREEN_TITLE, camera: { x: 260, y: 1180 }, best: 470, reason: null };
  }

  if (name === 'over') {
    world.wrecks = [];
    world.lures = [];
    world.spawnWreckAt(520, 1120, 2);
    place(world, 640, 1180, 780, 1200);
    world.banked = 880;
    world.depthMax = 132;
    world.stats = { cuts: 9, items: 7, hits: 3, collapses: 1, dives: 4, surfaced: 3, lost: 1 };
    world.player.hull = 0;
    world.time = 214;
    settle(world, 0.05);
    return { screen: SCREEN_OVER, camera: { x: 0, y: 900 }, best: 880, reason: 'hull', newBest: true };
  }

  if (name === 'cut') {
    // Close on a cut: the arc is nearly closed, sparks are still in the water, cargo trails.
    world.wrecks = [];
    world.lures = [];
    const wreck = world.spawnWreckAt(760, 1480, 2);
    world.spawnWreckAt(300, 1720, 1);
    place(world, 636, 1444, 760, 1480);
    attachTo(world, wreck, 1);
    world.hook.cutProgress = 0.78;
    world.hook.cutNode = wreck.nodes[0];
    const node = wreck.nodes[0];
    node.ox = 30;
    node.oy = -8;
    world.cargo.push({ kind: 'glass', label: 'amber glass', colour: '#f2b33d', value: 94, mass: 1.4, x: 600, y: 1462, phase: 0.4, spin: 0.2 });
    world.cargo.push({ kind: 'coil', label: 'copper coil', colour: '#e08b3c', value: 51, mass: 1, x: 590, y: 1452, phase: 2.1, spin: -0.1 });
    world.player.oxygen = 61;
    world.player.hull = 74;
    world.player.aim = Math.atan2(1480 - 1444, 760 - 636);
    for (let index = 0; index < 40; index += 1) world.particles.spawnSpark(700 + Math.sin(index) * 30, 1470 + Math.cos(index * 2) * 18, index % 3 ? 'amber' : 'dull');
    for (let index = 0; index < 24; index += 1) world.particles.spawnBubble(620 + Math.sin(index * 3) * 26, 1460 + Math.cos(index) * 20, 8, -40, 2);
    world.time = 96;
    world.banked = 235;
    world.lures.push(world.spawnLureAt(980, 1390));
    world.lures[0].awake = 1.4;
    world.spawnVentAt(980, 1610, 5.4);
    world.combo.count = 2;
    world.combo.multiplier = 1.25;
    world.combo.timer = 5.2;
    settle(world, 0.4, { thrust: 0, ballast: 0, grapple: true, cut: true, aimX: 760, aimY: 1480 });
    world.hook.cutProgress = 0.78;
    return { screen: SCREEN_PLAY, camera: { x: 120, y: 1190 }, best: 235, reason: null };
  }

  // The cover: the Black Shelf at ~90 m — a lit wreck under tether, a vent warning on the
  // left, a pressure well pulling on the right, a lure awake in the lamp cone, a live combo
  // in the HUD and two pieces in the hold. Everything in it is the real simulation.
  world.wrecks = [];
  world.lures = [];
  world.vents = [];
  world.wells = [];
  const shelfWreck = world.spawnWreckAt(900, 2760, 3);
  world.spawnWreckAt(300, 3160, 3);
  world.spawnWreckAt(1240, 2450, 2);
  place(world, 604, 2720, 900, 2744);
  attachTo(world, shelfWreck, 0);
  world.hook.cutProgress = 0.52;
  world.hook.cutNode = shelfWreck.nodes[1];
  shelfWreck.nodes[1].cut = 0.52;
  world.cargo.push({ kind: 'relic', label: 'trench relic', colour: '#7ef0c8', value: 214, mass: 2.8, x: 566, y: 2736, phase: 0.9, spin: 0.2 });
  world.cargo.push({ kind: 'ingot', label: 'silver ingot', colour: '#bfd7e6', value: 138, mass: 2.2, x: 552, y: 2724, phase: 2.4, spin: -0.2 });
  world.player.aim = Math.atan2(2790 - 2720, 930 - 604);
  world.player.oxygen = 74;
  world.player.hull = 78;
  world.banked = 380;
  world.depthMax = 96;
  world.time = 231;
  world.combo.count = 3;
  world.combo.multiplier = 1.5;
  world.combo.timer = 5.6;
  world.environment = environmentForY(2720);
  world.deepSeen = true;
  const coverVent = world.spawnVentAt(360, 2860, 5.4);
  const coverWell = world.spawnWellAt(1150, 2560, 6.3);
  const lureA = world.spawnLureAt(1040, 2660);
  lureA.awake = 2.2;
  const lureB = world.spawnLureAt(760, 2900);
  lureB.awake = 0.8;
  world.spawnLureAt(220, 2600).awake = 0;
  for (let index = 0; index < 46; index += 1) {
    world.particles.spawnBubble(560 + Math.sin(index * 2.3) * 40, 2960 + Math.cos(index * 1.7) * 46, 10, -30 - (index % 5) * 6, 2 + (index % 3));
  }
  for (let index = 0; index < 26; index += 1) world.particles.spawnSpark(900 + Math.sin(index) * 40, 2740 + Math.cos(index) * 26, index % 4 ? 'amber' : 'dull');
  settle(world, 0.25, { thrust: 0, ballast: 0, grapple: true, cut: true, aimX: 920, aimY: 2750 });
  coverVent.clock = 5.4;
  coverWell.clock = 6.3;
  coverVent.phase = 'warning';
  coverWell.phase = 'pull';
  world.hook.cutProgress = 0.52;
  world.hook.tension = 0.46;
  return { screen: SCREEN_PLAY, camera: { x: 20, y: 2420 }, best: 380, reason: null };
}

export { VIEW };
