// Run economy and collection streaks. A combo rewards fast, controlled salvage but
// decays during travel, so it never replaces the risk of surfacing alive.

export function createCombo() {
  return { count: 0, multiplier: 1, timer: 0, max: 1 };
}

export function resetCombo(combo) {
  combo.count = 0;
  combo.multiplier = 1;
  combo.timer = 0;
}

export function stepCombo(combo, dt) {
  if (combo.timer > 0) combo.timer = Math.max(0, combo.timer - dt);
  if (combo.timer <= 0 && combo.count > 0) {
    combo.count = 0;
    combo.multiplier = 1;
  }
}

export function collectCombo(combo, baseValue, environmentScale = 1) {
  combo.count += 1;
  combo.timer = 7.5;
  combo.multiplier = Math.min(2.5, 1 + Math.max(0, combo.count - 1) * 0.25);
  combo.max = Math.max(combo.max, combo.multiplier);
  return Math.round(baseValue * combo.multiplier * environmentScale);
}

export function comboLabel(combo) {
  return combo.count > 1 ? `COMBO x${combo.multiplier.toFixed(2)}` : 'SALVAGE';
}
