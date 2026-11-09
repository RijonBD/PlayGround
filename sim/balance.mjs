// Headless balance harness: plays several plausible strategies and reports
// how far each one gets. Run with `node sim/balance.mjs`.
import { Game } from '../js/game.js';
import { TOWERS, CONFIG } from '../js/config.js';

const DT = 1 / 60;

function slotCoverage(game, slot, range) {
  let n = 0;
  for (let i = 0; i < game.path.length; i += 2) {
    const p = game.path[i];
    if (Math.hypot(p.x - slot.x, p.y - slot.y) <= range) n++;
  }
  return n;
}

function bestSlot(game, key) {
  const range = TOWERS[key].range;
  let best = null;
  let bestScore = -1;
  for (const slot of game.slots) {
    if (game.towerAt(slot.x, slot.y, 30)) continue;
    let score = slotCoverage(game, slot, range);
    // Prefer the part of the lane closer to the base a little.
    score += (slot.y / game.height) * 8;
    if (score > bestScore) {
      bestScore = score;
      best = slot;
    }
  }
  return best;
}

function run({ buildOrder, upgradeBefore = 0, name }) {
  const game = new Game({ width: 390, height: 844 });
  let waveLog = [];
  let lastWave = 0;
  let t = 0;
  let decide = 0;
  let lastHp = game.baseHp;
  let orderIndex = 0;

  while (game.status === 'running' && t < 900) {
    game.update(DT);
    t += DT;
    if (game.wave !== lastWave) {
      if (lastWave) waveLog.push({ wave: lastWave, hp: game.baseHp, towers: game.towers.length, coins: game.coins });
      lastWave = game.wave;
    }
    if (game.baseHp !== lastHp) lastHp = game.baseHp;

    decide += DT;
    if (decide < 0.35) continue;
    decide = 0;

    if (game.phase === 'prep' || game.phase === 'spawning' || game.phase === 'clearing') {
      // Build planned towers first, then upgrade.
      while (orderIndex < buildOrder.length) {
        const key = buildOrder[orderIndex];
        if (game.coins < TOWERS[key].cost) break;
        const slot = bestSlot(game, key);
        if (!slot) {
          orderIndex++;
          continue;
        }
        const r = game.buildTower(key, slot.x, slot.y);
        if (r.ok) orderIndex++;
        else break;
      }
      if (game.towers.length >= upgradeBefore || orderIndex >= buildOrder.length) {
        // Upgrade the cheapest available option, favoring low levels.
        const options = game.towers
          .filter((tw) => !tw.maxed && game.coins >= tw.upgradeCost)
          .sort((a, b) => a.upgradeCost - b.upgradeCost);
        if (options.length) game.upgradeTower(options[0].id);
      }
    }
  }

  waveLog.push({ wave: game.wave, hp: game.baseHp, towers: game.towers.length, coins: game.coins, kills: game.totalKills });
  return { name, status: game.status, wave: game.wave, hp: game.baseHp, towers: game.towers.length, kills: game.totalKills, log: waveLog, time: t, orderUsed: orderIndex };
}

const strategies = [
  { name: 'balanced rush', buildOrder: ['machine', 'ice', 'machine', 'cannon', 'sniper', 'cannon', 'machine'], upgradeBefore: 3 },
  { name: 'long game', buildOrder: ['machine', 'sniper', 'ice', 'cannon', 'machine', 'cannon', 'machine', 'sniper'], upgradeBefore: 5 },
  { name: 'upgrade first', buildOrder: ['machine', 'machine', 'ice', 'cannon'], upgradeBefore: 2 },
  { name: 'mg spam', buildOrder: Array(8).fill('machine'), upgradeBefore: 4 },
  { name: 'sniper carry', buildOrder: ['sniper', 'sniper', 'ice', 'machine', 'cannon', 'sniper'], upgradeBefore: 3 },
];

for (const s of strategies) {
  const r = run(s);
  console.log(`\n=== ${r.name}: ${r.status.toUpperCase()} at wave ${r.wave} | hp ${r.hp} | kills ${r.kills} | towers ${r.towers} | ${r.time.toFixed(0)}s`);
  console.log(r.log.map((w) => `w${w.wave} hp=${w.hp} towers=${w.towers} $=${w.coins}`).join(' | '));
}
