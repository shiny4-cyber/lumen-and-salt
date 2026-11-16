// A tuning probe, not a game feature: it plays the real rules with a simple bot — descend to
// the nearest wreck, grapple, cut three pieces, dodge what wakes, surface before the air runs
// out — and reports what happened over a set of seeds. It is how the balance numbers were
// chosen: the bot is deliberately naive (it never plans a route, never waits for a lure to
// pass), so it should sometimes win and often drown, not clear the contract every time.
//
// Run: node tools/autoplay.mjs [seeds] [seedOffset]

import { createWorld, PHASE_DEAD, PHASE_SURFACED, PHASE_WON } from '../game/src/world.js';
import { createRandom } from '../game/src/random.js';
import { applyRefit } from '../game/src/upgrades.js';
import { anchorAt } from '../game/src/wrecks.js';

const STEP = 1 / 60;
const MAX_STEPS = 60 * 60 * 30;

function nearestWreck(world) {
  let best = null;
  let bestDist = Infinity;
  for (const wreck of world.wrecks) {
    if (wreck.dead) continue;
    const dist = Math.hypot(wreck.x - world.player.x, wreck.y - world.player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = wreck;
    }
  }
  return best;
}

function intentFor(world) {
  const player = world.player;
  const idle = { thrust: 0, ballast: 0, grapple: false, cut: false, aimX: player.x, aimY: player.y };
  const threat = world.lures
    .filter((lure) => lure.awake > 0 && Math.hypot(lure.x - player.x, lure.y - player.y) < 260)
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
  player.lampOn = !(threat && Math.hypot(threat.x - player.x, threat.y - player.y) < 180);
  // Vents telegraph and wells ring: the bot reads both, the way a player can.
  const vent = world.vents
    .filter((entry) => entry.phase !== 'idle' && Math.abs(entry.x - player.x) < 110 && player.y > entry.y - 260 && player.y < entry.y + 40)
    .sort((a, b) => Math.abs(a.y - player.y) - Math.abs(b.y - player.y))[0];
  const well = world.wells
    .filter((entry) => entry.phase === 'pull' && Math.hypot(entry.x - player.x, entry.y - player.y) < entry.radius)
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
  if (vent || well) {
    const source = vent ?? well;
    const dx = player.x - source.x;
    const dy = player.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    return { thrust: Math.max(-1, Math.min(1, dx / length)), ballast: vent ? -0.6 : dy > 0 ? 0.5 : -0.5, grapple: false, cut: false, aimX: player.x + dx, aimY: player.y + dy };
  }
  const winding = world.elites.find((entry) => entry.phase === 'windup' && Math.hypot(entry.x - player.x, entry.y - player.y) < 460);
  if (winding) {
    // Step off the locked lane: perpendicular to it, away from the line.
    const px = -winding.laneY;
    const py = winding.laneX;
    const side = (player.x - winding.laneStartX) * px + (player.y - winding.laneStartY) * py >= 0 ? 1 : -1;
    return { thrust: Math.max(-1, Math.min(1, px * side)), ballast: py * side > 0 ? 0.5 : -0.5, grapple: false, cut: false, aimX: player.x + px * side * 100, aimY: player.y + py * side * 100 };
  }
  if (threat) {
    const dx = player.x - threat.x;
    const dy = player.y - threat.y;
    const length = Math.hypot(dx, dy) || 1;
    return { thrust: Math.max(-1, Math.min(1, dx / length)), ballast: dy > 0 ? 0.5 : -0.5, grapple: false, cut: false, aimX: player.x + dx, aimY: player.y + dy };
  }
  if (world.cargo.length >= 3 || player.oxygen < world.player.oxygenMax * 0.3) {
    // The bot reads the ascent gauge: it slows the vent before the bend builds.
    // Vent hard, then pulse the ballast back when the bend climbs: a human's ascent rhythm.
    const bend = player.bend ?? 0;
    return { thrust: 0, ballast: bend > 0.4 ? 0.6 : -1, grapple: false, cut: false, aimX: player.x, aimY: player.y - 100 };
  }
  const hook = world.hook;
  if (hook.state === 'attached' && hook.wreck) {
    const anchor = anchorAt(hook.wreck, hook.anchorIndex);
    return { thrust: 0, ballast: 0, grapple: true, cut: true, aimX: anchor.x, aimY: anchor.y };
  }
  const wreck = nearestWreck(world);
  if (!wreck) return { ...idle, ballast: 0.6 };
  if (hook.state === 'idle' && Math.hypot(wreck.x - player.x, wreck.y - player.y) < 500) {
    return { thrust: 0, ballast: 0, grapple: true, cut: false, aimX: wreck.x, aimY: wreck.y };
  }
  const dx = wreck.x - player.x;
  const dy = wreck.y - player.y;
  return { thrust: Math.max(-1, Math.min(1, dx / 140)), ballast: dy > 80 ? 0.7 : dy < -80 ? -0.7 : 0, grapple: false, cut: false, aimX: wreck.x, aimY: wreck.y };
}

function play(seed) {
  const world = createWorld(createRandom(seed));
  world.reset(seed);
  let steps = 0;
  while (world.phase !== PHASE_DEAD && world.phase !== PHASE_WON && steps < MAX_STEPS) {
    steps += 1;
    world.step(STEP, intentFor(world));
    if (world.phase === PHASE_SURFACED) {
      const offer = world.offers[steps % world.offers.length];
      if (offer) applyRefit(world.refits, offer.id);
      world.startDive();
    }
  }
  return {
    seed,
    outcome: world.phase,
    banked: world.banked,
    dives: world.dive + 1,
    seconds: Math.round(world.time),
    deepest: Math.round(world.depthMax),
    cuts: world.stats.cuts,
    hits: world.stats.hits,
    oxygen: Math.round(world.player.oxygen),
    hull: Math.round(world.player.hull),
  };
}

const count = Number(process.argv[2] ?? 12);
const offset = Number(process.argv[3] ?? 1);
const runs = [];
for (let index = 0; index < count; index += 1) runs.push(play(offset + index));
for (const run of runs) console.log(JSON.stringify(run));
const wins = runs.filter((run) => run.outcome === PHASE_WON).length;
const survived = runs.filter((run) => run.banked > 0).length;
const mean = Math.round(runs.reduce((sum, run) => sum + run.banked, 0) / runs.length);
console.log(`${wins}/${runs.length} closed the contract, ${survived}/${runs.length} banked a haul, mean $${mean}`);
