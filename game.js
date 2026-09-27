'use strict';

// ---------- 画面設定 ----------
// 低解像度で描いてから 1bit ディザをかけ、CSS で拡大表示する
const W = 108;
let H = 234;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const INK = [242, 239, 230];
const BG = [11, 11, 13];

// 4x4 ベイヤー行列（ディザのしきい値）
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

let lumBuf = new Float32Array(W * H);
function resize() {
  const aspect = window.innerHeight / window.innerWidth;
  H = Math.max(160, Math.min(260, Math.round(W * aspect)));
  canvas.width = W;
  canvas.height = H;
  lumBuf = new Float32Array(W * H);
}
window.addEventListener('resize', resize);
resize();

// ---------- 定数 ----------
const RUN = 9;    // 1段ごとの横移動量
const RISE = 7;   // 1段ごとの高さ
const STEP_W = 12;
const HOP_TIME = 0.09;

// リズム判定（秒）
const GREAT_WINDOW = 0.07;
const GOOD_WINDOW = 0.13;
const FEVER_AT = 20;

// ---------- スプライト ----------
const HERO = [
  '..###..',
  '.#####.',
  '.##.#..',
  '..###..',
  '.#####.',
  '#.###.#',
  '..###..',
  '..#.#..',
  '.##.##.',
];
const HERO_STEP = [
  '..###..',
  '.#####.',
  '.##.#..',
  '..###..',
  '#.###..',
  '.#####.',
  '..###.#',
  '.#...#.',
  '##....#',
];
const GHOST = [
  '..####..',
  '.######.',
  '########',
  '##.##.##',
  '########',
  '########',
  '########',
  '#.##.##.',
  '...#..#.',
];

function drawSprite(sprite, x, y, flip, lum, outline) {
  const h = sprite.length, w = sprite[0].length;
  x = Math.round(x); y = Math.round(y);
  if (outline) {
    ctx.fillStyle = gray(0);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      if (sprite[r][flip ? w - 1 - c : c] === '#') ctx.fillRect(x + c - 1, y + r - 1, 3, 3);
    }
  }
  ctx.fillStyle = lum === 1 ? `rgb(${INK.join(',')})` : gray(lum);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    if (sprite[r][flip ? w - 1 - c : c] === '#') ctx.fillRect(x + c, y + r, 1, 1);
  }
}

function gray(l) {
  const v = Math.round(Math.max(0, Math.min(1, l)) * 255);
  return `rgb(${v},${v},${v})`;
}

// ---------- 乱数・ノイズ ----------
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// プリズム用の虹色テーブル（パステル寄り）
const PRISM = [];
for (let i = 0; i < 256; i++) {
  const h = i / 256 * 6;
  const k = n => {
    const v = Math.max(0, Math.min(1, Math.abs(((h + n) % 6) - 3) - 1));
    return Math.round(255 * (0.45 + 0.55 * v));
  };
  PRISM.push([k(0), k(4), k(2)]);
}
const CONFETTI_COLORS = ['#ff3b6b', '#ffd23b', '#3bffb0', '#3bb8ff', '#b43bff', '#ffffff', '#ff8a3b'];

// ---------- 状態 ----------
let state = 'title'; // title | play | dead
let steps, player, cam, energy, score, ghosts, particles, deadTimer, time, started;
let combo, maxCombo, fever, lastHitBeat, lastHitTime;
let confetti = [];
let shake = 0, zoom = 0, flash = 0, dark = 0, beatPulse = 0, prevBeat = null, cannonSide = 1;
let best = 0;
try { best = Number(localStorage.getItem('endless-stair-best')) || 0; } catch (e) { /* ストレージ不可でも遊べる */ }

function genStep() {
  const prev = steps[steps.length - 1];
  let dir = prev.dir;
  const runLen = prev.run;
  if (runLen >= 2 && (Math.random() < 0.38 || runLen >= 6)) dir = -dir;
  steps.push({
    x: prev.x + dir * RUN,
    y: prev.y - RISE,
    dir,
    run: dir === prev.dir ? runLen + 1 : 1,
  });
}

