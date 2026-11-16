// Headless logic tests over the real simulation: no browser, no rendering, fixed 1/60 s steps.
// Run with `node test/logic.test.mjs`. Every case is a regression: the run prints one row per
// test and exits non-zero on any failure.

import { CONTRACT_TARGET, GRAPPLE, PLAYER, WRECK } from '../game/src/config.js';
import { createRandom } from '../game/src/random.js';
import { createWorld, EVENT_DEAD, EVENT_HIT, EVENT_SALVAGE, PHASE_DEAD, PHASE_DIVE, PHASE_SURFACED, PHASE_WON } from '../game/src/world.js';
import { applyRefit } from '../game/src/upgrades.js';
import { cargoMass } from '../game/src/salvage.js';
import { anchorAt } from '../game/src/wrecks.js';

const rows = [];
function test(name, fn) {
  try {
    fn();
    rows.push({ ok: true, name, detail: '' });
  } catch (error) {
    rows.push({ ok: false, name, detail: error.message });
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function near(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected} (+/-${tolerance})`);
}

const IDLE = { thrust: 0, ballast: 0, grapple: false, cut: false, aimX: 0, aimY: 0 };
const STEP = 1 / 60;

function freshWorld(seed = 7) {
  const world = createWorld(createRandom(seed));
  world.reset(seed);
  return world;
}

/** Clear the spawn director's field so a test sees only the wreck it placed itself. */
function clearField(world) {
  world.wrecks = [];
  world.lures = [];
}

function stepWorld(world, seconds, intent) {
  const steps = Math.round(seconds / STEP);
  let mask = 0;
  for (let index = 0; index < steps; index += 1) {
    const result = world.step(STEP, { ...IDLE, aimX: world.player.x + 100, aimY: world.player.y, ...intent });
    mask |= result.mask;
  }
  return mask;
}

/** Attach the tether to `wreck` the way the hook does, with a rest length that will not snap. */
function attachTo(world, wreck, index = 0) {
  const player = world.player;
  const anchor = anchorAt(wreck, index);
  world.hook.state = 'attached';
  world.hook.wreck = wreck;
  world.hook.anchorIndex = index;
  world.hook.x = anchor.x;
  world.hook.y = anchor.y;
  world.hook.rest = Math.hypot(anchor.x - player.x, anchor.y - player.y);
}

/** Place the diver beside the nearest free node of a wreck and attach to it. */
function parkAtNode(world, wreck, offsetX = 70) {
  const node = wreck.nodes.find((entry) => !entry.free) ?? wreck.nodes[0];
  world.player.x = wreck.x + node.ox - offsetX;
  world.player.y = wreck.y + node.oy;
  world.player.vx = 0;
  world.player.vy = 0;
  attachTo(world, wreck, 0);
}

test('oxygen drains, and drains faster with depth', () => {
  const shallow = freshWorld(11);
  const deep = freshWorld(11);
  clearField(shallow);
  clearField(deep);
  shallow.player.y = 100;
  deep.player.y = 1800;
  shallow.player.ballast = 0.5;
  deep.player.ballast = 0.5;
  const shallowStart = shallow.player.oxygen;
  const deepStart = deep.player.oxygen;
  stepWorld(shallow, 6);
  stepWorld(deep, 6);
  const shallowLoss = shallowStart - shallow.player.oxygen;
  const deepLoss = deepStart - deep.player.oxygen;
  assert(shallowLoss > 0, 'oxygen never drained');
  assert(deepLoss > shallowLoss * 1.5, `deep drain ${deepLoss.toFixed(2)} not clearly above shallow ${shallowLoss.toFixed(2)}`);
});

test('an empty tank ends the run', () => {
  const world = freshWorld(12);
  clearField(world);
  world.player.oxygen = 0.05;
  const mask = stepWorld(world, 1);
  assert(world.phase === PHASE_DEAD, `phase is ${world.phase}`);
  assert((mask & EVENT_DEAD) !== 0, 'no EVENT_DEAD was raised');
});

test('a broken hull ends the run', () => {
  const world = freshWorld(13);
  clearField(world);
  const lure = world.spawnLureAt(world.player.x, world.player.y);
  lure.awake = 5;
  world.player.hull = 12;
  world.player.mercy = 0;
  stepWorld(world, 3, { aimX: world.player.x, aimY: world.player.y });
  assert(world.phase === PHASE_DEAD, `phase is ${world.phase}`);
});

test('grapple attaches to a wreck it is aimed at', () => {
  const world = freshWorld(14);
  clearField(world);
  const wreck = world.spawnWreckAt(world.player.x + 200, world.player.y + 40, 1);
  for (let index = 0; index < 60 && world.hook.state !== 'attached'; index += 1) {
    world.step(STEP, { ...IDLE, grapple: true, aimX: wreck.x, aimY: wreck.y });
  }
  assert(world.hook.state === 'attached', `hook state ${world.hook.state}`);
  assert(world.hook.wreck === wreck, 'hook attached to the wrong wreck');
  assert(world.hook.rest >= GRAPPLE.minRest && world.hook.rest <= GRAPPLE.maxRest, 'rest length out of band');
});

test('releasing the button lets the tether go', () => {
  const world = freshWorld(15);
  clearField(world);
  const wreck = world.spawnWreckAt(world.player.x + 200, world.player.y, 1);
  attachTo(world, wreck);
  stepWorld(world, 0.4, { grapple: true });
  assert(world.hook.state === 'attached', 'tether dropped while held');
  stepWorld(world, 0.1, { grapple: false });
  assert(world.hook.state === 'idle', `hook state ${world.hook.state} after release`);
});

test('tether tension pulls the diver toward the anchor without snapping', () => {
  const world = freshWorld(16);
  clearField(world);
  const wreck = world.spawnWreckAt(world.player.x + 260, world.player.y, 1);
  attachTo(world, wreck);
  world.player.x -= 90;
  const anchor = anchorAt(wreck, 0);
  const before = Math.hypot(anchor.x - world.player.x, anchor.y - world.player.y);
  let peak = 0;
  for (let index = 0; index < 60; index += 1) {
    world.step(STEP, { ...IDLE, grapple: true, aimX: anchor.x, aimY: anchor.y });
    peak = Math.max(peak, world.hook.tension);
  }
  const after = Math.hypot(anchor.x - world.player.x, anchor.y - world.player.y);
  assert(world.hook.state === 'attached', `tether snapped early: ${world.hook.tension}`);
  assert(after < before - 12, `the tether did not pull: ${before.toFixed(1)} -> ${after.toFixed(1)}`);
  assert(peak > 0.05, `tension peaked at ${peak}, it did not register`);
});

test('an over-stretched tether snaps and lets go', () => {
  const world = freshWorld(17);
  clearField(world);
  const wreck = world.spawnWreckAt(world.player.x + 260, world.player.y, 1);
  attachTo(world, wreck);
  world.player.x -= GRAPPLE.snapSlack + 140;
  world.step(STEP, { ...IDLE, grapple: true, aimX: world.player.x - 100, aimY: world.player.y });
  assert(world.hook.state !== 'attached', `the tether held at ${world.hook.tension} tension`);
});

test('cutting frees exactly one piece and costs the wreck integrity', () => {
  const world = freshWorld(18);
  clearField(world);
  const wreck = world.spawnWreckAt(760, 900, 1);
  world.player.y = 880;
  parkAtNode(world, wreck);
  const integrity = wreck.integrity;
  const mask = stepWorld(world, 2.2, { grapple: true, cut: true, aimX: anchorAt(wreck, 0).x, aimY: anchorAt(wreck, 0).y });
  assert(world.cargo.length === 1, `cargo ${world.cargo.length}`);
  assert((mask & EVENT_SALVAGE) !== 0, 'no EVENT_SALVAGE');
  assert(wreck.integrity === integrity - 1, `integrity ${wreck.integrity} vs ${integrity}`);
});

test('a cut keeps its progress when the diver lets go', () => {
  const world = freshWorld(28);
  clearField(world);
  const wreck = world.spawnWreckAt(760, 900, 1);
  world.player.y = 880;
  parkAtNode(world, wreck);
  stepWorld(world, 0.8, { grapple: true, cut: true, aimX: anchorAt(wreck, 0).x, aimY: anchorAt(wreck, 0).y });
  const partial = wreck.nodes.find((node) => !node.free).cut;
  assert(partial > 0.4 && partial < 1, `progress after 0.8 s is ${partial}`);
  stepWorld(world, 0.6, { grapple: true, cut: false });
  near(wreck.nodes.find((node) => !node.free).cut, partial, 1e-9, 'progress survived the pause');
  stepWorld(world, 0.8, { grapple: true, cut: true, aimX: anchorAt(wreck, 0).x, aimY: anchorAt(wreck, 0).y });
  assert(world.cargo.length === 1, `resumed cut did not finish: cargo ${world.cargo.length}`);
});

test('cutting needs the diver beside the piece', () => {
  const world = freshWorld(19);
  clearField(world);
  const wreck = world.spawnWreckAt(760, 900, 1);
  world.player.x = 1200;
  world.player.y = 1400;
  attachTo(world, wreck);
  world.hook.rest = 3000;
  stepWorld(world, 2.2, { grapple: true, cut: true, aimX: wreck.x, aimY: wreck.y });
  assert(world.cargo.length === 0, `a piece was cut from 600 px away: ${world.cargo.length}`);
});

test('carried salvage adds mass, slows thrust and sinks harder', () => {
  const empty = freshWorld(20);
  const loaded = freshWorld(20);
  clearField(empty);
  clearField(loaded);
  for (const world of [empty, loaded]) {
    world.player.y = 600;
    world.player.ballast = 0.5;
    world.player.oxygen = 999;
  }
  for (let index = 0; index < 3; index += 1) {
    loaded.cargo.push({ kind: 'ingot', label: 'silver ingot', colour: '#fff', value: 100, mass: 2.2, x: 0, y: 0, phase: 0, spin: 0 });
  }
  stepWorld(empty, 1.5, { thrust: 1 });
  stepWorld(loaded, 1.5, { thrust: 1 });
  assert(cargoMass(loaded.cargo) > cargoMass(empty.cargo), 'cargo mass did not grow');
  assert(loaded.player.vx < empty.player.vx * 0.85, `thrust not slowed: ${loaded.player.vx.toFixed(1)} vs ${empty.player.vx.toFixed(1)}`);
  assert(loaded.player.vy > empty.player.vy + 4, `sink not heavier: ${loaded.player.vy.toFixed(1)} vs ${empty.player.vy.toFixed(1)}`);
});

test('a lure in the lamp light hits the diver', () => {
  const world = freshWorld(21);
  clearField(world);
  world.player.hull = 100;
  world.player.mercy = 0;
  world.player.lampOn = true;
  const lure = world.spawnLureAt(world.player.x + 60, world.player.y);
  lure.awake = 4;
  const mask = stepWorld(world, 2.5, { aimX: world.player.x + 60, aimY: world.player.y });
  assert((mask & EVENT_HIT) !== 0, 'no EVENT_HIT');
  assert(world.player.hull < 100, `hull unchanged: ${world.player.hull}`);
});

test('a collapsing hull damages a diver inside its radius', () => {
  const world = freshWorld(22);
  clearField(world);
  const wreck = world.spawnWreckAt(760, 900, 1);
  parkAtNode(world, wreck);
  wreck.integrity = 1;
  stepWorld(world, 2.2, { grapple: true, cut: true, aimX: anchorAt(wreck, 0).x, aimY: anchorAt(wreck, 0).y });
  assert(wreck.collapsing, 'the wreck did not start to collapse');
  world.player.mercy = 0;
  const hull = world.player.hull;
  stepWorld(world, WRECK.collapseDelay + 0.4, { aimX: wreck.x, aimY: wreck.y });
  assert(wreck.dead, 'the wreck never collapsed');
  assert(world.player.hull < hull, `no collapse damage: ${world.player.hull} vs ${hull}`);
});

test('ballast sets the ascent speed', () => {
  const vented = freshWorld(23);
  const half = freshWorld(23);
  for (const world of [vented, half]) {
    clearField(world);
    world.player.y = 1400;
    world.player.oxygen = 999;
    world.player.ballast = 1;
  }
  stepWorld(vented, 2.4, { ballast: -1 });
  stepWorld(half, 2.4, { ballast: 0 });
  assert(vented.player.ballast < 0.2, `ballast did not vent: ${vented.player.ballast}`);
  assert(vented.player.vy < half.player.vy - 20, `vented rise ${vented.player.vy.toFixed(1)} not faster than ${half.player.vy.toFixed(1)}`);
});

test('surfacing banks the hold and offers three refits', () => {
  const world = freshWorld(24);
  clearField(world);
  world.cargo.push({ kind: 'ingot', label: 'silver ingot', colour: '#fff', value: 120, mass: 2.2, x: 0, y: 0, phase: 0, spin: 0 });
  world.player.y = -60;
  world.time = 5;
  stepWorld(world, 0.2);
  assert(world.phase === PHASE_SURFACED, `phase ${world.phase}`);
  near(world.banked, 120, 0.001, 'banked value');
  assert(world.cargo.length === 0, 'the hold was not emptied');
  assert(world.offers.length === 3, `offers ${world.offers.length}`);
});

test('a refit changes the next dive', () => {
  const world = freshWorld(25);
  clearField(world);
  const before = world.player.oxygenMax;
  applyRefit(world.refits, 'tank');
  world.startDive();
  near(world.player.oxygenMax, before + 25, 0.001, 'oxygen capacity');
  near(world.player.oxygen, before + 25, 0.001, 'oxygen fill');
  assert(world.dive === 1, `dive ${world.dive}`);
});

test('banking the contract target wins the run', () => {
  const world = freshWorld(26);
  clearField(world);
  world.banked = CONTRACT_TARGET - 50;
  world.cargo.push({ kind: 'relic', label: 'trench relic', colour: '#fff', value: 50, mass: 2.8, x: 0, y: 0, phase: 0, spin: 0 });
  world.player.y = -60;
  world.time = 5;
  stepWorld(world, 0.2);
  assert(world.phase === PHASE_WON, `phase ${world.phase}`);
});

test('restart clears the run', () => {
  const world = freshWorld(27);
  clearField(world);
  world.banked = 400;
  world.cargo.push({ kind: 'coil', label: 'copper coil', colour: '#fff', value: 30, mass: 1, x: 0, y: 0, phase: 0, spin: 0 });
  world.player.hull = 20;
  world.reset(99);
  assert(world.banked === 0, 'banked not cleared');
  assert(world.cargo.length === 0, 'cargo not cleared');
  assert(world.dive === 0, `dive ${world.dive}`);
  assert(world.phase === PHASE_DIVE, `phase ${world.phase}`);
  assert(world.player.oxygen === world.player.oxygenMax, 'tank not refilled');
  assert(world.wrecks.length > 0, 'no wrecks spawned');
});

test('the same seed builds the same run', () => {
  const a = freshWorld(1234);
  const b = freshWorld(1234);
  const intent = { thrust: 0.4, ballast: 0.7, grapple: true, cut: true, aimX: 900, aimY: 1200 };
  for (let index = 0; index < 600; index += 1) {
    a.step(STEP, intent);
    b.step(STEP, intent);
  }
  const snap = (world) => JSON.stringify([
    world.player.x, world.player.y, world.player.oxygen, world.player.hull,
    world.wrecks.map((wreck) => [wreck.x, wreck.y, wreck.integrity]),
    world.lures.map((lure) => [lure.x, lure.y]),
  ]);
  assert(snap(a) === snap(b), 'two runs of the same seed diverged');
});

// ---- report -------------------------------------------------------------------------------
const failed = rows.filter((row) => !row.ok);
const width = Math.max(...rows.map((row) => row.name.length));
console.log('');
console.log(`${'RESULT'.padEnd(6)}  TEST${' '.repeat(Math.max(1, width - 3))}  DETAIL`);
console.log('-'.repeat(width + 26));
for (const row of rows) {
  console.log(`${row.ok ? 'PASS' : 'FAIL'}    ${row.name.padEnd(width)}  ${row.detail}`);
}
console.log('-'.repeat(width + 26));
console.log(`${rows.length - failed.length}/${rows.length} passed, ${failed.length} failed`);
if (failed.length > 0) process.exitCode = 1;
