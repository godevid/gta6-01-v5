// Palm Key Heat — main loop. Owns the state machine (menu, playing,
// paused, dialogue, busted, wasted), the HUD, the shops, the phone calls
// that start missions, and the save. All simulation lives in entities.js
// and missions.js; this file only conducts it.

import { generateWorld, PLACES } from './world.js';
import { createGame, updateGame, addWanted, addPickup } from './entities.js';
import { createMissions, startMission, updateMissions, objectiveText, missionTarget, noteThugDown, MISSIONS } from './missions.js';
import { createRenderer, drawGame, drawMinimap } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { hasSave, saveGame, loadSave, applySave, clearSave } from './save.js';
import { parseShot, applyShot } from './shots.js';
import { ECONOMY, PLAYER } from './config.js';

const canvas = document.getElementById('game');
const minimap = document.getElementById('minimap');
const input = createInput(canvas);
const audio = createAudio();
const world = generateWorld(1337);
const renderer = createRenderer(canvas, minimap);

const $ = (id) => document.getElementById(id);
const els = {
  menu: $('menu'), objective: $('objective'), stars: $('stars'), clock: $('clock'),
  cash: $('cash'), cashval: $('cashval'), health: $('health'), healthfill: $('healthfill'),
  armorval: $('armorval'), weaponval: $('weaponval'), ammoval: $('ammoval'),
  speed: $('speed'), speedval: $('speedval'), toast: $('toast'), hint: $('hint'),
  banner: $('banner'), bannertitle: $('bannertitle'), bannertext: $('bannertext'),
  dialog: $('dialog'), dialogwho: $('dialogwho'), dialogline: $('dialogline'),
};

const shot = parseShot();
const state = createGame(world, { freeRoam: shot.name === 'play' });
const missions = createMissions();

let mode = 'menu';           // menu | playing | paused | dialog | over
let dialogQueue = [];        // {who, lines[]} then current line index
let dialogCurrent = null;
let dialogLineIdx = 0;
let toastTimer = 0;
let bannerTimer = 0;
let overTimer = 0;
let phoneTimer = 7;          // first call comes quickly
let lastSaveAt = 0;
let shotPose = null;

function toast(text, secs = 3) {
  els.toast.textContent = text;
  toastTimer = secs;
}

function banner(title, text, secs = 2.6) {
  els.bannertitle.textContent = title;
  els.bannertext.textContent = text;
  els.banner.style.display = 'block';
  bannerTimer = secs;
}

function openDialog(who, lines) {
  dialogQueue.push({ who, lines });
  if (mode !== 'dialog') nextDialog();
}

function nextDialog() {
  if (dialogQueue.length === 0) {
    dialogCurrent = null;
    els.dialog.style.display = 'none';
    if (mode === 'dialog') mode = 'playing';
    return;
  }
  dialogCurrent = dialogQueue[0];
  dialogLineIdx = 0;
  mode = 'dialog';
  els.dialog.style.display = 'block';
  els.dialogwho.textContent = dialogCurrent.who;
  els.dialogline.textContent = dialogCurrent.lines[0];
}

function advanceDialog() {
  if (!dialogCurrent) return;
  dialogLineIdx++;
  if (dialogLineIdx >= dialogCurrent.lines.length) {
    dialogQueue.shift();
    nextDialog();
  } else {
    els.dialogline.textContent = dialogCurrent.lines[dialogLineIdx];
  }
}

// ---- starting the game -------------------------------------------------

function beginGame(kind) {
  audio.unlock();
  els.menu.style.display = 'none';
  els.objective.style.display = 'block';
  els.cash.style.display = 'block';
  els.health.style.display = 'block';
  els.speed.style.display = 'block';
  mode = 'playing';
  state.over = null;
  if (kind === 'new') {
    clearSave();
    missions.index = 0;
    missions.done = false;
    phoneTimer = 2.5;
    toast('Welcome to Palm Key. Rico is calling…', 4);
  } else if (kind === 'continue') {
    const data = loadSave();
    if (data) {
      applySave(state, missions, data);
      toast(`Welcome back, Jax. ${MISSIONS[missions.index] ? 'Rico has work for you.' : 'Palm Key is yours.'}`, 4);
      phoneTimer = 3;
    }
  } else {
    // free roam: no story, the island and a starter car
    missions.done = true;
    missions.active = false;
    state.freeRoam = true;
    state.player.cash = 500;
    toast('Free roam — the whole island is yours. No jobs, no rules.', 4);
  }
}

