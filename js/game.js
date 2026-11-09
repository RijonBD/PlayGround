// ---------------------------------------------------------------------------
// LAST STAND — pure game simulation (no DOM, no rendering)
// ---------------------------------------------------------------------------
import {
  CONFIG,
  TOWERS,
  ENEMIES,
  WAVES,
  SPAWN_GAP,
  waveHpMultiplier,
  waveSpeedMultiplier,
} from './config.js';

const TAU = Math.PI * 2;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

function segDist2(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
  t = clamp(t, 0, 1);
  return dist2(px, py, ax + vx * t, ay + vy * t);
}

// Cut the sharp corners off a polyline so the lane both looks and feels smooth.
function roundPolyline(points, radius, samples = 7) {
  if (points.length < 3) return points.slice();
  const out = [{ ...points[0] }];
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const d1 = Math.hypot(p0.x - p1.x, p0.y - p1.y);
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const r = Math.min(radius, d1 * 0.42, d2 * 0.42);
    const a = { x: p1.x + ((p0.x - p1.x) / (d1 || 1)) * r, y: p1.y + ((p0.y - p1.y) / (d1 || 1)) * r };
    const b = { x: p1.x + ((p2.x - p1.x) / (d2 || 1)) * r, y: p1.y + ((p2.y - p1.y) / (d2 || 1)) * r };
    out.push(a);
    for (let s = 1; s <= samples; s++) {
      const t = s / samples;
      const mt = 1 - t;
      out.push({
        x: mt * mt * a.x + 2 * mt * t * p1.x + t * t * b.x,
        y: mt * mt * a.y + 2 * mt * t * p1.y + t * t * b.y,
      });
    }
  }
  out.push({ ...points[points.length - 1] });
  // Remove duplicate consecutive points.
  const clean = [out[0]];
  for (let i = 1; i < out.length; i++) {
    if (dist2(out[i].x, out[i].y, clean[clean.length - 1].x, clean[clean.length - 1].y) > 0.05) clean.push(out[i]);
  }
  return clean;
}

let nextTowerId = 1;

export class Tower {
  constructor(key, x, y) {
    this.id = nextTowerId++;
    this.key = key;
    this.def = TOWERS[key];
    this.x = x;
    this.y = y;
    this.level = 1;
    this.cooldown = 0;
    this.angle = -Math.PI / 2;
    this.recoil = 0;
    this.flash = 0;
    this.invested = this.def.cost;
    this.kills = 0;
    this.damageDone = 0;
    this.spin = 0;
  }

  get damage() {
    return this.def.damage * Math.pow(1.55, this.level - 1);
  }

  get range() {
    return this.def.range * (1 + 0.075 * (this.level - 1));
  }

  get rate() {
    return this.def.rate * Math.pow(1.12, this.level - 1);
  }

  get splash() {
    return this.def.splash ? this.def.splash * (1 + 0.06 * (this.level - 1)) : 0;
  }

  get upgradeCost() {
    return this.level < 3 ? this.def.upgrades[this.level - 1] : null;
  }

  get sellValue() {
    return Math.floor(this.invested * 0.65);
  }

  get maxed() {
    return this.level >= 3;
  }
}

export class Enemy {
  constructor(key, wave) {
    this.key = key;
    this.def = ENEMIES[key];
    this.maxHp = Math.round(this.def.hp * waveHpMultiplier(wave));
    this.hp = this.maxHp;
    this.baseSpeed = this.def.speed * waveSpeedMultiplier(wave);
    this.armor = this.def.armor;
    this.reward = this.def.reward;
    this.damage = this.def.damage;
    this.radius = this.def.radius;
    this.travelled = 0;
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.dead = false;
    this.reached = false;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.hitFlash = 0;
    this.bob = Math.random() * TAU;
    this.wobble = 0;
  }

  get speed() {
    return this.baseSpeed * this.slowFactor;
  }

  get slowed() {
    return this.slowFactor < 0.999;
  }
}

