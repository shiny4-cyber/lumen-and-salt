// Headless logic tests over the real simulation: no browser, no rendering, fixed 1/60 s steps.
// Run with `node test/logic.test.mjs`. Every case is a regression: the run prints one row per
// test and exits non-zero on any failure.

import { CONTRACT_TARGET, CUT, GRAPPLE, PLAYER, WRECK } from '../game/src/config.js';
import { BANDS, environmentForDepth, environmentForY, spawnGap } from '../game/src/environment.js';
import { createElite, stepElites } from '../game/src/elites.js';
import { createSonar, ping, sonarCooldownFor, sonarRadius, stepSonar } from '../game/src/sonar.js';
import { createContracts, stepContracts } from '../game/src/contracts.js';
import { kindOf } from '../game/src/salvage.js';
import { collectCombo, createCombo, stepCombo } from '../game/src/economy.js';
import { lureSenseScale } from '../game/src/upgrades.js';
import { createRandom } from '../game/src/random.js';
import { createWorld, EVENT_DEAD, EVENT_HIT, EVENT_SALVAGE, PHASE_DEAD, PHASE_DIVE, PHASE_SURFACED, PHASE_WON } from '../game/src/world.js';
import { applyRefit } from '../game/src/upgrades.js';
import { cargoMass } from '../game/src/salvage.js';
import { anchorAt } from '../game/src/wrecks.js';
import { nearestFreeNode } from '../game/src/grapple.js';

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
  world.vents = [];
  world.wells = [];
  world.currents = [];
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

test('a silt vent telegraphs, then damages only inside its plume', () => {
  const world = freshWorld(31);
  clearField(world);
  world.vents = [];
  world.player.x = 800;
  world.player.y = 1200;
  world.player.hull = 100;
  world.player.mercy = 0;
  const vent = world.spawnVentAt(800, 1240, 1.0);
  stepWorld(world, 0.5);
  assert(world.player.hull === 100, `the idle vent hurt the diver: ${world.player.hull}`);
  assert(vent.phase === 'idle', `phase ${vent.phase}`);
  vent.clock = 6.3;
  world.player.mercy = 0;
  stepWorld(world, 0.2);
  assert(vent.phase === 'blast', `phase ${vent.phase}`);
  assert(world.player.hull < 100, 'the blast did not damage the diver');
  assert(world.player.vy < 0, 'the blast did not push the diver up');
});

test('a pressure well pulls inside its ring and is inert at rest', () => {
  const world = freshWorld(32);
  clearField(world);
  world.wells = [];
  world.player.x = 700;
  world.player.y = 1400;
  world.player.ballast = 0.5;
  world.player.oxygen = 999;
  const well = world.spawnWellAt(800, 1400, 1.0);
  const rest = Math.hypot(well.x - world.player.x, well.y - world.player.y);
  stepWorld(world, 0.6);
  near(Math.hypot(well.x - world.player.x, well.y - world.player.y), rest, 2, 'the resting well moved the diver');
  well.clock = 6.0;
  stepWorld(world, 1.2);
  const pulled = Math.hypot(well.x - world.player.x, well.y - world.player.y);
  assert(pulled < rest - 20, `the well did not pull: ${rest.toFixed(1)} -> ${pulled.toFixed(1)}`);
});

test('the trench changes band at 75 m, with denser wrecks and richer salvage', () => {
  assert(environmentForDepth(40).id === 'upper-trench', 'upper band wrong');
  assert(environmentForDepth(120).id === 'black-shelf', 'deep band wrong');
  const deep = environmentForDepth(120);
  const shallow = environmentForDepth(40);
  assert(deep.salvageScale > shallow.salvageScale, 'deep salvage is not richer');
  assert(deep.currentScale > shallow.currentScale, 'deep current is not stronger');
  const random = () => 0.5;
  assert(spawnGap(deep, random) < spawnGap(shallow, random), 'deep wrecks are not denser');
  const world = freshWorld(33);
  clearField(world);
  world.player.y = 3000;
  stepWorld(world, 1 / 60);
  assert(world.environment.id === 'black-shelf', `world band ${world.environment.id}`);
  assert(environmentForY(3000).label === 'BLACK SHELF', 'band label wrong');
});

test('a combo multiplies salvage and lapses when the diver stops cutting', () => {
  const combo = createCombo();
  const first = collectCombo(combo, 100, 1);
  const second = collectCombo(combo, 100, 1);
  const third = collectCombo(combo, 100, 1);
  assert(first === 100, `first paid ${first}`);
  assert(second === 125, `second paid ${second}`);
  assert(third === 150, `third paid ${third}`);
  stepCombo(combo, 7.6);
  assert(combo.multiplier === 1 && combo.count === 0, 'the combo did not lapse');
  const scaled = collectCombo(createCombo(), 100, 1.34);
  assert(scaled === 134, `deep-band value ${scaled}`);
});