$('btn-new').addEventListener('click', () => beginGame('new'));
$('btn-continue').addEventListener('click', () => beginGame('continue'));
$('btn-freeroam').addEventListener('click', () => beginGame('free'));
if (hasSave()) $('btn-continue').style.display = 'inline-block';

// ---- events from the simulation ----------------------------------------

function handleEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case 'dialog':
        openDialog(ev.who, ev.lines);
        break;
      case 'mission-start':
        banner(ev.title, 'New job — check the objective, top left.', 3);
        audio.phone();
        break;
      case 'mission-complete':
        banner('JOB DONE', `${ev.title} — +$${ev.reward}`, 3.2);
        audio.mission();
        saveGame(state, missions);
        phoneTimer = 6;
        break;
      case 'mission-failed':
        banner('JOB FAILED', ev.reason + ' — Rico is giving you another shot.', 3.2);
        audio.fail();
        break;
      case 'story-complete':
        banner('PALM KEY IS YOURS', 'All six jobs done. Jax Marlow runs this island now.', 6);
        audio.mission();
        saveGame(state, missions);
        break;
      case 'carjack':
        toast('Carjacked! The PD won\'t like that.', 2.5);
        audio.sirenBlip();
        break;
      case 'carjack-police':
        toast('You stole a cop car?! Bold. Very bold.', 3);
        break;
      case 'wanted-up':
        if (ev.stars >= 3) toast(`WANTED — ${ev.stars} stars! Lose the cops!`, 3);
        break;
      case 'wanted-down':
        if (ev.stars === 0) toast('You lost them. For now.', 2.5);
        break;
      case 'busted':
        mode = 'over';
        overTimer = 0;
        banner('BUSTED', 'The Palm Key PD has you. Fine paid, ride impounded.', 0);
        break;
      case 'wasted':
        mode = 'over';
        overTimer = 0;
        banner('WASTED', 'You wake up at Palm Key General, lighter in the wallet.', 0);
        break;
      case 'thug-down':
        noteThugDown(missions, state);
        toast('Dock Rat down.', 1.6);
        break;
      case 'cop-down':
        toast('Cop down! The heat is coming.', 2.5);
        break;
      case 'package':
        toast(`Package ${ev.n} of 3 secured.`, 2);
        audio.pickup();
        break;
      case 'alarm':
        toast(ev.text, 3.5);
        audio.sirenBlip();
        break;
      case 'cash':
        audio.coin();
        break;
      case 'healed':
        audio.pickup();
        break;
      case 'ammo':
        audio.pickup();
        break;
      case 'punch-hit':
        break;
      case 'crash':
        if (ev.hard) toast('That\'s gonna leave a mark.', 1.5);
        break;
      case 'car-destroyed':
        toast('Your ride is scrap. Find another one.', 3);
        break;
      case 'rammed':
        toast('The PD is ramming you!', 1.6);
        break;
      case 'dry-fire':
        toast('Out of ammo — buy more at Ironworks.', 2.5);
        break;
      case 'entered-car':
        toast(`${ev.car} — yours now.`, 1.8);
        break;
      default:
        break;
    }
  }
}

// ---- shops ---------------------------------------------------------------

function nearPlace(name, radius) {
  const pl = PLACES[name];
  const p = state.player;
  return Math.hypot(p.x - pl.x, p.y - pl.y) < radius;
}

