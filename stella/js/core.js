'use strict';

// ---------- 画面・入力・保存・演出の土台 ----------
// 論理解像度は高さ 270 固定。横幅は端末の比率に合わせて 400〜640 の間で変わる。

const H = 270, FLOOR = 170, DEPTH = 86, GRAV = 0.3;
const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif';
const DFONT = '"Dela Gothic One", ' + FONT;
const params = new URLSearchParams(location.search);

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
let W = 480, scale = 1, dpr = 1, offX = 0, offY = 0;
const safe = { l: 0, r: 0, t: 0, b: 0 };
let portrait = false;

function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(vw * dpr);
  cv.height = Math.round(vh * dpr);
  portrait = vh > vw * 1.05;
  scale = cv.height / H;
  W = cv.width / scale;
  offX = 0;
  offY = 0;
  if (W < 420) {
    scale = cv.width / 420;
    W = 420;
    offY = (cv.height - H * scale) / 2;
  } else if (W > 640) {
    W = 640;
    offX = (cv.width - W * scale) / 2;
  }
  W = Math.round(W);
  const sa = document.getElementById('sa');
  if (sa) {
    const cs = getComputedStyle(sa);
    const k = dpr / scale;
    safe.l = Math.max(0, parseFloat(cs.paddingLeft) * k - offX / scale);
    safe.r = Math.max(0, parseFloat(cs.paddingRight) * k - offX / scale);
    safe.t = parseFloat(cs.paddingTop) * k;
    safe.b = parseFloat(cs.paddingBottom) * k;
  }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------- 保存 ----------
const Save = {
  key: 'stellaRumble.v1',
  d: { unlocked: 0, best: 0, clears: 0, opts: { music: 0.7, sfx: 0.9, voice: 1, tts: true, easy: false } },
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (s) {
        Object.assign(this.d, s);
        this.d.opts = Object.assign({ music: 0.7, sfx: 0.9, voice: 1, tts: true, easy: false }, s.opts || {});
      }
    } catch (e) { /* 保存できない環境でも遊べる */ }
  },
  store() {
    try { localStorage.setItem(this.key, JSON.stringify(this.d)); } catch (e) { /* 無視 */ }
  },
};
Save.load();

function applyOptions() {
  const o = Save.d.opts;
  Sound.setVolume('music', o.music);
  Sound.setVolume('sfx', o.sfx);
  Sound.setVolume('voice', o.voice);
  Sound.TTS.enabled = o.tts;
}