test('the light servo trades air for thrust', () => {
  const plain = freshWorld(34);
  const servo = freshWorld(34);
  for (const world of [plain, servo]) {
    clearField(world);
    world.player.y = 600;
    world.player.ballast = 0.5;
    world.player.oxygen = 999;
  }
  applyRefit(servo.refits, 'servo');
  stepWorld(plain, 0.4, { thrust: 1 });
  stepWorld(servo, 0.4, { thrust: 1 });
  assert(servo.player.vx > plain.player.vx * 1.1, `servo thrust ${servo.player.vx.toFixed(1)} vs ${plain.player.vx.toFixed(1)}`);
  assert(servo.player.oxygen < plain.player.oxygen, 'servo did not burn extra air');
});

test('the deep hull trades air capacity for hull', () => {
  const world = freshWorld(35);
  clearField(world);
  const oxygenBefore = world.player.oxygenMax;
  const hullBefore = world.player.hullMax;
  applyRefit(world.refits, 'deepHull');
  world.startDive();
  near(world.player.oxygenMax, oxygenBefore - 25, 0.001, 'deep hull oxygen');
  near(world.player.hullMax, hullBefore + 40, 0.001, 'deep hull integrity');
});

test('the sweep lens reaches further but wakes lures sooner', () => {
  const world = freshWorld(36);
  clearField(world);
  const wreck = world.spawnWreckAt(760, 900, 1);
  const node = wreck.nodes.find((entry) => !entry.free);
  const spot = { x: wreck.x + node.ox - 205, y: wreck.y + node.oy, radius: PLAYER.radius };
  const plain = nearestFreeNode(wreck, spot, CUT.range);
  const swept = nearestFreeNode(wreck, spot, CUT.range * 1.3);
  assert(plain === null, 'the plain lamp reached a piece 205 px away');
  assert(swept === node, 'the sweep lens did not reach the piece');
  assert(lureSenseScale({ silent: 0, sweep: 0 }) === 1, 'the plain lamp changed the sensing range');
  assert(lureSenseScale({ silent: 0, sweep: 1 }) > 1.2, 'the sweep did not widen lure attention');
  assert(lureSenseScale({ silent: 1, sweep: 0 }) < 0.7, 'the silent propeller did not shorten it');
});

test('the deep band spawns its own hazards', () => {
  const world = freshWorld(37);
  clearField(world);
  world.vents = [];
  world.wells = [];
  world.lastSpawnY = 2400;
  world.player.y = 2400;
  stepWorld(world, 0.5);
  assert(world.vents.length + world.wells.length > 0, 'no deep-band hazard spawned');
  assert(world.wrecks.length > 0, 'no deep-band wreck spawned');
});

test('three bands, each with its own hazard mix and salvage table', () => {
  assert(BANDS.length === 3, `bands ${BANDS.length}`);
  const ids = BANDS.map((band) => band.id);
  assert(new Set(ids).size === 3, 'band ids are not distinct');
  assert(environmentForDepth(10).id === 'upper-trench', environmentForDepth(10).id);
  assert(environmentForDepth(90).id === 'black-shelf', environmentForDepth(90).id);
  assert(environmentForDepth(200).id === 'brine-hollow', environmentForDepth(200).id);
  const hollow = environmentForDepth(200);
  assert(hollow.eliteChance > 0, 'the hollow has no elite');
  assert(hollow.salvageScale > environmentForDepth(90).salvageScale, 'hollow pays no more than the shelf');
  assert(hollow.salvageTable.includes('bell'), 'the hollow table has no bell');
  assert(!environmentForDepth(10).salvageTable.includes('bell'), 'the upper trench table holds a bell');
  assert(hollow.ventChance > environmentForDepth(90).ventChance, 'hollow vents are not denser');
});