function updateShops(dt) {
  const p = state.player;
  if (nearPlace('hospital', 90) && p.hp < PLAYER.maxHealth) {
    p.hp = Math.min(PLAYER.maxHealth, p.hp + 6 * dt);
  }
  if (input.consume('KeyR') && nearPlace('spray', 110) && p.inCar) {
    if (p.cash >= ECONOMY.sprayCost) {
      p.cash -= ECONOMY.sprayCost;
      p.inCar.hp = 100;
      state.wanted = 0;
      state.cars = state.cars.filter((c) => c.kind !== 'police');
      toast('Pay N Spray — fresh paint, clean record. -$80', 3);
      audio.pickup();
    } else {
      toast('Pay N Spray costs $80 — you\'re short.', 2.5);
    }
  }
  if (input.consume('KeyB') && nearPlace('gunshop', 100) && !p.inCar) {
    if (!p.hasPistol) {
      if (p.cash >= ECONOMY.pistolCost) {
        p.cash -= ECONOMY.pistolCost;
        p.hasPistol = true;
        p.weapon = 'pistol';
        p.ammo = 24;
        toast('Ironworks — pistol bought, 24 rounds in. Press 2 to draw it.', 3.5);
        audio.pickup();
      } else {
        toast(`A pistol is $${ECONOMY.pistolCost} — save up.`, 2.5);
      }
    } else if (p.cash >= ECONOMY.ammoCost) {
      p.cash -= ECONOMY.ammoCost;
      p.ammo += 24;
      toast('Ammo +24. -$60', 2);
      audio.pickup();
    } else {
      toast('Ammo is $60 a box — you\'re short.', 2.5);
    }
  }
  if (input.consume('KeyH') && nearPlace('hospital', 100) && !p.inCar) {
    if (p.hp < PLAYER.maxHealth && p.cash >= 40) {
      p.cash -= 40;
      p.hp = PLAYER.maxHealth;
      toast('Palm Key General patched you up. -$40', 2.5);
      audio.pickup();
    }
  }
}

function hintText() {
  const p = state.player;
  if (mode !== 'playing') return '';
  if (p.inCar) {
    if (nearPlace('spray', 110)) return 'Press R — Pay N Spray: repair + clear wanted ($80)';
    return 'E — get out   •   SPACE — handbrake   •   Drive to the yellow marker';
  }
  // on foot: nearest car?
  let best = null, bestD = 70 * 70;
  for (const c of state.cars) {
    if (c.dead) continue;
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best) return `Press E — get in the ${best.type}`;
  if (nearPlace('gunshop', 100)) return 'Press B — buy pistol ($250) / ammo ($60)';
  if (nearPlace('hospital', 100)) return 'Press H — full heal ($40)   •   Standing here heals you free';
  return 'WASD — move   •   E — enter car   •   F — punch   •   Click — shoot (with a gun)';
}

// ---- HUD -----------------------------------------------------------------

