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

function resize() {
  const aspect = window.innerHeight / window.innerWidth;
  H = Math.max(160, Math.min(260, Math.round(W * aspect)));
  canvas.width = W;
  canvas.height = H;
}
window.addEventListener('resize', resize);
resize();

// ---------- 定数 ----------
const RUN = 9;    // 1段ごとの横移動量
const RISE = 7;   // 1段ごとの高さ
const STEP_W = 12;
const HOP_TIME = 0.09;

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
  ctx.fillStyle = gray(lum);
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

// ---------- 状態 ----------
let state = 'title'; // title | play | dead
let steps, player, cam, energy, score, ghosts, particles, deadTimer, time, started;
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
  deadTimer = 0;
  started = false;
  updateHud();
}

// ---------- 入力 ----------
function onPress(side) {
  initAudio();
  if (state === 'title') {
    state = 'play';
    document.getElementById('title').hidden = true;
    return;
  }
  if (state === 'dead') {
    if (deadTimer > 0.6) {
      reset();
      state = 'play';
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
  started = true;
  player.idx++;
  score = player.idx;
  energy = Math.min(1, energy + 0.11);
  while (steps.length < player.idx + 60) genStep();
  dust(next.x, next.y);
  blip(score);
  updateHud();
}

function fall(side) {
  player.falling = true;
  player.vx = side * 28;
  player.vy = -60;
  player.t = 1;
  state = 'dead';
  deadTimer = 0;
  thud();
  try { navigator.vibrate && navigator.vibrate(120); } catch (e) { /* 非対応端末 */ }
  if (score > best) {
    best = score;
    try { localStorage.setItem('endless-stair-best', String(best)); } catch (e) { /* 無視 */ }
  }
  document.getElementById('finalScore').textContent = score;
  document.getElementById('bestScore').textContent = best;
}

// ---------- HUD ----------
const flagEl = document.getElementById('flag');
const energyEl = document.querySelector('#energy > i');
function updateHud() {
  flagEl.textContent = score;
}

// ---------- 音 ----------
let audio = null;
function initAudio() {
  if (audio) return;
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
}
function tone(freq, dur, type, vol, slide) {
  if (!audio) return;
  const t = audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + dur);
}
const SCALE = [0, 2, 4, 7, 9, 12, 9, 7];
function blip(n) {
  tone(330 * Math.pow(2, SCALE[n % SCALE.length] / 12), 0.07, 'square', 0.05);
}
function thud() {
  tone(220, 0.5, 'triangle', 0.15, 50);
}

// ---------- パーティクル・背景オブジェクト ----------
function dust(x, y) {
  for (let i = 0; i < 4; i++) {
    particles.push({ x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 20, vy: -Math.random() * 15, life: 0.4 });
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
function update(dt) {
  time += dt;

  if (state === 'play' && started) {
    const drain = Math.min(0.9, 0.22 + score * 0.0025);
    energy -= drain * dt;
    if (energy <= 0) {
      energy = 0;
      fall(player.dir);
    }
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
  for (let r = r0; r < r0 + H / bh + 3; r++) {
    const shift = (r & 1) * bw / 2;
    for (let c = c0; c < c0 + W / bw + 3; c++) {
      const n = hash(c, r);
      // 上の方ほど暗く、ところどころ欠ける
      if (n < 0.25) continue;
      const x = Math.round(c * bw + shift - ox);
      const y = Math.round(r * bh - oy);
      const vign = 1 - Math.abs(x - W / 2) / (W * 0.75);
      ctx.fillStyle = gray((0.03 + n * 0.09) * vign);
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

function dither() {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const row = (y & 3) * 4;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const on = d[i] / 255 > BAYER[row + (x & 3)];
      const c = on ? INK : BG;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function render() {
  ctx.globalAlpha = 1;
  drawBackground();
  drawGhosts();
  drawStairs();
  drawParticles();
  drawPlayer();
  dither();
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
