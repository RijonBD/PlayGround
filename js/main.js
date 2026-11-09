import { Game } from './game.js';
import { TOWERS, TOWER_ORDER, ENEMIES, CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const shell = $('gameShell');
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
const game = new Game();
const dpr = () => Math.min(2, window.devicePixelRatio || 1);
let selectedBuild = null;
let paused = false;
let speedIndex = 0;
const speeds = [1, 1.5, 2];
let lastTime = performance.now();
let toastTimer = 0;
let bannerTimer = 0;
let shake = 0;
const particles = [];
const floating = [];

const towerIcons = { machine: '✣', sniper: '⌖', cannon: '✹', ice: '❄' };
const enemyIcons = { basic: '●', fast: '◆', armored: '⬟', boss: '♟' };

function resize() {
  const rect = shell.getBoundingClientRect();
  const ratio = dpr();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  game.resize(rect.width, rect.height);
  draw();
}
window.addEventListener('resize', resize);

function buildTowerCards() {
  const list = $('towerList');
  list.innerHTML = '';
  for (const key of TOWER_ORDER) {
    const def = TOWERS[key];
    const button = document.createElement('button');
    button.className = 'tower-card';
    button.dataset.key = key;
    button.innerHTML = `<span class="tower-art" style="background:${def.color}22;color:${def.color}">${towerIcons[key]}</span><span class="tower-name">${def.name}</span><span class="tower-cost">◆ ${def.cost}</span>`;
    button.addEventListener('click', () => {
      if (game.coins < def.cost) return showToast('Not enough coins for that unit');
      selectedBuild = selectedBuild === key ? null : key;
      game.selectedTowerId = null;
      updatePanels();
      if (selectedBuild) showToast(`Tap an empty pad to place ${def.name}`);
    });
    list.append(button);
  }
}

function showToast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  toastTimer = 2.1;
}

function updatePanels() {
  $('towerPanel').classList.toggle('hidden', Boolean(game.selectedTower));
  $('selectedPanel').classList.toggle('hidden', !game.selectedTower);
  document.querySelectorAll('.tower-card').forEach((el) => {
    const key = el.dataset.key;
    el.classList.toggle('selected', selectedBuild === key);
    el.classList.toggle('disabled', game.coins < TOWERS[key].cost);
  });
  const tower = game.selectedTower;
  if (tower) {
    const def = tower.def;
    const next = tower.upgradeCost;
    $('selectedContent').innerHTML = `<div class="unit-head"><span class="unit-icon" style="background:${def.color}25;color:${def.color}">${towerIcons[tower.key]}</span><div><h2>${def.name}</h2><p>${def.tagline} · ${tower.kills} eliminations</p></div><span class="unit-level">LVL ${tower.level} / 3</span></div><div class="unit-stats"><div class="unit-stat"><small>DAMAGE</small><b>${Math.round(tower.damage)}</b></div><div class="unit-stat"><small>RANGE</small><b>${Math.round(tower.range)}</b></div><div class="unit-stat"><small>FIRE RATE</small><b>${tower.rate.toFixed(1)} /s</b></div></div><div class="unit-actions"><button class="upgrade-btn" id="upgradeBtn" ${next == null || game.coins < next ? 'disabled' : ''}>${next == null ? 'MAX LEVEL' : `UPGRADE · ◆ ${next}`}</button><button class="sell-btn" id="sellBtn">SELL · ◆ ${tower.sellValue}</button></div>`;
    $('upgradeBtn').addEventListener('click', () => {
      const result = game.upgradeTower(tower.id);
      if (!result.ok) showToast(result.error);
      else showToast(`${def.name} upgraded to level ${tower.level}`);
      updatePanels();
    });
    $('sellBtn').addEventListener('click', () => {
      game.sellTower(tower.id);
      selectedBuild = null;
      updatePanels();
      showToast('Unit sold');
    });
  }
  $('waveBtn').innerHTML = game.phase === 'prep' ? '<span>START WAVE</span><b>↗</b>' : '<span>WAVE IN PROGRESS</span><b>•</b>';
  $('waveBtn').disabled = game.phase !== 'prep';
  $('waveBtn').style.opacity = game.phase === 'prep' ? '1' : '.55';
  $('bottomStatus').textContent = game.phase === 'prep' ? 'DEFENSE GRID ONLINE' : game.phase === 'spawning' ? 'HOSTILE WAVE INBOUND' : game.phase === 'clearing' ? 'ENGAGING HOSTILES' : 'FRONTLINE SECURE';
}

