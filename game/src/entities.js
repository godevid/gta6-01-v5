// Entities: the player, traffic, parked cars, police, pedestrians, pickups
// and particles — plus the wanted system and combat. One update() drives
// all of them and returns plain event objects the main loop turns into
// toasts, sounds and mission progress.

import { WORLD, PLAYER, CAR, CAR_TYPES, WANTED, ECONOMY, DAY } from './config.js';
import { clamp, dist2, angleTo, angleLerp, wrapAngle, pick } from './random.js';
import { nearestRoad, buildingAt, collideCircle, isWater, PLACES } from './world.js';

let nextId = 1;

export function createGame(world, opts = {}) {
  const state = {
    world,
    time: 0,
    clock: DAY.startHour,
    player: {
      x: PLACES.ferry.x, y: PLACES.ferry.y - 60, angle: -Math.PI / 2,
      hp: PLAYER.maxHealth, cash: ECONOMY.startCash,
      weapon: 'fists', ammo: 0, hasPistol: false,
      inCar: null, punchCd: 0, bustTimer: 0, speed: 0,
      moving: false, lastHurtAt: -99,
    },
    cars: [],
    peds: [],
    particles: [],
    pickups: [],
    bullets: [],
    wanted: 0,
    unseenTimer: 0,
    lastCrimeAt: -99,
    copSpawnTimer: 0,
    stats: { stolen: 0, busted: 0, wasted: 0, missions: 0, cashEarned: 0 },
    freeRoam: !!opts.freeRoam,
    over: null,          // 'busted' | 'wasted' once set
    overTimer: 0,
  };
  spawnParked(state, 26);
  spawnTraffic(state, 16);
  spawnPeds(state, 34);
  return state;
}

// ---- spawning ----------------------------------------------------------

function roadPoint(rng, margin = 120) {
  const vertical = rng() < 0.5;
  const roads = vertical ? [210, 630, 1050, 1470, 1890, 2310, 2730, 3150] : [210, 630, 1050, 1470, 1890, 2310, 2730, 3150];
  const road = roads[Math.floor(rng() * roads.length)];
  const along = margin + rng() * (WORLD.size - margin * 2);
  return vertical ? { x: road, y: along, angle: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 } : { x: along, y: road, angle: rng() < 0.5 ? 0 : Math.PI };
}

function makeCar(state, x, y, angle, kind, typeIdx) {
  const type = CAR_TYPES[typeIdx ?? Math.floor(Math.random() * CAR_TYPES.length)];
  const car = {
    id: nextId++, kind, type: type.name, color: type.color,
    top: type.top, accel: type.accel,
    x, y, angle, speed: 0, hp: 100,
    driver: kind === 'traffic',
    cruise: 150 + Math.random() * 90,
    target: null, waitTimer: 0, stuckTimer: 0,
    smoke: 0, dead: false, siren: kind === 'police',
    vx: 0, vy: 0,
  };
  state.cars.push(car);
  return car;
}

export function spawnParked(state, n) {
  for (let i = 0; i < n; i++) {
    const p = roadPoint(Math.random);
    const side = Math.random() < 0.5 ? -1 : 1;
    const ox = p.angle === 0 || p.angle === Math.PI ? 0 : side * (WORLD.roadWidth / 2 - 14);
    const oy = p.angle === 0 || p.angle === Math.PI ? side * (WORLD.roadWidth / 2 - 14) : 0;
    makeCar(state, p.x + ox, p.y + oy, p.angle + (Math.random() < 0.5 ? 0 : Math.PI), 'parked');
  }
}

export function spawnTraffic(state, n) {
  for (let i = 0; i < n; i++) {
    const p = roadPoint(Math.random);
    const car = makeCar(state, p.x, p.y, p.angle, 'traffic');
    car.speed = car.cruise;
    pickRouteTarget(car);
  }
}

export function spawnPeds(state, n) {
  for (let i = 0; i < n; i++) {
    const p = roadPoint(Math.random);
    state.peds.push({
      id: nextId++, kind: 'civ',
      x: p.x + (Math.random() - 0.5) * 120, y: p.y + (Math.random() - 0.5) * 120,
      angle: Math.random() * Math.PI * 2, speed: 30 + Math.random() * 35,
      hp: 40, state: 'walk', target: null, fleeFrom: null, downTimer: 0,
      shirt: pick(Math.random, ['#e8e8e8', '#d94f4f', '#4f7dd9', '#e8c832', '#7ad94f', '#d94fc2']),
      skin: pick(Math.random, ['#e8b98a', '#c98d5f', '#8a5a3b', '#f0c8a0']),
    });
  }
}

