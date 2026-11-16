// Small maths helpers shared by the simulation. Pure functions, no state.

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Frame-rate independent approach of `value` toward `target`, `rate` per second. */
export function approach(value, target, rate, dt) {
  const step = rate * dt;
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Normalise a vector, returning [0, 0] for a zero-length one. */
export function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (length < 1e-6) return [0, 0];
  return [x / length, y / length];
}

/** The angle of a vector, 0 pointing right, growing clockwise on screen. */
export function angleOf(x, y) {
  return Math.atan2(y, x);
}

/** The shortest signed difference between two angles, in radians. */
export function angleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}
