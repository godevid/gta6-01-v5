// Rendering: the camera, the island, every car and pedestrian, the HUD and
// the minimap. Top-down with a little height faked in — buildings cast a
// south-east shadow and palms lean the same way, so the flat map reads as a
// place. The day cycle tints everything from morning gold to neon night.

import { WORLD, COLORS, CAR, PLAYER } from './config.js';
import { clamp, lerp } from './random.js';
import { ROAD_XS, ROAD_YS, PLACES, isSand } from './world.js';

export function createRenderer(canvas, minimap) {
  const ctx = canvas.getContext('2d');
  const mctx = minimap.getContext('2d');
  const camera = { x: 0, y: 0, zoom: 1 };
  return { ctx, mctx, camera, canvas, minimap };
}

function skyTint(clock) {
  // returns {overlay, alpha, lampOn} for the hour of day
  if (clock >= 6 && clock < 9) return { color: '255,190,90', alpha: 0.10, lamp: false };
  if (clock >= 9 && clock < 17) return { color: '255,255,255', alpha: 0, lamp: false };
  if (clock >= 17 && clock < 19.5) return { color: '255,120,60', alpha: 0.16, lamp: true };
  if (clock >= 19.5 || clock < 5) return { color: '10,20,80', alpha: 0.30, lamp: true };
  return { color: '255,170,110', alpha: 0.12, lamp: false };
}

