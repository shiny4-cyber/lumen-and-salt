// The dive loadout: two of three tools. Each one changes how the dive is actually played,
// so the choice before every dive is a plan, not a stat.

export const TOOLS = [
  {
    id: 'sonar',
    name: 'Sonar set',
    blurb: 'Q pings: reveal the water and drowse every lure and hunter inside 620 px.',
  },
  {
    id: 'cutter',
    name: 'Power cutter',
    blurb: 'Cut 40% faster and 10% further: more pieces per litre of air.',
  },
  {
    id: 'ballast',
    name: 'Ballast assist',
    blurb: 'Pump 50% faster, and the safe ascent rate rises a quarter.',
  },
];

export const TOOL_COUNT = 2;

export function createLoadout() {
  return { sonar: true, cutter: true, ballast: false };
}

export function toggleTool(loadout, id) {
  const next = { ...loadout, [id]: !loadout[id] };
  const fitted = Object.values(next).filter(Boolean).length;
  if (fitted > TOOL_COUNT) {
    // Fitting a third drops the oldest other tool.
    const others = TOOLS.map((tool) => tool.id).filter((toolId) => toolId !== id && next[toolId]);
    if (others.length > 0) next[others[0]] = false;
  }
  if (Object.values(next).filter(Boolean).length === 0) return loadout;
  return next;
}

export function toolCount(loadout) {
  return TOOLS.filter((tool) => loadout[tool.id]).length;
}

export function cutterScale(loadout) {
  return loadout.cutter ? 1.4 : 1;
}

export function cutterRangeScale(loadout) {
  return loadout.cutter ? 1.1 : 1;
}

export function pumpScale(loadout) {
  return loadout.ballast ? 1.5 : 1;
}

export function safeAscentScale(loadout) {
  return loadout.ballast ? 1.25 : 1;
}