export function spawnCopCar(state, nearX, nearY) {
  // spawn on a road 500-800px away from the player
  for (let tries = 0; tries < 12; tries++) {
    const p = roadPoint(Math.random);
    const d = Math.hypot(p.x - nearX, p.y - nearY);
    if (d > 450 && d < 900) {
      const car = makeCar(state, p.x, p.y, p.angle, 'police', 0);
      car.color = '#20242a';
      car.top = WANTED.copCarSpeed;
      car.speed = car.top * 0.7;
      return car;
    }
  }
  return null;
}

export function spawnFootCop(state, x, y) {
  const p = { id: nextId++, kind: 'cop', x, y, angle: 0, speed: WANTED.copFootSpeed, hp: 60, state: 'chase', target: null, fleeFrom: null, downTimer: 0, shirt: '#1d2f4a', skin: '#e8b98a' };
  state.peds.push(p);
  return p;
}

export function spawnThug(state, x, y) {
  const p = { id: nextId++, kind: 'thug', x, y, angle: 0, speed: 120, hp: 90, state: 'guard', target: null, fleeFrom: null, downTimer: 0, shirt: '#3a3a3a', skin: '#c98d5f' };
  state.peds.push(p);
  return p;
}

function pickRouteTarget(car) {
  // next intersection along the current road
  const roads = [210, 630, 1050, 1470, 1890, 2310, 2730, 3150];
  if (Math.abs(Math.sin(car.angle)) > 0.7) {
    const dir = Math.sin(car.angle) > 0 ? 1 : -1;
    const next = roads.filter((r) => (dir > 0 ? r > car.y + 30 : r < car.y - 30));
    car.target = { x: car.x, y: dir > 0 ? (next[0] ?? 3150) : (next[next.length - 1] ?? 210) };
  } else {
    const dir = Math.cos(car.angle) > 0 ? 1 : -1;
    const next = roads.filter((r) => (dir > 0 ? r > car.x + 30 : r < car.x - 30));
    car.target = { x: dir > 0 ? (next[0] ?? 3150) : (next[next.length - 1] ?? 210), y: car.y };
  }
}

// ---- events ------------------------------------------------------------

function pushEvent(events, type, data = {}) {
  events.push({ type, ...data });
}

export function addWanted(state, stars, events) {
  const before = state.wanted;
  state.wanted = clamp(state.wanted + stars, 0, WANTED.maxStars);
  state.lastCrimeAt = state.time;
  state.unseenTimer = 0;
  if (state.wanted > before) pushEvent(events, 'wanted-up', { stars: state.wanted });
}

// ---- main update -------------------------------------------------------

export function updateGame(state, input, dt, audio) {
  const events = [];
  if (state.over) {
    state.overTimer += dt;
    updateParticles(state, dt);
    return events;
  }
  state.time += dt;
  state.clock = (DAY.startHour + (state.time / DAY.length) * 24) % 24;

  updatePlayer(state, input, dt, events, audio);
  updateCars(state, dt, events, audio);
  updatePeds(state, dt, events);
  updateWanted(state, dt, events);
  updatePickups(state, dt, events);
  updateParticles(state, dt);
  updateBullets(state, dt, events);

  // keep the streets alive
  const traffic = state.cars.filter((c) => c.kind === 'traffic').length;
  if (traffic < 14) spawnTraffic(state, 1);
  const civs = state.peds.filter((p) => p.kind === 'civ' && p.state !== 'down').length;
  if (civs < 26) spawnPeds(state, 1);
  return events;
}

// ---- player ------------------------------------------------------------

