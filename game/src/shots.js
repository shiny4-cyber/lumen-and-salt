// The screenshot scenes behind ?shot=cover|title|cut|over. Each one builds a real world with
// the real rules and stages it deterministically, so the same seed always paints the same
// frame — and everything in the frame exists in the simulation, never painted in by hand.

import { VIEW } from './config.js';
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
    settle(world, 0.4, { thrust: 0, ballast: 0, grapple: true, cut: true, aimX: 760, aimY: 1480 });
    world.hook.cutProgress = 0.78;
    return { screen: SCREEN_PLAY, camera: { x: 120, y: 1190 }, best: 235, reason: null };
  }

  // The cover: a deep working dive — tether under load, a lit wreck, a lure awake in the
  // lamp cone, two pieces in the hold, HUD mid-run.
  world.wrecks = [];
  world.lures = [];
  const wreck = world.spawnWreckAt(880, 1620, 2);
  world.spawnWreckAt(300, 2020, 3);
  world.spawnWreckAt(1180, 1180, 1);
  place(world, 604, 1584, 880, 1610);
  attachTo(world, wreck, 0);
  world.hook.cutProgress = 0.34;
  world.hook.cutNode = wreck.nodes[1];
  world.cargo.push({ kind: 'ingot', label: 'silver ingot', colour: '#bfd7e6', value: 162, mass: 2.2, x: 560, y: 1600, phase: 0.9, spin: 0.2 });
  world.cargo.push({ kind: 'glass', label: 'amber glass', colour: '#f2b33d', value: 94, mass: 1.4, x: 548, y: 1590, phase: 2.4, spin: -0.2 });
  world.player.aim = Math.atan2(1640 - 1584, 900 - 604);
  world.player.oxygen = 68;
  world.player.hull = 81;
  world.banked = 310;
  world.depthMax = 96;
  world.time = 148;
  const lureA = world.spawnLureAt(1010, 1560);
  lureA.awake = 2.2;
  const lureB = world.spawnLureAt(1180, 1760);
  lureB.awake = 0.6;
  world.spawnLureAt(250, 1900).awake = 0;
  for (let index = 0; index < 46; index += 1) {
    world.particles.spawnBubble(560 + Math.sin(index * 2.3) * 40, 1560 + Math.cos(index * 1.7) * 46, 10, -30 - (index % 5) * 6, 2 + (index % 3));
  }
  for (let index = 0; index < 24; index += 1) world.particles.spawnSpark(880 + Math.sin(index) * 40, 1600 + Math.cos(index) * 26, index % 4 ? 'amber' : 'dull');
  settle(world, 0.3, { thrust: 0, ballast: 0, grapple: true, cut: true, aimX: 900, aimY: 1610 });
  world.hook.cutProgress = 0.34;
  world.hook.tension = 0.42;
  return { screen: SCREEN_PLAY, camera: { x: 20, y: 1290 }, best: 310, reason: null };
}

export { VIEW };