export function drawGame(r, state, view, shotMode) {
  const { ctx, canvas, camera } = r;
  const p = state.player;
  const W = canvas.width, H = canvas.height;
  const zoom = Math.min(W / 1280, H / 720) * 1.0;
  camera.zoom = zoom;

  // camera follows the player (or the shot's fixed framing)
  if (shotMode === 'start') {
    camera.x = 1470; camera.y = 2400;
  } else if (shotMode === 'end') {
    camera.x = PLACES.bank.x; camera.y = PLACES.bank.y;
  } else {
    const look = p.inCar ? 90 : 40;
    const lx = Math.cos(p.angle) * look;
    const ly = Math.sin(p.angle) * look;
    camera.x = lerp(camera.x || p.x, p.x + lx, 0.12);
    camera.y = lerp(camera.y || p.y, p.y + ly, 0.12);
  }

  ctx.fillStyle = '#0a2536';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camera.x, -camera.y);

  drawGround(ctx, state.world, camera, zoom, W, H);
  drawPlaces(ctx, state);
  drawPickups(ctx, state);
  drawPeds(ctx, state);
  drawCars(ctx, state);
  drawPlayer(ctx, state);
  drawParticles(ctx, state);
  drawBullets(ctx, state);
  drawWaypoint(ctx, state, view.target);

  ctx.restore();

  // day / night tint
  const tint = skyTint(state.clock);
  if (tint.alpha > 0) {
    ctx.fillStyle = `rgba(${tint.color},${tint.alpha})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (tint.lamp) {
    ctx.fillStyle = 'rgba(255,230,150,0.05)';
    ctx.fillRect(0, 0, W, H);
  }
}

function visible(camera, zoom, W, H) {
  const hw = W / 2 / zoom, hh = H / 2 / zoom;
  return { x0: camera.x - hw - 80, y0: camera.y - hh - 80, x1: camera.x + hw + 80, y1: camera.y + hh + 80 };
}

function drawGround(ctx, world, camera, zoom, W, H) {
  const v = visible(camera, zoom, W, H);
  // water around the island
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  // island base
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, WORLD.size, WORLD.size);
  // mow stripes for texture
  ctx.fillStyle = COLORS.grassDark;
  for (let y = 0; y < WORLD.size; y += 240) {
    ctx.fillRect(0, y, WORLD.size, 110);
  }
  // sand beaches south + east
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(0, 3180, WORLD.size, WORLD.size - 3180);
  ctx.fillRect(3180, 0, WORLD.size - 3180, WORLD.size);
  ctx.fillStyle = COLORS.waterDeep;
  ctx.fillRect(0, 3360, WORLD.size, 40);
  ctx.fillRect(3360, 0, 40, WORLD.size);

  // parks
  for (const park of world.parks) {
    if (park.x > v.x1 || park.x + park.w < v.x0 || park.y > v.y1 || park.y + park.h < v.y0) continue;
    ctx.fillStyle = park.plaza ? COLORS.plaza : COLORS.park;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    if (!park.plaza) {
      ctx.fillStyle = '#2a6e34';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(park.x + 40 + i * 60, park.y + park.h / 2, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // sidewalks + roads
  ctx.fillStyle = COLORS.sidewalk;
  for (const rx of ROAD_XS) ctx.fillRect(rx - WORLD.roadWidth / 2 - WORLD.sidewalk, 0, WORLD.roadWidth + WORLD.sidewalk * 2, WORLD.size);
  for (const ry of ROAD_YS) ctx.fillRect(0, ry - WORLD.roadWidth / 2 - WORLD.sidewalk, WORLD.size, WORLD.roadWidth + WORLD.sidewalk * 2);
  ctx.fillStyle = COLORS.road;
  for (const rx of ROAD_XS) ctx.fillRect(rx - WORLD.roadWidth / 2, 0, WORLD.roadWidth, WORLD.size);
  for (const ry of ROAD_YS) ctx.fillRect(0, ry - WORLD.roadWidth / 2, WORLD.size, WORLD.roadWidth);

  // centre dashes
  ctx.fillStyle = COLORS.roadLine;
  for (const rx of ROAD_XS) {
    for (let y = 0; y < WORLD.size; y += 64) ctx.fillRect(rx - 2, y, 4, 30);
  }
  for (const ry of ROAD_YS) {
    for (let x = 0; x < WORLD.size; x += 64) ctx.fillRect(x, ry - 2, 30, 4);
  }

  // buildings with a fake-height shadow offset
  for (const b of world.buildings) {
    if (b.x > v.x1 || b.x + b.w < v.x0 || b.y > v.y1 || b.y + b.h < v.y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(b.x, b.y, b.w, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(b.x + 10, b.y + 14, b.w - 20, b.h - 24);
    // roof details: vents / pool
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, b.w * 0.16, b.h * 0.2);
    ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.55, b.w * 0.16, b.h * 0.2);
  }

  // palms
  for (const palm of world.palms) {
    if (palm.x < v.x0 || palm.x > v.x1 || palm.y < v.y0 || palm.y > v.y1) continue;
    drawPalm(ctx, palm.x, palm.y, palm.s);
  }
}

function drawPalm(ctx, x, y, s) {
  ctx.strokeStyle = '#7a5230';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 4 * s, y - 12 * s);
  ctx.stroke();
  ctx.fillStyle = '#2f9e44';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.ellipse(x + 4 * s + Math.cos(a) * 9 * s, y - 12 * s + Math.sin(a) * 7 * s, 11 * s, 4 * s, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#8a5a3b';
  ctx.beginPath();
  ctx.arc(x + 4 * s, y - 12 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.fill();
}

const PLACE_COLORS = {
  garage: '#ffd75e', marina: '#7ad9ff', bar: '#ff9ecf', hospital: '#ff6b6b',
  spray: '#9dff6e', gunshop: '#c9a2ff', docks: '#ffb347', bank: '#ffe9a8',
  hideout: '#7dffd4', ferry: '#ffffff',
};

function drawPlaces(ctx, state) {
  ctx.font = 'bold 13px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = 'center';
  for (const key of Object.keys(PLACES)) {
    const pl = PLACES[key];
    // ground pad
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PLACE_COLORS[key] || '#fff';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10202e';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PLACE_COLORS[key] || '#fff';
    ctx.fillText('★', pl.x, pl.y + 5);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(pl.name, pl.x, pl.y + 44);
  }
}

function drawPickups(ctx, state) {
  for (const pk of state.pickups) {
    const bob = Math.sin(state.time * 4 + pk.x) * 3;
    if (pk.kind === 'health') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(pk.x - 11, pk.y - 11 + bob, 22, 22);
      ctx.fillStyle = '#e33';
      ctx.fillRect(pk.x - 3, pk.y - 8 + bob, 6, 16);
      ctx.fillRect(pk.x - 8, pk.y - 3 + bob, 16, 6);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#c9a2ff';
      ctx.fillRect(pk.x - 10, pk.y - 7 + bob, 20, 14);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Verdana';
      ctx.textAlign = 'center';
      ctx.fillText('AMMO', pk.x, pk.y + 3 + bob);
    } else if (pk.kind === 'package') {
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(pk.x - 12, pk.y - 9 + bob, 24, 18);
      ctx.fillStyle = '#ffd75e';
      ctx.fillRect(pk.x - 12, pk.y - 2 + bob, 24, 4);
    } else {
      ctx.fillStyle = '#2f9e44';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd75e';
      ctx.font = 'bold 12px Verdana';
      ctx.textAlign = 'center';
      ctx.fillText('$', pk.x, pk.y + 4 + bob);
    }
  }
}

function drawPeds(ctx, state) {
  for (const pd of state.peds) {
    if (pd.state === 'down') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(pd.x, pd.y, 13, 8, pd.angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pd.shirt;
      ctx.beginPath();
      ctx.ellipse(pd.x, pd.y, 11, 6, pd.angle, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(pd.x + 2, pd.y + 3, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // body: shoulders + head, facing angle
    const fx = Math.cos(pd.angle), fy = Math.sin(pd.angle);
    ctx.fillStyle = pd.shirt;
    ctx.beginPath();
    ctx.arc(pd.x, pd.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pd.skin;
    ctx.beginPath();
    ctx.arc(pd.x + fx * 3, pd.y + fy * 3, 6.5, 0, Math.PI * 2);
    ctx.fill();
    if (pd.kind === 'cop') {
      ctx.fillStyle = '#1d2f4a';
      ctx.beginPath();
      ctx.arc(pd.x + fx * 3, pd.y + fy * 3, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd75e';
      ctx.fillRect(pd.x - 6, pd.y - 2, 12, 4);
    }
    if (pd.kind === 'thug') {
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(pd.x + fx * 3, pd.y + fy * 3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e33';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pd.x + fx * 10, pd.y + fy * 10);
      ctx.lineTo(pd.x + fx * 20, pd.y + fy * 20);
      ctx.stroke();
    }
  }
}

function drawCars(ctx, state) {
  for (const car of state.cars) {
    drawCar(ctx, car);
  }
}

function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width);
  // body
  ctx.fillStyle = car.dead ? '#3a3a3a' : car.color;
  roundRect(ctx, -CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
  ctx.fill();
  // cabin
  ctx.fillStyle = car.dead ? '#222' : 'rgba(20,40,60,0.85)';
  roundRect(ctx, -12, -CAR.width / 2 + 4, 24, CAR.width - 8, 5);
  ctx.fill();
  // windshield shine
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(8, -CAR.width / 2 + 5, 5, CAR.width - 10);
  // headlights / taillights
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(CAR.length / 2 - 3, -CAR.width / 2 + 2, 3, 5);
  ctx.fillRect(CAR.length / 2 - 3, CAR.width / 2 - 7, 3, 5);
  ctx.fillStyle = '#e33';
  ctx.fillRect(-CAR.length / 2, -CAR.width / 2 + 2, 3, 5);
  ctx.fillRect(-CAR.length / 2, CAR.width / 2 - 7, 3, 5);
  if (car.kind === 'police') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px Verdana';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
    // light bar, alternating with time
    const on = Math.floor(performance.now() / 280) % 2 === 0;
    ctx.fillStyle = on ? '#ff2e2e' : '#2e6bff';
    ctx.fillRect(-6, -CAR.width / 2 - 2, 12, 4);
    ctx.fillStyle = on ? '#2e6bff' : '#ff2e2e';
    ctx.fillRect(-6, CAR.width / 2 - 2, 12, 4);
  }
  if (car.kind === 'player') {
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 2;
    roundRect(ctx, -CAR.length / 2 - 3, -CAR.width / 2 - 3, CAR.length + 6, CAR.width + 6, 10);
    ctx.stroke();
  }
  if (car.dead) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -8); ctx.lineTo(14, 8);
    ctx.moveTo(14, -8); ctx.lineTo(-14, 8);
    ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPlayer(ctx, state) {
  const p = state.player;
  if (p.inCar) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  // Jax: teal jacket, dark jeans, always moving like he owns the street
  ctx.fillStyle = '#0f8a7a';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(4, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242a';
  ctx.beginPath();
  ctx.arc(5, -3, 3, 0, Math.PI * 2);
  ctx.arc(5, 3, 3, 0, Math.PI * 2);
  ctx.fill();
  // gun in hand
  if (p.weapon === 'pistol' && p.hasPistol) {
    ctx.fillStyle = '#222';
    ctx.fillRect(10, -2, 12, 4);
  }
  // punch swing arc
  if (p.punchCd > PLAYER_PUNCH_WINDOW) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 30, -0.7, 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

// punch window constant: the swing arc shows for the first part of the cooldown
const PLAYER_PUNCH_WINDOW = PLAYER.punchCooldown - 0.18;

function drawParticles(ctx, state) {
  for (const pt of state.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBullets(ctx, state) {
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2;
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
  }
}

function drawWaypoint(ctx, state, target) {
  if (!target) return;
  const p = state.player;
  const d = Math.hypot(target.x - p.x, target.y - p.y);
  // beacon column on the target
  ctx.fillStyle = 'rgba(255,215,94,0.25)';
  ctx.fillRect(target.x - 3, target.y - 130, 6, 130);
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath();
  ctx.moveTo(target.x, target.y - 132);
  ctx.lineTo(target.x - 12, target.y - 108);
  ctx.lineTo(target.x + 12, target.y - 108);
  ctx.closePath();
  ctx.fill();
  // edge arrow when the target is off-screen handled by the minimap;
  // draw a small direction tick above the player
  if (d > 60) {
    const a = Math.atan2(target.y - p.y, target.x - p.x);
    ctx.save();
    ctx.translate(p.x + Math.cos(a) * 46, p.y + Math.sin(a) * 46);
    ctx.rotate(a);
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 12px Verdana';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(d)}m`, p.x + Math.cos(a) * 46, p.y + Math.sin(a) * 46 - 14);
  }
}

