// The contract board: three jobs from the Halcyon yard, rolled from the run seed. Each has a
// goal, a live progress reading off the world, and a cash reward paid the moment it closes.

import { CONTRACTS } from './config.js';

export const CONTRACT_DEFS = [
  {
    id: 'bank',
    title: 'bank a haul',
    goal: (random) => 340 + Math.round(random() * 180, 0),
    reward: 36,
    progress: (world) => world.banked,
    unit: '$',
  },
  {
    id: 'cut',
    title: 'cut pieces free',
    goal: (random) => 5 + Math.floor(random() * 4),
    reward: 32,
    progress: (world) => world.stats.cuts,
    unit: '',
  },
  {
    id: 'depth',
    title: 'reach the depth',
    goal: (random) => 90 + Math.floor(random() * 45),
    reward: 36,
    progress: (world) => Math.round(world.depthMax),
    unit: 'm',
  },
  {
    id: 'dives',
    title: 'make dives',
    goal: (random) => 3 + Math.floor(random() * 2),
    reward: 36,
    progress: (world) => world.stats.surfaced,
    unit: '',
  },
  {
    id: 'weight',
    title: 'land a tonnage',
    goal: (random) => 5 + Math.floor(random() * 4),
    reward: 42,
    progress: (world) => Math.round(world.stats.massLanded * 10) / 10,
    unit: ' t',
  },
  {
    id: 'bell',
    title: 'raise a drowned bell',
    goal: () => 1,
    reward: 66,
    progress: (world) => world.stats.bells,
    unit: '',
  },
  {
    id: 'combo',
    title: 'hold a combo',
    goal: () => 1.65,
    reward: 30,
    progress: (world) => Math.round(world.combo.max * 100) / 100,
    unit: 'x',
  },
];

export function createContracts(random) {
  const pool = [...CONTRACT_DEFS];
  const picked = [];
  while (picked.length < Math.min(CONTRACTS.count, pool.length)) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked.map((definition) => ({
    id: definition.id,
    title: definition.title,
    unit: definition.unit,
    goal: definition.goal(random),
    reward: Math.round(definition.reward * CONTRACTS.rewardScale),
    progress: 0,
    done: false,
    closedDive: -1,
  }));
}

/**
 * Read every open contract's progress off the world and close the ones that meet their goal.
 * Returns the contracts closed on this step, so the caller can pay and announce them.
 */
export function stepContracts(world) {
  const closed = [];
  for (const contract of world.contracts) {
    if (contract.done) continue;
    const definition = CONTRACT_DEFS.find((entry) => entry.id === contract.id);
    if (!definition) continue;
    contract.progress = definition.progress(world);
    if (contract.progress >= contract.goal) {
      contract.done = true;
      contract.closedDive = world.dive;
      closed.push(contract);
    }
  }
  return closed;
}

export function contractSummary(world) {
  return world.contracts.map((contract) => ({
    id: contract.id,
    title: contract.title,
    progress: contract.progress,
    goal: contract.goal,
    unit: contract.unit,
    reward: contract.reward,
    done: contract.done,
  }));
}
