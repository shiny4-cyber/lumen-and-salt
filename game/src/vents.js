// Silt vents telegraph for 1.4 seconds before a narrow upward blast. Cross during
// the long idle interval, or steer around the marked plume: no hidden random hits.
export function createVent(x, y, offset = 0) {
  return { x, y, clock: offset, phase: 'idle', radius: 48, height: 220 };
}
export function stepVents(vents, dt, player) {
  const hits = [];
  for (const vent of vents) {
    vent.clock = (vent.clock + dt) % 8;
    vent.phase = vent.clock < 4.8 ? 'idle' : vent.clock < 6.2 ? 'warning' : 'blast';
    if (vent.phase === 'blast' && Math.abs(player.x - vent.x) < vent.radius + player.radius &&
        player.y > vent.y - vent.height && player.y < vent.y + 18) {
      player.vy -= 190 * dt;
      hits.push({ type: 'vent', x: vent.x, y: vent.y, damage: 10 });
    }
  }
  return hits;
}