$('closeSelection').addEventListener('click', () => { game.selectedTowerId = null; updatePanels(); });
$('waveBtn').addEventListener('click', () => {
  if (game.phase === 'prep') game.phaseTimer = 0;
});
$('pauseBtn').addEventListener('click', () => {
  if (game.status !== 'running') return;
  paused = !paused;
  $('pauseIcon').textContent = paused ? '▶' : 'Ⅱ';
  $('pauseBtn').setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
  showToast(paused ? 'Game paused' : 'Back to the battle');
});
$('speedBtn').addEventListener('click', () => {
  speedIndex = (speedIndex + 1) % speeds.length;
  $('speedBtn').textContent = `${speeds[speedIndex]}×`;
});
$('restartBtn').addEventListener('click', () => {
  game.reset(); paused = false; speedIndex = 0; selectedBuild = null;
  $('modal').classList.add('hidden'); $('pauseIcon').textContent = 'Ⅱ'; $('speedBtn').textContent = '1×';
  updatePanels(); showToast('Defenses reset. Good luck, commander.');
});

canvas.addEventListener('pointerdown', (event) => {
  if (game.status !== 'running') return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const tower = game.towerAt(x, y, 31);
  if (tower) {
    selectedBuild = null;
    game.selectedTowerId = tower.id;
    updatePanels();
    return;
  }
  if (selectedBuild) {
    const result = game.buildTower(selectedBuild, x, y);
    if (result.ok) {
      selectedBuild = null;
      updatePanels();
      showToast(`${result.tower.def.name} deployed`);
    } else showToast(result.error === 'Needs a clear spot' ? 'Choose a highlighted build pad' : result.error);
    return;
  }
  if (game.selectedTower) {
    game.selectedTowerId = null;
    updatePanels();
  }
});

function addBurst(x, y, color, count = 10, force = 1) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = (18 + Math.random() * 85) * force;
    particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .35 + Math.random() * .45, max: .8, size: 1.5 + Math.random() * 3, color });
  }
}
function processEvents() {
  for (const e of game.drainEvents()) {
    if (e.type === 'waveStart') {
      $('bannerTitle').textContent = `WAVE ${String(e.wave).padStart(2, '0')}`;
      $('bannerSub').textContent = 'HOSTILES APPROACHING';
      $('waveBanner').classList.add('show'); bannerTimer = 1.7;
    } else if (e.type === 'kill') {
      const color = ENEMIES[e.enemy].color;
      addBurst(e.x, e.y, color, e.boss ? 22 : 9, e.boss ? 1.6 : 1);
      floating.push({ x: e.x, y: e.y - 15, text: `+${e.reward}`, color: '#ffe18a', life: .8 });
      if (e.boss) shake = .35;
    } else if (e.type === 'explosion') {
      addBurst(e.x, e.y, '#ffb858', 18, 1.4); shake = Math.max(shake, .16);
    } else if (e.type === 'impact') {
      addBurst(e.x, e.y, e.kind === 'ice' ? '#a5ffff' : '#ffe08a', e.kind === 'tracer' ? 3 : 5, .45);
    } else if (e.type === 'baseHit') {
      addBurst(e.x, e.y, '#ff5966', 15, 1.2); shake = .28; showToast(`Base hit! −${e.amount} integrity`);
    } else if (e.type === 'waveClear') {
      floating.push({ x: game.width / 2, y: 205, text: `WAVE CLEAR  +${e.bonus} ◆`, color: '#ffe18a', life: 1.5 });
    } else if (e.type === 'victory' || e.type === 'defeat') {
      showEndScreen(e.type === 'victory');
    }
  }
}
function showEndScreen(victory) {
  $('modalEmblem').textContent = victory ? '★' : '✕';
  $('modalKicker').textContent = victory ? 'MISSION COMPLETE' : 'FRONTLINE FALLEN';
  $('modalTitle').textContent = victory ? 'VICTORY' : 'DEFEAT';
  $('modalTitle').style.color = victory ? '#ffe09a' : '#ff858b';
  $('modalCopy').textContent = victory ? 'You held the line. The frontier is safe—for now.' : 'The defenses were overrun. Rebuild and hold the line.';
  $('resultStats').innerHTML = `<div class="result-stat"><b>${game.totalKills}</b><small>HOSTILES DOWN</small></div><div class="result-stat"><b>${game.wave} / 10</b><small>WAVES HELD</small></div><div class="result-stat"><b>${game.baseHp}</b><small>BASE HP LEFT</small></div>`;
  $('modal').classList.remove('hidden');
}

