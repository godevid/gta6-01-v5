// The story: six jobs from Rico, the fixer at the marina garage. Each
// mission is a small state machine — a list of steps with a place to reach,
// something to collect or someone to deal with, and a timer where the job
// has one. Failing a timed job just restarts that job, never the story.

import { PLACES } from './world.js';
import { ECONOMY } from './config.js';
import { addPickup, spawnThug, addWanted } from './entities.js';

export const MISSIONS = [
  {
    id: 'wheels',
    title: '1 — WHEELS',
    giver: 'RICO',
    intro: [
      'Jax. You made it off the ferry. Good. First rule of Palm Key: nobody lends you a car.',
      'Borrow one. Any car on the street. Then bring it to my garage so I can see what I\'m working with.',
    ],
    steps: [
      { text: 'Get in a car — any car. Press E next to one.', kind: 'enter-car' },
      { text: 'Drive to Rico\'s Garage.', kind: 'reach', place: 'garage', radius: 90 },
    ],
  },
  {
    id: 'pickup',
    title: '2 — THE PICKUP',
    giver: 'RICO',
    intro: [
      'Lena is waiting at The Sandbar and she does not like waiting. Fetch her, bring her to the marina.',
      'Drive smooth. She gets carsick, and she tells me everything.',
    ],
    timer: 170,
    steps: [
      { text: 'Drive to The Sandbar and pick up Lena.', kind: 'reach', place: 'beachBar', radius: 90 },
      { text: 'Drive Lena to the Marina.', kind: 'reach', place: 'marina', radius: 90 },
    ],
  },
  {
    id: 'packages',
    title: '3 — PACKAGE RUN',
    giver: 'LENA',
    intro: [
      'Rico\'s got product moving and no driver he trusts. That\'s you, apparently.',
      'Three packages, three corners of the island. You have three minutes. Don\'t get cute with the cops.',
    ],
    timer: 180,
    steps: [
      { text: 'Collect the package at the Ferry Terminal.', kind: 'collect', place: 'ferry', radius: 70 },
      { text: 'Collect the package at Dockside.', kind: 'collect', place: 'docks', radius: 70 },
      { text: 'Collect the package at the Hideout.', kind: 'collect', place: 'hideout', radius: 70 },
    ],
  },
  {
    id: 'heat',
    title: '4 — HEAT',
    giver: 'RICO',
    intro: [
      'The PD has a new captain and he wants a headline. So give him one — then vanish.',
      'Get to three stars, then lose them. When the heat is off, meet me at the hideout.',
    ],
    steps: [
      { text: 'Raise your wanted level to 3 stars. Steal cars, cause chaos.', kind: 'wanted', stars: 3 },
      { text: 'Lose the cops — get back to 0 stars.', kind: 'lose-wanted' },
      { text: 'Reach the Hideout.', kind: 'reach', place: 'hideout', radius: 90 },
    ],
  },
  {
    id: 'shakedown',
    title: '5 — SHAKEDOWN',
    giver: 'LENA',
    intro: [
      'The Dock Rats have been skimming Rico\'s crates. Four of them, down at Dockside.',
      'Go sort it out. On foot, up close. Bring back what they owe us.',
    ],
    steps: [
      { text: 'Go to Dockside.', kind: 'reach', place: 'docks', radius: 90 },
      { text: 'Deal with the 4 Dock Rats.', kind: 'defeat-thugs', count: 4 },
      { text: 'Collect the cash bag.', kind: 'collect-cash' },
    ],
  },
  {
    id: 'bigone',
    title: '6 — THE BIG ONE',
    giver: 'RICO',
    intro: [
      'Palm Key Trust moves its cash at noon and the vault door sticks. One job, Jax. The whole island will know your name.',
      'Hit the bank, grab the loot, and lose a four-star tail at the hideout. Then we\'re legends.',
    ],
    steps: [
      { text: 'Reach Palm Key Trust bank.', kind: 'reach', place: 'bank', radius: 90 },
      { text: 'Grab the loot — stay inside the bank doors.', kind: 'hold', place: 'bank', radius: 70, hold: 4 },
      { text: 'Escape the heat — reach the Hideout with the loot.', kind: 'reach', place: 'hideout', radius: 90 },
    ],
  },
];

export function createMissions() {
  return {
    index: 0,
    step: 0,
    timer: 0,
    active: false,
    done: false,
    thugsLeft: 0,
    holdTimer: 0,
    cashSpawned: false,
    startedAt: 0,
  };
}

export function startMission(m, state, events) {
  const def = MISSIONS[m.index];
  if (!def) { m.done = true; return; }
  m.step = 0;
  m.active = true;
  m.timer = def.timer || 0;
  m.thugsLeft = 0;
  m.holdTimer = 0;
  m.cashSpawned = false;
  events.push({ type: 'dialog', who: def.giver, lines: def.intro });
  events.push({ type: 'mission-start', title: def.title });
  setupStep(m, state, events);
}