function fmtClock(clock) {
  const h = Math.floor(clock) % 24;
  const m = Math.floor((clock % 1) * 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const part = h < 5 ? 'NIGHT' : h < 9 ? 'DAWN' : h < 17 ? 'DAY' : h < 19.5 ? 'DUSK' : 'NIGHT';
  return `${hh}:${mm}  ${part}`;
}

function updateHUD() {
  const p = state.player;
  els.cashval.textContent = '$' + p.cash.toLocaleString('en-US');
  els.stars.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  els.stars.style.color = state.wanted >= 3 ? '#ff5e5e' : '#ffd75e';
  els.stars.style.opacity = state.wanted === 0 ? '0.35' : '1';
  els.clock.textContent = fmtClock(state.clock);
  els.healthfill.style.width = Math.max(0, p.hp) + '%';
  els.healthfill.style.background = p.hp > 50 ? 'linear-gradient(90deg,#37e07a,#9dff6e)' : p.hp > 25 ? 'linear-gradient(90deg,#e0a437,#ffd75e)' : 'linear-gradient(90deg,#e03737,#ff7a5e)';
  els.armorval.textContent = state.wanted > 0 ? `WANTED ${state.wanted}★` : 'CLEAN';
  els.weaponval.textContent = p.weapon === 'pistol' && p.hasPistol ? 'PISTOL' : 'FISTS';
  els.ammoval.textContent = p.hasPistol ? `AMMO ${p.ammo}` : '';
  els.speedval.textContent = p.inCar ? String(Math.round(Math.abs(p.inCar.speed) * 0.09)) : '0';
  els.objective.innerHTML = '<b>JOB</b><br>' + objectiveText(missions) + '<div class="sub">Missions done: ' + state.stats.missions + ' / 6 &nbsp;•&nbsp; Cars taken: ' + state.stats.stolen + '</div>';
  els.hint.textContent = hintText();
  if (toastTimer > 0) {
    toastTimer -= 1 / 60;
    if (toastTimer <= 0) els.toast.textContent = '';
  }
  if (bannerTimer > 0) {
    bannerTimer -= 1 / 60;
    if (bannerTimer <= 0) els.banner.style.display = 'none';
  }
}

// ---- respawn after busted / wasted ---------------------------------------

function respawn() {
  const p = state.player;
  els.banner.style.display = 'none';
  if (state.over === 'busted') {
    p.cash = Math.max(0, p.cash - ECONOMY.bustFine);
    p.x = PLACES.garage.x; p.y = PLACES.garage.y + 80;
  } else {
    p.cash = Math.max(0, p.cash - ECONOMY.hospitalFee);
    p.x = PLACES.hospital.x; p.y = PLACES.hospital.y + 80;
    p.hp = PLAYER.maxHealth;
  }
  p.inCar = null;
  p.hp = Math.max(p.hp, 60);
  state.wanted = 0;
  state.cars = state.cars.filter((c) => c.kind !== 'police');
  state.peds = state.peds.filter((pd) => pd.kind !== 'cop');
  state.over = null;
  mode = 'playing';
  saveGame(state, missions);
}

// ---- the loop --------------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // world mouse position for aiming
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const mx = (input.mouse.x * sx - canvas.width / 2) / renderer.camera.zoom + renderer.camera.x;
  const my = (input.mouse.y * sy - canvas.height / 2) / renderer.camera.zoom + renderer.camera.y;
  input.mouse.wx = mx;
  input.mouse.wy = my;

  if (input.consume('KeyM')) {
    const muted = audio.toggleMute();
    toast(muted ? 'Sound off.' : 'Sound on.', 1.5);
  }

  if (mode === 'menu') {
    // attract mode: the island lives behind the title
    updateGame(state, input, dt, audio);
  } else if (mode === 'playing') {
    if (input.consume('KeyP')) {
      mode = 'paused';
      banner('PAUSED', 'Press P to keep playing.', 0);
    } else {
      const events = updateGame(state, input, dt, audio);
      updateMissions(missions, state, dt, events);
      handleEvents(events);
      updateShops(dt);
      // phone rings for the next job
      if (!missions.active && !missions.done && !state.freeRoam) {
        phoneTimer -= dt;
        if (phoneTimer <= 0) {
          const call = [];
          startMission(missions, state, call);
          handleEvents(call);
        }
      }
      // engine + siren mix
      const car = state.player.inCar;
      audio.setEngine(car ? Math.abs(car.speed) / car.top : 0, !!car);
      audio.setSiren(state.wanted > 0);
      // autosave every 45s
      if (state.time - lastSaveAt > 45) {
        lastSaveAt = state.time;
        saveGame(state, missions);
      }
    }
  } else if (mode === 'paused') {
    if (input.consume('KeyP')) {
      mode = 'playing';
      els.banner.style.display = 'none';
    }
    audio.setEngine(0, false);
    audio.setSiren(false);
  } else if (mode === 'dialog') {
    if (input.consume('Enter') || input.consume('NumpadEnter')) advanceDialog();
    audio.setEngine(0, false);
  } else if (mode === 'over') {
    overTimer += dt;
    updateGame(state, input, 0, audio);
    if (overTimer > 2.6) respawn();
  }

  drawGame(renderer, state, { target: missionTarget(missions) }, shotPose);
  drawMinimap(renderer, state, missionTarget(missions));
  updateHUD();
  input.endFrame();
  requestAnimationFrame(frame);
}

// ---- screenshot poses ------------------------------------------------------

if (shot.name) {
  shotPose = applyShot(state, missions, shot.name);
  if (shotPose === 'menu') {
    // stay on the title screen over the beach vista
    mode = 'menu';
  } else {
    els.menu.style.display = 'none';
    els.objective.style.display = 'block';
    els.cash.style.display = 'block';
    els.health.style.display = 'block';
    els.speed.style.display = 'block';
    mode = 'playing';
    if (shotPose === 'story') {
      banner('THE BIG ONE — DONE', 'Palm Key Trust, cleaned out. Jax Marlow runs this island.', 0);
    }
  }
}

// debug handle: lets automated smoke tests (and the curious) inspect the
// live simulation without touching the save or the DOM.
window.__palmkey = { state, missions, version: 1 };

requestAnimationFrame(frame);
