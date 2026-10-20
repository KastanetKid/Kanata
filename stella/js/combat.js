'use strict';

// ---------- 戦闘 ----------
// キャラクター（プレイヤー・雑魚・ボス共通）の状態遷移、技の進行、当たり判定、敵の AI。
// G はいま遊んでいるステージの状態（stage.js で作る）。

let G = null;
let uid = 0;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

class Fighter {
  constructor(o) {
    this.id = ++uid;
    this.x = 0; this.z = 40; this.y = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.facing = 1;
    this.state = 'idle'; this.st = 0; this.t = 0;
    this.move = null; this.mf = 0; this.hitMap = new Map();
    this.stun = 0; this.inv = 0; this.flash = 0;
    this.hits = 0; this.hitsT = 0;
    this.walkPh = 0; this.bounced = false; this.juggles = 0;
    this.atk = 1; this.downT = 40; this.cd = 60;
    Object.assign(this, o);
    this.size = (this.look && this.look.size) || 1;
    this.w = 9 * this.size;
    this.h = 64 * this.size;
  }
  get air() { return this.y > 0.01 || this.vy > 0; }
  setState(s) { this.state = s; this.st = 0; }
}

function isInv(f) {
  if (f.inv > 0) return true;
  if (f.state === 'attack' && f.move && f.move.invuln) {
    const iv = f.move.invuln;
    return iv === true || (f.mf >= iv[0] && f.mf <= iv[1]);
  }
  return false;
}
function hasArmor(f) {
  return f.state === 'attack' && f.move && f.move.armor && f.mf <= f.move.st + f.move.ac;
}

// ---------- 技 ----------
function startMove(f, key) {
  const m = f.moves[key];
  if (!m) return false;
  f.move = m;
  f.moveKey = key;
  f.mf = 0;
  f.hitMap.clear();
  f.hitConfirm = false;
  f.setState('attack');
  if (!m.air && !f.air) { f.vx = 0; f.vz = 0; }
  if (m.grunt && f.f0 && Math.random() < (f.team === 'p' ? 0.85 : 0.55)) Sound.say(m.grunt, f.f0, { who: f.id });
  return true;
}

function endMove(f) {
  const m = f.move;
  f.move = null;
  if (m && m.then && f.moves[m.then] && f.hp > 0) {
    startMove(f, m.then);
    return;
  }
  if (f.grabbing && f.grabbing.state === 'grabbed') {
    f.setState('grab');
    return;
  }
  f.setState(f.air ? 'jump' : 'idle');
  if (f.team === 'e') f.cd = f.kind === 'boss' ? f.cd : rnd(40, 90) / G.aggro;
}

function target(f) {
  return f.team === 'e' ? G.player : null;
}

function activeStart(f, m) {
  const T = target(f);
  if (m.hit || m.area) Sound.sfx('swing', m.hit && m.hit.dmg > 7 ? 0.7 : 1);
  if (m.vy) f.vy = m.vy;
  if (m.leap) {
    f.vy = m.leap.vy;
    f.vx = f.facing * m.leap.vx;
    if (T && m.leap.vx > 0) {
      const tt = 2 * m.leap.vy / GRAV;
      f.vx = clamp((T.x - f.x) / tt, -Math.abs(m.leap.vx) * 1.3, Math.abs(m.leap.vx) * 1.3);
      f.vz = clamp((T.z - f.z) / tt, -1.2, 1.2);
    }
  }
  if (m.dive) {
    f.vy = m.dive.vy;
    f.vx = f.facing * m.dive.vx;
  }
  if (m.homing && T) {
    f.vy = 7;
    const tt = 2 * 7 / GRAV;
    f.vx = (T.x - f.x) / tt;
    f.vz = (T.z - f.z) / tt;
    G.hazards.push({ kind: 'marker', x: T.x, z: T.z, t: 0, life: tt });
  }
  if (m.warp && T) {
    FX.ring(f.x, FLOOR + f.z - 30, 30, '#ffffff', 16, false);
    FX.petals(f.x, FLOOR + f.z - 40, 8);
    const side = T.facing === 1 ? -1 : 1;
    f.x = clamp(T.x + side * 46, G.camX + 24, G.camX + W - 24);
    f.z = T.z;
    f.facing = T.x > f.x ? 1 : -1;
    FX.ring(f.x, FLOOR + f.z - 30, 30, '#ffffff', 16, false);
    Sound.sfx('whoosh');
  }
  if (m.summon) G.summon(f, m.summon);
  if (m.hazard) G.spawnHazard(f, m.hazard);
  if (m.beam) Sound.sfx('beam');
}

function chase(f, spd) {
  const T = target(f);
  if (!T) return;
  const dx = T.x - f.x, dz = T.z - f.z;
  f.vx = clamp(dx * 0.05, -spd, spd);
  f.vz = clamp(dz * 0.05, -spd * 0.6, spd * 0.6);
  if (Math.abs(dx) > 6) f.facing = dx > 0 ? 1 : -1;
}

function updateMove(f) {
  const m = f.move;
  f.mf++;
  const mf = f.mf;
  const a0 = m.st + 1, a1 = m.st + m.ac;
  const act = mf >= a0 && mf <= a1;
  if (mf === a0) activeStart(f, m);
  if (m.vx && act) f.vx = f.facing * m.vx * Math.pow(m.decay || 1, mf - a0);
  else if (!m.air && !m.chase) f.vx *= 0.75;
  if (m.chase) { if (act) chase(f, m.chase); else { f.vx *= 0.8; f.vz *= 0.8; } }
  if (m.proj) {
    const P = m.proj;
    if (mf === P.at || (P.every && mf > P.at && (mf - P.at) % P.every === 0 && (mf - P.at) / P.every < P.count)) spawnProj(f, P);
  }
  if (m.area) {
    const A = m.area;
    if (mf === a0 + (A.at || 0) || (A.every && act && mf > a0 && (mf - a0) % A.every === 0)) areaHit(f, A, m);
  }
  if (m.hit && act) tryHit(f, m, m.hit);
  if (m.float) floatMove(f, m, mf);
  if (m.fx && act && mf % 3 === 0) moveFx(f, m.fx);
  if (f.team === 'p' && m.say && act && mf % 2 === 0) FX.after(f);

  if (m.air) {
    if (mf > a1 + m.rc && !(m.dive || m.homing || m.leap || m.float)) {
      f.move = null;
      f.airAtk = true;
      f.setState(f.air ? 'jump' : 'idle');
    }
  } else if (mf >= a1 + m.rc) {
    endMove(f);
  }
}

// エトワールの日傘ふわふわ → 急降下
function floatMove(f, m, mf) {
  const T = target(f);
  const a0 = m.st + 1;
  if (mf < a0) return;
  const k = mf - a0;
  if (k < 60) {
    f.vy = 0;
    f.y += (90 - f.y) * 0.06;
    if (T) {
      f.vx = clamp((T.x - f.x) * 0.04, -2.2, 2.2);
      f.vz = clamp((T.z - f.z) * 0.04, -1.2, 1.2);
      f.facing = T.x > f.x ? 1 : -1;
    }
    if (k === 40 && T) G.hazards.push({ kind: 'marker', x: T.x, z: T.z, t: 0, life: 40 });
  } else if (k === 60) {
    f.vy = -6;
    f.vx *= 0.4;
    f.vz *= 0.4;
  }
}

function moveFx(f, kind) {
  const sx = f.x, sy = FLOOR + f.z - f.y - 30 * f.size;
  if (kind === 'stars') FX.starBurst(sx, sy, f.team === 'p' ? G.chr.color : '#ffe14a', 2);
  else if (kind === 'wind') FX.ring(sx, FLOOR + f.z - f.y - 10, 34, '#bfefff', 12, true);
  else if (kind === 'fire') FX.dust(sx - f.facing * 10, FLOOR + f.z - 6, 2, -f.facing);
  else if (kind === 'notes') FX.notes(sx, sy, 1);
  else if (kind === 'petals') FX.petals(sx, sy, 2);
  else if (kind === 'quake') FX.dust(sx, FLOOR + f.z, 1, 0);
  else if (kind === 'after') FX.after(f);
}

