// The world: one run of dives. It owns the simulation state and steps it at a fixed rate,
// composing the diver, the grapple, the wrecks and the hazards. Nothing here touches the
// DOM, so the whole game can be stepped headlessly in a test.

import { CONTRACT_TARGET, LURE, TRENCH, WRECK } from './config.js';
import { createRandom } from './random.js';
import { createParticles } from './particles.js';
import { createPlayer, damagePlayer, isAtSurface, resetPlayerForDive, stepPlayer } from './player.js';
import { createHook, releaseHook, stepGrapple } from './grapple.js';
import { beginCollapse, collapseWreck, createWreck, nodeAt, stepWrecks } from './wrecks.js';
import { createLure, stepLures } from './hazards.js';
import { createCurrents, currentAt, currentForce } from './currents.js';
import { bandIndexForDepth, environmentForY, spawnGap } from './environment.js';
import { createElite, stepElites } from './elites.js';
import { createSonar, ping as sonarPing, sonarReady, stepSonar } from './sonar.js';
import { createContracts, stepContracts } from './contracts.js';
import { createVent, stepVents } from './vents.js';
import { createPressureWell, stepPressureWells } from './pressure-wells.js';
import { createCombo, stepCombo, collectCombo, resetCombo } from './economy.js';
import { cargoMass, cargoValue } from './salvage.js';
import { createRefits, lureSenseScale, rollOffers } from './upgrades.js';

export const EVENT_FIRE = 1;
export const EVENT_ATTACH = 2;
export const EVENT_RELEASE = 4;
export const EVENT_CUT = 8;
export const EVENT_SALVAGE = 16;
export const EVENT_HIT = 32;
export const EVENT_COLLAPSE = 64;
export const EVENT_SURFACED = 128;
export const EVENT_DEAD = 256;
export const EVENT_WON = 512;
export const EVENT_DEEP = 1024;
export const EVENT_VENT = 2048;
export const EVENT_WELL = 4096;
export const EVENT_BAND = 8192;
export const EVENT_CONTRACT = 16384;
export const EVENT_CACHE = 32768;
export const EVENT_ELITE = 65536;
export const EVENT_SONAR = 131072;
export const EVENT_BEND = 262144;

export const PHASE_DIVE = 'dive';
export const PHASE_SURFACED = 'surfaced';
export const PHASE_DEAD = 'dead';
export const PHASE_WON = 'won';

const SPAWN_AHEAD = 1700;
const MAX_WRECKS = 9;

