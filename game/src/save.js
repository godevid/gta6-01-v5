// Save / load through localStorage. A save holds the player's position,
// health, cash, weapons, mission progress, wanted level and the clock —
// enough to pick up exactly where the player left off. Cars and pedestrians
// are re-dealt fresh on load, which keeps saves small and honest.

import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return false;
  }
}

export function saveGame(state, missions) {
  try {
    const p = state.player;
    const data = {
      v: 1,
      savedAt: Date.now(),
      x: Math.round(p.x), y: Math.round(p.y),
      hp: Math.round(p.hp), cash: p.cash,
      weapon: p.weapon, ammo: p.ammo, hasPistol: p.hasPistol,
      missionIndex: missions.index,
      missionStep: missions.step,
      missionsDone: missions.done,
      wanted: state.wanted,
      clock: state.clock,
      stats: state.stats,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage */ }
}

export function applySave(state, missions, data) {
  const p = state.player;
  p.x = data.x; p.y = data.y;
  p.hp = data.hp; p.cash = data.cash;
  p.weapon = data.weapon; p.ammo = data.ammo; p.hasPistol = data.hasPistol;
  p.inCar = null;
  state.wanted = data.wanted || 0;
  state.clock = data.clock ?? 9.5;
  if (data.stats) state.stats = { ...state.stats, ...data.stats };
  missions.index = data.missionIndex || 0;
  missions.step = 0;
  missions.done = !!data.missionsDone;
  missions.active = false;
  return data;
}
