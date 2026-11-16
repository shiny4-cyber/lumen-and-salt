// The difficulty ramp: the yard sends a new diver into easy water and only then lets the
// trench bite. Bands of the ramp scale hazard spawn rates, the air burn and the elite mix,
// so dive 1 teaches and dive 6 tests. It reads off the dive index, nothing else.

export const RAMP = [
  {
    id: 'first-water',
    label: 'FIRST WATER',
    maxDive: 1,
    hazardScale: 0.4,
    oxygenScale: 0.68,
    eliteScale: 0,
    salvageScale: 1.1,
    brief: 'the yard keeps the first dives shallow and slow',
  },
  {
    id: 'working-dive',
    label: 'WORKING DIVE',
    maxDive: 3,
    hazardScale: 0.8,
    oxygenScale: 0.94,
    eliteScale: 1,
    salvageScale: 1,
    brief: 'full trench, full rules',
  },
  {
    id: 'deep-contract',
    label: 'DEEP CONTRACT',
    maxDive: Number.MAX_SAFE_INTEGER,
    hazardScale: 1.15,
    oxygenScale: 1.12,
    eliteScale: 1.4,
    salvageScale: 1.06,
    brief: 'the deep end, and it knows your name',
  },
];

export function rampForDive(dive) {
  const index = Math.max(0, dive);
  return RAMP.find((entry) => index <= entry.maxDive) ?? RAMP[RAMP.length - 1];
}

/** Chance of a hazard spawning, scaled by the ramp and clamped to a sane band. */
export function rampChance(chance, scale) {
  return Math.max(0, Math.min(1, chance * scale));
}
