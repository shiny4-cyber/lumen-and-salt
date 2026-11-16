// The refit screen's catalogue: one card is offered after every surfacing, and the choice
// changes the next dive for real — tank, winch, plating, lamp lens, silent propeller,
// ballast pump or cargo clamps.

export const REFITS = [
  {
    id: 'tank',
    name: 'Long tank',
    blurb: '+25 oxygen capacity, and a full fill on every dive.',
    apply(refits) {
      refits.tank += 1;
    },
  },
  {
    id: 'winch',
    name: 'Geared winch',
    blurb: 'Tether pulls harder, reaches further, and cuts faster.',
    apply(refits) {
      refits.winch += 1;
    },
  },
  {
    id: 'plating',
    name: 'Hull plating',
    blurb: '+25 hull, and 10 repaired before the next dive.',
    apply(refits) {
      refits.plating += 1;
    },
  },
  {
    id: 'lens',
    name: 'Amber lens',
    blurb: '+12% value on every piece you bring up.',
    apply(refits) {
      refits.lens += 1;
    },
  },
  {
    id: 'silent',
    name: 'Silent propeller',
    blurb: 'Lures notice the lamp at 60% of the range.',
    apply(refits) {
      refits.silent += 1;
    },
  },
  {
    id: 'pump',
    name: 'Fast ballast pump',
    blurb: 'Ballast vents and floods 45% faster.',
    apply(refits) {
      refits.pump += 1;
    },
  },
  {
    id: 'clamps',
    name: 'Cargo clamps',
    blurb: 'A full hold costs 40% less speed and sink.',
    apply(refits) {
      refits.clamps += 1;
    },
  },
  {
    id: 'servo',
    name: 'Light servo',
    blurb: '+18% thrust, but the motors burn 12% more air.',
    apply(refits) {
      refits.servo += 1;
    },
  },
  {
    id: 'deepHull',
    name: 'Deep hull',
    blurb: '+40 hull for the pressure, at 25 fewer seconds of air.',
    apply(refits) {
      refits.deepHull += 1;
    },
  },
  {
    id: 'sweep',
    name: 'Sweep lens',
    blurb: 'Cut range +30% and a faster cut, but lures notice the lamp 30% further.',
    apply(refits) {
      refits.sweep += 1;
    },
  },
];

export function createRefits() {
  return { tank: 0, winch: 0, plating: 0, lens: 0, silent: 0, pump: 0, clamps: 0, servo: 0, deepHull: 0, sweep: 0 };
}

/** The share of the lamp's reach a lure still notices: a quiet propeller vs a sweep lens. */
export function lureSenseScale(refits) {
  return Math.max(0.25, 1 - 0.4 * refits.silent + 0.3 * refits.sweep);
}

/** Three offers, never the same card twice, from a seeded generator. */
export function rollOffers(random, refits) {
  const pool = REFITS.filter((refit) => refits[refit.id] < 3);
  const offers = [];
  const taken = new Set();
  while (offers.length < Math.min(3, pool.length)) {
    const pick = pool[Math.floor(random() * pool.length)];
    if (taken.has(pick.id)) continue;
    taken.add(pick.id);
    offers.push({ id: pick.id, name: pick.name, blurb: pick.blurb });
  }
  return offers;
}

export function applyRefit(refits, id) {
  const refit = REFITS.find((entry) => entry.id === id);
  if (!refit) return null;
  refit.apply(refits);
  return refit.name;
}