export function createWorld(random) {
  const world = {
    random,
    refits: createRefits(),
    player: createPlayer(),
    hook: createHook(),
    particles: createParticles(random),
    wrecks: [],
    lures: [],
    currents: [],
    cargo: [],
    phase: PHASE_DIVE,
    time: 0,
    dive: 0,
    depthMax: 0,
    banked: 0,
    best: 0,
    stats: { cuts: 0, items: 0, hits: 0, collapses: 0, dives: 0, surfaced: 0, lost: 0, massLanded: 0, bells: 0, contracts: 0, eliteHits: 0, pings: 0 },
    offers: [],
    shake: 0,
    flash: 0,
    lastSpawnY: 0,
    message: '',
    messageTimer: 0,
    events: 0,
    currentBand: null,
    vents: [],
    wells: [],
    elites: [],
    combo: createCombo(),
    environment: null,
    deepSeen: false,
    band: 0,
    /** 0..1 band-crossing flash, read by the renderer only. */
    transition: 0,
    hitStop: 0,
    sonar: createSonar(),
    contracts: [],
    cache: null,
    summary: null,
    diveEarned: 0,
    diveLost: 0,
    diveContracts: 0,
  };

  world.reset = (seed) => {
    if (Number.isInteger(seed)) world.random = createRandom(seed);
    world.refits = createRefits();
    world.banked = 0;
    world.dive = -1;
    world.time = 0;
    world.depthMax = 0;
    world.stats = { cuts: 0, items: 0, hits: 0, collapses: 0, dives: 0, surfaced: 0, lost: 0, massLanded: 0, bells: 0, contracts: 0, eliteHits: 0, pings: 0 };
    world.offers = [];
    world.shake = 0;
    world.flash = 0;
    world.message = '';
    world.messageTimer = 0;
    world.vents = [];
    world.wells = [];
    world.elites = [];
    world.combo = createCombo();
    world.deepSeen = false;
    world.hitStop = 0;
    world.sonar = createSonar();
    world.band = 0;
    world.transition = 0;
    world.summary = null;
    world.diveEarned = 0;
    world.diveLost = 0;
    world.diveContracts = 0;
    world.contracts = createContracts(world.random);
    world.startDive();
    // A new contract means a fresh boat: the hull from the last run does not carry over.
    world.player.hull = world.player.hullMax;
  };

  world.startDive = () => {
    world.dive += 1;
    world.stats.dives = world.dive + 1;
    world.phase = PHASE_DIVE;
    world.cargo = [];
    world.wrecks = [];
    world.lures = [];
    world.vents = [];
    world.wells = [];
    world.elites = [];
    world.cache = null;
    world.summary = null;
    world.diveEarned = 0;
    world.diveLost = 0;
    world.diveContracts = 0;
    world.hook = createHook();
    world.particles.clear();
    world.lastSpawnY = 340;
    world.currents = createCurrents(world.random, 120, TRENCH.floorY);
    world.vents = [];
    world.wells = [];
    world.combo = createCombo();
    world.environment = environmentForY(0);
    resetPlayerForDive(world.player, world.refits);
    world.particles.seedSilt(world.player.x, world.player.y + 300, 120);
    spawnAhead(world);
    if (world.refits.airCache > 0) {
      const first = world.wrecks[0];
      world.cache = { x: (first?.x ?? 800) + 120, y: (first?.y ?? 500) + 60, taken: false };
    }
  };

  world.spawnWreckAt = (x, y, tier) => {
    const wreck = createWreck(world.random, x, y, tier);
    world.wrecks.push(wreck);
    return wreck;
  };

  world.spawnLureAt = (x, y) => {
    const lure = createLure(world.random, x, y);
    world.lures.push(lure);
    return lure;
  };

  world.spawnEliteAt = (x, y) => {
    const elite = createElite(world.random, x, y);
    world.elites.push(elite);
    return elite;
  };

  world.ping = () => {
    if (!sonarPing(world.sonar, world.refits)) return false;
    world.stats.pings += 1;
    return true;
  };

  world.spawnVentAt = (x, y, offset = 0) => {
    const vent = createVent(x, y, offset);
    world.vents.push(vent);
    return vent;
  };

  world.spawnWellAt = (x, y, offset = 0) => {
    const well = createPressureWell(x, y, offset);
    world.wells.push(well);
    return well;
  };

  world.toggleLamp = () => {
    world.player.lampOn = !world.player.lampOn;
    return world.player.lampOn;
  };

  /** The quiet scene the title screen sits over: wrecks and lures drifting, no diver on screen. */
  world.titleScene = () => {
    world.wrecks = [];
    world.lures = [];
    world.cargo = [];
    world.hook = createHook();
    world.phase = PHASE_DEAD;
    world.player.x = 1180;
    world.player.y = 1500;
    world.player.vx = 0;
    world.player.vy = 0;
    world.player.lampOn = false;
    world.spawnWreckAt(340, 1430, 2);
    world.spawnWreckAt(1130, 1810, 3);
    world.spawnWreckAt(760, 1180, 1);
    world.spawnLureAt(690, 1580);
    world.spawnLureAt(980, 1330);
    world.spawnLureAt(420, 1720);
    world.particles.clear();
    world.particles.seedSilt(700, 1500, 130);
    world.time = 0;
  };

  /** Drift only: the title backdrop breathes without spending the diver's air. */
  world.idle = (dt) => {
    world.time += dt;
    stepWrecks(world.wrecks, dt, world.time, 0);
    stepLures(world.lures, dt, world.time, { x: -9999, y: -9999, radius: 0, mercy: 9 }, false, 1);
    world.particles.step(dt, world.player.x, world.player.y, 0);
  };

  world.pushMessage = (text, seconds = 2.2) => {
    world.message = text;
    world.messageTimer = seconds;
  };

  world.step = (dt, intent) => {
    const events = { mask: 0, cutting: false, hit: 0, freed: null };
    if (world.phase !== PHASE_DIVE) {
      world.messageTimer = Math.max(0, world.messageTimer - dt);
      world.shake = Math.max(0, world.shake - dt * 26);
      return events;
    }
    world.time += dt;
    world.messageTimer = Math.max(0, world.messageTimer - dt);

    spawnAhead(world);
    const band = currentAt(world.currents, world.player.y);
    world.currentBand = band;
    const environment = environmentForY(world.player.y);
    world.environment = environment;
    const bandIndex = bandIndexForDepth(world.player.depth);
    if (bandIndex !== world.band) {
      world.band = bandIndex;
      world.pushMessage(`${environment.label} — ${bandIndex === 2 ? 'the hollow pays, and it hunts' : bandIndex === 1 ? 'stronger current, richer wrecks' : 'back in the light'}`, 3);
      world.transition = 1;
      events.mask |= EVENT_BAND;
    }
    if (!world.deepSeen && bandIndex >= 1) {
      world.deepSeen = true;
      events.mask |= EVENT_DEEP;
    }
    stepSonar(world.sonar, dt);
    const drowsy = world.sonar.active > 0;
    const base = currentForce(band, world.time);
    const current = { x: base.x * environment.currentScale, y: base.y * environment.currentScale };
    const well = stepPressureWells(world.wells, dt, world.player);
    current.x += well.force.x;
    current.y += well.force.y;
    if (well.hits.length > 0) events.mask |= EVENT_WELL;
    stepCombo(world.combo, dt);

    const eliteEvents = stepElites(world.elites, dt, world.player, world.time, drowsy);
    for (const hit of eliteEvents) {
      if (hit.type === 'windup') continue;
      const dealt = damagePlayer(world.player, hit.damage);
      if (dealt > 0) {
        world.stats.hits += 1;
        world.stats.eliteHits += 1;
        events.mask |= EVENT_HIT | EVENT_ELITE;
        events.hit = dealt;
        world.shake = Math.min(32, world.shake + 20);
        world.player.vx += hit.dirX * 320;
        world.player.vy += hit.dirY * 320;
        for (let index = 0; index < 18; index += 1) {
          world.particles.spawnSpark(world.player.x + (world.random() - 0.5) * 30, world.player.y + (world.random() - 0.5) * 30, index % 2 ? 'amber' : 'dull');
        }
      }
    }

    if (world.cache && !world.cache.taken && Math.hypot(world.player.x - world.cache.x, world.player.y - world.cache.y) < 34) {
      world.cache.taken = true;
      world.player.oxygen = Math.min(world.player.oxygenMax, world.player.oxygen + 18);
      events.mask |= EVENT_CACHE;
      for (let index = 0; index < 12; index += 1) world.particles.spawnBubble(world.cache.x, world.cache.y, (world.random() - 0.5) * 60, -30 - world.random() * 40, 2.4);
    }

    const grapple = stepGrapple(world, dt, intent);
    for (const event of grapple.events) {
      if (event.type === 'fire') events.mask |= EVENT_FIRE;
      else if (event.type === 'attach') {
        events.mask |= EVENT_ATTACH;
        world.particles.spawnBubble(event.x, event.y, 0, -30, 2);
      } else if (event.type === 'release') events.mask |= EVENT_RELEASE;
      else if (event.type === 'cutting') {
        events.cutting = true;
        if (world.random() < 0.4) world.particles.spawnSpark(event.x, event.y, 'amber');
      }
    }
    if (grapple.tether.x !== 0 || grapple.tether.y !== 0) events.mask |= 0;

    const ventHits = stepVents(world.vents, dt, world.player);
    if (ventHits.length > 0) events.mask |= EVENT_VENT;

    stepPlayer(world.player, dt, {
      thrust: intent.thrust,
      ballast: intent.ballast,
      tether: grapple.tether,
      current,
    }, world.cargo, world.refits);

    for (const freed of grapple.freeNodes) {
      const position = nodeAt(freed.wreck, freed.node);
      freed.node.free = true;
      const paid = collectCombo(world.combo, freed.node.value, environment.salvageScale);
      freed.node.value = paid;
      world.cargo.push({
        kind: freed.node.kind,
        label: freed.node.label,
        colour: freed.node.colour,
        value: paid,
        mass: freed.node.mass,
        x: position.x,
        y: position.y,
        phase: world.random() * Math.PI * 2,
        spin: (world.random() - 0.5) * 2,
      });
      freed.wreck.integrity -= 1;
      freed.wreck.hitFlash = 1;
      world.stats.cuts += 1;
      if (freed.node.kind === 'bell') world.stats.bells += 1;
      events.mask |= EVENT_SALVAGE;
      for (let index = 0; index < 14; index += 1) {
        world.particles.spawnSpark(position.x, position.y, index % 3 === 0 ? 'amber' : 'dull');
      }
      if (freed.wreck.integrity <= 0 && beginCollapse(freed.wreck)) {
        world.pushMessage('the hull is buckling — get clear', 2.4);
      }
    }

    stepCargo(world, dt);
    stepWrecks(world.wrecks, dt, world.time, band ? (band.vertical ? 0 : band.x * band.strength * 0.02) : 0);
    for (const wreck of world.wrecks) {
      if (wreck.collapsing && wreck.collapseTimer <= 0 && !wreck.dead) {
        const blast = collapseWreck(wreck);
        world.stats.collapses += 1;
        world.stats.lost += blast.lost.length;
        world.diveLost += blast.lost.length;
        events.mask |= EVENT_COLLAPSE;
        for (let index = 0; index < 26; index += 1) {
          const angle = (index / 26) * Math.PI * 2;
          world.particles.spawnDebris(blast.x, blast.y, Math.cos(angle) * (60 + world.random() * 150), Math.sin(angle) * (60 + world.random() * 150), 3 + world.random() * 7);
        }
        if (Math.hypot(world.player.x - blast.x, world.player.y - blast.y) < blast.radius) {
          const dealt = damagePlayer(world.player, blast.damage);
          if (dealt > 0) events.mask |= EVENT_HIT;
        }
        if (world.hook.wreck === wreck) {
          releaseHook(world.hook, 'snap');
          events.mask |= EVENT_RELEASE;
        }
        world.shake = Math.min(30, world.shake + WRECK.collapseShake);
      }
    }
    world.wrecks = world.wrecks.filter((wreck) => !wreck.dead || wreck.collapseTimer > 0);

    for (const hit of ventHits.concat(well.hits)) {
      const dealt = damagePlayer(world.player, hit.damage);
      if (dealt > 0) {
        world.stats.hits += 1;
        events.mask |= EVENT_HIT;
        events.hit = dealt;
        world.shake = Math.min(26, world.shake + 12);
      }
    }
    const lureHits = stepLures(world.lures, dt, world.time, world.player, world.player.lampOn, lureSenseScale(world.refits));
    for (const hit of lureHits) {
      const dealt = damagePlayer(world.player, hit.damage);
      if (dealt > 0) {
        world.stats.hits += 1;
        events.mask |= EVENT_HIT;
        events.hit = dealt;
        world.shake = Math.min(26, world.shake + 14);
        const dx = world.player.x - hit.x;
        const dy = world.player.y - hit.y;
        const length = Math.hypot(dx, dy) || 1;
        world.player.vx += (dx / length) * LURE.knockback;
        world.player.vy += (dy / length) * LURE.knockback;
        for (let index = 0; index < 12; index += 1) world.particles.spawnBubble(world.player.x, world.player.y, (Math.random() - 0.5) * 90, -40 - Math.random() * 60, 3);
      }
    }
    world.lures = world.lures.filter((lure) => !lure.dead);

    if (Math.abs(world.player.vy) > 20 || world.random() < 0.12) {
      world.particles.spawnBubble(world.player.x + (world.random() - 0.5) * 14, world.player.y - 12, (world.random() - 0.5) * 30, -20 - world.random() * 40, 1.6 + world.random() * 2.4);
    }
    world.particles.step(dt, world.player.x, world.player.y, world.player.depth);

    if (world.player.bending) events.mask |= EVENT_BEND;
    world.depthMax = Math.max(world.depthMax, world.player.depth);
    for (const closed of stepContracts(world)) {
      world.banked += closed.reward;
      world.stats.contracts += 1;
      world.diveContracts += closed.reward;
      events.mask |= EVENT_CONTRACT;
      world.pushMessage(`contract closed: ${closed.title} (+$${closed.reward})`, 2.6);
    }
    world.shake = Math.max(0, world.shake - dt * 26);
    world.flash = Math.max(0, world.flash - dt * 2.5);
    world.transition = Math.max(0, world.transition - dt * 0.8);

    if (world.player.hull <= 0) {
      world.phase = PHASE_DEAD;
      events.mask |= EVENT_DEAD;
      return events;
    }
    if (world.player.oxygen <= 0) {
      world.phase = PHASE_DEAD;
      events.mask |= EVENT_DEAD;
      return events;
    }
    if (isAtSurface(world.player) && world.time > 2) {
      surface(world);
      events.mask |= world.phase === PHASE_WON ? EVENT_WON : EVENT_SURFACED;
    }
    world.events = events.mask;
    return events;
  };

  return world;
}

