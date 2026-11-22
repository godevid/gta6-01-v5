// Screenshot poses: ?shot=start | play | end (with &seed=) set the game
// up as a still frame so the screenshots show the real game, not a mock.
// start — the title screen over a sunny beach vista; play — Jax mid-chase
// in a sports car with the PD on his tail; end — the crew at the bank
// after the big score.

import { PLACES } from './world.js';
import { ECONOMY, DAY } from './config.js';
import { spawnCopCar, addPickup, burst } from './entities.js';

// the clock is derived from elapsed time, so pose the hour by rewinding it
function setHour(state, hour) {
  state.time = ((hour - DAY.startHour + 24) % 24) / 24 * DAY.length;
}

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  return {
    name: q.get('shot') || null,
    seed: parseInt(q.get('seed') || '1', 10) || 1,
  };
}

export function applyShot(state, missions, name) {
  const p = state.player;
  if (name === 'start') {
    p.x = 1470; p.y = 3050; p.angle = Math.PI / 2;
    p.cash = ECONOMY.startCash;
    return 'menu';
  }
  if (name === 'play') {
    // put Jax in a sports car on the main drag, two stars, two cop cars
    const car = state.cars.find((c) => c.type === 'Sport' && c.kind === 'parked') || state.cars[0];
    car.kind = 'player';
    car.x = 1470; car.y = 1890; car.angle = 0; car.speed = 300; car.hp = 100;
    p.inCar = car;
    p.x = car.x; p.y = car.y; p.angle = 0;
    p.cash = 1250;
    p.hp = 82;
    state.wanted = 2;
    spawnCopCar(state, p.x, p.y);
    spawnCopCar(state, p.x, p.y);
    setHour(state, 16.5);
    missions.index = 2;
    missions.step = 1;
    missions.active = true;
    return 'playing';
  }
  if (name === 'end') {
    p.x = PLACES.bank.x + 60; p.y = PLACES.bank.y + 40; p.angle = -Math.PI / 2;
    p.cash = 4820;
    p.hp = 100;
    p.hasPistol = true;
    p.weapon = 'pistol';
    p.ammo = 48;
    state.wanted = 0;
    setHour(state, 12.0);
    addPickup(state, 'cash', p.x + 40, p.y - 30, 2500);
    burst(state, p.x, p.y - 40, 18, '#ffd75e');
    missions.index = 6;
    missions.done = true;
    missions.active = false;
    return 'story';
  }
  return null;
}
