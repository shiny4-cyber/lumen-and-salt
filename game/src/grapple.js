// The grapple: a hook that flies out, bites a wreck, and then holds a tether with real
// spring tension. Momentum is the mechanic — the tether pulls the diver through water,
// drags the wreck a little, and snaps if it is stretched too far.

import { CUT, GRAPPLE } from './config.js';
import { clamp, distance, normalize } from './mathx.js';
import { anchorAt, beginCollapse, nodeAt } from './wrecks.js';

export function createHook() {
  return {
    state: 'idle',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    travel: 0,
    flavour: 0,
    wreck: null,
    anchorIndex: 0,
    rest: GRAPPLE.minRest,
    tension: 0,
    cutNode: null,
    cutProgress: 0,
    cooldown: 0,
    flash: 0,
  };
}

export function releaseHook(hook, reason) {
  const wasAttached = hook.state === 'attached';
  hook.state = 'idle';
  hook.wreck = null;
  hook.cutNode = null;
  hook.cutProgress = 0;
  hook.tension = 0;
  hook.flavour = 0;
  return wasAttached ? reason : null;
}

function wreckHitAt(wrecks, x, y) {
  for (const wreck of wrecks) {
    if (wreck.dead) continue;
    for (let index = 0; index < wreck.anchors.length; index += 1) {
      const anchor = anchorAt(wreck, index);
      if (distance(x, y, anchor.x, anchor.y) < 26) return { wreck, anchorIndex: index };
    }
    if (Math.abs(x - wreck.x) < wreck.half && Math.abs(y - wreck.y) < wreck.height * 0.6) {
      return { wreck, anchorIndex: 0 };
    }
  }
  return null;
}

/**
 * Step the hook and return what happened: { events, tether, freeNodes }.
 * `tether` is the acceleration the rope puts on the diver this step.
 */
export function stepGrapple(state, dt, intent) {
  const hook = state.hook;
  const player = state.player;
  const events = [];
  const freeNodes = [];
  const tether = { x: 0, y: 0 };
  hook.cooldown = Math.max(0, hook.cooldown - dt);
  hook.flash = Math.max(0, hook.flash - dt * 3);

  if (hook.state === 'idle') {
    if (intent.grapple && hook.cooldown <= 0) {
      hook.state = 'flying';
      hook.x = player.x;
      hook.y = player.y;
      hook.travel = 0;
      hook.flavour = 1;
      const [dx, dy] = normalize(intent.aimX - player.x, intent.aimY - player.y);
      hook.vx = dx * GRAPPLE.speed;
      hook.vy = dy * GRAPPLE.speed;
      events.push({ type: 'fire' });
    }
    return { events, tether, freeNodes };
  }

  if (hook.state === 'flying') {
    hook.x += hook.vx * dt;
    hook.y += hook.vy * dt;
    hook.travel += GRAPPLE.speed * dt;
    const hit = wreckHitAt(state.wrecks, hook.x, hook.y);
    if (hit) {
      hook.state = 'attached';
      hook.wreck = hit.wreck;
      hook.anchorIndex = hit.anchorIndex;
      hook.rest = clamp(distance(hook.x, hook.y, player.x, player.y), GRAPPLE.minRest, GRAPPLE.maxRest);
      hook.flash = 1;
      events.push({ type: 'attach', x: hook.x, y: hook.y });
    } else if (hook.travel > GRAPPLE.reach * (state.refits.slackRope > 0 ? 1.15 : 1)) {
      hook.state = 'retracting';
    }
    return { events, tether, freeNodes };
  }

  if (hook.state === 'retracting') {
    const [dx, dy] = normalize(player.x - hook.x, player.y - hook.y);
    hook.x += dx * GRAPPLE.speed * 1.6 * dt;
    hook.y += dy * GRAPPLE.speed * 1.6 * dt;
    if (distance(hook.x, hook.y, player.x, player.y) < 18) hook.state = 'idle';
    return { events, tether, freeNodes };
  }

  // Attached: this is where tension, momentum and cutting live.
  const wreck = hook.wreck;
  if (!wreck || wreck.dead) {
    releaseHook(hook, 'snap');
    events.push({ type: 'release' });
    return { events, tether, freeNodes };
  }
  const anchor = anchorAt(wreck, hook.anchorIndex);
  const dx = anchor.x - player.x;
  const dy = anchor.y - player.y;
  const dist = Math.hypot(dx, dy) || 1;
  const stretch = dist - hook.rest;
  hook.tension = clamp(stretch / GRAPPLE.snapSlack, 0, 1.4);
  const slack = state.refits.slackRope > 0 ? 0.75 : 1;
  const pull = Math.min(GRAPPLE.maxPull * (1 + 0.3 * state.refits.winch) * slack, Math.max(0, stretch) * GRAPPLE.spring * slack);
  if (stretch > 0) {
    tether.x = (dx / dist) * pull;
    tether.y = (dy / dist) * pull;
    wreck.vx += (-dx / dist) * pull * GRAPPLE.wreckShare * dt;
    wreck.vy += (-dy / dist) * pull * GRAPPLE.wreckShare * dt;
  }
  if (stretch > GRAPPLE.snapSlack && state.refits.slackRope === 0) {
    releaseHook(hook, 'snap');
    events.push({ type: 'release' });
    return { events, tether: { x: 0, y: 0 }, freeNodes };
  }
  if (!intent.grapple) {
    releaseHook(hook, 'release');
    events.push({ type: 'release' });
    return { events, tether: { x: 0, y: 0 }, freeNodes };
  }

  if (intent.cut) {
    const node = nearestFreeNode(wreck, player, CUT.range * (1 + 0.15 * state.refits.winch + 0.3 * state.refits.sweep));
    if (node) {
      // Progress lives on the piece, not on the hook: drifting to another piece never throws
      // away work already done, and letting go for a moment does not reset the cut.
      hook.cutNode = node;
      const seconds = node.cutTime ?? CUT.seconds;
      node.cut = Math.min(1, node.cut + (dt / seconds) * (1 + 0.35 * state.refits.winch + 0.15 * state.refits.sweep));
      hook.cutProgress = node.cut;
      events.push({ type: 'cutting', x: player.x + (nodeAt(wreck, node).x - player.x) * 0.6, y: player.y + (nodeAt(wreck, node).y - player.y) * 0.6 });
      if (node.cut >= 1) {
        freeNodes.push({ wreck, node });
        hook.cutNode = null;
        hook.cutProgress = 0;
      }
    } else {
      hook.cutNode = null;
      hook.cutProgress = 0;
    }
  } else {
    hook.cutNode = null;
    hook.cutProgress = 0;
  }

  return { events, tether, freeNodes };
}

/** The nearest salvage node of this wreck still attached to it, within `range`. */
export function nearestFreeNode(wreck, player, range) {
  let best = null;
  let bestDist = range;
  for (const node of wreck.nodes) {
    if (node.free) continue;
    const position = nodeAt(wreck, node);
    const dist = distance(position.x, position.y, player.x, player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = node;
    }
  }
  return best;
}