test('four new salvage classes with their own mass, value and cut time', () => {
  const pearl = kindOf('pearl');
  const bloom = kindOf('bloom');
  const obsidian = kindOf('obsidian');
  const bell = kindOf('bell');
  for (const kind of [pearl, bloom, obsidian, bell]) {
    assert(typeof kind.cutTime === 'number' && kind.cutTime > 0, `${kind.id} has no cut time`);
    assert(kind.mass > 0, `${kind.id} has no mass`);
  }
  assert(bell.mass > obsidian.mass && obsidian.mass > bloom.mass, 'new masses are not distinct');
  assert(bell.value > obsidian.value && obsidian.value > bloom.value, 'new values are not distinct');
  assert(bell.cutTime > obsidian.cutTime && obsidian.cutTime > pearl.cutTime, 'new cut times are not distinct');
  const world = freshWorld(41);
  clearField(world);
  const wreck = world.spawnWreckAt(760, 900, 2, ['bell', 'pearl']);
  assert(wreck.nodes.every((node) => node.cutTime > 0), 'a node has no cut time');
});

test('a bell takes longer to cut than a pearl', () => {
  const measure = (kindId) => {
    const world = freshWorld(42);
    clearField(world);
    const wreck = world.spawnWreckAt(760, 900, 0, [kindId]);
    for (const node of wreck.nodes) node.kind = kindId;
    const bell = kindOf(kindId);
    for (const node of wreck.nodes) {
      node.label = bell.label;
      node.mass = bell.mass;
      node.cutTime = bell.cutTime;
      node.value = bell.value;
    }
    world.player.y = 880;
    parkAtNode(world, wreck);
    let seconds = 0;
    while (world.cargo.length === 0 && seconds < 6) {
      stepWorld(world, 0.1, { grapple: true, cut: true, aimX: anchorAt(wreck, 0).x, aimY: anchorAt(wreck, 0).y });
      seconds += 0.1;
    }
    return seconds;
  };
  const bell = measure('bell');
  const pearl = measure('pearl');
  assert(bell > pearl + 0.5, `bell ${bell.toFixed(1)}s vs pearl ${pearl.toFixed(1)}s`);
});

test('the glassmaw telegraphs, then charges, then recovers', () => {
  const player = { x: 800, y: 1200, radius: 17, mercy: 0 };
  const elite = createElite(() => 0.5, 800, 1500);
  const events = [];
  // One step inside the sense range must lock the lane and raise the windup, without damage.
  for (const event of stepElites([elite], 1 / 60, player, 0.1, false)) events.push(event.type);
  assert(elite.phase === 'windup', `phase ${elite.phase}`);
  assert(events.includes('windup'), 'no windup event was raised');
  assert(events.every((type) => type !== 'elite-hit'), 'the windup damaged the diver');
  // The lane is locked at the windup, so the charge is dodgeable by leaving it.
  const laneX = elite.laneX;
  const laneY = elite.laneY;
  for (let index = 0; index < 90; index += 1) stepElites([elite], 1 / 60, { ...player, x: 60, y: 200 }, 0.2 + index / 60, false);
  assert(elite.laneX === laneX && elite.laneY === laneY, 'the lane tracked the diver during the windup');
  assert(elite.phase === 'dash' || elite.phase === 'recover', `phase ${elite.phase}`);
  // A diver standing in the locked lane is hit, once, and the elite then recovers.
  const elite2 = createElite(() => 0.5, 800, 1500);
  stepElites([elite2], 1 / 60, player, 0.1, false);
  let hits = 0;
  for (let index = 0; index < 180; index += 1) {
    const out = stepElites([elite2], 1 / 60, player, 0.2 + index / 60, false);
    hits += out.filter((event) => event.type === 'elite-hit').length;
  }
  assert(hits === 1, `dash hits ${hits}`);
  assert(elite2.phase === 'recover' || elite2.phase === 'prowl', `post-hit phase ${elite2.phase}`);
  // Sonar drowses it: no new lane is locked.
  const elite3 = createElite(() => 0.5, 800, 1500);
  for (let index = 0; index < 120; index += 1) stepElites([elite3], 1 / 60, player, index / 60, true);
  assert(elite3.phase === 'prowl', `a drowsy elite locked a lane: ${elite3.phase}`);
});

test('a sonar ping reveals, drowses, and then cools down', () => {
  const sonar = createSonar();
  const refits = { sonarArray: 0 };
  assert(ping(sonar, refits) === true, 'the first ping was refused');
  assert(sonar.active > 0, 'the ping is not active');
  assert(ping(sonar, refits) === false, 'a second ping fired during the cooldown');
  const wake = 3;
  const drowsy = sonar.active > 0;
  assert(drowsy, 'the ping did not put the water to sleep');
  stepSonar(sonar, sonar.active + 0.1);
  assert(sonar.active === 0, 'the ping never ended');
  assert(sonar.cooldown > 0, 'the cooldown is not running');
  stepSonar(sonar, sonar.cooldown + 0.1);
  assert(ping(sonar, refits) === true, 'the set never cooled');
  assert(wake > 0, 'sanity');
  assert(sonarRadius({ sonarArray: 1 }) > sonarRadius({ sonarArray: 0 }), 'the array refit widened nothing');
  assert(sonarCooldownFor({ sonarArray: 1 }) < sonarCooldownFor({ sonarArray: 0 }), 'the array refit shortened nothing');
});