function nearestCar(state, x, y, maxD) {
  let best = null, bestD = maxD * maxD;
  for (const c of state.cars) {
    if (c.dead) continue;
    const d = dist2(x, y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function updatePlayer(state, input, dt, events, audio) {
  const p = state.player;
  p.punchCd = Math.max(0, p.punchCd - dt);

  if (p.inCar) {
    driveCar(state, p.inCar, input, dt, events, audio);
    p.x = p.inCar.x; p.y = p.inCar.y; p.angle = p.inCar.angle;
    p.speed = Math.abs(p.inCar.speed);
    if (input.consume('KeyE')) exitCar(state, events);
    if (input.consume('KeyF')) { /* no punching from a car */ }
    if (input.consume('Digit1')) p.weapon = 'fists';
    if (input.consume('Digit2') && p.hasPistol) p.weapon = 'pistol';
    return;
  }

  // on foot movement
  const ax = input.axisX();
  const ay = input.axisY();
  const moving = ax !== 0 || ay !== 0;
  p.moving = moving;
  const speed = input.sprint() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  if (moving) {
    const len = Math.hypot(ax, ay);
    const nx = ax / len, ny = ay / len;
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.angle = angleLerp(p.angle, Math.atan2(ny, nx), Math.min(1, dt * 12));
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  collideCircle(state.world, p, PLAYER.radius);
  if (isWater(p.x, p.y)) { p.x = clamp(p.x, 20, WORLD.size - 20); p.y = clamp(p.y, 20, WORLD.size - 20); }

  // aim with the mouse (world coords stashed by main)
  if (input.mouse.wx !== undefined) {
    p.aimAngle = angleTo(p.x, p.y, input.mouse.wx, input.mouse.wy);
  }

  if (input.consume('KeyE')) {
    const car = nearestCar(state, p.x, p.y, 70);
    if (car) enterCar(state, car, events);
  }
  if (input.consume('KeyF') && p.punchCd <= 0) {
    p.punchCd = PLAYER.punchCooldown;
    punch(state, events, audio);
  }
  if (input.mouse.clicked && p.weapon === 'pistol' && p.hasPistol) {
    shoot(state, events, audio);
  }
  if (input.consume('Digit1')) p.weapon = 'fists';
  if (input.consume('Digit2') && p.hasPistol) p.weapon = 'pistol';

  // touch pickups
  for (const pk of state.pickups) {
    if (dist2(p.x, p.y, pk.x, pk.y) < 34 * 34) {
      pk.taken = true;
      if (pk.kind === 'health') { p.hp = Math.min(PLAYER.maxHealth, p.hp + 40); pushEvent(events, 'healed'); }
      if (pk.kind === 'ammo') { p.ammo += 24; pushEvent(events, 'ammo', { n: 24 }); }
      if (pk.kind === 'cash') { p.cash += pk.amount; state.stats.cashEarned += pk.amount; pushEvent(events, 'cash', { n: pk.amount }); }
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);

  // busted check: a cop standing on you
  const copNear = state.peds.some((pd) => pd.kind === 'cop' && pd.state !== 'down' && dist2(p.x, p.y, pd.x, pd.y) < 30 * 30);
  if (copNear && state.wanted > 0) {
    p.bustTimer += dt;
    if (p.bustTimer > WANTED.bustTime) {
      state.over = 'busted';
      state.stats.busted++;
      pushEvent(events, 'busted');
      audio.busted();
    }
  } else {
    p.bustTimer = Math.max(0, p.bustTimer - dt * 2);
  }

  if (p.hp <= 0) {
    state.over = 'wasted';
    state.stats.wasted++;
    pushEvent(events, 'wasted');
    audio.fail();
  }
}

function enterCar(state, car, events) {
  const p = state.player;
  if (car.kind === 'traffic' && car.driver) {
    car.driver = false;
    car.kind = 'parked';
    addWanted(state, 1, events);
    pushEvent(events, 'carjack');
    // the driver flees on foot
    state.peds.push({
      id: nextId++, kind: 'civ', x: car.x + 30, y: car.y + 30,
      angle: Math.random() * Math.PI * 2, speed: 200, hp: 40, state: 'flee',
      target: null, fleeFrom: { x: car.x, y: car.y }, downTimer: 0,
      shirt: '#d9d9d9', skin: '#e8b98a',
    });
    state.stats.stolen++;
  } else if (car.kind === 'police') {
    addWanted(state, 2, events);
    pushEvent(events, 'carjack-police');
    state.stats.stolen++;
  }
  car.kind = 'player';
  p.inCar = car;
  pushEvent(events, 'entered-car', { car: car.type });
}

function exitCar(state, events) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  p.inCar = null;
  car.kind = 'parked';
  car.speed = 0;
  // step out to the side
  const side = Math.cos(car.angle + Math.PI / 2);
  const sideY = Math.sin(car.angle + Math.PI / 2);
  p.x = car.x + side * 34;
  p.y = car.y + sideY * 34;
  collideCircle(state.world, p, PLAYER.radius);
  pushEvent(events, 'exited-car');
}

function driveCar(state, car, input, dt, events, audio) {
  const forward = input.up();
  const back = input.downKey();
  const steer = (input.left() ? -1 : 0) + (input.right() ? 1 : 0);
  const handbrake = input.handbrake();

  if (forward) car.speed += car.accel * dt;
  else if (back) car.speed -= (car.speed > 5 ? CAR.brake : CAR.reverseAccel) * dt;
  else {
    // coast down
    car.speed -= car.speed * 0.9 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, car.top);

  const dir = car.speed >= 0 ? 1 : -1;
  const steerAmount = steer * CAR.steerRate * clamp(Math.abs(car.speed) / 240, 0, 1) * dir;
  car.angle += steerAmount * dt * (handbrake ? 1.6 : 1);

  const grip = handbrake ? CAR.handbrakeGrip : CAR.grip;
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const px = -fy, py = fx;
  // velocity: mostly forward, lateral part decays with grip
  let vx = fx * car.speed + (car.vx || 0);
  let vy = fy * car.speed + (car.vy || 0);
  const lat = vx * px + vy * py;
  vx -= px * lat * Math.min(1, grip * dt);
  vy -= py * lat * Math.min(1, grip * dt);
  car.vx = vx - fx * car.speed;
  car.vy = vy - fy * car.speed;
  const nx = car.x + vx * dt;
  const ny = car.y + vy * dt;

  // building collision: check nose + tail
  const noseX = nx + fx * (CAR.length / 2), noseY = ny + fy * (CAR.length / 2);
  const tailX = nx - fx * (CAR.length / 2), tailY = ny - fy * (CAR.length / 2);
  const hit = buildingAt(state.world, noseX, noseY, 4) || buildingAt(state.world, tailX, tailY, 4) || isWater(nx, ny);
  if (hit) {
    if (Math.abs(car.speed) > 260) {
      car.hp -= 12;
      burst(state, noseX, noseY, 10, '#ffb347');
      pushEvent(events, 'crash', { hard: true });
      audio.crash();
      addWanted(state, 0, events); // no star, but resets the unseen clock
      state.lastCrimeAt = state.time;
    } else if (Math.abs(car.speed) > 60) {
      car.hp -= 3;
      pushEvent(events, 'crash', { hard: false });
    }
    car.speed *= -0.25;
    car.vx *= -0.3; car.vy *= -0.3;
  } else {
    car.x = nx; car.y = ny;
  }
  car.x = clamp(car.x, 30, WORLD.size - 30);
  car.y = clamp(car.y, 30, WORLD.size - 30);

  if (car.hp <= 0 && !car.dead) {
    car.dead = true;
    car.speed = 0;
    burst(state, car.x, car.y, 26, '#ff6b35');
    burst(state, car.x, car.y, 14, '#555');
    pushEvent(events, 'car-destroyed');
    if (state.player.inCar === car) {
      state.player.inCar = null;
      state.player.hp -= 25;
      state.player.x = car.x + 40;
      state.player.y = car.y + 40;
    }
  }
  if (car.hp < 45) {
    car.smoke += dt;
    if (car.smoke > 0.12) {
      car.smoke = 0;
      state.particles.push({ x: car.x, y: car.y - 8, vx: (Math.random() - 0.5) * 20, vy: -30, life: 0.9, max: 0.9, color: '#888', size: 5 });
    }
  }
}

// ---- combat ------------------------------------------------------------

function punch(state, events, audio) {
  const p = state.player;
  const reach = PLAYER.punchRange;
  const ang = p.aimAngle ?? p.angle;
  let hitAny = false;
  for (const pd of state.peds) {
    if (pd.state === 'down') continue;
    const d = Math.hypot(pd.x - p.x, pd.y - p.y);
    if (d < reach + 14) {
      const a = angleTo(p.x, p.y, pd.x, pd.y);
      if (Math.abs(wrapAngle(a - ang)) < 1.1) {
        hurtPed(state, pd, PLAYER.punchDamage, events);
        pd.x += Math.cos(a) * 26;
        pd.y += Math.sin(a) * 26;
        hitAny = true;
      }
    }
  }
  // punching a car dents it and annoys its driver
  const car = nearestCar(state, p.x + Math.cos(ang) * 30, p.y + Math.sin(ang) * 30, 46);
  if (car && !hitAny) {
    car.hp -= 4;
    burst(state, p.x + Math.cos(ang) * 30, p.y + Math.sin(ang) * 30, 4, '#ddd');
    hitAny = true;
  }
  audio.punch();
  if (hitAny) pushEvent(events, 'punch-hit');
}

function shoot(state, events, audio) {
  const p = state.player;
  if (p.ammo <= 0) {
    pushEvent(events, 'dry-fire');
    return;
  }
  p.ammo -= 1;
  audio.shot();
  const ang = p.aimAngle ?? p.angle;
  const mx = p.x + Math.cos(ang) * 26, my = p.y + Math.sin(ang) * 26;
  const range = 520;
  let bestD = range, bestPed = null;
  for (const pd of state.peds) {
    if (pd.state === 'down') continue;
    const dx = pd.x - mx, dy = pd.y - my;
    const along = dx * Math.cos(ang) + dy * Math.sin(ang);
    if (along < 0 || along > range) continue;
    const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
    if (perp < 16 && along < bestD) { bestD = along; bestPed = pd; }
  }
  const ex = mx + Math.cos(ang) * bestD, ey = my + Math.sin(ang) * bestD;
  state.bullets.push({ x1: mx, y1: my, x2: ex, y2: ey, life: 0.09, max: 0.09 });
  if (bestPed) {
    hurtPed(state, bestPed, 55, events);
    burst(state, ex, ey, 6, '#c0392b');
    if (bestPed.kind === 'cop') addWanted(state, 1, events);
    else if (bestPed.kind === 'civ') addWanted(state, 1, events);
  }
  // scare nearby pedestrians
  for (const pd of state.peds) {
    if (pd.kind === 'civ' && dist2(p.x, p.y, pd.x, pd.y) < 420 * 420) {
      pd.state = 'flee';
      pd.fleeFrom = { x: p.x, y: p.y };
    }
  }
}

export function hurtPed(state, pd, dmg, events) {
  pd.hp -= dmg;
  if (pd.hp <= 0 && pd.state !== 'down') {
    pd.state = 'down';
    pd.downTimer = 0;
    burst(state, pd.x, pd.y, 8, '#c0392b');
    if (pd.kind === 'thug') pushEvent(events, 'thug-down', { id: pd.id });
    if (pd.kind === 'cop') pushEvent(events, 'cop-down', { id: pd.id });
    if (pd.kind === 'civ') pushEvent(events, 'civ-down', { id: pd.id });
    if (Math.random() < 0.55) {
      state.pickups.push({ x: pd.x, y: pd.y, kind: 'cash', amount: 20 + Math.floor(Math.random() * 40), ttl: 45, taken: false });
    }
  } else if (pd.kind === 'thug') {
    pd.state = 'chase';
  } else if (pd.kind === 'cop') {
    pd.state = 'chase';
  }
}

// ---- cars --------------------------------------------------------------

function updateCars(state, dt, events, audio) {
  const p = state.player;
  for (const car of state.cars) {
    if (car.dead) continue;
    if (car.kind === 'player') continue; // driven by updatePlayer
    if (car.kind === 'police') {
      updatePoliceCar(state, car, dt, events);
    } else if (car.kind === 'traffic') {
      updateTrafficCar(state, car, dt);
    }
    // car-car separation
    for (const other of state.cars) {
      if (other === car || other.dead) continue;
      const d2 = dist2(car.x, car.y, other.x, other.y);
      if (d2 < 46 * 46 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (46 - d) / 2;
        const nx = (car.x - other.x) / d, ny = (car.y - other.y) / d;
        car.x += nx * push; car.y += ny * push;
        if (car.kind === 'traffic') car.speed *= 0.94;
      }
    }
    // building hit for AI cars
    const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    if (buildingAt(state.world, car.x + fx * 26, car.y + fy * 26, 2)) {
      car.angle += Math.PI / 2;
      car.speed *= 0.4;
    }
    car.x = clamp(car.x, 30, WORLD.size - 30);
    car.y = clamp(car.y, 30, WORLD.size - 30);
  }
  // cull far-away wrecks and respawn traffic balance handled in updateGame
  state.cars = state.cars.filter((c) => !(c.dead && c.kind !== 'player'));
}

function updateTrafficCar(state, car, dt) {
  if (!car.target) pickRouteTarget(car);
  const tx = car.target.x, ty = car.target.y;
  const want = angleTo(car.x, car.y, tx, ty);
  car.angle = angleLerp(car.angle, want, Math.min(1, dt * 2.2));
  // slow for a car ahead on the same heading
  let blocked = false;
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const perp = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (along > 0 && along < 95 && perp < 30) { blocked = true; break; }
  }
  const targetSpeed = blocked ? 0 : car.cruise;
  car.speed += clamp(targetSpeed - car.speed, -260 * dt, 200 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (Math.hypot(tx - car.x, ty - car.y) < 26) {
    // at the intersection: mostly straight, sometimes turn
    if (Math.random() < 0.42) {
      car.angle += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2);
    }
    pickRouteTarget(car);
  }
}

function updatePoliceCar(state, car, dt, events) {
  const p = state.player;
  const target = p.inCar ? p.inCar : p;
  const want = angleTo(car.x, car.y, target.x, target.y);
  const d = Math.hypot(target.x - car.x, target.y - car.y);
  car.angle = angleLerp(car.angle, want, Math.min(1, dt * 2.6));
  const wantSpeed = d > 90 ? car.top : car.top * 0.55;
  car.speed += clamp(wantSpeed - car.speed, -700 * dt, 500 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // ram the player's car
  if (p.inCar && d < 52) {
    p.inCar.hp -= 14 * dt;
    p.inCar.speed *= 0.985;
    if (Math.random() < dt * 6) {
      burst(state, p.inCar.x, p.inCar.y, 4, '#ffd75e');
      pushEvent(events, 'rammed');
    }
  }
  // pull up next to a player on foot and drop a foot cop
  if (!p.inCar && d < 120 && Math.random() < dt * 0.5) {
    spawnFootCop(state, car.x + 20, car.y + 20);
  }
  // give up if the player is far and long unseen
  if (d > 1500) {
    car.dead = true;
  }
}

// ---- pedestrians -------------------------------------------------------

function updatePeds(state, dt, events) {
  const p = state.player;
  for (const pd of state.peds) {
    if (pd.state === 'down') {
      pd.downTimer += dt;
      continue;
    }
    if (pd.kind === 'cop' || (pd.kind === 'thug' && pd.state === 'chase')) {
      // chase the player
      const d = Math.hypot(p.x - pd.x, p.y - pd.y);
      pd.angle = angleTo(pd.x, pd.y, p.x, p.y);
      const sp = pd.speed * (d > 240 ? 1 : 0.9);
      pd.x += Math.cos(pd.angle) * sp * dt;
      pd.y += Math.sin(pd.angle) * sp * dt;
      if (pd.kind === 'thug' && d < 30) {
        p.hp -= 12 * dt;
        p.lastHurtAt = state.time;
        if (Math.random() < dt * 3) pushEvent(events, 'player-hit');
      }
      collideCircle(state.world, pd, 11);
      continue;
    }
    if (pd.state === 'flee' && pd.fleeFrom) {
      const a = angleTo(pd.fleeFrom.x, pd.fleeFrom.y, pd.x, pd.y);
      pd.angle = a;
      pd.x += Math.cos(a) * pd.speed * 2.4 * dt;
      pd.y += Math.sin(a) * pd.speed * 2.4 * dt;
      if (Math.hypot(pd.x - pd.fleeFrom.x, pd.y - pd.fleeFrom.y) > 420) {
        pd.state = 'walk';
        pd.fleeFrom = null;
      }
      collideCircle(state.world, pd, 11);
      continue;
    }
    // stroll: wander along sidewalks, pick a new heading now and then
    if (!pd.target || Math.hypot(pd.target.x - pd.x, pd.target.y - pd.y) < 24 || Math.random() < dt * 0.02) {
      const r = nearestRoad(pd.x, pd.y);
      const along = (Math.random() - 0.5) * 500;
      pd.target = r.vertical
        ? { x: r.x + (Math.random() < 0.5 ? -1 : 1) * 62, y: clamp(pd.y + along, 40, WORLD.size - 40) }
        : { x: clamp(pd.x + along, 40, WORLD.size - 40), y: r.y + (Math.random() < 0.5 ? -1 : 1) * 62 };
    }
    const a = angleTo(pd.x, pd.y, pd.target.x, pd.target.y);
    pd.angle = angleLerp(pd.angle, a, Math.min(1, dt * 4));
    pd.x += Math.cos(pd.angle) * pd.speed * dt;
    pd.y += Math.sin(pd.angle) * pd.speed * dt;
    collideCircle(state.world, pd, 11);
  }
  // hit by a fast car: peds get knocked down
  for (const car of state.cars) {
    if (car.dead || Math.abs(car.speed) < 200) continue;
    for (const pd of state.peds) {
      if (pd.state === 'down') continue;
      if (dist2(car.x, car.y, pd.x, pd.y) < 30 * 30) {
        hurtPed(state, pd, 999, events);
        burst(state, pd.x, pd.y, 8, '#c0392b');
        if (pd.kind === 'civ') addWanted(state, 1, events);
        pushEvent(events, 'ped-run-over');
      }
    }
  }
  // remove peds far from the player, keep the count healthy
  state.peds = state.peds.filter((pd) => {
    if (pd.state === 'down' && pd.downTimer > 14) return false;
    const d = Math.hypot(pd.x - p.x, pd.y - p.y);
    return d < 1400 || pd.kind === 'thug' || pd.kind === 'cop';
  });
}

// ---- wanted ------------------------------------------------------------

function updateWanted(state, dt, events) {
  const p = state.player;
  if (state.wanted === 0) return;
  // a cop nearby keeps you "seen"
  let seen = false;
  for (const car of state.cars) {
    if (car.kind === 'police' && !car.dead && Math.hypot(car.x - p.x, car.y - p.y) < 650) { seen = true; break; }
  }
  if (!seen) {
    for (const pd of state.peds) {
      if (pd.kind === 'cop' && pd.state !== 'down' && Math.hypot(pd.x - p.x, pd.y - p.y) < 420) { seen = true; break; }
    }
  }
  if (seen) {
    state.unseenTimer = 0;
  } else {
    state.unseenTimer += dt;
    if (state.unseenTimer > WANTED.decayDelay) {
      state.unseenTimer = WANTED.decayDelay + WANTED.decayStep - 0.001;
      // handled below by the accumulator trick: lose a star every decayStep
      state._decayAcc = (state._decayAcc || 0) + dt;
      if (state._decayAcc >= WANTED.decayStep) {
        state._decayAcc = 0;
        state.wanted -= 1;
        pushEvent(events, 'wanted-down', { stars: state.wanted });
        if (state.wanted === 0) {
          state.cars = state.cars.filter((c) => c.kind !== 'police');
          state.peds = state.peds.filter((pd) => pd.kind !== 'cop' || pd.state === 'down');
        }
      }
    }
  }
  // spawn pressure: keep 1 cop car per star (cap 4) plus foot cops at 2+
  state.copSpawnTimer -= dt;
  if (state.copSpawnTimer <= 0) {
    state.copSpawnTimer = 2.2;
    const copCars = state.cars.filter((c) => c.kind === 'police' && !c.dead).length;
    const wantCars = Math.min(4, Math.max(1, state.wanted));
    if (copCars < wantCars) spawnCopCar(state, p.x, p.y);
    if (state.wanted >= 2 && !p.inCar) {
      const footCops = state.peds.filter((pd) => pd.kind === 'cop' && pd.state !== 'down').length;
      if (footCops < state.wanted) {
        const spot = roadPoint(Math.random);
        spawnFootCop(state, spot.x, spot.y);
      }
    }
  }
}

// ---- pickups / particles / bullets -------------------------------------

function updatePickups(state, dt, events) {
  for (const pk of state.pickups) pk.ttl -= dt;
  state.pickups = state.pickups.filter((pk) => pk.ttl > 0);
}

function updateParticles(state, dt) {
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 12 * dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
}

function updateBullets(state, dt, events) {
  for (const b of state.bullets) b.life -= dt;
  state.bullets = state.bullets.filter((b) => b.life > 0);
}

export function burst(state, x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 140;
    state.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.4 + Math.random() * 0.5, max: 0.9, color, size: 2 + Math.random() * 3,
    });
  }
}

export function addPickup(state, kind, x, y, amount = 0) {
  state.pickups.push({ x, y, kind, amount, ttl: 60, taken: false });
}