// ---------- 入力 ----------
// 左半分のどこでも触ればそこがスティックの中心になる（フローティングスティック）
const Input = {
  mx: 0, mz: 0,
  keys: new Set(),
  pressed: { a: 0, b: 0, s: 0, u: 0, pause: 0 },
  held: { a: false, b: false, s: false, u: false },
  stick: null,       // {id, ox, oy, x, y}
  btnPtr: new Map(), // pointerId -> ボタン名
  taps: [],          // メニュー用のタップ
  touchUsed: false,
  lastKeyDir: 0,

  buttons() {
    const r = W - safe.r;
    const b = H - Math.max(0, safe.b * 0.5);
    return {
      a: { x: r - 54, y: b - 50, r: 28, label: 'A' },
      b: { x: r - 116, y: b - 30, r: 21, label: 'B' },
      s: { x: r - 30, y: b - 108, r: 21, label: 'S' },
      u: { x: r - 94, y: b - 94, r: 19, label: '★' },
      pause: { x: r - 18, y: 16 + safe.t * 0.3, r: 13, label: 'II' },
    };
  },
  toLogical(e) {
    return [(e.clientX * dpr - offX) / scale, (e.clientY * dpr - offY) / scale];
  },
  gameplay: false,
  down(e) {
    const [x, y] = this.toLogical(e);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.touchUsed = true;
    this.taps.push({ x, y });
    if (!this.gameplay) return;
    const B = this.buttons();
    for (const k of ['pause', 'a', 'b', 's', 'u']) {
      const bt = B[k];
      if (Math.hypot(x - bt.x, y - bt.y) < bt.r * 1.3) {
        this.btnPtr.set(e.pointerId, k);
        this.pressed[k]++;
        if (k !== 'pause') this.held[k] = true;
        return;
      }
    }
    if (x < W * 0.5 && !this.stick) {
      this.stick = { id: e.pointerId, ox: x, oy: y, x, y };
      this.updateStick();
    } else if (x >= W * 0.5) {
      // 右側のボタン以外を触ったら、一番近いボタンにする（押し間違いを減らす）
      let best = null, bd = 60;
      for (const k of ['a', 'b', 's', 'u']) {
        const d = Math.hypot(x - B[k].x, y - B[k].y);
        if (d < bd) { bd = d; best = k; }
      }
      if (best) {
        this.btnPtr.set(e.pointerId, best);
        this.pressed[best]++;
        this.held[best] = true;
      }
    }
  },
  move(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      const [x, y] = this.toLogical(e);
      this.stick.x = x;
      this.stick.y = y;
      this.updateStick();
    }
  },
  up(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.updateStick();
    }
    const k = this.btnPtr.get(e.pointerId);
    if (k) {
      this.btnPtr.delete(e.pointerId);
      if (k !== 'pause' && ![...this.btnPtr.values()].includes(k)) this.held[k] = false;
    }
  },
  updateStick() {
    const R = 32;
    if (this.stick) {
      let dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
      const d = Math.hypot(dx, dy);
      // 指が大きく離れたら中心もついてくる
      if (d > R * 1.4) {
        this.stick.ox += dx * (1 - R * 1.4 / d);
        this.stick.oy += dy * (1 - R * 1.4 / d);
        dx = this.stick.x - this.stick.ox;
        dy = this.stick.y - this.stick.oy;
      }
      const m = Math.min(1, Math.hypot(dx, dy) / R);
      const a = Math.atan2(dy, dx);
      const dead = 0.22;
      const k = m < dead ? 0 : (m - dead) / (1 - dead);
      this.stickVec = [Math.cos(a) * k, Math.sin(a) * k];
    } else {
      this.stickVec = [0, 0];
    }
  },
  stickVec: [0, 0],
  poll() {
    let kx = 0, kz = 0;
    const K = this.keys;
    if (K.has('ArrowLeft') || K.has('KeyA')) kx -= 1;
    if (K.has('ArrowRight') || K.has('KeyD')) kx += 1;
    if (K.has('ArrowUp') || K.has('KeyW')) kz -= 1;
    if (K.has('ArrowDown') || K.has('KeyS')) kz += 1;
    if (kx || kz) {
      const l = Math.hypot(kx, kz);
      this.mx = kx / l * (kz ? 1.15 : 1);
      this.mz = kz / l * (kx ? 1.15 : 1);
      this.mx = Math.max(-1, Math.min(1, this.mx));
      this.mz = Math.max(-1, Math.min(1, this.mz));
    } else {
      this.mx = this.stickVec[0];
      this.mz = this.stickVec[1];
    }
  },
  consume() {
    const p = Object.assign({}, this.pressed);
    for (const k in this.pressed) this.pressed[k] = 0;
    return p;
  },
  reset() {
    this.stick = null;
    this.stickVec = [0, 0];
    this.btnPtr.clear();
    for (const k in this.held) this.held[k] = false;
    for (const k in this.pressed) this.pressed[k] = 0;
    this.taps.length = 0;
  },
};
const KEYMAP = { KeyZ: 'a', KeyJ: 'a', KeyX: 'b', KeyK: 'b', Space: 'b', KeyC: 's', KeyL: 's', KeyV: 'u', Semicolon: 'u', Escape: 'pause', KeyP: 'pause' };
cv.addEventListener('pointerdown', e => { e.preventDefault(); Input.down(e); boot(); });
cv.addEventListener('pointermove', e => { e.preventDefault(); Input.move(e); });
cv.addEventListener('pointerup', e => { e.preventDefault(); Input.up(e); });
cv.addEventListener('pointercancel', e => Input.up(e));
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') Input.up(e); });
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (e.repeat) { if (e.code.startsWith('Arrow')) e.preventDefault(); return; }
  Input.keys.add(e.code);
  const k = KEYMAP[e.code];
  if (k) { Input.pressed[k]++; if (Input.held[k] !== undefined) Input.held[k] = true; }
  Input.keyQueue.push(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  boot();
});
window.addEventListener('keyup', e => {
  Input.keys.delete(e.code);
  const k = KEYMAP[e.code];
  if (k && Input.held[k] !== undefined) Input.held[k] = false;
});
Input.keyQueue = [];