export class Game {
  constructor({ width = 390, height = 844 } = {}) {
    this.width = width;
    this.height = height;
    this._buildLayout();
    this.reset();
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------
  _buildLayout() {
    const W = (this.width = Math.max(280, this.width));
    const H = (this.height = Math.max(480, this.height));
    this.fieldTop = 96;
    this.fieldBottom = H - 152;

    const fieldH = this.fieldBottom - this.fieldTop;
    const raw = [
      [0.5, -0.16],
      [0.5, 0.055],
      [0.79, 0.055],
      [0.79, 0.215],
      [0.21, 0.215],
      [0.21, 0.385],
      [0.77, 0.385],
      [0.77, 0.555],
      [0.24, 0.555],
      [0.24, 0.725],
      [0.52, 0.9],
    ].map(([fx, fy]) => ({ x: fx * W, y: this.fieldTop + fy * fieldH }));

    this.rawPath = raw;
    this.path = roundPolyline(raw, 26);
    this.pathCum = [0];
    this.segmentAngles = [];
    for (let i = 1; i < this.path.length; i++) {
      const a = this.path[i - 1];
      const b = this.path[i];
      this.pathCum.push(this.pathCum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
      this.segmentAngles.push(Math.atan2(b.y - a.y, b.x - a.x));
    }
    this.pathLength = this.pathCum[this.pathCum.length - 1];
    this.base = { ...this.path[this.path.length - 1] };
    this.laneHalf = CONFIG.laneWidth / 2;

    this.slots = this._makeSlots();
  }

  _makeSlots() {
    const slots = [];
    const step = CONFIG.buildGrid;
    const lastY = this.height - 132;
    for (let y = this.fieldTop + 26; y <= lastY; y += step) {
      for (let x = 25; x <= this.width - 25; x += step) {
        if (x < 19 || x > this.width - 19) continue;
        if (this._pathDistance(x, y) < this.laneHalf + 20) continue;
        if (dist2(x, y, this.base.x, this.base.y) < 72 * 72) continue;
        slots.push({ x, y });
      }
    }
    return slots;
  }

  _pathDistance(x, y) {
    let best = Infinity;
    for (let i = 1; i < this.path.length; i++) {
      const a = this.path[i - 1];
      const b = this.path[i];
      const d = segDist2(x, y, a.x, a.y, b.x, b.y);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  pathPointAt(distance) {
    const d = clamp(distance, 0, this.pathLength);
    let lo = 0;
    let hi = this.pathCum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.pathCum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const a = this.path[lo];
    const b = this.path[hi];
    const seg = this.pathCum[hi] - this.pathCum[lo] || 1;
    const t = (d - this.pathCum[lo]) / seg;
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), angle: this.segmentAngles[lo] || 0 };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  reset() {
    this.status = 'running';
    this.coins = CONFIG.startingCoins;
    this.baseMaxHp = CONFIG.baseHp;
    this.baseHp = CONFIG.baseHp;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.events = [];
    this.time = 0;
    this.wave = 0;
    this.phase = 'prep';
    this.phaseTimer = CONFIG.firstPrep;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveKills = 0;
    this.totalKills = 0;
    this.totalEarned = 0;
    this.leaks = 0;
    this.selectedTowerId = null;
    this.baseFlash = 0;
    this.defeatTimer = 0;
    this.victoryTimer = 0;
    this.towerBuiltThisWave = 0;
  }

  resize(width, height) {
    if (Math.abs(width - this.width) < 0.5 && Math.abs(height - this.height) < 0.5) return;
    const oldW = this.width;
    const oldTop = this.fieldTop;
    const oldFieldH = this.fieldBottom - this.fieldTop;
    const mapPoint = (p) => ({
      x: (p.x / oldW) * width,
      y: this.fieldTopPreview(width, height) + ((p.y - oldTop) / oldFieldH) * (this.fieldBottomPreview(width, height) - this.fieldTopPreview(width, height)),
    });
    const towerPositions = this.towers.map((t) => mapPoint(t));
    const projectilePositions = this.projectiles.map((p) => mapPoint(p));
    const enemyFractions = this.enemies.map((e) => e.travelled / (this.pathLength || 1));

    this.width = width;
    this.height = height;
    this._buildLayout();

    this.towers.forEach((t, i) => {
      t.x = clamp(towerPositions[i].x, 20, this.width - 20);
      t.y = clamp(towerPositions[i].y, this.fieldTop + 20, this.height - 128);
    });
    this.projectiles.forEach((p, i) => {
      p.x = clamp(projectilePositions[i].x, 0, this.width);
      p.y = clamp(projectilePositions[i].y, 0, this.height);
      p.tx = p.x;
      p.ty = p.y;
    });
    this.enemies.forEach((e, i) => {
      e.travelled = enemyFractions[i] * this.pathLength;
      const pos = this.pathPointAt(e.travelled);
      e.x = pos.x;
      e.y = pos.y;
    });
  }

  fieldTopPreview(width, height) {
    return 96;
  }

  fieldBottomPreview(width, height) {
    return Math.max(480, height) - 152;
  }

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------
  getTower(id) {
    return this.towers.find((t) => t.id === id) || null;
  }

  slotAt(x, y, maxDist = 34) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const slot of this.slots) {
      if (this.towerAt(slot.x, slot.y, 30)) continue;
      const d = dist2(x, y, slot.x, slot.y);
      if (d <= bestD) {
        bestD = d;
        best = slot;
      }
    }
    return best;
  }

  towerAt(x, y, radius = 26) {
    let best = null;
    let bestD = radius * radius;
    for (const t of this.towers) {
      const d = dist2(x, y, t.x, t.y);
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  buildTower(key, x, y) {
    const def = TOWERS[key];
    if (!def) return { ok: false, error: 'Unknown tower' };
    const slot = this.slotAt(x, y, 18);
    if (!slot) return { ok: false, error: 'Needs a clear spot' };
    if (this.coins < def.cost) return { ok: false, error: 'Not enough coins' };
    this.coins -= def.cost;
    const t = new Tower(key, slot.x, slot.y);
    this.towers.push(t);
    this.events.push({ type: 'build', x: t.x, y: t.y, tower: key, level: 1 });
    this.selectedTowerId = t.id;
    return { ok: true, tower: t };
  }

  upgradeTower(id) {
    const t = this.getTower(id);
    if (!t) return { ok: false, error: 'No tower selected' };
    if (t.maxed) return { ok: false, error: 'Already max level' };
    const cost = t.upgradeCost;
    if (this.coins < cost) return { ok: false, error: 'Not enough coins' };
    this.coins -= cost;
    t.invested += cost;
    t.level += 1;
    t.cooldown = 0;
    this.events.push({ type: 'upgrade', x: t.x, y: t.y, tower: t.key, level: t.level });
    return { ok: true, tower: t, cost };
  }

  sellTower(id) {
    const t = this.getTower(id);
    if (!t) return { ok: false, error: 'No tower selected' };
    const value = t.sellValue;
    this.coins += value;
    this.totalEarned += value;
    this.towers = this.towers.filter((tw) => tw.id !== id);
    if (this.selectedTowerId === id) this.selectedTowerId = null;
    this.events.push({ type: 'sell', x: t.x, y: t.y, value });
    return { ok: true, value };
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  update(dt) {
    if (this.status !== 'running') {
      this.baseFlash = Math.max(0, this.baseFlash - dt * 2);
      return;
    }
    this.time += dt;
    this.baseFlash = Math.max(0, this.baseFlash - dt * 2.2);

    this._updateWaves(dt);
    this._updateEnemies(dt);
    this._updateTowers(dt);
    this._updateProjectiles(dt);

    for (const t of this.towers) {
      t.flash = Math.max(0, t.flash - dt * 5);
      t.recoil = Math.max(0, t.recoil - dt * 5.5);
      t.spin += dt * (t.key === 'ice' ? 0.7 : 0);
    }
    for (const e of this.enemies) {
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
      e.wobble += dt;
    }
    this.enemies = this.enemies.filter((e) => !e.dead && !e.reached);
    this.projectiles = this.projectiles.filter((p) => !p.done);

    if (this.status === 'running' && this.baseHp <= 0) {
      this.baseHp = 0;
      this.status = 'defeat';
      this.phase = 'done';
      this.events.push({ type: 'defeat' });
    }
  }

  _updateWaves(dt) {
    if (this.phase === 'prep') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this._startWave(this.wave + 1);
      return;
    }
    if (this.phase === 'spawning') {
      this.spawnTimer -= dt;
      let guard = 0;
      while (this.spawnQueue.length && this.spawnTimer <= 0 && guard++ < 12) {
        const type = this.spawnQueue.shift();
        this._spawnEnemy(type);
        this.spawnTimer += SPAWN_GAP[type] || 0.7;
      }
      if (!this.spawnQueue.length) this.phase = 'clearing';
      return;
    }
    if (this.phase === 'clearing' && this.enemies.length === 0) {
      this._finishWave();
    }
  }

  _startWave(n) {
    this.wave = n;
    this.phase = 'spawning';
    this.waveKills = 0;
    this.spawnTimer = 0.5;
    this.towerBuiltThisWave = 0;
    this.spawnQueue = this._waveSequence(WAVES[n - 1]);
    this.events.push({ type: 'waveStart', wave: n });
  }

  _waveSequence(groups) {
    const order = ['basic', 'fast', 'armored', 'boss'];
    const remaining = {};
    for (const k of order) remaining[k] = groups[k] || 0;
    const queue = [];
    let left = Object.values(remaining).reduce((a, b) => a + b, 0);
    while (left > 0) {
      let pushed = false;
      for (const k of order) {
        if (remaining[k] > 0) {
          queue.push(k);
          remaining[k]--;
          left--;
          pushed = true;
        }
      }
      if (!pushed) break;
    }
    return queue;
  }

  _spawnEnemy(type) {
    const e = new Enemy(type, this.wave);
    const pos = this.pathPointAt(0);
    e.x = pos.x;
    e.y = pos.y;
    e.angle = pos.angle;
    e.bob = Math.random() * TAU;
    this.enemies.push(e);
  }

  _finishWave() {
    const bonus = 25 + this.wave * 10;
    this.coins += bonus;
    this.totalEarned += bonus;
    this.events.push({ type: 'waveClear', wave: this.wave, bonus });
    if (this.wave >= CONFIG.maxWaves) {
      this.coins += CONFIG.victoryReward;
      this.totalEarned += CONFIG.victoryReward;
      this.status = 'victory';
      this.phase = 'done';
      this.events.push({ type: 'victory' });
      return;
    }
    this.phase = 'prep';
    this.phaseTimer = CONFIG.betweenPrep;
  }

  _updateEnemies(dt) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.slowUntil && this.time >= e.slowUntil) {
        e.slowUntil = 0;
        e.slowFactor = 1;
      }
      e.travelled += e.speed * dt;
      if (e.travelled >= this.pathLength) {
        e.reached = true;
        this.baseHp -= e.damage;
        this.leaks++;
        this.baseFlash = 1;
        this.events.push({ type: 'baseHit', x: this.base.x, y: this.base.y, amount: e.damage, enemy: e.key });
        if (this.baseHp <= 0) {
          this.baseHp = 0;
          this.status = 'defeat';
          this.phase = 'done';
          this.events.push({ type: 'defeat' });
        }
        continue;
      }
      const pos = this.pathPointAt(e.travelled);
      e.x = pos.x;
      e.y = pos.y;
      e.angle = pos.angle;
    }
    this.enemies = this.enemies.filter((e) => !e.dead && !e.reached);
  }