function setupStep(m, state, events) {
  const def = MISSIONS[m.index];
  const step = def.steps[m.step];
  if (!step) return;
  if (step.kind === 'collect') {
    const p = PLACES[step.place];
    addPickup(state, 'cash', p.x, p.y, 0);
    // mark it as a package by kind
    const pk = state.pickups[state.pickups.length - 1];
    pk.kind = 'package';
  }
  if (step.kind === 'defeat-thugs') {
    const d = PLACES.docks;
    for (let i = 0; i < step.count; i++) {
      spawnThug(state, d.x + (i % 2) * 90 - 45, d.y + Math.floor(i / 2) * 80 - 40);
    }
    m.thugsLeft = step.count;
  }
  if (step.kind === 'hold') {
    m.holdTimer = 0;
  }
}

export function objectiveText(m) {
  if (m.done) return 'Story complete — Palm Key is yours. Free roam!';
  if (!m.active) return 'Talk to Rico — press ENTER when the phone rings.';
  const def = MISSIONS[m.index];
  const step = def.steps[m.step];
  let text = def.title + ' — ' + step.text;
  if (m.timer > 0) text += `  [${Math.ceil(m.timer)}s]`;
  if (step.kind === 'defeat-thugs') text += `  (${m.thugsLeft} left)`;
  if (step.kind === 'hold') text += `  (${Math.max(0, step.hold - m.holdTimer).toFixed(0)}s)`;
  return text;
}

export function missionTarget(m) {
  if (m.done || !m.active) return null;
  const def = MISSIONS[m.index];
  const step = def.steps[m.step];
  if (step.place) {
    const p = PLACES[step.place];
    return { x: p.x, y: p.y, label: p.name };
  }
  if (step.kind === 'defeat-thugs' || step.kind === 'collect-cash') {
    return { x: PLACES.docks.x, y: PLACES.docks.y, label: 'Dockside' };
  }
  return null;
}

function advanceStep(m, state, events) {
  const def = MISSIONS[m.index];
  m.step++;
  if (m.step >= def.steps.length) {
    completeMission(m, state, events);
  } else {
    setupStep(m, state, events);
  }
}

function completeMission(m, state, events) {
  const def = MISSIONS[m.index];
  const reward = ECONOMY.missionRewards[m.index] || 500;
  state.player.cash += reward;
  state.stats.cashEarned += reward;
  state.stats.missions++;
  events.push({ type: 'mission-complete', title: def.title, reward });
  m.index++;
  m.active = false;
  if (m.index >= MISSIONS.length) {
    m.done = true;
    events.push({ type: 'story-complete' });
  }
}

function failMission(m, state, events, reason) {
  events.push({ type: 'mission-failed', reason });
  // restart the same mission cleanly
  state.wanted = 0;
  state.cars = state.cars.filter((c) => c.kind !== 'police');
  state.peds = state.peds.filter((pd) => pd.kind !== 'thug' && pd.kind !== 'cop');
  startMission(m, state, events);
}

export function updateMissions(m, state, dt, events) {
  if (m.done || !m.active) return;
  const def = MISSIONS[m.index];
  const step = def.steps[m.step];
  const p = state.player;

  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(m, state, events, 'Out of time on ' + def.title);
      return;
    }
  }

  const atPlace = (place, radius) => {
    const q = PLACES[place];
    return Math.hypot(p.x - q.x, p.y - q.y) < radius;
  };

  switch (step.kind) {
    case 'enter-car':
      if (p.inCar) advanceStep(m, state, events);
      break;
    case 'reach':
      if (atPlace(step.place, step.radius)) advanceStep(m, state, events);
      break;
    case 'collect': {
      const q = PLACES[step.place];
      // package pickup is collected by touch (entities handles cash kind;
      // packages are picked up here)
      for (const pk of state.pickups) {
        if (pk.kind === 'package' && Math.hypot(p.x - pk.x, p.y - pk.y) < 46) {
          pk.taken = true;
          events.push({ type: 'package', n: m.step + 1 });
          advanceStep(m, state, events);
          break;
        }
      }
      state.pickups = state.pickups.filter((pk) => !pk.taken);
      break;
    }
    case 'wanted':
      if (state.wanted >= step.stars) advanceStep(m, state, events);
      break;
    case 'lose-wanted':
      if (state.wanted === 0) advanceStep(m, state, events);
      break;
    case 'defeat-thugs':
      // thug-down events decrement in main via noteThugDown
      if (m.thugsLeft <= 0) advanceStep(m, state, events);
      break;
    case 'collect-cash': {
      if (!m.cashSpawned) {
        m.cashSpawned = true;
        addPickup(state, 'cash', PLACES.docks.x + 60, PLACES.docks.y, 500);
      }
      const bag = state.pickups.find((pk) => pk.kind === 'cash' && pk.amount === 500);
      if (!bag) advanceStep(m, state, events);
      break;
    }
    case 'hold':
      if (atPlace(step.place, step.radius)) {
        m.holdTimer += dt;
        if (m.holdTimer >= step.hold) {
          addWanted(state, 4, events);
          events.push({ type: 'alarm', text: 'ALARM! The whole island is coming for you!' });
          advanceStep(m, state, events);
        }
      } else {
        m.holdTimer = Math.max(0, m.holdTimer - dt * 2);
      }
      break;
    default:
      break;
  }
}

export function noteThugDown(m, state) {
  if (m.active && MISSIONS[m.index] && MISSIONS[m.index].steps[m.step].kind === 'defeat-thugs') {
    m.thugsLeft = Math.max(0, m.thugsLeft - 1);
  }
}