// ---- HUD + minimap -----------------------------------------------------

export function drawMinimap(r, state, target) {
  const { mctx, minimap } = r;
  const p = state.player;
  const S = minimap.width;
  const scale = S / WORLD.size;
  mctx.clearRect(0, 0, S, S);
  mctx.save();
  mctx.beginPath();
  mctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  mctx.clip();
  mctx.fillStyle = '#123a2a';
  mctx.fillRect(0, 0, S, S);
  mctx.fillStyle = '#e8d29a';
  mctx.fillRect(0, S * 3180 / WORLD.size, S, S);
  mctx.fillRect(S * 3180 / WORLD.size, 0, S, S);
  mctx.fillStyle = '#5a5f66';
  for (const rx of ROAD_XS) mctx.fillRect(rx * scale - 1, 0, 2, S);
  for (const ry of ROAD_YS) mctx.fillRect(0, ry * scale - 1, S, 2);
  // places
  for (const key of Object.keys(PLACES)) {
    const pl = PLACES[key];
    mctx.fillStyle = '#ffd75e';
    mctx.fillRect(pl.x * scale - 1.5, pl.y * scale - 1.5, 3, 3);
  }
  // mission target
  if (target) {
    mctx.fillStyle = '#ff5e5e';
    mctx.beginPath();
    mctx.arc(target.x * scale, target.y * scale, 5, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = 1;
    mctx.stroke();
  }
  // police
  for (const car of state.cars) {
    if (car.kind === 'police' && !car.dead) {
      mctx.fillStyle = '#2e6bff';
      mctx.beginPath();
      mctx.arc(car.x * scale, car.y * scale, 3, 0, Math.PI * 2);
      mctx.fill();
    }
  }
  // player arrow, always centred on the map
  mctx.save();
  mctx.translate(p.x * scale, p.y * scale);
  mctx.rotate(p.angle);
  mctx.fillStyle = '#fff';
  mctx.beginPath();
  mctx.moveTo(7, 0); mctx.lineTo(-5, -4.5); mctx.lineTo(-5, 4.5);
  mctx.closePath();
  mctx.fill();
  mctx.restore();
  // north tick
  mctx.fillStyle = '#fff';
  mctx.font = 'bold 11px Verdana';
  mctx.textAlign = 'center';
  mctx.fillText('N', S / 2, 12);
  mctx.restore();
}