function reset() {
  steps = [{ x: 0, y: 0, dir: 1, run: 3 }];
  // 最初の数段はまっすぐ
  for (let i = 0; i < 3; i++) steps.push({ x: (i + 1) * RUN, y: -(i + 1) * RISE, dir: 1, run: 3 + i });
  while (steps.length < 80) genStep();
  player = { idx: 0, x: 0, y: 0, fx: 0, fy: 0, t: 1, dir: 1, frame: 0, vx: 0, vy: 0, falling: false };
  cam = { x: 0, y: 0 };
  energy = 1;
  score = 0;
  ghosts = [];
  particles = [];
  confetti = [];
  deadTimer = 0;
  started = false;
  combo = 0;
  maxCombo = 0;
  fever = false;
  lastHitBeat = -1;
  lastHitTime = 0;
  document.body.classList.remove('fever');
  updateHud();
}

// ---------- 入力 ----------
function onPress(side) {
  if (!Music.ready) Music.init();
  Music.start();
  if (state === 'title') {
    state = 'play';
    document.getElementById('title').hidden = true;
    return;
  }
  if (state === 'dead') {
    if (deadTimer > 0.6) {
      reset();
      state = 'play';
      Music.setMuffled(false);
      document.getElementById('over').hidden = true;
    }
    return;
  }
  climb(side);
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  onPress(e.clientX < window.innerWidth / 2 ? -1 : 1);
});
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.key === 'ArrowLeft' || e.key === 'a') onPress(-1);
  else if (e.key === 'ArrowRight' || e.key === 'd') onPress(1);
  else if (e.key === ' ' || e.key === 'Enter') onPress(player ? player.dir : 1);
});
document.addEventListener('gesturestart', e => e.preventDefault());

function judgeTap() {
  const b = Music.nearestBeat();
  if (!b) return { kind: 'good', beat: null };
  const off = Math.abs(b.offset);
  // 同じ拍に2回タップしたら2回目はリズム外れ
  if (b.index === lastHitBeat) return { kind: 'off', beat: b };
  if (off <= GREAT_WINDOW) return { kind: 'great', beat: b };
  if (off <= GOOD_WINDOW) return { kind: 'good', beat: b };
  return { kind: 'off', beat: b };
}

function climb(side) {
  if (player.falling) return;
  // 前のホップ中なら着地させてから次へ
  if (player.t < 1) { player.t = 1; player.x = steps[player.idx].x; player.y = steps[player.idx].y; }

  const next = steps[player.idx + 1];
  player.dir = side;
  player.fx = player.x; player.fy = player.y;
  player.t = 0;
  player.frame ^= 1;

  if (next.dir !== side) {
    // 段のない方へ踏み出した → 落下
    fall(side);
    return;
  }

  const j = judgeTap();
  started = true;
  player.idx++;
  score = player.idx;
  while (steps.length < player.idx + 60) genStep();
  dust(next.x, next.y);

  if (j.kind === 'off') {
    energy = Math.min(1, energy + 0.05);
    Music.sfx('off');
    breakCombo('OFF BEAT');
  } else {
    energy = Math.min(1, energy + (j.kind === 'great' ? 0.12 : 0.09));
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    if (j.beat) { lastHitBeat = j.beat.index; lastHitTime = j.beat.time; }
    Music.sfx(j.kind, combo);
    showJudge(j.kind === 'great' ? 'GREAT' : 'GOOD', j.kind);
    shake += fever ? 1.5 : 0.6;
    if (combo === FEVER_AT) enterFever();
  }
  updateHud();
}

