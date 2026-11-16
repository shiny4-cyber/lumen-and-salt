// Pressure wells pulse on a nine-second cycle. A contracting ring announces suction;
// the core is dangerous only during the four-second pull. The outer ring is escapable.
export function createPressureWell(x, y, offset = 0) {
  return { x, y, clock: offset, phase: 'rest', radius: 180, core: 29 };
}
export function stepPressureWells(wells, dt, player) {
  const force = { x: 0, y: 0 };
  const hits = [];
  for (const well of wells) {
    well.clock = (well.clock + dt) % 9;
    well.phase = well.clock < 3.5 ? 'rest' : well.clock < 5 ? 'warning' : 'pull';
    if (well.phase !== 'pull') continue;
    const dx = well.x - player.x, dy = well.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < well.radius && distance > 0.01) {
      const strength = 320 * (1 - distance / well.radius);
      force.x += dx / distance * strength;
      force.y += dy / distance * strength;
    }
    if (distance < well.core + player.radius) hits.push({ type: 'pressure', x: well.x, y: well.y, damage: 14 });
  }
  return { force, hits };
}
