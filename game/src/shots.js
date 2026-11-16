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

  // The cover: the Brine Hollow at ~160 m. A lit wreck under tether, a vent warning on the
  // left, a pressure well pulling on the right, a glassmaw mid-windup with its danger lane
  // drawn across the frame, a sonar ping still ringing, a live combo and the contract board
  // in the HUD. Every object in it is the real simulation, staged by the real rules.
  world.wrecks = [];
  world.lures = [];
  world.vents = [];
  world.wells = [];
  world.elites = [];
  const hollowWreck = world.spawnWreckAt(880, 4720, 3);
  world.spawnWreckAt(300, 5120, 3);
  world.spawnWreckAt(1250, 4380, 2);
  place(world, 604, 4680, 900, 4704);
  attachTo(world, hollowWreck, 0);
  hollowWreck.nodes[1].cut = 0.46;
  world.hook.cutProgress = 0.46;
  world.hook.cutNode = hollowWreck.nodes[1];
  world.cargo.push({ kind: 'bell', label: 'drowned bell', colour: '#ffcf7a', value: 356, mass: 4.6, x: 566, y: 4692, phase: 0.9, spin: 0.2 });
  world.cargo.push({ kind: 'obsidian', label: 'obsidian shard', colour: '#7d7fa8', value: 186, mass: 3.2, x: 552, y: 4680, phase: 2.4, spin: -0.2 });
  world.player.aim = Math.atan2(4750 - 4680, 930 - 604);
  world.player.oxygen = 82;
  world.player.hull = 74;
  world.player.bend = 0.12;
  world.banked = 610;
  world.depthMax = 168;
  world.time = 268;
  world.combo.count = 3;
  world.combo.multiplier = 1.5;
  world.combo.timer = 5.4;
  world.band = 2;
  world.environment = environmentForY(4680);
  world.deepSeen = true;
  world.contracts = [
    { id: 'bank', title: 'bank a haul', unit: '$', goal: 560, reward: 130, progress: 610, done: true, closedDive: 1 },
    { id: 'cut', title: 'cut pieces free', unit: '', goal: 9, reward: 95, progress: 6, done: false, closedDive: -1 },
    { id: 'bell', title: 'raise a drowned bell', unit: '', goal: 1, reward: 190, progress: 0, done: false, closedDive: -1 },
  ];
  world.sonar.active = 1.5;
  world.sonar.cooldown = 4.2;
  world.sonar.radius = 620;
  const coverVent = world.spawnVentAt(330, 4880, 5.4);
  const coverWell = world.spawnWellAt(1160, 4520, 6.3);
  const coverElite = world.spawnEliteAt(1120, 4640);
  coverElite.phase = 'windup';
  coverElite.timer = 0.5;
  coverElite.laneX = -0.94;
  coverElite.laneY = 0.34;
  coverElite.laneStartX = coverElite.x;
  coverElite.laneStartY = coverElite.y;
  coverElite.angle = Math.atan2(coverElite.laneY, coverElite.laneX);
  const coverChorus = world.spawnChorusAt(700, 4540);
  coverChorus.phase = 'ring';
  coverChorus.timer = 0.55;
  coverChorus.ringRadius = 168;
  const lureA = world.spawnLureAt(1000, 4770);
  lureA.awake = 2.2;
  const lureB = world.spawnLureAt(760, 4990);
  lureB.awake = 0.8;
  world.spawnLureAt(220, 4600).awake = 0;
  for (let index = 0; index < 46; index += 1) {
    world.particles.spawnBubble(560 + Math.sin(index * 2.3) * 40, 4920 + Math.cos(index * 1.7) * 46, 10, -30 - (index % 5) * 6, 2 + (index % 3));
  }
  for (let index = 0; index < 26; index += 1) world.particles.spawnSpark(900 + Math.sin(index) * 40, 4700 + Math.cos(index) * 26, index % 4 ? 'amber' : 'dull');
  settle(world, 0.25, { thrust: 0, ballast: 0, grapple: true, cut: true, aimX: 900, aimY: 4710 });
  coverVent.clock = 5.4;
  coverWell.clock = 6.3;
  coverVent.phase = 'warning';
  coverWell.phase = 'pull';
  coverElite.phase = 'windup';
  coverElite.timer = 0.5;
  coverChorus.phase = 'ring';
  coverChorus.timer = 0.55;
  coverChorus.ringRadius = 168;
  world.sonar.active = 1.5;
  world.hook.cutProgress = 0.46;
  world.hook.tension = 0.44;
  return { screen: SCREEN_PLAY, camera: { x: 20, y: 4380 }, best: 610, reason: null };
}

export { VIEW };
