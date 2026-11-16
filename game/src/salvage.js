// The salvage table: what a wreck can hold, what it is worth, and how heavy it is once
// cut free. Weight is the whole point of the loop — a rich haul makes the ascent slow.

import { SALVAGE } from './config.js';

const BY_ID = new Map(SALVAGE.kinds.map((kind) => [kind.id, kind]));

export function kindOf(id) {
  return BY_ID.get(id) ?? BY_ID.get('coil');
}

/** A wreck of `tier` (0 deepest-cheap to 3 deepest-rich) rolls one of its kinds. */
export function rollKind(random, tier) {
  const table = SALVAGE.tiers[Math.max(0, Math.min(SALVAGE.tiers.length - 1, tier))];
  return kindOf(random.pick(table));
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