// ---------- 当たり判定 ----------
function targetsOf(team) {
  if (team === 'p') {
    const out = G.enemies.slice();
    if (G.boss) out.push(G.boss);
    return out;
  }
  return G.player ? [G.player] : [];
}

function hittable(v, hit) {
  if (v.state === 'dead' || v.state === 'enter' && v.kind === 'boss') return false;
  if (isInv(v)) return false;
  if (v.state === 'down' || v.state === 'getup') return false;
  if ((v.state === 'fall' || v.state === 'thrown') && !hit.juggle) return false;
  return true;
}

function tryHit(f, m, hit) {
  const s = f.kind === 'boss' ? Math.min(1.25, f.size) : 1;
  for (const v of targetsOf(f.team)) {
    if (!hittable(v, hit)) continue;
    const last = f.hitMap.get(v);
    if (last != null && (!m.multi || f.mf - last < m.multi)) continue;
    const dx = (v.x - f.x) * f.facing;
    if (dx + v.w < hit.x0 * s || dx - v.w > hit.x1 * s) continue;
    if (Math.abs(v.z - f.z) > hit.z) continue;
    const y0 = f.y + hit.y0 * s, y1 = f.y + hit.y1 * s;
    if (y1 < v.y || y0 > v.y + v.h) continue;
    f.hitMap.set(v, f.mf);
    f.hitConfirm = true;
    applyHit(f, v, hit);
  }
  if (f.team === 'p') hitProps(f, hit, s);
}

// 体の周りの円（楕円）に当てる
function areaHit(f, A, m) {
  const off = (A.off || 0) * f.facing;
  const cx = f.x + off;
  FX.ring(cx, FLOOR + f.z, A.r * 2, f.team === 'p' ? '#fff27a' : '#ff7ab8', 20);
  if (A.r >= 50) G.shake = Math.max(G.shake, 8);
  const hit = Object.assign({ x0: 0, x1: 0, y0: 0, y1: 0, z: 0, kb: 'launch', stun: 18, push: 1, stop: 6, juggle: !!A.juggle, sfx: 'hitH' }, A);
  for (const v of targetsOf(f.team)) {
    if (!hittable(v, hit)) continue;
    if (v.y > 40) continue;
    const dx = v.x - cx, dz = (v.z - f.z) * 2.2;
    if (dx * dx + dz * dz > A.r * A.r) continue;
    applyHit(Object.assign(Object.create(f), { x: cx }), v, hit);
  }
  if (f.team === 'p') {
    for (const p of G.props) if (!p.broken && Math.abs(p.x - cx) < A.r && Math.abs(p.z - f.z) * 2.2 < A.r) breakProp(p);
  }
}

function hitProps(f, hit, s) {
  for (const p of G.props) {
    if (p.broken) continue;
    const dx = (p.x - f.x) * f.facing;
    if (dx + 10 < hit.x0 * s || dx - 10 > hit.x1 * s) continue;
    if (Math.abs(p.z - f.z) > hit.z) continue;
    if (f.y + hit.y0 > 30) continue;
    if (f.hitMap.has(p)) continue;
    f.hitMap.set(p, f.mf);
    breakProp(p);
  }
}
function breakProp(p) {
  p.hp--;
  Sound.sfx('break');
  FX.spark(p.x, FLOOR + p.z - 14, false, '#ffffff');
  p.shake = 8;
  if (p.hp <= 0) {
    p.broken = true;
    for (let i = 0; i < 8; i++) FX.add({ k: 'bit', x: p.x, y: FLOOR + p.z - 14, vx: rnd(-2.5, 2.5), vy: rnd(-3.5, -1), life: 30, col: p.col, s: 3 });
    G.items.push({ x: p.x, z: p.z, kind: p.item, t: 0, y: 6, vy: 2 });
  }
}

function applyHit(att, v, hit) {
  const dir = v.x >= att.x ? 1 : -1;
  let dmg = hit.dmg * (att.atk || 1);
  if (v.team === 'p') {
    dmg *= Save.d.opts.easy ? 0.6 : 1;
    if (G.god) dmg = 0;
  }
  if (att.ult && v.kind === 'boss') dmg *= 0.6;
  v.hp -= dmg;
  v.flash = 6;
  G.hitstop = Math.max(G.hitstop, hit.stop || 4);
  const sx = (att.x + v.x) / 2 * 0.3 + v.x * 0.7 - dir * v.w * 0.4;
  const sy = FLOOR + v.z - v.y - v.h * 0.55;
  const heavy = hit.kb === 'launch' || dmg >= 9;
  FX.spark(sx, sy, heavy, att.team === 'p' ? (hit.sfx === 'hitS' ? G.chr.color : '#fff27a') : '#ff7ab8');
  if (heavy && Math.random() < 0.6) FX.word(sx + rnd(-10, 10), sy - 14, pick(att.team === 'p' ? ['バシッ!', 'ドカッ!', 'キラッ☆', 'バーン!', 'ズドン!'] : ['ゴッ!', 'バシッ!']), att.team === 'p' ? '#fff27a' : '#ff9ac6', 13);
  Sound.sfx(hit.sfx || (heavy ? 'hitH' : 'hitL'));
  if (heavy) G.shake = Math.max(G.shake, 4);

  if (att.team === 'p') {
    G.combo++;
    G.comboT = 110;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    G.score += Math.round(dmg * 10);
    const p = G.player;
    if (p) p.sp = Math.min(300, p.sp + (att.ult ? 0 : 4));
    G.focus = { f: v, t: 160 };
    if (v.f0 && Math.random() < 0.35) Sound.say(pick(['kya', 'fu', 'un']), v.f0, { who: v.id, gain: 0.5 });
  } else {
    v.sp = Math.min(300, v.sp + 10);
    G.combo = 0;
    if (v.f0) Sound.say(v.hp <= 0 ? 'aa' : pick(['kya', 'un', 'fu']), v.f0, { who: 'p' });
  }

  // つかみ中に殴られたら離す
  if (v.grabbing) release(v);
  if (v.state === 'grabbed' && v.grabbedBy && v.grabbedBy !== att) release(v.grabbedBy);

  // 倒れる途中・倒れている相手には反応を重ねない（体力 0 になった相手は必ず吹き飛ばす）
  if (v.ko && ['fall', 'thrown', 'down', 'dead'].includes(v.state)) return;
  const dying = v.hp <= 0;
  if (dying) v.ko = true;

  let launch = hit.kb === 'launch' || dying || v.air;
  if (v.team === 'p' && !launch) {
    v.hits++;
    v.hitsT = 60;
    if (v.hits >= 3) launch = true;
  }
  if (dying) {
    // そのまま吹き飛ばしへ
  } else if (v.kind === 'boss') {
    v.poise -= dmg;
    v.recent = (v.recent || 0) + 1;
    if (v.poise <= 0) { launch = true; v.poise = v.maxPoise; }
    else if (!v.ko && (hasArmor(v) || v.state === 'attack' && v.move && v.move.st > 14 && v.mf > v.move.st)) return;
    else if (!v.ko && hit.kb === 'launch' && !att.ult && v.poise > v.maxPoise * 0.35) launch = false;
  } else if (v.poise && !launch) {
    v.poiseNow = (v.poiseNow || v.poise) - dmg;
    if (v.poiseNow > 0 && (hasArmor(v) || v.state === 'attack')) return;
    if (v.poiseNow <= 0) v.poiseNow = v.poise;
  } else if (hasArmor(v) && !launch) {
    return;
  }
  if (!dying && hasArmor(v) && v.kind !== 'boss' && launch && !att.ult && hit.kb !== 'launch') return;

  v.facing = -dir;
  v.move = null;
  if (launch) {
    const jk = v.state === 'fall' || v.state === 'thrown' ? Math.max(0.35, 1 - v.juggles * 0.18) : 1;
    v.juggles = v.state === 'fall' ? v.juggles + 1 : 0;
    v.setState('fall');
    v.vy = (hit.lv != null ? hit.lv : 4.2) * jk;
    v.vx = dir * (hit.lh != null ? hit.lh : 2.4);
    v.vz = 0;
    v.bounced = false;
    if (v.y < 1) v.y = 1;
    if (v.team === 'p') { v.hits = 0; }
  } else {
    v.setState('hurt');
    v.stun = v.kind === 'boss' ? Math.min(hit.stun || 16, 12) : (hit.stun || 16);
    v.vx = dir * (hit.push != null ? hit.push : 1.2);
  }
}