// iOS は touchend / click の中でないと音や読み上げが有効にならないことがあるので、そこでも起こす
let ttsUnlocked = false;
function gestureUnlock() {
  boot();
  Sound.resume();
  if (!ttsUnlocked) { ttsUnlocked = true; Sound.unlockTTS(); }
}
window.addEventListener('touchend', gestureUnlock, { passive: true });
window.addEventListener('click', gestureUnlock);

let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  Sound.init();
  Sound.unlockTTS();
  applyOptions();
}

// ---------- 文字 ----------
function txt(s, x, y, o) {
  o = o || {};
  const size = o.size || 10;
  ctx.font = `${o.w || 800} ${size}px ${o.font || FONT}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'middle';
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  if (o.stroke !== false) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = o.sc || '#2a1531';
    ctx.lineWidth = o.lw || Math.max(2, size * 0.3);
    ctx.strokeText(s, x, y);
  }
  if (o.grad) {
    const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    o.grad.forEach((c, i) => g.addColorStop(i / (o.grad.length - 1), c));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = o.color || '#ffffff';
  }
  ctx.fillText(s, x, y);
  if (o.alpha != null) ctx.globalAlpha = 1;
}
function txtW(s, size, w, font) {
  ctx.font = `${w || 800} ${size}px ${font || FONT}`;
  return ctx.measureText(s).width;
}
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 演出（パーティクル） ----------
// 位置はワールドの x と画面の y で持つ（カメラが動いても地面に残る）
const FX = {
  list: [],
  add(e) {
    e.t = 0;
    this.list.push(e);
    if (this.list.length > 260) this.list.splice(0, this.list.length - 260);
    return e;
  },
  clear() { this.list.length = 0; },
  spark(x, y, big, col) {
    this.add({ k: 'spark', x, y, life: big ? 14 : 10, r: big ? 22 : 13, rot: Math.random() * 6, col: col || '#fff27a' });
    const n = big ? 8 : 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * (big ? 3.5 : 2);
      this.add({ k: 'bit', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 16 + Math.random() * 10, col: Math.random() < 0.5 ? '#ffffff' : (col || '#ffe14a'), s: 1.6 + Math.random() * 1.5 });
    }
  },
  starBurst(x, y, col, n) {
    for (let i = 0; i < (n || 6); i++) {
      const a = i / (n || 6) * Math.PI * 2 + Math.random() * 0.4;
      const s = 2 + Math.random() * 2;
      this.add({ k: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 26, col: col || '#ffe14a', s: 3 + Math.random() * 2, rot: Math.random() * 6 });
    }
  },
  ring(x, y, r, col, life, flat) {
    this.add({ k: 'ring', x, y, r, col: col || '#ffffff', life: life || 18, flat: flat == null ? true : flat });
  },
  word(x, y, s, col, size) {
    this.add({ k: 'word', x, y, s, col: col || '#ffe14a', size: size || 14, life: 30, rot: (Math.random() - 0.5) * 0.5 });
  },
  float(x, y, s, col, size) {
    this.add({ k: 'float', x, y, s, col: col || '#ffffff', size: size || 9, life: 60 });
  },
  hearts(x, y, n) {
    for (let i = 0; i < (n || 4); i++) this.add({ k: 'heart', x: x + (Math.random() - 0.5) * 20, y: y - Math.random() * 20, vx: (Math.random() - 0.5) * 0.6, vy: -0.6 - Math.random() * 0.8, life: 50 + Math.random() * 20, s: 3 + Math.random() * 2.5, col: Math.random() < 0.5 ? '#ff6fa8' : '#ffb3d1' });
  },
  dust(x, y, n, dir) {
    for (let i = 0; i < (n || 3); i++) this.add({ k: 'dust', x: x + (Math.random() - 0.5) * 10, y, vx: (dir || 0) * (0.5 + Math.random()) + (Math.random() - 0.5) * 0.8, vy: -0.2 - Math.random() * 0.4, life: 20 + Math.random() * 10, s: 3 + Math.random() * 3 });
  },
  notes(x, y, n, col) {
    for (let i = 0; i < (n || 3); i++) this.add({ k: 'note', x: x + (Math.random() - 0.5) * 24, y: y - Math.random() * 20, vx: (Math.random() - 0.5) * 1.2, vy: -0.8 - Math.random(), life: 40, s: 5 + Math.random() * 3, col: col || ['#ff6fa8', '#39d3ff', '#ffe14a', '#b07bff'][Math.floor(Math.random() * 4)] });
  },
  petals(x, y, n) {
    for (let i = 0; i < (n || 6); i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      this.add({ k: 'petal', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2, life: 40 + Math.random() * 20, s: 2.4 + Math.random() * 1.5, rot: Math.random() * 6, col: ['#ffc2dc', '#ff8fc0', '#ffffff', '#ffe0ec'][Math.floor(Math.random() * 4)] });
    }
  },
  after(f) {
    this.add({ k: 'after', x: f.x, y: FLOOR + f.z - f.y, look: f.look, pose: f.lastPose, facing: f.facing, life: 14, sx: f.lastSx });
  },
  update() {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const e = L[i];
      e.t++;
      if (e.vx != null) { e.x += e.vx; e.y += e.vy; }
      if (e.k === 'bit' || e.k === 'star') { e.vy += 0.12; e.vx *= 0.96; }
      if (e.k === 'petal') { e.vy += 0.03; e.vx *= 0.97; e.rot += 0.1; }
      if (e.k === 'dust') { e.vx *= 0.92; }
      if (e.k === 'word') e.y -= 0.5;
      if (e.k === 'float') e.y -= 0.4;
      if (e.t >= e.life) L.splice(i, 1);
    }
  },
  draw(camX) {
    for (const e of this.list) {
      const x = e.x - camX, y = e.y, k = e.t / e.life;
      ctx.save();
      switch (e.k) {
        case 'spark': {
          ctx.translate(x, y);
          ctx.rotate(e.rot);
          const r = e.r * (0.5 + k * 0.8);
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = e.col;
          Fig.starPath(ctx, 0, 0, r, r * 0.3, 6);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          Fig.starPath(ctx, 0, 0, r * 0.6, r * 0.18, 6);
          ctx.fill();
          break;
        }
        case 'bit':
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = e.col;
          ctx.fillRect(x - e.s / 2, y - e.s / 2, e.s, e.s);
          break;
        case 'star':
          ctx.globalAlpha = 1 - k * k;
          ctx.fillStyle = e.col;
          Fig.starPath(ctx, x, y, e.s, e.s * 0.45, 5, e.rot + e.t * 0.2);
          ctx.fill();
          break;
        case 'ring':
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.strokeStyle = e.col;
          ctx.lineWidth = 3 * (1 - k) + 1;
          ctx.beginPath();
          ctx.ellipse(x, y, e.r * (0.3 + k), e.r * (0.3 + k) * (e.flat ? 0.35 : 1), 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'word': {
          const s = e.t < 5 ? 0.5 + e.t * 0.12 : 1.1;
          ctx.translate(x, y);
          ctx.rotate(e.rot);
          ctx.scale(s, s);
          txt(e.s, 0, 0, { size: e.size, color: e.col, font: DFONT, w: 400, alpha: k > 0.7 ? (1 - k) / 0.3 : 1, lw: 4 });
          break;
        }
        case 'float':
          txt(e.s, x, y, { size: e.size, color: e.col, align: 'center', alpha: k > 0.6 ? (1 - k) / 0.4 : 1 });
          break;
        case 'heart':
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = e.col;
          Fig.heartPath(ctx, x + Math.sin(e.t * 0.15) * 3, y, e.s);
          ctx.fill();
          break;
        case 'dust':
          ctx.globalAlpha = (1 - k) * 0.5;
          ctx.fillStyle = '#e8e0f0';
          ctx.beginPath();
          ctx.arc(x, y, e.s * (0.6 + k), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'note':
          ctx.globalAlpha = 1 - k;
          Fig.noteGlyph(ctx, x + Math.sin(e.t * 0.2) * 3, y, e.s, e.col);
          break;
        case 'petal':
          ctx.globalAlpha = 1 - k;
          ctx.translate(x, y);
          ctx.rotate(e.rot);
          ctx.fillStyle = e.col;
          ctx.beginPath();
          ctx.ellipse(0, 0, e.s, e.s * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'after':
          if (e.pose) {
            ctx.globalAlpha = (1 - k) * 0.4;
            Fig.draw(ctx, e.look, e.pose, x, y, e.facing, { flash: true, sx: e.sx });
          }
          break;
      }
      ctx.restore();
    }
  },
};