function enterFever() {
  fever = true;
  flash = 1;
  shake += 10;
  zoom = 1;
  document.body.classList.add('fever');
  showBanner('FEVER!!');
  Music.setFever(true);
  burstConfetti(60);
  try { navigator.vibrate && navigator.vibrate([30, 40, 60]); } catch (e) { /* 非対応端末 */ }
}

function breakCombo(label) {
  const wasFever = fever;
  if (combo > 0 || wasFever) showJudge(label, 'miss');
  combo = 0;
  lastHitBeat = -1;
  if (wasFever) {
    // 一気に通常モードへ戻す
    fever = false;
    confetti = [];
    dark = 1;
    shake += 6;
    zoom = 0;
    document.body.classList.remove('fever');
    showBanner('BREAK', true);
    Music.setFever(false);
    try { navigator.vibrate && navigator.vibrate(80); } catch (e) { /* 非対応端末 */ }
  }
  updateHud();
}

function fall(side) {
  player.falling = true;
  player.vx = side * 28;
  player.vy = -60;
  player.t = 1;
  state = 'dead';
  deadTimer = 0;
  if (combo > 0 || fever) breakCombo('FALL');
  Music.sfx('fall');
  Music.setMuffled(true);
  shake += 5;
  try { navigator.vibrate && navigator.vibrate(120); } catch (e) { /* 非対応端末 */ }
  if (score > best) {
    best = score;
    try { localStorage.setItem('endless-stair-best', String(best)); } catch (e) { /* 無視 */ }
  }
  document.getElementById('finalScore').textContent = score;
  document.getElementById('finalCombo').textContent = maxCombo;
  document.getElementById('bestScore').textContent = best;
}

// ---------- HUD ----------
const flagEl = document.getElementById('flag');
const energyEl = document.querySelector('#energy > i');
const comboEl = document.getElementById('combo');
const comboNumEl = comboEl.querySelector('b');
const judgeEl = document.getElementById('judge');
const bannerEl = document.getElementById('banner');

function updateHud() {
  flagEl.textContent = score;
  comboNumEl.textContent = combo;
  comboEl.hidden = combo < 2;
  retrigger(comboEl, 'bump');
}

function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function showJudge(text, kind) {
  judgeEl.textContent = text;
  judgeEl.dataset.kind = kind;
  retrigger(judgeEl, 'pop');
}

function showBanner(text, down) {
  bannerEl.textContent = text;
  bannerEl.dataset.kind = down ? 'down' : 'up';
  retrigger(bannerEl, 'show');
}

// ---------- パーティクル・背景オブジェクト ----------
function dust(x, y) {
  for (let i = 0; i < 4; i++) {
    particles.push({ x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 20, vy: -Math.random() * 15, life: 0.4 });
  }
}

// 紙吹雪は画面座標（ディザの後に色付きで描く）
function burstConfetti(n) {
  for (let i = 0; i < n; i++) {
    const fromLeft = Math.random() < 0.5;
    confetti.push(makeConfetti(fromLeft ? -2 : W + 2, H * (0.55 + Math.random() * 0.4), fromLeft ? 1 : -1));
  }
}

function makeConfetti(x, y, dir) {
  const speed = 60 + Math.random() * 70;
  const ang = (-Math.PI / 2) + dir * (0.25 + Math.random() * 0.6);
  return {
    x, y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    life: 1.6 + Math.random() * 0.8,
    phase: Math.random() * 6.28,
    spin: 8 + Math.random() * 10,
    color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
  };
}

// 拍ごとに左右交互の「キャノン」＋上から少し降らせる
function beatConfetti() {
  const level = Math.floor(combo / FEVER_AT);
  const n = Math.min(30, 10 + level * 4);
  cannonSide = -cannonSide;
  const x = cannonSide < 0 ? -2 : W + 2;
  for (let i = 0; i < n; i++) confetti.push(makeConfetti(x, H * (0.7 + Math.random() * 0.25), -cannonSide));
  for (let i = 0; i < 4; i++) {
    confetti.push({
      x: Math.random() * W, y: -3, vx: (Math.random() - 0.5) * 20, vy: 10 + Math.random() * 20,
      life: 3, phase: Math.random() * 6.28, spin: 8, color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
    });
  }
}

