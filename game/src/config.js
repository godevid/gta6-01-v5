// Palm Key Heat — tuning, palette and shared constants.
// Everything here is a plain value: the world, the cars, the cops and the
// economy all read from this one file so a balance pass touches one place.

export const WORLD = {
  size: 3400,            // island is size x size pixels
  roadGap: 420,          // distance between road centre lines
  roadWidth: 92,
  sidewalk: 16,
  blockInset: 70,        // buildings sit this far inside a block
};

export const COLORS = {
  grass: '#3f8f4f',
  grassDark: '#357a44',
  sand: '#e8d29a',
  water: '#1d6fb8',
  waterDeep: '#155a96',
  road: '#33373d',
  roadLine: '#e8d44d',
  sidewalk: '#9aa0a3',
  curb: '#6e7377',
  roofA: '#c96f4a',
  roofB: '#4a7fb5',
  roofC: '#7a5fa0',
  roofD: '#b5a44a',
  roofE: '#4ab5a0',
  park: '#2f7a3a',
  plaza: '#8f8578',
};

export const PLAYER = {
  walkSpeed: 175,
  runSpeed: 285,
  radius: 13,
  maxHealth: 100,
  punchDamage: 34,
  punchRange: 42,
  punchCooldown: 0.38,
};

export const CAR = {
  // arcade handling, tuned so a sedan feels weighty and a coupe feels loose
  accel: 520,
  brake: 900,
  reverseAccel: 300,
  maxSpeed: 620,
  maxReverse: 190,
  steerRate: 2.5,
  grip: 3.4,
  drag: 0.55,
  handbrakeGrip: 1.1,
  length: 54,
  width: 26,
};

export const CAR_TYPES = [
  { name: 'Sedan',   color: '#c23b3b', top: 560, accel: 500, price: 0 },
  { name: 'Coupe',   color: '#3b7ec2', top: 660, accel: 560, price: 0 },
  { name: 'Taxi',    color: '#e8c832', top: 540, accel: 480, price: 0 },
  { name: 'Pickup',  color: '#7a4a2b', top: 500, accel: 470, price: 0 },
  { name: 'Van',     color: '#8a8f94', top: 460, accel: 420, price: 0 },
  { name: 'Sport',   color: '#e86ec2', top: 720, accel: 640, price: 0 },
  { name: 'Beater',  color: '#5d7a52', top: 430, accel: 400, price: 0 },
];

export const WANTED = {
  decayDelay: 9,       // seconds unseen before stars start falling
  decayStep: 6,        // seconds per star lost while hidden
  maxStars: 5,
  copCarSpeed: 560,
  copFootSpeed: 205,
  bustTime: 1.4,       // seconds a cop must touch you on foot to bust you
};

export const ECONOMY = {
  startCash: 50,
  sprayCost: 80,       // Pay N Spray: full repair + clears wanted
  pistolCost: 250,
  ammoCost: 60,        // per 24 rounds
  hospitalFee: 120,
  bustFine: 150,
  missionRewards: [300, 450, 600, 800, 1000, 2500],
};

export const DAY = {
  length: 300,         // one full in-game day, in real seconds
  startHour: 9.5,      // game opens mid-morning
};

export const SAVE_KEY = 'palm-key-heat-save-v1';
