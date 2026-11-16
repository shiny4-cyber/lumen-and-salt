// Keyboard and mouse, read every frame. Held state becomes intent: thrust, ballast,
// grapple and cut. One-shot presses (lamp, pause, choose, restart) are queued as bit
// flags and taken exactly once by the loop, so a press between frames is never lost.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_LAMP = 4;
export const ACTION_CHOOSE_1 = 8;
export const ACTION_CHOOSE_2 = 16;
export const ACTION_CHOOSE_3 = 32;
export const ACTION_MUTE = 64;
export const ACTION_SONAR = 128;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const UP = new Set(['ArrowUp', 'KeyW']);
const CUT = new Set(['KeyE', 'ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CHOOSERS = { Digit1: ACTION_CHOOSE_1, Digit2: ACTION_CHOOSE_2, Digit3: ACTION_CHOOSE_3, Numpad1: ACTION_CHOOSE_1, Numpad2: ACTION_CHOOSE_2, Numpad3: ACTION_CHOOSE_3 };

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let pointerX = 640;
  let pointerY = 360;
  let pointerHeld = false;
  let pointerInside = false;
  // A tap shorter than the fixed step would otherwise fall between two ticks and vanish.
  let cutBufferUntil = 0;
  let grappleBufferUntil = 0;

  function isDown(codes) {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (LEFT.has(event.code) || RIGHT.has(event.code) || UP.has(event.code) || DOWN.has(event.code) || CUT.has(event.code)) held.add(event.code);
      return;
    }
    held.add(event.code);
    if (CUT.has(event.code)) cutBufferUntil = performance.now() + 130;
    if (CONFIRM.has(event.code)) grappleBufferUntil = performance.now() + 130;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (event.code === 'KeyF') actions |= ACTION_LAMP;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'KeyQ') actions |= ACTION_SONAR;
    else if (CHOOSERS[event.code]) actions |= CHOOSERS[event.code];
    else if (!LEFT.has(event.code) && !RIGHT.has(event.code) && !UP.has(event.code) && !DOWN.has(event.code) && !CUT.has(event.code)) return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    held.clear();
    pointerHeld = false;
  });
  window.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerY = event.clientY - rect.top;
    pointerInside = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    pointerHeld = true;
    grappleBufferUntil = performance.now() + 130;
    if (event.button === 2) actions |= ACTION_LAMP;
    event.preventDefault();
  });
  window.addEventListener('pointerup', () => {
    pointerHeld = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** -1 left, 1 right, 0 neither or both. */
    thrust() {
      return (isDown(RIGHT) ? 1 : 0) - (isDown(LEFT) ? 1 : 0);
    },
    /** -1 vents ballast (up), 1 floods it (down). */
    ballast() {
      return (isDown(DOWN) ? 1 : 0) - (isDown(UP) ? 1 : 0);
    },
    grappleHeld() {
      return pointerHeld || isDown(CONFIRM) || performance.now() < grappleBufferUntil;
    },
    cutHeld() {
      return isDown(CUT) || performance.now() < cutBufferUntil;
    },
    /** The pointer in CSS pixels on the canvas, for aiming the lamp and the hook. */
    pointer() {
      return { x: pointerX, y: pointerY, inside: pointerInside };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