  _updateTowers(dt) {
    for (const tower of this.towers) {
      tower.cooldown -= dt;
      const target = this._findTarget(tower);
      if (target) {
        const desired = Math.atan2(target.y - (tower.y - 10), target.x - tower.x);
        tower.angle = this._turnToward(tower.angle, desired, dt * 9);
        if (tower.cooldown <= 0) this._fire(tower, target);
      } else {
        // Idle scan sweep
        tower.angle += Math.sin(this.time * 0.9 + tower.id) * dt * 0.15;
      }
    }
  }

  _turnToward(current, target, maxStep) {
    let delta = ((target - current + Math.PI) % TAU) - Math.PI;
    if (delta < -Math.PI) delta += TAU;
    return current + clamp(delta, -maxStep, maxStep);
  }

  _findTarget(tower) {
    let best = null;
    let bestTravelled = -1;
    const r2 = tower.range * tower.range;
    for (const e of this.enemies) {
      if (e.dead || e.reached) continue;
      if (dist2(tower.x, tower.y, e.x, e.y) > r2) continue;
      if (e.travelled > bestTravelled) {
        bestTravelled = e.travelled;
        best = e;
      }
    }
    return best;
  }

  _fire(tower, target) {
    const def = tower.def;
    tower.cooldown = 1 / tower.rate;
    tower.recoil = 1;
    tower.flash = 1;
    const muzzleDist = tower.key === 'sniper' ? 26 : tower.key === 'cannon' ? 20 : 19;
    const sx = tower.x + Math.cos(tower.angle) * muzzleDist;
    const sy = tower.y - 10 + Math.sin(tower.angle) * muzzleDist;

    if (def.projectile === 'shell') {
      // Lead the target a little so the lobbed shell can actually connect.
      const travelGuess = Math.hypot(target.x - tower.x, target.y - tower.y) / def.projectileSpeed;
      const ahead = Math.min(0.55, travelGuess * 0.65);
      const lead = this.pathPointAt(target.travelled + target.speed * ahead);
      const dist = Math.hypot(lead.x - sx, lead.y - sy);
      this.projectiles.push({
        kind: 'shell',
        x: sx,
        y: sy,
        sx,
        sy,
        tx: lead.x,
        ty: lead.y,
        t: 0,
        duration: Math.max(0.25, dist / def.projectileSpeed),
        speed: def.projectileSpeed,
        damage: tower.damage,
        splash: tower.splash,
        pierce: def.pierce,
        towerId: tower.id,
        towerKey: tower.key,
        life: 3,
        done: false,
      });
      this.events.push({ type: 'shoot', kind: 'shell', x: tower.x, y: tower.y, angle: tower.angle, towerId: tower.id });
      return;
    }

    this.projectiles.push({
      kind: def.projectile,
      x: sx,
      y: sy,
      tx: target.x,
      ty: target.y,
      targetId: target,
      speed: def.projectileSpeed,
      damage: tower.damage,
      pierce: def.pierce,
      splash: 0,
      slow: def.slow || 0,
      slowDuration: def.slowDuration || 0,
      towerId: tower.id,
      towerKey: tower.key,
      color: def.color,
      life: 2.2,
      trail: [],
      done: false,
    });
    this.events.push({ type: 'shoot', kind: def.projectile, x: tower.x, y: tower.y, angle: tower.angle, towerId: tower.id });
  }

  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.done) continue;
      if (p.kind === 'shell') {
        p.t += dt / p.duration;
        if (p.t >= 1) {
          this._explodeShell(p);
          continue;
        }
        const t = p.t;
        p.x = lerp(p.sx, p.tx, t);
        p.y = lerp(p.sy, p.ty, t) - Math.sin(t * Math.PI) * Math.min(90, Math.hypot(p.tx - p.sx, p.ty - p.sy) * 0.35);
        continue;
      }

      if (p.targetId && !p.targetId.dead && !p.targetId.reached) {
        p.tx = p.targetId.x;
        p.ty = p.targetId.y;
      } else {
        p.targetId = null;
      }

      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step + 8) {
        // Hit
        p.x = p.tx;
        p.y = p.ty;
        if (p.targetId) this._hitProjectile(p, p.targetId);
        p.done = true;
        continue;
      }
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      p.life -= dt;
      if (p.life <= 0) {
        p.done = true;
        continue;
      }
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 6) p.trail.shift();
    }
  }

  _hitProjectile(p, target) {
    if (p.kind === 'ice') {
      this._damageEnemy(target, p.damage, { pierce: p.pierce, towerId: p.towerId });
      if (!target.dead) this._applySlow(target, p.slow, p.slowDuration);
      this.events.push({ type: 'impact', kind: 'ice', x: p.x, y: p.y });
      return;
    }
    const dealt = this._damageEnemy(target, p.damage, { pierce: p.pierce, towerId: p.towerId });
    if (p.kind === 'tracer') this.events.push({ type: 'impact', kind: 'tracer', x: p.x, y: p.y, dealt });
    else this.events.push({ type: 'impact', kind: 'bullet', x: p.x, y: p.y, dealt });
  }

  _explodeShell(p) {
    p.done = true;
    p.x = p.tx;
    p.y = p.ty;
    this.events.push({ type: 'explosion', x: p.tx, y: p.ty, radius: p.splash });
    const r2 = p.splash * p.splash;
    for (const e of this.enemies) {
      if (e.dead || e.reached) continue;
      const d2 = dist2(p.tx, p.ty, e.x, e.y);
      if (d2 <= r2 + e.radius * e.radius) {
        const falloff = clamp(1.15 - Math.sqrt(d2) / (p.splash + 20), 0.45, 1);
        this._damageEnemy(e, p.damage * falloff, { pierce: p.pierce, splash: true, towerId: p.towerId });
      }
    }
  }

  _applySlow(enemy, slow, duration) {
    const resist = enemy.def.slowResist || 0;
    const factor = 1 - slow * (1 - resist);
    if (enemy.slowFactor > factor || this.time >= enemy.slowUntil) enemy.slowFactor = factor;
    enemy.slowUntil = Math.max(enemy.slowUntil, this.time + duration);
    this.events.push({ type: 'slow', x: enemy.x, y: enemy.y });
  }

  _damageEnemy(enemy, raw, { pierce = 0, splash = false, towerId = 0 } = {}) {
    if (!enemy || enemy.dead) return 0;
    let armor = enemy.armor * (1 - pierce);
    if (splash) armor *= 0.6;
    const dmg = Math.max(1, raw - armor);
    enemy.hp -= dmg;
    enemy.hitFlash = 1;
    const tower = this.towers.find((t) => t.id === towerId);
    if (tower) {
      tower.damageDone += dmg;
      if (enemy.hp <= 0) tower.kills++;
    }
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.dead = true;
      this.coins += enemy.reward;
      this.totalEarned += enemy.reward;
      this.totalKills++;
      this.waveKills++;
      this.events.push({
        type: 'kill',
        x: enemy.x,
        y: enemy.y,
        enemy: enemy.key,
        reward: enemy.reward,
        boss: enemy.key === 'boss',
      });
    }
    return dmg;
  }

  // -------------------------------------------------------------------------
  // Read-only helpers for UI / renderer
  // -------------------------------------------------------------------------
  get timeToNextWave() {
    return this.phase === 'prep' ? Math.max(0, Math.ceil(this.phaseTimer)) : null;
  }

  get waveProgress() {
    return { wave: Math.max(1, this.wave), max: CONFIG.maxWaves };
  }

  get selectedTower() {
    return this.selectedTowerId ? this.getTower(this.selectedTowerId) : null;
  }

  get upgradeCost() {
    const t = this.selectedTower;
    return t ? t.upgradeCost : null;
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