// ---------- つかみ・投げ ----------
function grabbable(e) {
  return e.kind === 'grunt' && (e.state === 'idle' || e.state === 'walk' || e.state === 'hurt') && !isInv(e) && !e.ko && e.y < 1;
}
function grab(p, e) {
  p.grabbing = e;
  p.grabT = 0;
  p.knees = 0;
  p.setState('grab');
  p.vx = p.vz = 0;
  e.grabbedBy = p;
  e.move = null;
  e.setState('grabbed');
  Sound.sfx('grab');
  holdGrab(p);
}
function holdGrab(p) {
  const e = p.grabbing;
  if (!e) return;
  e.x = p.x + p.facing * 15 * Math.max(p.size, 0.95);
  e.z = p.z + 0.5;
  e.y = 0;
  e.facing = -p.facing;
  e.vx = e.vz = 0;
}
function release(p) {
  const e = p.grabbing;
  p.grabbing = null;
  if (e && e.state === 'grabbed') {
    e.grabbedBy = null;
    e.setState('hurt');
    e.stun = 12;
    e.vx = p.facing * 2;
  }
  if (p.state === 'grab') p.setState('idle');
}
function throwVictim(p, back) {
  const e = p.grabbing;
  if (!e) return;
  p.grabbing = null;
  e.grabbedBy = null;
  const dir = p.facing;
  const dmg = 12 * p.grabMul * p.atk;
  e.hp -= dmg;
  e.flash = 8;
  if (e.hp <= 0) e.ko = true;
  e.setState('thrown');
  e.vy = 4.8;
  e.vx = dir * 4.6;
  e.y = 8;
  e.bounced = false;
  e.thrownHit = new Set();
  G.score += Math.round(dmg * 12);
  G.combo++;
  G.comboT = 110;
  G.focus = { f: e, t: 160 };
  p.sp = Math.min(300, p.sp + 10);
  Sound.sfx('throw');
}
// 投げられた敵が他の敵にぶつかる
function thrownCollide(e) {
  if (e.y > 50) return;
  for (const o of G.enemies) {
    if (o === e || e.thrownHit.has(o)) continue;
    if (o.state === 'dead' || o.state === 'down' || o.state === 'fall' || o.state === 'thrown' || isInv(o)) continue;
    if (Math.abs(o.x - e.x) < 20 && Math.abs(o.z - e.z) < 14) {
      e.thrownHit.add(o);
      applyHit({ x: e.x - e.vx, team: 'p', atk: G.player ? G.player.atk : 1, y: 0 }, o, Object.assign({ dmg: 10, sfx: 'hitH', stop: 6 }, LAUNCH, { lh: 3 }));
    }
  }
}

// ---------- 物理 ----------
function onLand(f, vy) {
  switch (f.state) {
    case 'jump':
      f.setState('land');
      f.landLag = 4;
      f.vx *= 0.3;
      f.vz = 0;
      FX.dust(f.x, FLOOR + f.z, 2, 0);
      Sound.sfx('land');
      break;
    case 'attack': {
      const m = f.move;
      if (m && m.air) {
        if (m.land) areaHit(f, m.land, m);
        if (m.land || m.dive) { G.shake = Math.max(G.shake, m.land && m.land.r > 50 ? 10 : 5); Sound.sfx('thud'); FX.dust(f.x, FLOOR + f.z, 6, 0); }
        f.move = null;
        f.setState('land');
        f.landLag = m.land ? 14 : m.dive ? 10 : 5;
        f.vx = 0;
        f.vz = 0;
      } else {
        f.vx *= 0.5;
      }
      break;
    }
    case 'fall':
    case 'thrown':
      if (!f.bounced) {
        f.bounced = true;
        f.vy = 2;
        f.vx *= 0.5;
        f.y = 0.5;
        G.shake = Math.max(G.shake, f.state === 'thrown' ? 6 : 3);
        Sound.sfx('thud');
        FX.dust(f.x, FLOOR + f.z, 4, 0);
      } else {
        f.setState('down');
        f.vx = 0;
        f.vz = 0;
        f.juggles = 0;
      }
      break;
    case 'hurt':
      f.setState('down');
      f.vx = 0;
      break;
    default:
      if (f.state !== 'dead') f.setState('idle');
  }
}

function physics(f) {
  if (f.state === 'grabbed') return;
  if (f.y > 0 || f.vy !== 0) {
    let g = GRAV;
    const m = f.move;
    if (f.state === 'attack' && m) {
      if (m.hover && f.mf > m.st && f.mf <= m.st + m.ac) {
        g *= m.hover;
        if (f.vy < -1) f.vy = -1;
        if (f.vy > 1.5) f.vy = 1.5;
      }
      if (m.float && f.mf > m.st && f.mf <= m.st + 60) g = 0;
    }
    if (f.state === 'fall' || f.state === 'thrown') g = GRAV * 0.9;
    f.vy -= g;
    f.y += f.vy;
    if (f.y <= 0) {
      f.y = 0;
      const vy = f.vy;
      f.vy = 0;
      onLand(f, vy);
    }
  }
  f.x += f.vx;
  f.z += f.vz;
  if (f.y <= 0 && ['hurt', 'down', 'fall', 'getup', 'land', 'dead', 'thrown'].includes(f.state)) f.vx *= 0.82;
  f.z = clamp(f.z, 0, DEPTH);
  let lo, hi;
  if (f.team === 'p' || f.kind === 'boss' || ['fall', 'thrown', 'hurt'].includes(f.state)) {
    const m = f.team === 'p' ? 12 : 16;
    lo = G.camX + m; hi = G.camX + W - m;
    if (f.kind === 'grunt' && (f.x < lo - 1 || f.x > hi + 1) && f.state === 'hurt') { lo -= 80; hi += 80; }
  } else {
    lo = G.camX - 90; hi = G.camX + W + 90;
  }
  if (f.x < lo) { f.x = lo; if (f.state === 'thrown' || f.state === 'fall') f.vx = Math.abs(f.vx) * 0.3; }
  if (f.x > hi) { f.x = hi; if (f.state === 'thrown' || f.state === 'fall') f.vx = -Math.abs(f.vx) * 0.3; }
}

// 状態ごとの共通処理
function updateFighter(f) {
  f.t++;
  f.st++;
  if (f.flash > 0) f.flash--;
  if (f.inv > 0) f.inv--;
  if (f.hitsT > 0 && --f.hitsT === 0) f.hits = 0;
  switch (f.state) {
    case 'attack': updateMove(f); break;
    case 'hurt': if (f.st >= f.stun) f.setState('idle'); break;
    case 'land': f.vx *= 0.7; if (f.st >= (f.landLag || 4)) f.setState('idle'); break;
    case 'down':
      if (f.st >= (f.ko ? 24 : f.downT)) {
        if (f.ko) { f.setState('dead'); G.onDefeat(f); } else f.setState('getup');
      }
      break;
    case 'getup':
      if (f.st >= 18) {
        f.setState('idle');
        f.inv = f.team === 'p' ? 45 : 8;
        if (f.kind === 'boss') bossWake(f);
      }
      break;
    case 'grabbed':
      if (!f.grabbedBy || f.grabbedBy.grabbing !== f) { f.grabbedBy = null; f.setState('hurt'); f.stun = 8; }
      break;
    case 'thrown': thrownCollide(f); break;
  }
  const sp = Math.hypot(f.vx, f.vz);
  if (f.state === 'walk' || f.state === 'run' || f.state === 'enter') f.walkPh += 0.16 + sp * 0.07;
  physics(f);
}