/** Spawn wrecks ahead of the diver, deeper tiers as he descends and as dives go on. */
function spawnAhead(world) {
  while (world.lastSpawnY < world.player.y + SPAWN_AHEAD && world.wrecks.length < MAX_WRECKS) {
    const tier = clamp(Math.floor(world.lastSpawnY / 900 + world.dive * 0.5), 0, 3);
    const x = 240 + world.random() * (TRENCH.width - 480);
    const environment = environmentForY(world.lastSpawnY);
    const wreck = createWreck(world.random, x, world.lastSpawnY, tier, environment.salvageTable);
    world.wrecks.push(wreck);
    const lures = tier >= 3 ? 2 : 1;
    for (let index = 0; index < lures; index += 1) {
      world.lures.push(createLure(world.random, x + (world.random() - 0.5) * 620, world.lastSpawnY + (world.random() - 0.5) * 340));
    }
    if (world.random() < environment.ventChance) {
      world.vents.push(createVent(180 + world.random() * (TRENCH.width - 360), world.lastSpawnY + 140, world.random() * 8));
    }
    if (world.random() < environment.wellChance) {
      world.wells.push(createPressureWell(220 + world.random() * (TRENCH.width - 440), world.lastSpawnY + 320, world.random() * 9));
    }
    if (world.random() < environment.eliteChance) {
      const existing = world.elites.filter((elite) => Math.abs(elite.homeY - world.lastSpawnY) < 1600).length;
      if (existing === 0) world.elites.push(createElite(world.random, x + (world.random() - 0.5) * 420, world.lastSpawnY + 260));
    }
    world.lastSpawnY += spawnGap(environment, world.random);
  }
}

