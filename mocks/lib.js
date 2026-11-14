'use strict';
// モック共通ライブラリ：360x640 の縦画面キャンバス、入力、効果音、手応え（ヒットストップ・振動・フラッシュ）、
// タイトル → プレイ → 結果 → 即リトライ の流れをまとめて面倒みる。
const W = 360, H = 640, TAU = Math.PI * 2;
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const pick = a => a[Math.floor(Math.random() * a.length)];

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let scale = 1;
function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const s = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr);
  scale = cv.width / W;
}
addEventListener('resize', fit);

// ---- 音：アタック強め・残響ほどほど ----
let ac = null;
function audio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (ac && ac.state === 'suspended') ac.resume();
}
function tone(f, d = .1, type = 'square', v = .12, f2 = 0, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + .02);
}
let nbuf = null;
function noise(d = .15, v = .2, fc = 1200, delay = 0) {
  if (!ac) return;
  if (!nbuf) { nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const a = nbuf.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; }
  const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = nbuf; f.type = 'lowpass'; f.frequency.value = fc;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  s.connect(f).connect(g).connect(ac.destination); s.start(t, rnd(.5)); s.stop(t + d + .02);
}
const sfx = {
  tap: () => tone(700, .05, 'square', .07),
  tick: () => tone(1200, .025, 'square', .04),
  coin: () => { tone(988, .06, 'square', .09); tone(1319, .14, 'square', .09, 0, .06); },
  hit: (p = 1) => { noise(.06 + .08 * p, .12 + .2 * p, 2400); tone(220, .09 + .06 * p, 'triangle', .15 + .2 * p, 70); },
  boom: () => { noise(.45, .35, 700); tone(120, .4, 'sawtooth', .18, 35); },
  bad: () => tone(170, .22, 'sawtooth', .12, 70),
  up: () => tone(440, .12, 'square', .08, 880),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .16, 'square', .09, 0, i * .07)),
};

// ---- 手応え ----
const fx = { parts: [], texts: [], rings: [], shake: 0, flash: 0, flashC: '#fff', stop: 0 };
function hitstop(s) { fx.stop = Math.max(fx.stop, s); }
function shake(a) { fx.shake = Math.max(fx.shake, a); }
function flash(c = '#fff', a = .6) { fx.flashC = c; fx.flash = a; }
function burst(x, y, c, n = 10, sp = 200, life = .5, g = 0) {
  for (let i = 0; i < n; i++) { const a = rnd(TAU), s = rnd(.3, 1) * sp; fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, c, life, max: life, r: rnd(2.5, 6), g }); }
}
function ring(x, y, c = '#fff', r = 44) { fx.rings.push({ x, y, c, r, t: 0 }); }
function pop(x, y, s, c = '#fff', size = 20) { fx.texts.push({ x, y, s, c, size, t: 0 }); }
function confetti(n = 50) {
  const cs = ['#ff5d73', '#3ec1ff', '#ffd23e', '#6fe36a', '#fff'];
  for (let i = 0; i < n; i++) fx.parts.push({ x: rnd(W), y: rnd(-80, 0), vx: rnd(-60, 60), vy: rnd(80, 260), c: pick(cs), life: 1.8, max: 1.8, r: rnd(3, 6), g: 200 });
}
function updFx(dt) {
  fx.shake -= fx.shake * 10 * dt; fx.flash -= dt * 2.5;
  for (const p of fx.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
  fx.parts = fx.parts.filter(p => p.life > 0);
  for (const r of fx.rings) r.t += dt * 3.5; fx.rings = fx.rings.filter(r => r.t < 1);
  for (const t of fx.texts) t.t += dt; fx.texts = fx.texts.filter(t => t.t < .9);
}
function drawFx() {
  for (const r of fx.rings) { ctx.globalAlpha = 1 - r.t; ctx.lineWidth = 6 * (1 - r.t) + 1; ctx.strokeStyle = r.c; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.2 + r.t), 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1;
  for (const p of fx.parts) { const k = p.life / p.max, s = p.r * (.4 + k); ctx.fillStyle = 'rgba(10,12,24,.8)'; ctx.fillRect(p.x - s / 2 - 1, p.y - s / 2 - 1, s + 2, s + 2); ctx.fillStyle = p.c; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); }
  for (const t of fx.texts) { const k = Math.min(1, t.t * 10); ctx.globalAlpha = t.t > .6 ? (0.9 - t.t) / .3 : 1; text(t.s, t.x, t.y - t.t * 40, t.size * (0.6 + .4 * k) * (k < 1 ? 1.25 : 1), t.c); }
  ctx.globalAlpha = 1;
}