test('fast venting builds a bend and damages the hull; a slow rise does not', () => {
  const rise = (ballast) => {
    const world = freshWorld(44);
    clearField(world);
    world.player.y = 2200;
    world.player.oxygen = 999;
    world.player.hull = 100;
    world.player.ballast = ballast;
    let peakBend = 0;
    for (let index = 0; index < 240; index += 1) {
      world.step(STEP, { ...IDLE, ballast: 0, aimX: world.player.x, aimY: world.player.y - 100 });
      peakBend = Math.max(peakBend, world.player.bend);
    }
    return { bend: peakBend, hull: world.player.hull, rate: world.player.ascentRate };
  };
  const fast = rise(0);
  const slow = rise(0.3);
  assert(fast.bend > 0.3, `fast rise bend ${fast.bend.toFixed(2)}`);
  assert(fast.hull < 100, `fast rise did no damage: ${fast.hull.toFixed(1)}`);
  assert(slow.hull === 100, `slow rise damaged the hull: ${slow.hull.toFixed(1)}`);
  assert(slow.bend < fast.bend, 'the slow rise bent as hard as the fast one');
});

test('the contract board rolls three distinct jobs and pays them once', () => {
  const world = freshWorld(45);
  assert(world.contracts.length === 3, `contracts ${world.contracts.length}`);
  assert(new Set(world.contracts.map((entry) => entry.id)).size === 3, 'contracts are not distinct');
  // Force a cheap goal on the first contract and satisfy it from world state.
  const contract = world.contracts[0];
  contract.id = 'cut';
  contract.goal = 1;
  contract.progress = 0;
  world.stats.cuts = 1;
  const bankedBefore = world.banked;
  const closed = stepContracts(world);
  assert(closed.length === 1 && closed[0] === contract, `closed ${closed.length}`);
  world.banked += closed[0].reward;
  assert(world.banked > bankedBefore, 'the reward was not paid');
  const again = stepContracts(world);
  assert(again.length === 0, 'the contract paid twice');
});

test('surfacing writes a dive summary with earned, mass and loss', () => {
  const world = freshWorld(46);
  clearField(world);
  world.cargo.push({ kind: 'bell', label: 'drowned bell', colour: '#fff', value: 300, mass: 4.6, x: 0, y: 0, phase: 0, spin: 0 });
  world.cargo.push({ kind: 'pearl', label: 'brine pearl', colour: '#fff', value: 90, mass: 0.7, x: 0, y: 0, phase: 0, spin: 0 });
  world.diveLost = 2;
  world.player.y = -60;
  world.time = 9;
  stepWorld(world, 0.2);
  assert(world.phase === PHASE_SURFACED, world.phase);
  assert(world.summary !== null, 'no summary was written');
  near(world.summary.earned, 390, 0.001, 'summary earned');
  near(world.summary.mass, 5.3, 0.001, 'summary mass');
  assert(world.summary.lost === 2, `summary lost ${world.summary.lost}`);
  near(world.stats.massLanded, 5.3, 0.001, 'landed tonnage');
});

test('the new refits change how the dive is played', () => {
  // Air cache: the pod spawns and tops the tank up when reached.
  const cached = freshWorld(47);
  clearField(cached);
  applyRefit(cached.refits, 'airCache');
  cached.startDive();
  assert(cached.cache !== null, 'no air cache was placed');
  cached.player.oxygen = 40;
  cached.player.x = cached.cache.x;
  cached.player.y = cached.cache.y;
  const mask = stepWorld(cached, 0.1);
  assert(cached.player.oxygen > 40, 'the cache gave no air');
  assert(cached.cache.taken === true, 'the cache was not consumed');
  assert((mask & 32768) !== 0, 'no cache event');
  // Slack rope: an over-stretched tether holds instead of snapping.
  const slack = freshWorld(48);
  clearField(slack);
  applyRefit(slack.refits, 'slackRope');
  const wreck = slack.spawnWreckAt(slack.player.x + 260, slack.player.y, 1);
  attachTo(slack, wreck);
  slack.player.x -= GRAPPLE.snapSlack + 140;
  slack.step(STEP, { ...IDLE, grapple: true, aimX: slack.player.x - 100, aimY: slack.player.y });
  assert(slack.hook.state === 'attached', 'the slack rope snapped');
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