function spawnGhost() {
  const side = Math.random() < 0.5 ? -1 : 1;
  ghosts.push({
    x: cam.x + side * (W / 2 + 10),
    y: cam.y - 40 - Math.random() * 60,
    vx: -side * (6 + Math.random() * 8),
    phase: Math.random() * 6.28,
  });
}

// ---------- 更新 ----------
function onBeat() {
  beatPulse = 1;
  if (fever) {
    const level = Math.floor(combo / FEVER_AT);
    shake += 2.5 + level * 1.2;
    zoom = 1;
    beatConfetti();
  }
}

function update(dt) {
  time += dt;

  // 拍の検出
  if (Music.ready) {
    const lb = Music.lastBeatTime();
    if (lb !== null && lb !== prevBeat) {
      prevBeat = lb;
      onBeat();
    }
  }

  if (state === 'play' && started) {
    const drain = (0.07 + Math.min(0.05, score * 0.0003)) * (Music.BPM / 60);
    energy -= drain * dt;
    if (energy <= 0) {
      energy = 0;
      fall(player.dir);
    }
    // 次の拍を叩かずにやり過ごしたらコンボ切れ
    if (combo > 0 && Music.now() > lastHitTime + Music.BEAT + GOOD_WINDOW + 0.02) breakCombo('MISS');
  }
  energyEl.style.width = `${Math.max(0, energy) * 100}%`;

  if (state === 'dead') deadTimer += dt;
  if (state === 'dead' && deadTimer > 0.7) document.getElementById('over').hidden = false;

  // プレイヤー
  if (player.falling) {
    player.vy += 260 * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
  } else if (player.t < 1) {
    player.t = Math.min(1, player.t + dt / HOP_TIME);
    const s = steps[player.idx];
    player.x = player.fx + (s.x - player.fx) * player.t;
    player.y = player.fy + (s.y - player.fy) * player.t - Math.sin(Math.PI * player.t) * 3;
  }

  // カメラ（落下中は追わない）
  if (!player.falling) {
    const k = 1 - Math.exp(-10 * dt);
    cam.x += (player.x - cam.x) * k;
    cam.y += (player.y - cam.y) * k;
  }

  // 幽霊
  if (Math.random() < dt * 0.25 && ghosts.length < 3) spawnGhost();
  for (const g of ghosts) {
    g.x += g.vx * dt;
    g.phase += dt * 2;
  }
  ghosts = ghosts.filter(g => Math.abs(g.x - cam.x) < W && g.y - cam.y < H);

  for (const p of particles) {
    p.vy += 60 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);

  for (const c of confetti) {
    c.vy += 70 * dt;
    c.vx *= Math.exp(-1.6 * dt);
    c.vy *= Math.exp(-1.2 * dt);
    c.x += (c.vx + Math.sin(c.phase) * 8) * dt;
    c.y += c.vy * dt;
    c.phase += c.spin * dt;
    c.life -= dt;
  }
  confetti = confetti.filter(c => c.life > 0 && c.y < H + 4);

  // 演出の減衰
  shake *= Math.exp(-10 * dt);
  zoom *= Math.exp(-8 * dt);
  flash *= Math.exp(-5 * dt);
  dark *= Math.exp(-6 * dt);
  beatPulse *= Math.exp(-9 * dt);

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const amp = reduce ? 0 : Math.min(shake, 24);
  const sx0 = (Math.random() - 0.5) * amp;
  const sy0 = (Math.random() - 0.5) * amp;
  const sc = 1 + (reduce ? 0 : zoom * 0.035);
  const rot = fever && !reduce ? (Math.random() - 0.5) * amp * 0.15 : 0;
  canvas.style.transform = `translate(${sx0.toFixed(1)}px, ${sy0.toFixed(1)}px) scale(${sc.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
}

// ---------- 描画 ----------
const ANCHOR_Y = 0.64; // プレイヤーを画面のどの高さに置くか
function sx(x, par = 1) { return Math.round((x - cam.x) * par + W / 2); }
function sy(y, par = 1) { return Math.round((y - cam.y) * par + H * ANCHOR_Y); }

function drawBackground() {
  ctx.fillStyle = gray(0);
  ctx.fillRect(0, 0, W, H);

  // うっすら見える石壁（視差 0.4）
  const par = 0.4;
  const ox = cam.x * par, oy = cam.y * par;
  const bw = 10, bh = 5;
  const c0 = Math.floor(ox / bw) - 1, r0 = Math.floor(oy / bh) - 1;
  const wallLum = fever ? 0.05 : 0.03;
  for (let r = r0; r < r0 + H / bh + 3; r++) {
    const shift = (r & 1) * bw / 2;
    for (let c = c0; c < c0 + W / bw + 3; c++) {
      const n = hash(c, r);
      if (n < 0.25) continue;
      const x = Math.round(c * bw + shift - ox);
      const y = Math.round(r * bh - oy);
      const vign = 1 - Math.abs(x - W / 2) / (W * 0.75);
      ctx.fillStyle = gray((wallLum + n * 0.09) * vign);
      ctx.fillRect(x, y, bw - 1, bh - 1);
    }
  }

  // 遠くの扉（視差 0.6）— 一定間隔ごとに現れる
  const dpar = 0.6;
  const dStart = Math.floor((cam.y * dpar - H) / 70);
  for (let k = dStart; k < dStart + 4; k++) {
    if (hash(k, 99) < 0.45) continue;
    const side = hash(k, 7) < 0.5 ? -1 : 1;
    const x = W / 2 + side * (28 + hash(k, 3) * 12) - 7;
    const y = k * 70 - cam.y * dpar + H * ANCHOR_Y;
    ctx.fillStyle = gray(0.55);
    ctx.fillRect(Math.round(x), Math.round(y + 4), 14, 18);
    ctx.beginPath();
    ctx.arc(Math.round(x) + 7, Math.round(y) + 5, 7, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = gray(0.85);
    ctx.fillRect(Math.round(x) + 10, Math.round(y) + 13, 1, 2);
  }
}

function fadeFor(i) {
  const d = i - player.idx;
  if (d > 6) return Math.max(0.15, 1 - (d - 6) / 16);
  if (d < -6) return Math.max(0.15, 1 + (d + 6) / 10);
  return 1;
}

function drawStairs() {
  const from = Math.max(0, player.idx - 18);
  const to = Math.min(steps.length - 1, player.idx + 28);

  // 手すり（段の外側をつなぐ線）
  ctx.lineWidth = 1;
  for (let i = to; i > from; i--) {
    const a = steps[i - 1], b = steps[i];
    const f = fadeFor(i);
    ctx.strokeStyle = gray(0.8 * f);
    const edge = -b.dir * (STEP_W / 2 - 1);
    ctx.beginPath();
    ctx.moveTo(sx(a.x - a.dir * (STEP_W / 2 - 1)) + 0.5, sy(a.y) - 6.5);
    ctx.lineTo(sx(b.x + edge) + 0.5, sy(b.y) - 6.5);
    ctx.stroke();
  }

  for (let i = to; i >= from; i--) {
    const s = steps[i];
    const f = fadeFor(i);
    const x = sx(s.x) - STEP_W / 2;
    const y = sy(s.y);
    if (y < -20 || y > H + 40) continue;

    // 下の支柱（ドットの塊になる）
    ctx.fillStyle = gray(0.2 * f);
    ctx.fillRect(x + 1, y + 7, STEP_W - 2, 18);
    ctx.fillStyle = gray(0.1 * f);
    ctx.fillRect(x + 2, y + 25, STEP_W - 4, 16);
    // 蹴込み
    ctx.fillStyle = gray(0.55 * f);
    ctx.fillRect(x, y + 2, STEP_W, 5);
    // 踏み面
    ctx.fillStyle = gray(0.97 * f);
    ctx.fillRect(x, y, STEP_W, 2);
    // 手すりの支柱
    ctx.fillStyle = gray(0.8 * f);
    const px = s.dir > 0 ? x + 1 : x + STEP_W - 2;
    ctx.fillRect(px, y - 6, 1, 6);
  }
}

function drawGhosts() {
  for (const g of ghosts) {
    ctx.globalAlpha = 0.75;
    drawSprite(GHOST, sx(g.x) - 4, sy(g.y) + Math.sin(g.phase) * 2, g.vx < 0, 0.95, false);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer() {
  const sprite = player.t < 1 || player.frame ? HERO_STEP : HERO;
  drawSprite(sprite, sx(player.x) - 3, sy(player.y) - 9, player.dir < 0, 1, true);
}

function drawParticles() {
  ctx.fillStyle = gray(0.9);
  for (const p of particles) ctx.fillRect(sx(p.x), sy(p.y), 1, 1);
}

// 画面下のビートガイド：左右から寄ってくる線が中央で重なった瞬間が拍
function drawBeatGuide() {
  if (!Music.ready || state === 'title') return;
  const y = H - 28;
  const cx = W / 2;
  const lb = Music.lastBeatTime();
  if (lb === null) return;
  const now = Music.now();
  ctx.fillStyle = gray(0.35 + beatPulse * 0.65);
  ctx.fillRect(cx - 2, y - 2, 5, 5);
  ctx.fillStyle = gray(1);
  ctx.fillRect(cx - 1, y - 1, 3, 3);
  for (let k = 1; k <= 3; k++) {
    const dt = lb + k * Music.BEAT - now;
    const d = Math.round(dt / Music.BEAT * 16) + 4;
    const lum = 0.9 - (k - 1) * 0.25;
    ctx.fillStyle = gray(lum);
    ctx.fillRect(cx - d - 1, y - 2, 1, 5);
    ctx.fillRect(cx + d + 1, y - 2, 1, 5);
  }
}

function dither() {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const lift = beatPulse * 0.06 + flash * 0.9;
  const keep = 1 - dark * 0.75;
  for (let i = 0, n = W * H; i < n; i++) lumBuf[i] = (d[i * 4] / 255) * keep + lift;

  const hueShift = (time * 220) | 0;
  for (let y = 0; y < H; y++) {
    const row = (y & 3) * 4;
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const i = p * 4;
      const th = BAYER[row + (x & 3)];
      let c;
      if (lumBuf[p] > th) {
        c = fever ? PRISM[(x * 3 + y * 2 + hueShift) & 255] : INK;
      } else if (fever && x > 1 && lumBuf[p - 2] > th) {
        c = [150, 30, 120]; // 色ずれ（赤紫）
      } else if (fever && x < W - 2 && lumBuf[p + 2] > th) {
        c = [20, 110, 160]; // 色ずれ（シアン）
      } else {
        c = BG;
      }
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawConfetti() {
  for (const c of confetti) {
    ctx.fillStyle = c.color;
    const flat = Math.sin(c.phase) > 0;
    ctx.fillRect(Math.round(c.x), Math.round(c.y), flat ? 2 : 1, flat ? 1 : 2);
  }
}

function render() {
  ctx.globalAlpha = 1;
  drawBackground();
  drawGhosts();
  drawStairs();
  drawParticles();
  drawBeatGuide();
  dither();
  // 主人公はディザ・プリズムの影響を受けないよう後から描く
  drawPlayer();
  drawConfetti();
}

// ---------- ループ ----------
let last = performance.now();
time = 0;
reset();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
