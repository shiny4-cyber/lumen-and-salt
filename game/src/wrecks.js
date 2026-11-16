// Wrecks: the drifting hulls that hold the salvage. A wreck is built once from the seeded
// generator (silhouette, ribs, anchor points, salvage nodes), then drifts on a slow sine,
// loses integrity with every cut, and collapses when a cut frees its last piece.

import { WRECK } from './config.js';
import { rollKind, valueOf } from './salvage.js';

const SHAPES = [
  { id: 'freighter', length: 300, height: 96, ribs: 7 },
  { id: 'tender', length: 232, height: 78, ribs: 5 },
  { id: 'liner', length: 348, height: 116, ribs: 9 },
  { id: 'bathysphere', length: 186, height: 120, ribs: 4 },
];

let nextId = 1;

/**
 * Build one wreck at (x, y) for a depth tier. `tier` picks the salvage table and the
 * integrity (how many cuts it survives before it buckles).
 */
export function createWreck(random, x, y, tier) {
  const shape = random.pick(SHAPES);
  const half = shape.length * 0.5;
  const hull = [];
  const segments = 12;
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const taper = Math.sin(Math.PI * t) ** 0.6;
    hull.push({
      x: -half + shape.length * t,
      y: -shape.height * 0.5 * taper - random.range(0, 6),
    });
  }
  for (let index = segments; index >= 0; index -= 1) {
    const t = index / segments;
    const taper = Math.sin(Math.PI * t) ** 0.55;
    hull.push({
      x: -half + shape.length * t,
      y: shape.height * 0.5 * taper + random.range(0, 6),
    });
  }

  const anchorCount = 2;
  const anchors = [];
  for (let index = 0; index < anchorCount; index += 1) {
    anchors.push({
      ox: -half * 0.55 + (shape.length * 0.55 * index) / Math.max(1, anchorCount - 1),
      oy: random.range(-shape.height * 0.2, shape.height * 0.2),
    });
  }

  const nodeCount = shape.id === 'liner' ? 4 : shape.id === 'tender' ? 2 : 3;
  const nodes = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const kind = rollKind(random, tier);
    nodes.push({
      id: `${nextId}-${index}`,
      kind,
      label: kind.label,
      colour: kind.colour,
      radius: kind.radius,
      mass: kind.mass,
      value: valueOf(kind, tier, 0),
      ox: -half * 0.62 + (shape.length * 0.62 * index) / Math.max(1, nodeCount - 1) + random.range(-14, 14),
      oy: random.range(-shape.height * 0.32, shape.height * 0.34),
      cut: 0,
      free: false,
      wobble: random() * Math.PI * 2,
    });
  }

  return {
    id: nextId++,
    shape: shape.id,
    tier,
    baseX: x,
    x,
    y,
    half,
    height: shape.height,
    hull,
    ribs: shape.ribs,
    anchors,
    nodes,
    driftPhase: random() * Math.PI * 2,
    driftAmp: WRECK.driftRange * (0.5 + random() * 0.8),
    driftRate: 0.11 + random() * 0.09,
    angle: random.range(-0.16, 0.16),
    integrity: 2 + tier,
    maxIntegrity: 2 + tier,
    collapsing: false,
    collapseTimer: WRECK.collapseDelay,
    dead: false,
    hitFlash: 0,
    // The wreck is a little loose in the water: tension tugs it toward the diver.
    vx: 0,
    vy: 0,
  };
}

/** Anchor positions in world space, for the hook and the tether. */
export function anchorAt(wreck, index) {
  const anchor = wreck.anchors[Math.max(0, Math.min(wreck.anchors.length - 1, index))];
  return { x: wreck.x + anchor.ox, y: wreck.y + anchor.oy, ox: anchor.ox, oy: anchor.oy };
}

export function nodeAt(wreck, node) {
  return { x: wreck.x + node.ox, y: wreck.y + node.oy };
}

export function stepWrecks(wrecks, dt, time, currentForce) {
  for (const wreck of wrecks) {
    if (wreck.dead) continue;
    wreck.driftPhase += wreck.driftRate * dt;
    wreck.vx *= 1 - 0.9 * dt;
    wreck.vy *= 1 - 0.9 * dt;
    wreck.x += wreck.vx * dt;
    wreck.y += wreck.vy * dt;
    wreck.x = wreck.baseX + Math.sin(wreck.driftPhase) * wreck.driftAmp;
    wreck.hitFlash = Math.max(0, wreck.hitFlash - dt * 2.2);
    if (wreck.collapsing) {
      wreck.collapseTimer -= dt;
      wreck.angle += 0.55 * dt;
      // Buckling throws off silt and small debris before it goes.
      if (wreck.collapseTimer > 0) {
        wreck.y += 26 * dt;
        wreck.shakeImpulse = 1;
      }
    }
    if (currentForce) {
      wreck.x += currentForce * 0.02 * dt;
    }
  }
}

/** Mark the wreck as buckled: it will collapse after the delay, and its cuts stop paying. */
export function beginCollapse(wreck) {
  if (wreck.collapsing || wreck.dead) return false;
  wreck.collapsing = true;
  wreck.collapseTimer = WRECK.collapseDelay;
  return true;
}

/** Remove a wreck from play and return the pieces and the damage it deals at its position. */
export function collapseWreck(wreck) {
  wreck.dead = true;
  const lost = wreck.nodes.filter((node) => !node.free);
  return {
    x: wreck.x,
    y: wreck.y,
    radius: WRECK.collapseRadius,
    damage: WRECK.collapseDamage,
    lost,
  };
}