// ---- 描画の小道具 ----
const FONT = 'system-ui,-apple-system,"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';
function text(s, x, y, size = 16, c = '#fff', align = 'center', outline) {
  ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (outline !== 0) { ctx.lineJoin = 'round'; ctx.lineWidth = outline || Math.max(3, size / 5); ctx.strokeStyle = 'rgba(10,12,24,.92)'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = c; ctx.fillText(s, x, y);
}
function circ(x, y, r, fill, stroke, lw = 3) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function rr(x, y, w, h, r, fill, stroke, lw = 3) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
const INK = '#0a0c18';

// ---- 進行 ----
const G = { state: 'title', score: 0, best: 0, t: 0, clock: 0, def: null, newBest: false, overT: 0, dieT: 0, punch: 0, shown: -1 };
const P = { x: 0, y: 0, sx: 0, sy: 0, down: false, live: false };
function begin() {
  G.state = 'play'; G.score = 0; G.t = 0; G.newBest = false; G.shown = 0;
  fx.parts = []; fx.texts = []; fx.rings = []; fx.stop = 0; fx.shake = 0; fx.flash = 0;
  G.def.init();
}
function end(delay = .5) { if (G.state !== 'play') return; G.state = 'dying'; G.dieT = delay; }
function finish() {
  G.state = 'over'; G.overT = 0; G.score = Math.floor(G.score);
  if (G.score > G.best) { G.best = G.score; G.newBest = true; try { localStorage.setItem('mock_' + G.def.id, G.best); } catch (e) { } confetti(70); sfx.win(); }
}
function start(def) {
  G.def = def; def.fmt = def.fmt || (s => '' + s);
  document.title = def.title + ' | カジュアルゲーム モック集';
  document.body.style.background = def.bg;
  try { G.best = +(localStorage.getItem('mock_' + def.id) || 0); } catch (e) { }
  fit(); def.init(); requestAnimationFrame(loop);
}
let last = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(.033, (ts - last) / 1000 || 0); last = ts;
  const d = G.def;
  if (G.state === 'play') { if (fx.stop > 0) fx.stop -= dt; else { G.t += dt; d.update(dt); } }
  else if (G.state === 'dying') { G.dieT -= dt; if (G.dieT <= 0) finish(); }
  else if (G.state === 'over') G.overT += dt;
  G.clock += dt; updFx(dt); render();
}
function render() {
  const d = G.def;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = d.bg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (fx.shake > .3) ctx.translate(rnd(-1, 1) * fx.shake, rnd(-1, 1) * fx.shake);
  d.draw(); drawFx();
  ctx.restore();
  if (fx.flash > 0) { ctx.globalAlpha = Math.min(1, fx.flash); ctx.fillStyle = fx.flashC; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  if (G.state === 'play' || G.state === 'dying') {
    const s = Math.floor(G.score);
    if (s !== G.shown) { G.shown = s; G.punch = 1; }
    G.punch -= G.punch * .2;
    text(d.fmt(s), W / 2, 34, 28 + G.punch * 10, '#fff');
  } else if (G.state === 'title') {
    ctx.fillStyle = 'rgba(10,12,24,.74)'; ctx.fillRect(0, 0, W, H);
    text(d.genre, W / 2, 150, 14, '#fff', 'center', 0);
    text(d.title, W / 2, 200, 46, d.color);
    d.how.forEach((l, i) => text(l, W / 2, 280 + i * 30, 16, '#fff'));
    if (G.best) text('ベスト ' + d.fmt(G.best), W / 2, 420, 16, '#ffd23e');
    if (G.clock % 1 < .65) text('タップでスタート', W / 2, 500, 22, '#fff');
  } else {
    const a = Math.min(1, G.overT * 5);
    ctx.fillStyle = `rgba(10,12,24,${.78 * a})`; ctx.fillRect(0, 0, W, H);
    const k = Math.min(1, G.overT / .5), sc = Math.floor(G.score * k);
    text('けっか', W / 2, 190, 18, '#fff');
    text(d.fmt(sc), W / 2, 260, k < 1 ? 56 : 64, d.color);
    if (G.newBest && k >= 1) text('ベスト更新!', W / 2, 330, 24, '#ffd23e');
    else text('ベスト ' + d.fmt(G.best), W / 2, 330, 16, '#ffd23e');
    if (G.overT > .4 && G.clock % 1 < .65) text('タップでもう一度', W / 2, 470, 22, '#fff');
  }
  circ(24, 28, 15, 'rgba(10,12,24,.6)', 'rgba(255,255,255,.7)', 2); text('‹', 23, 26, 24, '#fff', 'center', 0);
}

// ---- 入力 ----
function ppos(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); audio();
  try { cv.setPointerCapture(e.pointerId); } catch (er) { }
  const [x, y] = ppos(e); P.x = P.sx = x; P.y = P.sy = y; P.down = true; P.live = false;
  if (dist(x, y, 24, 28) < 24) { location.href = 'index.html'; return; }
  if (G.state === 'title') { begin(); sfx.tap(); return; }
  if (G.state === 'over') { if (G.overT > .4) { begin(); sfx.tap(); } return; }
  if (G.state === 'play') { P.live = true; G.def.down && G.def.down(x, y); }
});
cv.addEventListener('pointermove', e => {
  const [x, y] = ppos(e); P.x = x; P.y = y;
  if (G.state === 'play' && P.live && P.down && G.def.move) G.def.move(x, y);
});
function pup(e) {
  const [x, y] = ppos(e); const was = P.live && P.down; P.down = false;
  if (G.state === 'play' && was && G.def.up) G.def.up(x, y);
}
cv.addEventListener('pointerup', pup); cv.addEventListener('pointercancel', pup);
document.addEventListener('visibilitychange', () => { last = performance.now(); });
