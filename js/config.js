// ---------------------------------------------------------------------------
// LAST STAND — balance & content configuration
// All distances are in CSS pixels inside the 9:16 game viewport.
// ---------------------------------------------------------------------------

export const CONFIG = {
  maxWaves: 10,
  startingCoins: 210,
  baseHp: 20,
  laneWidth: 56,
  firstPrep: 3.5,
  betweenPrep: 4.5,
  victoryReward: 300,
  buildGrid: 44,
};

export const TOWERS = {
  machine: {
    key: 'machine',
    name: 'Machine Gun',
    tagline: 'Rapid fire',
    blurb: 'Shreds light enemies with a steady stream of bullets.',
    cost: 60,
    color: '#8ee05d',
    dark: '#2f7d3a',
    light: '#c6ff9a',
    range: 112,
    damage: 6.5,
    rate: 7.2,
    projectileSpeed: 660,
    projectile: 'bullet',
    pierce: 0,
    splash: 0,
    upgrades: [55, 90],
  },
  sniper: {
    key: 'sniper',
    name: 'Sniper',
    tagline: 'Long range',
    blurb: 'Extreme range and huge damage. Punches through armour.',
    cost: 115,
    color: '#63b8ff',
    dark: '#1d4f8a',
    light: '#bfe6ff',
    range: 245,
    damage: 46,
    rate: 0.72,
    projectileSpeed: 1500,
    projectile: 'tracer',
    pierce: 0.75,
    splash: 0,
    upgrades: [95, 155],
  },
  cannon: {
    key: 'cannon',
    name: 'Cannon',
    tagline: 'Splash damage',
    blurb: 'Lobs shells that explode, blasting whole groups.',
    cost: 100,
    color: '#ffa94d',
    dark: '#8c4816',
    light: '#ffd9a3',
    range: 158,
    damage: 26,
    rate: 1.05,
    projectileSpeed: 290,
    projectile: 'shell',
    pierce: 0.45,
    splash: 52,
    upgrades: [85, 140],
  },
  ice: {
    key: 'ice',
    name: 'Ice Tower',
    tagline: 'Slows enemies',
    blurb: 'Frost shards chill enemies, leaving them easy targets.',
    cost: 85,
    color: '#62e8e8',
    dark: '#146b80',
    light: '#d2ffff',
    range: 126,
    damage: 5,
    rate: 1.5,
    projectileSpeed: 430,
    projectile: 'ice',
    pierce: 0,
    splash: 0,
    slow: 0.45,
    slowDuration: 2.2,
    upgrades: [70, 115],
  },
};

export const TOWER_ORDER = ['machine', 'sniper', 'cannon', 'ice'];

export const ENEMIES = {
  basic: {
    key: 'basic',
    name: 'Grunt',
    hp: 60,
    speed: 60,
    reward: 7,
    damage: 1,
    radius: 13,
    armor: 0,
    scale: 1,
    color: '#ff5b5b',
    dark: '#8f2029',
    light: '#ff9d8a',
  },
  fast: {
    key: 'fast',
    name: 'Runner',
    hp: 40,
    speed: 100,
    reward: 8,
    damage: 1,
    radius: 11,
    armor: 0,
    scale: 0.92,
    color: '#ffd23f',
    dark: '#98610b',
    light: '#fff2a1',
  },
  armored: {
    key: 'armored',
    name: 'Juggernaut',
    hp: 195,
    speed: 45,
    reward: 16,
    damage: 2,
    radius: 15,
    armor: 4,
    scale: 1.05,
    color: '#a98bff',
    dark: '#4b3391',
    light: '#ded0ff',
  },
  boss: {
    key: 'boss',
    name: 'Warlord',
    hp: 1500,
    speed: 31,
    reward: 130,
    damage: 6,
    radius: 25,
    armor: 8,
    scale: 1.35,
    color: '#ff3d6e',
    dark: '#5c0b28',
    light: '#ff9bb4',
    slowResist: 0.62,
  },
};

// Counts are interleaved basic → fast → armored → boss to make each wave
// feel like a mixed assault instead of four separate queues.
export const WAVES = [
  { basic: 6 },
  { basic: 9, fast: 3 },
  { fast: 11, basic: 5 },
  { armored: 4, basic: 9, fast: 3 },
  { fast: 12, armored: 6 },
  { basic: 14, fast: 10, armored: 5 },
  { armored: 10, fast: 12 },
  { boss: 1, basic: 12, fast: 6 },
  { armored: 12, fast: 16 },
  { boss: 2, armored: 12, fast: 14 },
];

export const SPAWN_GAP = {
  basic: 0.68,
  fast: 0.46,
  armored: 0.86,
  boss: 1.7,
};

export function waveHpMultiplier(wave) {
  return 1 + 0.115 * (wave - 1) + 0.004 * (wave - 1) ** 2;
}

export function waveSpeedMultiplier(wave) {
  return 1 + 0.012 * (wave - 1);
}