// ---------- プレイヤー ----------
function makePlayer(ci) {
  const C = CHARS[ci];
  const p = new Fighter({
    team: 'p', kind: 'player', chr: C, look: C.look, name: C.name,
    hp: C.hp, maxHp: C.hp, atk: C.atk, grabMul: C.grabMul, f0: C.f0,
    moves: Object.assign({}, GRAB_MOVES, C.moves), sp: 100, downT: 26,
    bufA: 0, bufB: 0, bufS: 0, bufU: 0, runHold: 0, runDir: 0, grabTry: 0, jumps: 0, airAtk: false,
  });
  return p;
}

function playerSay(key, prio) {
  const C = G.chr;
  const line = C.lines[key];
  if (line) G.say(C.name, line, C.color, C.tts, prio || 2);
}

function useSpecial(p, key) {
  const m = p.moves[key];
  if (!m) return;
  if (p.sp >= 100) p.sp -= 100;
  else {
    if (p.hp <= 2) return;
    p.hp = Math.max(1, p.hp - p.maxHp * 0.06);
    FX.float(p.x, FLOOR + p.z - p.h - 10, 'HP消費', '#ff9ab8', 8);
  }
  startMove(p, key);
  p.airAtk = true;
  G.freeze = 7;
  G.banner = { text: m.name, t: 0, col: G.chr.color };
  Sound.sfx('special');
  if (m.say) playerSay(m.say, 2);
  FX.ring(p.x, FLOOR + p.z - p.y - 30, 50, G.chr.color, 14, false);
}

function playerControl(p, I) {
  const C = p.chr;
  for (const k of ['a', 'b', 's', 'u']) {
    const key = 'buf' + k.toUpperCase();
    if (I.pressed[k]) p[key] = 9;
    else if (p[key] > 0) p[key]--;
  }
  const mx = I.mx, mz = I.mz;
  const st = p.state;
  if (p.bufU && p.sp >= 300 && (st === 'idle' || st === 'walk' || st === 'run' || st === 'land' || (st === 'attack' && !p.move.air && !p.move.say))) {
    p.bufU = 0;
    G.startUlt(p);
    return;
  }
  if (st === 'idle' || st === 'walk' || st === 'run') {
    if (p.bufS) {
      p.bufS = 0;
      const fwd = Math.abs(mx) > 0.45;
      if (fwd) p.facing = mx > 0 ? 1 : -1;
      useSpecial(p, fwd || st === 'run' ? C.spB : C.spA);
      return;
    }
    if (p.bufB) {
      p.bufB = 0;
      const sp = st === 'run' ? C.run : C.walk;
      p.vy = C.jumpV;
      p.vx = mx * sp * 1.05;
      p.vz = mz * C.walk * 0.5;
      p.y = 0.5;
      p.jumps = 1;
      p.airAtk = false;
      p.setState('jump');
      Sound.sfx('jump');
      return;
    }
    if (p.bufA) {
      p.bufA = 0;
      if (st === 'run') startMove(p, C.dash);
      else { p.chainIdx = 0; startMove(p, C.chain[0]); }
      return;
    }
    // 歩く・走る（同じ向きに 0.35 秒倒し続けると走る）
    if (Math.abs(mx) > 0.7) {
      const d = mx > 0 ? 1 : -1;
      if (d === p.runDir) p.runHold++;
      else { p.runDir = d; p.runHold = 1; }
    } else {
      p.runHold = 0;
    }
    const running = p.runHold > 21;
    const spd = running ? C.run : C.walk;
    p.vx = mx * spd;
    p.vz = mz * C.walk * 0.68;
    if (Math.abs(mx) > 0.2) p.facing = mx > 0 ? 1 : -1;
    const moving = Math.abs(mx) + Math.abs(mz) > 0.15;
    const ns = running ? 'run' : moving ? 'walk' : 'idle';
    if (ns !== st) {
      if (ns === 'run') { FX.dust(p.x, FLOOR + p.z, 3, -p.facing); Sound.sfx('swing', 0.5); }
      p.state = ns;
    }
    // 敵に向かって歩き込むと、つかむ
    if (ns === 'walk' && Math.abs(mx) > 0.3) {
      let e = null;
      for (const o of G.enemies) {
        const dx = (o.x - p.x) * p.facing;
        if (dx > 4 && dx < 22 && Math.abs(o.z - p.z) < 7 && grabbable(o)) { e = o; break; }
      }
      if (e) { if (++p.grabTry > 4) { p.grabTry = 0; grab(p, e); } } else p.grabTry = 0;
    } else {
      p.grabTry = 0;
    }
    return;
  }
  if (st === 'jump') {
    if (p.bufS) { p.bufS = 0; useSpecial(p, C.spC); return; }
    if (p.bufA && !p.airAtk) { p.bufA = 0; p.airAtk = true; startMove(p, C.jump); return; }
    if (p.bufB && C.doubleJump && p.jumps < 2) {
      p.bufB = 0;
      p.jumps = 2;
      p.vy = C.jumpV * 0.85;
      p.airAtk = false;
      if (Math.abs(mx) > 0.2) { p.facing = mx > 0 ? 1 : -1; p.vx = mx * C.walk * 1.1; }
      FX.ring(p.x, FLOOR + p.z - p.y, 18, '#ffffff', 12);
      Sound.sfx('jump');
      return;
    }
    p.vx = clamp(p.vx + mx * 0.06, -C.run, C.run);
    return;
  }
  if (st === 'attack' && p.move) {
    const m = p.move;
    const rec = p.mf > m.st + m.ac;
    const ci = C.chain.indexOf(p.moveKey);
    // 通常技 → 必殺技でキャンセル
    if (p.bufS && !m.say && !m.air && p.mf > m.st && (p.hitConfirm || rec) && !p.grabbing) {
      p.bufS = 0;
      const fwd = Math.abs(mx) > 0.45;
      if (fwd) p.facing = mx > 0 ? 1 : -1;
      useSpecial(p, fwd ? C.spB : C.spA);
      return;
    }
    if (ci >= 0 && p.bufA && rec && ci + 1 < C.chain.length) {
      p.bufA = 0;
      if (Math.abs(mx) > 0.3) p.facing = mx > 0 ? 1 : -1;
      startMove(p, C.chain[ci + 1]);
      return;
    }
    if (ci >= 0 && p.bufA && rec && ci + 1 >= C.chain.length && p.mf >= m.st + m.ac + m.rc - 3) {
      p.bufA = 0;
      startMove(p, C.chain[0]);
    }
    return;
  }
  if (st === 'grab') {
    const e = p.grabbing;
    if (!e || e.state !== 'grabbed') { p.grabbing = null; p.setState('idle'); return; }
    p.grabT++;
    holdGrab(p);
    if (p.bufA) {
      p.bufA = 0;
      const back = mx * p.facing < -0.5;
      if (back) { p.facing *= -1; holdGrab(p); startMove(p, 'throwF'); }
      else if (p.knees >= 2) startMove(p, 'throwF');
      else { p.knees++; startMove(p, 'knee'); }
    } else if (p.bufB || p.grabT > 110) {
      p.bufB = 0;
      release(p);
    }
  }
}

