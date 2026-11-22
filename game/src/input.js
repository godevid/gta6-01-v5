// Keyboard + mouse state, polled by the game loop. Keys are tracked by
// `code` so WASD and arrows both work, and edge-triggered presses (E, F,
// P, M, 1, 2, R, Enter) are consumed once per frame by the game.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();   // edge presses, cleared each frame by consume()
  const mouse = { x: 0, y: 0, down: false, clicked: false, wx: 0, wy: 0 };

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  }
  function onMouseDown(e) {
    onMouseMove(e);
    mouse.down = true;
    mouse.clicked = true;
  }
  function onMouseUp() { mouse.down = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    keys,
    mouse,
    down(code) { return keys.has(code); },
    // movement axes: -1..1, arrows mirror WASD
    axisX() {
      let x = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      return x;
    },
    axisY() {
      let y = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      return y;
    },
    up() { return keys.has('KeyW') || keys.has('ArrowUp'); },
    downKey() { return keys.has('KeyS') || keys.has('ArrowDown'); },
    left() { return keys.has('KeyA') || keys.has('ArrowLeft'); },
    right() { return keys.has('KeyD') || keys.has('ArrowRight'); },
    sprint() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    handbrake() { return keys.has('Space'); },
    wasPressed(code) { return pressed.has(code); },
    consume(code) {
      if (pressed.has(code)) { pressed.delete(code); return true; }
      return false;
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}