function draw() {
  const w = game.width, h = game.height;
  ctx.clearRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#263a4b'); sky.addColorStop(.42, '#40534b'); sky.addColorStop(1, '#283d35');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  drawTerrain(w, h);
  drawPath();
  drawSlots();
  drawBase();
  for (const t of game.towers) drawTower(t);
  for (const p of game.projectiles) drawProjectile(p);
  for (const e of game.enemies) drawEnemy(e);
  drawEffects();
  if (game.baseFlash > 0) { ctx.fillStyle = `rgba(255,60,74,${game.baseFlash * .12})`; ctx.fillRect(0, 0, w, h); }
  updateHud();
}

function drawTerrain(w, h) {
  ctx.save();
  const top = game.fieldTop, bottom = game.fieldBottom;
  ctx.fillStyle = 'rgba(25,41,38,.22)'; ctx.fillRect(0, top, w, bottom - top);
  // soft terrain bands
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    const y = top + (bottom - top) * (i + .5) / 7;
    ctx.ellipse(w * ((i % 2) ? .22 : .78), y, w * .48, 36 + i * 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? 'rgba(138,162,112,.055)' : 'rgba(10,25,28,.07)'; ctx.fill();
  }
  // small scrub and stones in deterministic scatter
  for (let i = 0; i < 42; i++) {
    const x = ((i * 97 + 31) % 997) / 997 * w;
    const y = top + ((i * 163 + 71) % 991) / 991 * (bottom - top);
    if (game._pathDistance(x, y) < game.laneHalf + 18) continue;
    const r = 2 + (i % 4) * .8;
    if (i % 3 === 0) {
      ctx.fillStyle = '#172d2c66'; ctx.beginPath(); ctx.ellipse(x, y + 3, r * 2, r * .8, .2, 0, 7); ctx.fill();
      ctx.fillStyle = i % 2 ? '#82936a' : '#9a9866'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = i % 2 ? '#b0a27744' : '#b5c1b33c'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r * .7, .3, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

function tracePath() {
  ctx.beginPath();
  game.path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
}
function drawPath() {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  tracePath(); ctx.strokeStyle = '#101a23a8'; ctx.lineWidth = CONFIG.laneWidth + 13; ctx.stroke();
  tracePath(); ctx.strokeStyle = '#665b49'; ctx.lineWidth = CONFIG.laneWidth + 1; ctx.stroke();
  tracePath(); ctx.strokeStyle = '#a08a69'; ctx.lineWidth = CONFIG.laneWidth - 8; ctx.stroke();
  tracePath(); ctx.strokeStyle = '#b6a17d'; ctx.lineWidth = CONFIG.laneWidth - 19; ctx.stroke();
  tracePath(); ctx.setLineDash([3, 12]); ctx.strokeStyle = '#e3ce9c62'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  // scattered road marks
  for (let d = 35; d < game.pathLength; d += 57) {
    const p = game.pathPointAt(d);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    ctx.fillStyle = '#6e624d4d'; ctx.fillRect(-6, -12, 13, 3); ctx.restore();
  }
  ctx.restore();
}

function drawSlots() {
  if (!selectedBuild) return;
  ctx.save();
  for (const slot of game.slots) {
    if (game.towerAt(slot.x, slot.y, 30)) continue;
    ctx.beginPath(); ctx.arc(slot.x, slot.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#7ce5b52b'; ctx.fill(); ctx.strokeStyle = '#94f3c7c9'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(slot.x - 4, slot.y); ctx.lineTo(slot.x + 4, slot.y); ctx.moveTo(slot.x, slot.y - 4); ctx.lineTo(slot.x, slot.y + 4);
    ctx.strokeStyle = '#d7ffe6'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();
}

function drawBase() {
  const { x, y } = game.base;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#09121c66'; ctx.beginPath(); ctx.ellipse(0, 13, 37, 19, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#344a55'; roundRect(-28, -19, 56, 38, 7); ctx.fill();
  ctx.fillStyle = '#58716f'; roundRect(-23, -25, 46, 37, 6); ctx.fill();
  ctx.fillStyle = '#243944'; roundRect(-14, -30, 28, 22, 4); ctx.fill();
  ctx.fillStyle = '#f6c95d'; roundRect(-4, -37, 8, 24, 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(4, -36); ctx.lineTo(23, -30); ctx.lineTo(4, -24); ctx.closePath(); ctx.fillStyle = '#f16e61'; ctx.fill();
  ctx.fillStyle = '#d9eee0'; ctx.font = '800 8px "DM Sans"'; ctx.textAlign = 'center'; ctx.fillText('BASE', 0, 25);
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

function drawTower(t) {
  const def = t.def;
  const selected = game.selectedTowerId === t.id;
  ctx.save();
  if (selected) {
    ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
    ctx.fillStyle = `${def.color}0c`; ctx.fill(); ctx.strokeStyle = `${def.color}66`; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.translate(t.x, t.y);
  ctx.fillStyle = '#0b152088'; ctx.beginPath(); ctx.ellipse(0, 8, 19, 12, 0, 0, 7); ctx.fill();
  ctx.fillStyle = def.dark; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = def.color; ctx.beginPath(); ctx.arc(0, -2, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = def.light; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, -2, 10, .2, 2.8); ctx.stroke();
  if (t.key === 'machine') {
    ctx.save(); ctx.rotate(t.angle); ctx.fillStyle = '#d7e4c4'; roundRect(0, -7, 18, 5, 2); ctx.fill(); ctx.fillStyle = '#536c50'; roundRect(7, -8, 13, 3, 1); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#f2ffe1'; ctx.beginPath(); ctx.arc(-2, -3, 3.3, 0, 7); ctx.fill();
  } else if (t.key === 'sniper') {
    ctx.save(); ctx.rotate(t.angle); ctx.fillStyle = '#d4e7ec'; roundRect(-1, -3, 25, 4, 2); ctx.fill(); ctx.fillStyle = '#78c6f4'; roundRect(4, -5, 8, 3, 1); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#e5f6ff'; ctx.beginPath(); ctx.arc(-2, -3, 3, 0, 7); ctx.fill();
  } else if (t.key === 'cannon') {
    ctx.save(); ctx.rotate(t.angle); ctx.fillStyle = '#e4b979'; roundRect(-2, -7, 23, 14, 4); ctx.fill(); ctx.fillStyle = '#533c2a'; ctx.beginPath(); ctx.arc(18, 0, 4.5, 0, 7); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#ffe0a2'; ctx.beginPath(); ctx.arc(-3, -3, 3.2, 0, 7); ctx.fill();
  } else {
    ctx.save(); ctx.rotate(t.spin); ctx.strokeStyle = '#e2ffff'; ctx.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -15); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -15, 2.5, 0, 7); ctx.fillStyle = '#c9ffff'; ctx.fill(); }
    ctx.restore(); ctx.fillStyle = '#e7ffff'; ctx.beginPath(); ctx.arc(0, -2, 4, 0, 7); ctx.fill();
  }
  if (t.flash > .3) { ctx.globalAlpha = t.flash * .8; ctx.fillStyle = '#fff1bb'; ctx.beginPath(); ctx.arc(Math.cos(t.angle) * 17, -2 + Math.sin(t.angle) * 17, 5 + t.flash * 4, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#152332'; roundRect(-10, 12, 20, 10, 3); ctx.fill();
  ctx.fillStyle = def.light; ctx.font = '800 8px "DM Sans"'; ctx.textAlign = 'center'; ctx.fillText(String(t.level), 0, 20);
  if (selected) { ctx.strokeStyle = '#fff1b7'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -2, 18, 0, 7); ctx.stroke(); }
  ctx.restore();
}

function drawEnemy(e) {
  const def = e.def;
  const r = e.radius;
  const bob = Math.sin(e.wobble * 7 + e.bob) * 1.5;
  ctx.save(); ctx.translate(e.x, e.y + bob); ctx.rotate(e.angle);
  ctx.fillStyle = '#07121b66'; ctx.beginPath(); ctx.ellipse(0, r * .8, r * 1.05, r * .48, 0, 0, 7); ctx.fill();
  if (e.key === 'boss') {
    ctx.fillStyle = '#451827'; ctx.beginPath(); ctx.moveTo(-r * .7, -r * .5); ctx.lineTo(-r * .55, -r * 1.2); ctx.lineTo(-r * .15, -r * .82); ctx.lineTo(r * .2, -r * 1.3); ctx.lineTo(r * .65, -r * .45); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = e.hitFlash ? '#fff' : def.dark;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.03, r * .83, 0, 0, 7); ctx.fill();
  ctx.fillStyle = e.hitFlash ? '#fff' : def.color;
  ctx.beginPath(); ctx.ellipse(0, -1, r * .79, r * .68, 0, 0, 7); ctx.fill();
  ctx.fillStyle = def.light; ctx.beginPath(); ctx.ellipse(r * .22, -r * .1, r * .38, r * .22, -.2, 0, 7); ctx.fill();
  // facing eye and small directional spikes
  ctx.fillStyle = '#17202a'; ctx.beginPath(); ctx.arc(r * .45, -r * .2, Math.max(1.5, r * .12), 0, 7); ctx.fill();
  if (e.key === 'fast') { ctx.fillStyle = '#ffe6a1'; ctx.beginPath(); ctx.moveTo(-r * .2, -r * .7); ctx.lineTo(-r * .85, -r * 1.05); ctx.lineTo(-r * .55, -.15); ctx.fill(); }
  if (e.key === 'armored' || e.key === 'boss') {
    ctx.fillStyle = '#d1d0dd'; ctx.strokeStyle = '#66647c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(-r * .08, -r * .15, r * .63, r * .48, -.12, Math.PI, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * .55, -r * .15); ctx.lineTo(r * .5, -r * .15); ctx.stroke();
  }
  ctx.restore();
  // health bar
  const barW = e.key === 'boss' ? 42 : r * 2.25;
  const barY = e.y - r - 9;
  ctx.fillStyle = '#111b25d9'; roundRect(e.x - barW / 2, barY, barW, 4, 2); ctx.fill();
  ctx.fillStyle = e.hp / e.maxHp < .3 ? '#ff6570' : '#80e7a4'; roundRect(e.x - barW / 2, barY, barW * Math.max(0, e.hp / e.maxHp), 4, 2); ctx.fill();
  if (e.slowed) { ctx.strokeStyle = '#9bffffaa'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(e.x, e.y, r + 4, 0, 7); ctx.stroke(); }
}

function drawProjectile(p) {
  ctx.save();
  if (p.kind === 'shell') {
    ctx.fillStyle = '#181b1e'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffc66c'; ctx.beginPath(); ctx.arc(p.x - 1.5, p.y - 1.5, 2, 0, 7); ctx.fill();
  } else if (p.kind === 'tracer') {
    ctx.strokeStyle = '#d9f3ff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 13, p.y + 3); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 7); ctx.fill();
  } else {
    const color = p.kind === 'ice' ? '#9affff' : '#ffe38c';
    ctx.shadowColor = color; ctx.shadowBlur = 9; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'ice' ? 4 : 2.5, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawEffects() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * Math.max(.25, p.life / p.max), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of floating) {
    ctx.globalAlpha = Math.min(1, f.life * 1.5); ctx.fillStyle = f.color;
    ctx.font = '800 11px "DM Sans"'; ctx.textAlign = 'center'; ctx.shadowColor = '#111a'; ctx.shadowBlur = 5; ctx.fillText(f.text, f.x, f.y); ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function updateHud() {
  $('healthText').textContent = `${game.baseHp} / ${game.baseMaxHp}`;
  $('healthBar').style.width = `${Math.max(0, game.baseHp / game.baseMaxHp * 100)}%`;
  $('waveText').textContent = String(Math.max(1, game.wave)).padStart(2, '0');
  $('waveBar').style.width = `${game.wave / CONFIG.maxWaves * 100}%`;
  $('coinText').textContent = game.coins;
  $('enemyCount').textContent = `${game.enemies.length} HOSTILES`;
  $('phaseText').textContent = game.phase === 'prep' ? `PREPARE YOUR DEFENSES${game.timeToNextWave ? ` · ${game.timeToNextWave}s` : ''}` : game.phase === 'spawning' ? 'HOSTILE WAVE INBOUND' : game.phase === 'clearing' ? 'ELIMINATE ALL HOSTILES' : game.status === 'victory' ? 'FRONTIER SECURE' : 'DEFENSES BREACHED';
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (!paused && game.status === 'running') {
    const dt = realDt * speeds[speedIndex];
    game.update(dt);
    processEvents();
    for (const p of particles) { p.x += p.vx * realDt; p.y += p.vy * realDt; p.vx *= .94; p.vy *= .94; p.life -= realDt; }
    for (const f of floating) { f.y -= realDt * 23; f.life -= realDt; }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    for (let i = floating.length - 1; i >= 0; i--) if (floating[i].life <= 0) floating.splice(i, 1);
    if (toastTimer > 0 && (toastTimer -= realDt) <= 0) $('toast').classList.remove('show');
    if (bannerTimer > 0 && (bannerTimer -= realDt) <= 0) $('waveBanner').classList.remove('show');
    shake = Math.max(0, shake - realDt);
    if (Math.floor(now / 450) !== Math.floor((now - realDt * 1000) / 450)) updatePanels();
  } else {
    if (toastTimer > 0 && (toastTimer -= realDt) <= 0) $('toast').classList.remove('show');
  }
  if (shake > 0) {
    ctx.save(); ctx.translate((Math.random() - .5) * shake * 20, (Math.random() - .5) * shake * 15);
    draw(); ctx.restore();
  } else draw();
}

buildTowerCards();
updatePanels();
resize();
requestAnimationFrame(frame);