// つかみ技の実処理（プレイヤーの更新後に呼ぶ）
function playerGrabMoves(p) {
  if (p.state !== 'attack' || !p.grabbing) return;
  holdGrab(p);
  const e = p.grabbing;
  if (p.mf === p.move.st + 1) {
    if (p.moveKey === 'knee') {
      const dmg = 4 * p.grabMul * p.atk;
      e.hp -= dmg;
      e.flash = 6;
      G.score += Math.round(dmg * 10);
      G.combo++;
      G.comboT = 110;
      G.hitstop = 5;
      p.sp = Math.min(300, p.sp + 4);
      G.focus = { f: e, t: 160 };
      FX.spark(e.x, FLOOR + e.z - 30, false);
      Sound.sfx('hitL');
      if (e.hp <= 0) { e.ko = true; throwVictim(p); }
    } else if (p.moveKey === 'throwF') {
      throwVictim(p);
      Sound.say('ha', p.f0, { who: p.id });
    }
  }
}

// ---------- 雑魚の AI ----------
const AI_KIND = { dancer: 'melee', cheer: 'jumper', heavy: 'charger', thrower: 'ranged', slider: 'slider' };

function makeGrunt(type, si, x, z) {
  const T = ENEMY_TYPES[type], sk = STAGE_SKINS[si], S = STAGES[si];
  const tones = ['#fbe3d2', '#f3d0b5', '#e8b896', '#c98a62', '#a8704e'];
  const skin = si === 3 ? pick(tones.slice(2)) : Math.random() < 0.25 ? pick(tones) : sk.pal.skin;
  const look = Object.assign({ eye: '#ff3fa5', hypno: true }, sk.pal, BASE_LOOK[type], sk.types[type], { skin, hair: pick(sk.hairs) });
  if (look.legs === sk.pal.skin) look.legs = skin;
  if (!look.prop) look.prop = null;
  const elite = S.elite || 1;
  const hpMul = (1 + 0.12 * si) * elite;
  const nm = pick(sk.names);
  const e = new Fighter({
    team: 'e', kind: 'grunt', type, ai: AI_KIND[type], look, x, z,
    hp: T.hp * hpMul, maxHp: T.hp * hpMul, spd: T.spd * (1 + 0.03 * si), atk: (1 + 0.1 * si) * elite,
    moves: T.moves, name: si === 5 ? nm : `${sk.group} ${nm}`, range: T.range, score: Math.round(T.score * (1 + si * 0.2)),
    cd: rnd(30, 70), think: 0, side: 1, zoff: rnd(-8, 8), poise: T.poise || 0, downT: 40, f0: rnd(330, 470),
  });
  return e;
}

function gruntAI(e) {
  const p = G.player;
  if (e.cd > 0) e.cd--;
  if (e.state !== 'idle' && e.state !== 'walk') return;
  if (!p || p.state === 'dead' || G.phase === 'respawn') {
    e.vx *= 0.8;
    e.vz *= 0.8;
    e.state = 'idle';
    return;
  }
  const dx = p.x - e.x, dz = p.z - e.z, adx = Math.abs(dx), adz = Math.abs(dz);
  e.facing = dx >= 0 ? 1 : -1;
  if (--e.think <= 0) {
    e.think = rnd(30, 70);
    e.side = dx > 0 ? -1 : 1;
    if (Math.random() < 0.22) e.side = -e.side;
    e.zoff = rnd(-8, 8);
  }
  const free = G.tokens - G.attackers;
  const can = e.cd <= 0 && free > 0 && p.state !== 'down' && p.state !== 'getup' && !isInv(p);
  const inside = e.x > G.camX + 8 && e.x < G.camX + W - 8;
  const M = e.moves;
  if (can && inside) {
    if (e.ai === 'jumper' && adx > 48 && adx < 100 && adz < 9 && Math.random() < 0.08) return startMove(e, 'leap');
    if (e.ai === 'charger' && adx > 60 && adx < 230 && adz < 6 && Math.random() < 0.05) return startMove(e, 'charge');
    if (e.ai === 'slider' && adx > 56 && adx < 120 && adz < 6 && Math.random() < 0.07) return startMove(e, 'slide');
    if (e.ai === 'ranged' && adx > 70 && adx < 230 && adz < 8 && Math.random() < 0.06) return startMove(e, 'toss');
    if (adx < e.range + 8 && adx > 10 && adz < 6) {
      return startMove(e, M.atk2 && Math.random() < 0.35 ? 'atk2' : 'atk');
    }
  }
  // 位置取り：攻撃できる子は横に、待つ子は少し離れて回り込む
  let tx, tz;
  if (e.ai === 'ranged') { tx = p.x + e.side * 140; tz = p.z + e.zoff * 0.3; }
  else if (can) { tx = p.x + e.side * (e.range + 2); tz = p.z; }
  else { tx = p.x + e.side * (66 + (e.id % 3) * 16); tz = clamp(p.z + e.zoff * 3, 0, DEPTH); }
  // 画面に入ってくる
  if (!inside) tx = clamp(tx, G.camX + 30, G.camX + W - 30);
  const ddx = tx - e.x, ddz = tz - e.z;
  const spd = e.spd * (can ? 1 : 0.8);
  e.vx = Math.abs(ddx) > 3 ? clamp(ddx * 0.08, -spd, spd) : 0;
  e.vz = Math.abs(ddz) > 2 ? clamp(ddz * 0.08, -spd * 0.65, spd * 0.65) : 0;
  e.state = Math.abs(e.vx) + Math.abs(e.vz) > 0.15 ? 'walk' : 'idle';
}

// 敵どうしが重なりすぎないように押し合う
function separate(list) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.state === 'dead' || a.state === 'grabbed') continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.state === 'dead' || b.state === 'grabbed') continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      if (Math.abs(dx) < 16 && Math.abs(dz) < 7) {
        const s = dx >= 0 ? 1 : -1;
        a.x -= s * 0.6;
        b.x += s * 0.6;
        if (Math.abs(dz) < 7) { const t = dz >= 0 ? 1 : -1; a.z -= t * 0.3; b.z += t * 0.3; }
      }
    }
  }
}

// ---------- ボスの AI ----------
const BURST = MV({ pose: 'cheer', st: 3, ac: 4, rc: 22, invuln: true, area: { r: 58, dmg: 4, lv: 3.5, lh: 3.2 } });

function makeBoss(id, x, z) {
  const B = BOSSES[id];
  const hp = B.hp * (Save.d.opts.easy ? 0.8 : 1);
  return new Fighter({
    team: 'e', kind: 'boss', bossId: id, def: B, look: B.look, x, z, name: B.name,
    hp, maxHp: hp, spd: B.spd, atk: 1 + 0.06 * G.si, moves: Object.assign({ burst: BURST }, B.moves),
    poise: B.poise, maxPoise: B.poise, phase: 1, cd: 50, f0: B.f0, downT: 34, used: {}, recent: 0,
  });
}

function bossWake(b) {
  if (Math.random() < 0.55) { b.cd = 0; startMove(b, 'flip'); }
}