/** Carry the salvage: each piece trails the diver on a short spring, spinning slowly. */
function stepCargo(world, dt) {
  const mass = cargoMass(world.cargo);
  const size = Math.min(6, world.cargo.length);
  for (let index = 0; index < world.cargo.length; index += 1) {
    const item = world.cargo[index];
    item.phase += dt * 1.6;
    const ring = 26 + Math.min(5, index) * 9;
    const angle = (index / Math.max(1, size)) * Math.PI * 2 + item.phase * 0.2;
    const targetX = world.player.x + Math.cos(angle) * ring;
    const targetY = world.player.y + 12 + Math.sin(angle) * ring * 0.55 + Math.min(30, mass * 3);
    item.x += (targetX - item.x) * Math.min(1, dt * 9);
    item.y += (targetY - item.y) * Math.min(1, dt * 9);
  }
}

function surface(world) {
  const earned = cargoValue(world.cargo);
  const mass = cargoMass(world.cargo);
  world.banked += earned;
  world.diveEarned = earned;
  world.stats.items += world.cargo.length;
  world.stats.massLanded = Math.round((world.stats.massLanded + mass) * 10) / 10;
  world.stats.surfaced += 1;
  world.summary = {
    earned,
    mass: Math.round(mass * 10) / 10,
    pieces: world.cargo.length,
    lost: world.diveLost,
    contracts: world.diveContracts,
    dive: world.dive + 1,
  };
  world.cargo = [];
  world.hook = createHook();
  if (world.banked >= CONTRACT_TARGET) {
    world.phase = PHASE_WON;
    return;
  }
  world.phase = PHASE_SURFACED;
  world.offers = rollOffers(world.random, world.refits);
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}
