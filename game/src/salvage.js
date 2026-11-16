// The salvage table: what a wreck can hold, what it is worth, how heavy it is, and how
// long it takes to cut free. Weight is the whole point of the loop — a rich haul makes the
// ascent slow — and cut time is the second cost: the bell is worth the most and takes longest.

import { SALVAGE } from './config.js';

const BY_ID = new Map(SALVAGE.kinds.map((kind) => [kind.id, kind]));

export function kindOf(id) {
  return BY_ID.get(id) ?? BY_ID.get('coil');
}

/** A wreck rolls one kind from the band's own table. */
export function rollKind(random, table) {
  const list = table && table.length > 0 ? table : SALVAGE.tiers[0];
  return kindOf(random.pick(list));
}

export function valueOf(kind, tier, lensUpgrades) {
  const tierScale = SALVAGE.tierValue[Math.max(0, Math.min(SALVAGE.tierValue.length - 1, tier))];
  return Math.round(kind.value * tierScale * (1 + 0.12 * lensUpgrades));
}

/** Total mass of everything being carried, which the ballast and the winch both feel. */
export function cargoMass(cargo) {
  let mass = 0;
  for (const item of cargo) mass += item.mass;
  return mass;
}

export function cargoValue(cargo) {
  let value = 0;
  for (const item of cargo) value += item.value;
  return value;
}

/** Cutting time of a kind, in seconds, before refits. */
export function cutTimeOf(kind) {
  return kind.cutTime ?? SALVAGE.defaultCutTime;
}