function bossAI(b) {
  const p = G.player;
  if (b.recent > 0 && G.frame % 30 === 0) b.recent = Math.max(0, b.recent - 1);
  // 殴られ続けたら衝撃波で振りほどく
  if (b.state === 'hurt' && b.recent >= 7) {
    b.recent = 0;
    startMove(b, 'burst');
    Sound.say('ha', b.f0, { who: b.id });
    return;
  }
  if (b.cd > 0) b.cd--;
  if (b.state !== 'idle' && b.state !== 'walk') return;
  if (!p || p.state === 'dead' || G.phase === 'respawn') { b.vx = b.vz = 0; b.state = 'idle'; return; }
  // フェーズ 2
  if (b.phase === 1 && b.hp < b.maxHp * 0.5) {
    b.phase = 2;
    b.inv = 70;
    b.cd = 40;
    G.bossPhase(b);
    return;
  }
  const dx = p.x - b.x, dz = p.z - b.z, adx = Math.abs(dx), adz = Math.abs(dz);
  b.facing = dx >= 0 ? 1 : -1;
  const pk = b.phase === 2 ? 0.7 : 1;
  if (b.cd <= 0 && p.state !== 'down' && p.state !== 'getup') {
    const cands = [];
    for (const k in b.moves) {
      const m = b.moves[k];
      if (!m.w || !m.range) continue;
      if (m.ph && b.phase < m.ph) continue;
      if (m.once && b.used[k]) continue;
      if (m.minHp && b.hp / b.maxHp > m.minHp) continue;
      if (adx < m.range[0] || adx > m.range[1]) continue;
      if (m.summon && G.enemies.length > 1) continue;
      cands.push([k, m.w]);
    }
    if (cands.length) {
      let r = Math.random() * cands.reduce((a, c) => a + c[1], 0);
      let key = cands[0][0];
      for (const [k, w] of cands) { if ((r -= w) <= 0) { key = k; break; } }
      const m = b.moves[key];
      if (!m.zTol || adz <= m.zTol) {
        if (m.once) b.used[key] = true;
        startMove(b, key);
        b.cd = rnd(36, 70) * pk;
        return;
      }
      b.wantZ = 40;
    }
  }
  // 位置取り：近づきすぎず離れすぎず、奥行きを合わせる
  const pref = b.bossId === 'roxy' || b.bossId === 'etoile' ? 70 : b.bossId === 'aurora' ? 90 : 46;
  const tx = p.x - Math.sign(dx || 1) * pref;
  const ddx = tx - b.x, ddz = p.z - b.z;
  const spd = b.spd * (b.phase === 2 ? 1.15 : 1);
  b.vx = Math.abs(ddx) > 6 ? clamp(ddx * 0.06, -spd, spd) : 0;
  b.vz = Math.abs(ddz) > 3 ? clamp(ddz * 0.06, -spd * 0.7, spd * 0.7) : 0;
  if (b.wantZ > 0) b.wantZ--;
  b.state = Math.abs(b.vx) + Math.abs(b.vz) > 0.15 ? 'walk' : 'idle';
}

// ---------- 飛び道具 ----------
function spawnProj(f, P) {
  const dir = f.facing;
  const base = {
    team: f.team, owner: f, x: f.x + dir * 16 * f.size, z: f.z, y: f.y + 36 * f.size,
    vx: 0, vz: 0, vy: 0, life: 120, kind: P.kind, atk: f.atk, facing: dir, hitSet: new Set(), t: 0, w: 7, h: 8, zr: 9,
  };
  const L = (o) => G.projs.push(Object.assign({}, base, o, { hitSet: new Set() }));
  switch (P.kind) {
    case 'penlight':
      L({ vx: dir * 3.4, y: f.y + 40, hit: { dmg: 6, kb: 'light', stun: 16, push: 1.5, stop: 4 }, col: f.look.propC || '#ff5fb0' });
      Sound.sfx('shot');
      break;
    case 'shockwave':
      for (const lane of P.lanes) L({ z: clamp(f.z + lane, 0, DEPTH), y: 0, vx: dir * 3.6, life: 150, w: 10, h: 24, zr: 9, hit: Object.assign({ dmg: 10 }, LAUNCH) });
      Sound.sfx('beam');
      break;
    case 'ampnote':
      for (const s of P.spread) L({ vx: dir * 3.3, vz: s, y: f.y + 38, life: 150, hit: Object.assign({ dmg: 9 }, LAUNCH, { lv: 3.5 }), col: pick(['#ff6fa8', '#39d3ff', '#ffe14a']) });
      Sound.sfx('note');
      break;
    case 'boomerang':
      L({ vx: dir * 5.4, y: f.y + 38, life: 160, ret: true, rehit: 30, w: 9, h: 10, hit: Object.assign({ dmg: 9 }, LAUNCH, { lh: 2 }) });
      Sound.sfx('whoosh');
      break;
    case 'rose':
      for (const s of P.spread) L({ vx: dir * 4, vz: s * 0.9, y: f.y + 40, life: 130, hit: { dmg: 8, kb: 'light', stun: 18, push: 1.5, stop: 4 } });
      Sound.sfx('shot');
      break;
    case 'bignote':
      L({ vx: dir * 4.6, y: f.y + 34, life: 100, pierce: 3, w: 12, h: 16, zr: 13, hit: Object.assign({ dmg: 13, juggle: true, sfx: 'hitS' }, LAUNCH, { lh: 3 }) });
      Sound.sfx('note');
      break;
    case 'crescent':
      L({ vx: dir * 3.9, y: 0, life: 80, multi: 8, w: 10, h: 66, zr: 18, hit: Object.assign({ dmg: 6, juggle: true, sfx: 'hitS', stop: 3 }, LAUNCH, { lv: 3.6, lh: 1.6 }) });
      Sound.sfx('beam');
      break;
    case 'rain':
      L({ x: f.x + dir * rnd(10, 40), y: f.y + 4, vx: dir * 1.4, vy: -3.4, life: 80, grav: true, w: 7, h: 8, zr: 12, hit: Object.assign({ dmg: 7, juggle: true, sfx: 'hitS' }, LAUNCH, { lv: 3.6, lh: 1.5 }), col: pick(['#ff6fa8', '#39d3ff', '#ffe14a', '#b07bff']) });
      Sound.sfx('note');
      break;
  }
}

function updateProjs() {
  const L = G.projs;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i];
    p.t++;
    if (p.ret) {
      p.vx -= p.facing * 0.13;
      if (p.t > 30 && p.owner && Math.abs(p.owner.x - p.x) < 12 && p.vx * p.facing < 0) p.life = 0;
      if (p.t > 30 && p.owner) p.vz = clamp((p.owner.z - p.z) * 0.05, -1, 1);
    }
    p.x += p.vx;
    p.z = clamp(p.z + p.vz, 0, DEPTH);
    if (p.grav) { p.vy -= 0.04; p.y += p.vy; if (p.y <= 0) { p.life = 0; FX.ring(p.x, FLOOR + p.z, 14, p.col || '#fff', 10); } }
    if (p.kind === 'shockwave' && p.t % 4 === 0) FX.dust(p.x, FLOOR + p.z, 1, 0);
    // 当たり
    for (const v of targetsOf(p.team)) {
      if (!hittable(v, p.hit)) continue;
      const last = p.hitSet.has(v) ? p['h' + v.id] : null;
      if (last != null && (!p.multi && !p.rehit || p.t - last < (p.multi || p.rehit))) continue;
      if (Math.abs(v.x - p.x) > p.w + v.w || Math.abs(v.z - p.z) > p.zr) continue;
      if (p.y + p.h < v.y || p.y - p.h * 0.3 > v.y + v.h) continue;
      p.hitSet.add(v);
      p['h' + v.id] = p.t;
      applyHit({ x: p.x - p.vx * 3, team: p.team, atk: p.atk, y: p.y, facing: p.facing }, v, p.hit);
      if (p.pierce != null) { if (--p.pierce <= 0) p.life = 0; }
      else if (!p.multi && !p.rehit) p.life = 0;
    }
    if (p.team === 'p') {
      for (const pr of G.props) {
        if (!pr.broken && !p.hitSet.has(pr) && Math.abs(pr.x - p.x) < p.w + 10 && Math.abs(pr.z - p.z) < p.zr && p.y < 30) { p.hitSet.add(pr); breakProp(pr); }
      }
    }
    if (--p.life <= 0 || p.x < G.camX - 60 || p.x > G.camX + W + 60) L.splice(i, 1);
  }
}

function drawProj(p) {
  const x = p.x - G.camX, y = FLOOR + p.z - p.y;
  ctx.save();
  switch (p.kind) {
    case 'penlight':
      ctx.translate(x, y);
      ctx.rotate(p.t * 0.4);
      ctx.strokeStyle = Fig.rgba(p.col, 0.35);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.strokeStyle = p.col; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      break;
    case 'shockwave':
      ctx.strokeStyle = '#ff9ac6';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.9 - i * 0.25;
        ctx.beginPath();
        ctx.ellipse(x - p.facing * i * 7, y - 10, 5 + i * 2, 14 - i * 2, 0, p.facing > 0 ? -1.2 : Math.PI - 1.2, p.facing > 0 ? 1.2 : Math.PI + 1.2);
        ctx.stroke();
      }
      break;
    case 'ampnote':
    case 'rain':
      Fig.noteGlyph(ctx, x, y, 8, p.col || '#ffe14a');
      break;
    case 'boomerang':
      ctx.translate(x, y);
      ctx.rotate(p.t * 0.5);
      for (let i = -3; i <= 3; i++) {
        ctx.fillStyle = i % 2 ? '#ff4fa3' : '#ffd43b';
        ctx.beginPath(); ctx.ellipse(Math.sin(i * 0.4) * 6, -Math.cos(i * 0.4) * 6, 2, 6, i * 0.4, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'rose':
      ctx.translate(x, y);
      ctx.rotate(p.facing > 0 ? 0 : Math.PI);
      ctx.strokeStyle = '#2a8a3a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(2, 0); ctx.stroke();
      ctx.fillStyle = '#e8204a';
      ctx.beginPath(); ctx.arc(4, 0, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6a8a';
      ctx.beginPath(); ctx.arc(4.6, -0.6, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'bignote': {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y - 4, 1, x, y - 4, 20);
      g.addColorStop(0, 'rgba(200,160,255,.8)');
      g.addColorStop(1, 'rgba(200,160,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 20, y - 24, 40, 40);
      ctx.globalCompositeOperation = 'source-over';
      Fig.noteGlyph(ctx, x, y, 13, '#ffffff');
      break;
    }
    case 'crescent': {
      ctx.globalAlpha = Math.min(1, p.life / 20);
      ctx.strokeStyle = '#c8a8ff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(x, y - 34, 12, 34, 0, p.facing > 0 ? -1.3 : Math.PI - 1.3, p.facing > 0 ? 1.3 : Math.PI + 1.3);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ---------- 床の危険地帯（オーロラ） ----------
function updateHazards() {
  const L = G.hazards;
  const p = G.player;
  for (let i = L.length - 1; i >= 0; i--) {
    const h = L[i];
    h.t++;
    if (h.kind === 'spot') {
      if (h.t === h.warn) {
        Sound.sfx('boom');
        G.shake = Math.max(G.shake, 5);
        FX.ring(h.x, FLOOR + h.z, h.r * 2.4, '#fff27a', 18);
        FX.starBurst(h.x, FLOOR + h.z - 10, '#fff27a', 5);
        if (p && Math.hypot(p.x - h.x, (p.z - h.z) * 2.2) < h.r + 6 && p.y < 30 && hittable(p, { juggle: true })) {
          applyHit({ x: h.x, team: 'e', atk: G.boss ? G.boss.atk : 1, y: 0 }, p, Object.assign({ dmg: 13, sfx: 'hitH' }, LAUNCH));
        }
      }
      if (h.t > h.warn + 14) L.splice(i, 1);
    } else if (h.kind === 'laser') {
      const k = h.t - h.warn;
      if (k === 0) Sound.sfx('laser');
      if (k >= 0) {
        h.z = (k / h.sweep) * DEPTH;
        if (h.dir < 0) h.z = DEPTH - h.z;
        if (p && !h.done && Math.abs(p.z - h.z) < 5 && p.y < 16 && hittable(p, { juggle: false })) {
          h.done = true;
          applyHit({ x: p.x - p.facing, team: 'e', atk: G.boss ? G.boss.atk : 1, y: 0 }, p, Object.assign({ dmg: 12, sfx: 'hitH' }, LAUNCH));
        }
      }
      if (k > h.sweep) L.splice(i, 1);
    } else if (h.kind === 'marker') {
      if (h.t > h.life) L.splice(i, 1);
    }
  }
}

function drawHazard(h) {
  const x = h.x - G.camX;
  ctx.save();
  if (h.kind === 'spot') {
    const y = FLOOR + h.z;
    if (h.t < 0) { ctx.restore(); return; }
    if (h.t < h.warn) {
      const k = Math.max(0.02, h.t / h.warn);
      ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(h.t * 0.3));
      ctx.fillStyle = '#fff27a';
      ctx.beginPath(); ctx.ellipse(x, y, h.r * k, h.r * k * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, h.r, h.r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      // 天井からの細い光
      ctx.globalAlpha = 0.15 + k * 0.2;
      ctx.fillStyle = '#fff6c0';
      ctx.beginPath(); ctx.moveTo(x - 3, 0); ctx.lineTo(x + 3, 0); ctx.lineTo(x + h.r * k, y); ctx.lineTo(x - h.r * k, y); ctx.fill();
    } else {
      const k = (h.t - h.warn) / 14;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#fff6c0';
      ctx.beginPath(); ctx.moveTo(x - h.r * 0.8, 0); ctx.lineTo(x + h.r * 0.8, 0); ctx.lineTo(x + h.r * 1.2, y); ctx.lineTo(x - h.r * 1.2, y); ctx.fill();
    }
  } else if (h.kind === 'laser') {
    const k = h.t - h.warn;
    if (k < 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(h.t * 0.4));
      txt('JUMP!', W / 2, FLOOR - 14, { size: 14, color: '#ff4f7a', align: 'center', font: DFONT, w: 400 });
      ctx.fillStyle = 'rgba(255,60,100,.35)';
      const y = FLOOR + (h.dir < 0 ? DEPTH : 0);
      ctx.fillRect(0, y - 2, W, 4);
    } else {
      const y = FLOOR + h.z;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,40,90,.35)';
      ctx.fillRect(0, y - 5, W, 10);
      ctx.fillStyle = '#ff6f9a';
      ctx.fillRect(0, y - 1.5, W, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, y - 0.5, W, 1);
    }
  } else if (h.kind === 'marker') {
    const y = FLOOR + h.z;
    const k = h.t / h.life;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ff4f7a';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, 26 - k * 10, (26 - k * 10) * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,60,100,.25)';
    ctx.fill();
  }
  ctx.restore();
}

// ---------- 超必殺技 ----------
function ultUpdate(u) {
  u.t++;
  const p = G.player;
  const foes = targetsOf('p').filter(e => e.x > G.camX - 10 && e.x < G.camX + W + 10);
  const hitAll = (dmg, launch, lv) => {
    for (const e of foes) {
      if (e.state === 'dead' || e.state === 'enter') continue;
      const h = launch ? Object.assign({ dmg, juggle: true, sfx: 'hitS', stop: 3 }, LAUNCH, { lv: lv || 4.5, lh: (e.x > p.x ? 1 : -1) * 0 + 2 })
        : { dmg, kb: 'light', stun: 30, push: 0, juggle: true, sfx: 'hitS', stop: 2 };
      if (e.state === 'fall' || e.state === 'thrown' || e.state === 'down' || e.state === 'getup') {
        e.inv = 0;
        if (e.state === 'down' || e.state === 'getup') e.setState('fall'), e.vy = 2, e.y = 1;
      }
      applyHit({ x: p.x, team: 'p', atk: p.atk, y: 0, ult: true }, e, h);
    }
    for (const pr of G.props) if (!pr.broken && pr.x > G.camX && pr.x < G.camX + W) breakProp(pr);
  };
  const cx = p.x;
  switch (u.kind) {
    case 'starburst':
      if ([12, 26, 40].includes(u.t)) hitAll(13, false);
      if (u.t === 56) { hitAll(16, true, 5.5); G.shake = 12; Sound.sfx('boom'); }
      if (u.t % 3 === 0) FX.starBurst(cx + rnd(-W / 2, W / 2), rnd(40, 230), pick(['#ffe14a', '#ff6fa8', '#ffffff']), 2);
      break;
    case 'hurricane':
      u.hx = cx + Math.sin(u.t * 0.05) * W * 0.42;
      if (u.t % 7 === 0) {
        for (const e of foes) if (Math.abs(e.x - u.hx) < 60 && e.state !== 'dead') applyHit({ x: u.hx, team: 'p', atk: p.atk, y: 0, ult: true }, e, Object.assign({ dmg: 5, juggle: true, sfx: 'hitS', stop: 2 }, LAUNCH, { lv: 3.2, lh: 0.3 }));
      }
      if (u.t === 84) hitAll(10, true, 5.5);
      break;
    case 'explosion':
      if (u.t === 24) { hitAll(28, true, 6); G.shake = 18; Sound.sfx('boom'); G.flashT = 10; }
      if (u.t === 44) { hitAll(22, true, 4); G.shake = 10; Sound.sfx('boom'); }
      break;
    case 'aria':
      if (u.t % 12 === 0 && u.t <= 72) { hitAll(9, u.t === 72, 5); FX.notes(cx, FLOOR + p.z - 50, 4); Sound.sfx('note'); }
      break;
    case 'blossom':
      if (u.t % 10 === 0 && u.t <= 70) { hitAll(8, u.t === 70, 5.5); FX.petals(cx + rnd(-W / 2, W / 2), rnd(60, 220), 10); }
      break;
  }
  return u.t < u.dur;
}

function ultDraw(u) {
  const p = G.player;
  const x = p.x - G.camX, y = FLOOR + p.z - 36;
  const k = u.t / u.dur;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  switch (u.kind) {
    case 'starburst': {
      const r = 30 + u.t * 6;
      ctx.globalAlpha = Math.max(0, 1 - k);
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6 + u.t * 0.02;
        ctx.fillStyle = i % 2 ? 'rgba(255,230,120,.35)' : 'rgba(255,120,200,.3)';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a - 0.08) * 600, y + Math.sin(a - 0.08) * 600); ctx.lineTo(x + Math.cos(a + 0.08) * 600, y + Math.sin(a + 0.08) * 600); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,240,170,.8)';
      Fig.starPath(ctx, x, y, r * 0.4, r * 0.17, 5, u.t * 0.05);
      ctx.fill();
      break;
    }
    case 'hurricane': {
      const hx = (u.hx || p.x) - G.camX;
      ctx.globalAlpha = Math.min(1, (1 - k) * 3);
      for (let i = 0; i < 9; i++) {
        const yy = FLOOR + 70 - i * 22, w = 14 + i * 6;
        ctx.strokeStyle = i % 2 ? 'rgba(120,210,255,.7)' : 'rgba(255,255,255,.6)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(hx + Math.sin(u.t * 0.3 + i) * 6, yy, w, w * 0.3, 0, (u.t * 0.4 + i) % 6, (u.t * 0.4 + i) % 6 + 4); ctx.stroke();
      }
      break;
    }
    case 'explosion': {
      if (u.t >= 24) {
        const kk = (u.t - 24) / (u.dur - 24);
        const r = 40 + kk * 300;
        const g = ctx.createRadialGradient(W / 2, y, r * 0.2, W / 2, y, r);
        g.addColorStop(0, `rgba(255,255,220,${1 - kk})`);
        g.addColorStop(0.5, `rgba(255,160,40,${0.8 * (1 - kk)})`);
        g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = 'rgba(255,200,80,.6)';
        ctx.beginPath(); ctx.arc(W / 2, y, 6 + u.t, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'aria':
      for (let i = 0; i < 6; i++) {
        const rt = u.t - i * 12;
        if (rt < 0 || rt > 40) continue;
        ctx.globalAlpha = 1 - rt / 40;
        ctx.strokeStyle = i % 2 ? '#c8a8ff' : '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(x, y, rt * 9, rt * 5, 0, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    case 'blossom': {
      const r = Math.min(80, u.t * 3) * (k > 0.8 ? (1 - k) * 5 : 1);
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + u.t * 0.03;
        ctx.fillStyle = i % 2 ? 'rgba(255,170,210,.6)' : 'rgba(255,220,235,.6)';
        ctx.beginPath(); ctx.ellipse(W / 2 + Math.cos(a) * r * 0.6, y - 30 + Math.sin(a) * r * 0.6, r * 0.55, r * 0.25, a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,230,120,.8)';
      ctx.beginPath(); ctx.arc(W / 2, y - 30, r * 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ---------- 描画用の姿勢 ----------
function poseOf(f) {
  const t = f.t / 60;
  const P = Fig.POSES;
  let pose, sx = 1;
  switch (f.state) {
    case 'idle': pose = f.kind === 'boss' && f.def ? Fig.lerp(Fig.idle(t), P.taunt, 0.15) : Fig.idle(t); break;
    case 'walk': case 'enter': pose = Fig.walk(f.walkPh); break;
    case 'run': pose = Fig.run(f.walkPh); break;
    case 'jump': pose = f.vy > 0 ? P.jump : P.jumpDown; break;
    case 'land': pose = Fig.lerp(P.crouch, P.stand, Math.min(1, f.st / Math.max(4, f.landLag || 4))); break;
    case 'hurt': pose = P.hurt; break;
    case 'grabbed': pose = Fig.lerp(P.hurt, P.stand, 0.3); break;
    case 'fall': case 'thrown': {
      pose = Object.assign({}, P.fall);
      if (f.state === 'thrown') pose.rot = -f.st * 0.22;
      break;
    }
    case 'down': case 'dead': pose = P.down; break;
    case 'getup': pose = f.st < 9 ? Fig.lerp(P.down, P.crouch, f.st / 9) : Fig.lerp(P.crouch, P.stand, (f.st - 9) / 9); break;
    case 'grab': pose = P.grab; break;
    case 'victory': pose = Object.assign({}, P.victory, { by: -Math.abs(Math.sin(t * 5)) * 3 }); break;
    case 'cheer': pose = Object.assign({}, P.cheer, { by: -Math.abs(Math.sin(t * 6)) * 3 }); break;
    case 'freed': pose = Fig.lerp(P.crouch, P.wave, Math.min(1, f.st / 20)); pose.face = 'happy'; break;
    case 'taunt': pose = P.taunt; break;
    case 'attack': {
      const m = f.move;
      if (!m) { pose = P.stand; break; }
      const mf = f.mf, a0 = m.st, a1 = m.st + m.ac;
      let strike;
      if (m.poseAlt) strike = P[m.poseAlt[Math.floor(mf / 4) % m.poseAlt.length]];
      else strike = P[m.pose] || P.stand;
      const wind = P[(m.poseAlt ? m.poseAlt[0] : m.pose) + 'W'] || Fig.lerp(P.stand, strike, 0.25);
      if (mf <= a0) pose = Fig.lerp(f.air ? P.jump : P.stand, wind, Math.min(1, mf / Math.max(1, a0)));
      else if (mf <= a1 || m.air) pose = strike;
      else pose = Fig.lerp(strike, P.stand, Math.min(1, (mf - a1) / Math.max(1, m.rc)));
      if (m.spin && mf > a0 && mf <= a1) sx = Math.cos((mf - a0) * 0.45 * m.spin);
      if (m.roll && mf > a0) { pose = Object.assign({}, pose, { rot: (mf - a0) * m.roll * (m.roll < 0 ? 1 : 1) }); }
      if (f.kind === 'boss' && mf <= a0 && m.warn) pose = Object.assign({}, pose, { face: 'evil' });
      break;
    }
    default: pose = P.stand;
  }
  return [pose, sx];
}
