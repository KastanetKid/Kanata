'use strict';

// ---------- キャラクター描画 ----------
// 画像素材は使わず、頭・胴・手足・髪を図形で組み立てて「ちびアイドル」を描く。
// 右向きで描き、左向きは左右反転する。原点は足もと（地面）。
// 関節の角度は「真下 = 0、前へ振ると +、後ろへ振ると −」の絶対角（ラジアン）。

const Fig = (() => {
  const OUT = '#2a1531';
  const TAU = Math.PI * 2;
  const NO = {};
  const cache = new Map();

  function rgb(hex) {
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  // f < 0 で暗く、f > 0 で明るく（結果はキャッシュ）
  function shade(hex, f) {
    if (!f) return hex;
    const key = hex + '|' + f;
    let c = cache.get(key);
    if (!c) {
      const [r, g, b] = rgb(hex);
      const t = Math.abs(f), m = f < 0 ? 0 : 255;
      c = `rgb(${Math.round(r + (m - r) * t)},${Math.round(g + (m - g) * t)},${Math.round(b + (m - b) * t)})`;
      cache.set(key, c);
    }
    return c;
  }
  function rgba(hex, a) {
    const [r, g, b] = rgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  // 被弾時の白フラッシュ用に、色だけ白くした見た目を作っておく
  const COLOR_KEYS = ['skin', 'hair', 'eye', 'top', 'accent', 'skirt', 'legs', 'shin', 'boots',
    'sleeve', 'glove', 'cape', 'jacket', 'hat', 'propC', 'feather'];
  function flashed(look) {
    if (!look._flash) {
      const f = Object.assign({}, look);
      for (const k of COLOR_KEYS) if (f[k]) f[k] = '#fff6fb';
      f._flash = f;
      look._flash = f;
    }
    return look._flash;
  }

  // ---------- 図形ヘルパー ----------
  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU);
  }
  function circ(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
  }
  function fillOut(ctx, col, lw) {
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw || 1.2;
    ctx.stroke();
  }
  function starPath(ctx, x, y, r1, r2, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (rot || 0) - Math.PI / 2 + i * Math.PI / n;
      const r = i % 2 ? r2 : r1;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
    ctx.closePath();
  }
  function noteGlyph(ctx, x, y, s, col) {
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ell(ctx, x, y, s * 0.55, s * 0.4, -0.4);
    ctx.fill();
    ctx.lineWidth = s * 0.18;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.48, y - s * 0.1);
    ctx.lineTo(x + s * 0.48, y - s * 1.4);
    ctx.quadraticCurveTo(x + s * 1.0, y - s * 1.0, x + s * 1.05, y - s * 0.55);
    ctx.stroke();
  }

  // 2 関節の手足。輪郭→先の部位→根元の部位の順に塗る
  function limb(ctx, x0, y0, a1, l1, a2, l2, w1, w2, c1, c2, end, endFrom) {
    const x1 = x0 + Math.sin(a1) * l1, y1 = y0 + Math.cos(a1) * l1;
    const x2 = x1 + Math.sin(a2) * l2, y2 = y1 + Math.cos(a2) * l2;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = w1 + 2.2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.lineWidth = w2 + 2.2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = c2;
    ctx.lineWidth = w2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (end) {
      const sx = x1 + (x2 - x1) * endFrom, sy = y1 + (y2 - y1) * endFrom;
      ctx.strokeStyle = end;
      ctx.lineWidth = w2 + 0.7;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.strokeStyle = c1;
    ctx.lineWidth = w1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    return [x1, y1, x2, y2];
  }
  function foot(ctx, x, y, a, col) {
    const fx = Math.cos(a), fy = -Math.sin(a);
    ell(ctx, x + fx * 2.2, y + fy * 2.2, 3.8, 2.3, Math.atan2(fy, fx));
    fillOut(ctx, col, 1.1);
  }
  function hand(ctx, x, y, col) {
    circ(ctx, x, y, 2.7);
    fillOut(ctx, col, 1.1);
  }

  // ---------- 姿勢 ----------
  const BASE = {
    bx: 0, by: 0, lean: 0.08, head: 0, rot: 0, skirt: 0,
    fT: -0.2, fS: -0.08, nT: 0.22, nS: 0.1,
    fU: 0.55, fF: 2.3, nU: 0.3, nF: 2.0, face: null,
  };
  const P = o => Object.assign({}, BASE, o);
  const POSES = {
    stand: P({}),
    jabW: P({ nU: 0.15, nF: 1.5, lean: 0.02 }),
    jab: P({ nU: 1.55, nF: 1.6, lean: 0.22, fU: 0.4, fF: 2.4, nT: 0.35, fT: -0.3 }),
    crossW: P({ fU: 0.2, fF: 1.7, lean: 0.0 }),
    cross: P({ fU: 1.55, fF: 1.6, nU: 0.15, nF: 2.4, lean: 0.3, nT: 0.4, fT: -0.38, face: 'shout' }),
    kickW: P({ nT: 0.95, nS: -0.45, lean: -0.1 }),
    kick: P({ nT: 1.62, nS: 1.7, fT: -0.08, fS: -0.08, lean: -0.32, nU: 0.9, nF: 0.6, fU: -0.7, fF: -0.3, face: 'shout', skirt: 0.5 }),
    lowkickW: P({ nT: 0.6, nS: -0.3 }),
    lowkick: P({ nT: 1.15, nS: 1.3, fT: -0.2, fS: -0.15, by: 3, lean: 0.05, skirt: 0.3 }),
    upperW: P({ by: 6, nU: -0.2, nF: 0.5, lean: 0.35, nT: 0.5, nS: -0.2, fT: -0.4, fS: -0.6 }),
    upper: P({ by: -5, nU: 2.7, nF: 3.0, fU: 0.3, fF: 1.0, lean: -0.12, nT: 0.2, nS: 0.1, fT: -0.25, fS: -0.3, face: 'shout', skirt: 0.5 }),
    hammerW: P({ nU: 2.9, nF: 3.2, fU: 2.7, fF: 3.1, lean: -0.2, by: -2 }),
    hammer: P({ nU: 1.0, nF: 0.5, fU: 0.9, fF: 0.5, lean: 0.55, by: 5, face: 'shout' }),
    hookW: P({ nU: -0.3, nF: 1.0, lean: -0.1 }),
    hook: P({ nU: 1.45, nF: 2.5, lean: 0.3, face: 'shout' }),
    slapW: P({ nU: 1.1, nF: 2.7 }),
    slap: P({ nU: 1.3, nF: 1.15, lean: 0.2 }),
    headbuttW: P({ lean: -0.3, by: -1 }),
    headbutt: P({ lean: 0.85, by: 4, nU: -0.6, nF: -0.4, fU: -0.5, fF: -0.3, face: 'shout' }),
    pokeW: P({ nU: 0.6, nF: 1.3, fU: 0.7, fF: 1.3, lean: -0.05 }),
    poke: P({ nU: 1.45, nF: 1.57, fU: 1.4, fF: 1.57, lean: 0.25, nT: 0.45, fT: -0.35 }),
    swingW: P({ nU: 2.6, nF: 2.9, lean: -0.2 }),
    swing: P({ nU: 0.9, nF: 0.6, lean: 0.35, face: 'shout' }),
    dash: P({ lean: 0.55, nU: 0.7, nF: 1.2, fU: -0.4, fF: 0.2, nT: 0.6, nS: -0.1, fT: -0.6, fS: -0.9 }),
    slide: P({ lean: -0.9, by: 15, nT: 1.5, nS: 1.55, fT: 1.1, fS: 0.3, nU: -0.4, nF: 0.2, fU: -1.2, fF: -0.8, skirt: 0.6 }),
    jump: P({ nT: 0.9, nS: -0.35, fT: 0.35, fS: -0.65, nU: 2.2, nF: 2.6, fU: -0.6, fF: -0.2, skirt: 0.6 }),
    jumpDown: P({ nT: 0.3, nS: 0.1, fT: -0.1, fS: -0.3, nU: 2.4, nF: 2.5, fU: 2.0, fF: 2.2, skirt: 0.8 }),
    jkick: P({ nT: 1.45, nS: 1.5, fT: 0.55, fS: -0.9, lean: -0.25, nU: -0.5, nF: -0.2, fU: 1.6, fF: 2.4, skirt: 0.7, face: 'shout' }),
    dive: P({ nT: 0.75, nS: 0.8, fT: 0.2, fS: -0.9, lean: -0.1, nU: 2.4, nF: 2.2, fU: 1.6, fF: 2.4, skirt: 0.9, face: 'shout' }),
    press: P({ lean: 1.45, nT: -1.35, nS: -1.5, fT: -1.2, fS: -1.4, nU: 2.0, nF: 1.8, fU: 2.1, fF: 1.9, by: -8, skirt: 0.5, face: 'shout' }),
    grab: P({ nU: 1.3, nF: 1.6, fU: 1.2, fF: 1.5, lean: 0.15 }),
    knee: P({ nU: 1.25, nF: 1.2, fU: 1.1, fF: 1.2, nT: 1.5, nS: 0.1, lean: 0.25, face: 'shout' }),
    throwP: P({ nU: 3.0, nF: 3.3, fU: 2.8, fF: 3.2, lean: -0.45, nT: 0.4, fT: -0.4, face: 'shout' }),
    hurt: P({ lean: -0.4, head: -0.35, nU: -0.7, nF: -0.3, fU: -0.4, fF: 0.2, nT: 0.1, nS: -0.15, fT: -0.3, fS: -0.5, bx: -2, face: 'hurt' }),
    fall: P({ lean: -1.15, head: -0.3, nT: 0.9, nS: 1.25, fT: 0.6, fS: 1.0, nU: 2.5, nF: 2.7, fU: 2.2, fF: 2.6, skirt: 0.9, face: 'hurt' }),
    down: P({ lean: -1.42, head: -0.08, by: 19, nT: 1.55, nS: 1.6, fT: 1.4, fS: 1.55, nU: -1.2, nF: -1.6, fU: -1.0, fF: -1.4, face: 'ko' }),
    crouch: P({ by: 8, lean: 0.35, nT: 0.9, nS: -0.6, fT: 0.4, fS: -1.0, nU: 0.6, nF: 1.4, fU: 0.3, fF: 1.2 }),
    victory: P({ nU: 2.95, nF: 3.05, fU: -0.45, fF: 0.9, lean: -0.05, nT: 0.15, nS: 0.15, fT: -0.05, fS: -0.1, face: 'happy' }),
    sing: P({ nU: 0.75, nF: 2.85, fU: 1.9, fF: 2.05, lean: -0.08, face: 'shout' }),
    pound: P({ by: 9, lean: 0.6, nU: 0.25, nF: 0.05, fU: 0.15, fF: 0.0, nT: 0.9, nS: -0.5, fT: -0.6, fS: -0.9, face: 'shout' }),
    ball: P({ by: -4, lean: 0.9, nT: 2.3, nS: -0.4, fT: 2.1, fS: -0.6, nU: 1.6, nF: -0.6, fU: 1.5, fF: -0.7, head: 0.4, face: 'shout' }),
    spin: P({ nT: 1.5, nS: 1.55, fT: -0.1, fS: -0.1, lean: -0.3, nU: 1.6, nF: 1.6, fU: -1.5, fF: -1.5, skirt: 1, face: 'shout' }),
    cheer: P({ nU: 2.6, nF: 2.9, fU: 2.6, fF: 2.9, face: 'happy', skirt: 0.3 }),
    point: P({ nU: 1.7, nF: 1.75, fU: -0.4, fF: 0.8, lean: -0.05, face: 'evil' }),
    taunt: P({ nU: -0.4, nF: 0.8, fU: -0.4, fF: 0.8, lean: -0.1, face: 'evil' }),
    guard: P({ nU: 0.9, nF: 2.7, fU: 0.8, fF: 2.6, lean: -0.15, by: 2 }),
    wave: P({ nU: 2.7, nF: 2.4, fU: 0.2, fF: 0.6, face: 'happy' }),
  };
  const NUMS = ['bx', 'by', 'lean', 'head', 'rot', 'skirt', 'fT', 'fS', 'nT', 'nS', 'fU', 'fF', 'nU', 'nF'];
  function lerp(a, b, t) {
    const o = {};
    for (const k of NUMS) o[k] = a[k] + (b[k] - a[k]) * t;
    o.face = t < 0.5 ? a.face : b.face;
    return o;
  }
  function idle(t) {
    const b = Math.sin(t * 4);
    return P({ by: b * 0.7, nF: 2.0 + b * 0.06, fF: 2.3 - b * 0.06 });
  }
  function walk(ph, k) {
    k = k || 1;
    const s = Math.sin(ph), c = Math.cos(ph);
    const o = P({});
    o.nT = 0.5 * s * k;
    o.fT = -0.5 * s * k;
    o.nS = o.nT - 0.65 * Math.max(0, c) * k;
    o.fS = o.fT - 0.65 * Math.max(0, -c) * k;
    o.by = -Math.abs(c) * 1.1 * k + 0.6;
    o.nU = 0.35 - 0.3 * s * k;
    o.fU = 0.5 + 0.3 * s * k;
    return o;
  }
  function run(ph) {
    const o = walk(ph, 1.5);
    o.lean = 0.38;
    const s = Math.sin(ph);
    o.nU = 0.3 - 0.9 * s;
    o.nF = o.nU + 1.5;
    o.fU = 0.3 + 0.9 * s;
    o.fF = o.fU + 1.5;
    o.skirt = 0.4;
    return o;
  }

  // ---------- 髪 ----------
  function tail(ctx, ax, ay, ang, len, w, col, curl) {
    const dx = Math.sin(ang), dy = Math.cos(ang), nx = dy, ny = -dx;
    const mx = ax + dx * len * 0.5, my = ay + dy * len * 0.5;
    const tx = ax + dx * len + nx * curl, ty = ay + dy * len + ny * curl;
    ctx.beginPath();
    ctx.moveTo(ax + nx * w * 0.35, ay + ny * w * 0.35);
    ctx.quadraticCurveTo(mx + nx * w * 0.8, my + ny * w * 0.8, tx, ty);
    ctx.quadraticCurveTo(mx - nx * w * 0.6, my - ny * w * 0.6, ax - nx * w * 0.35, ay - ny * w * 0.35);
    ctx.closePath();
    fillOut(ctx, col, 1.2);
    ctx.strokeStyle = 'rgba(42,21,49,.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx + nx * w * 0.1, my + ny * w * 0.1, ax + (tx - ax) * 0.85, ay + (ty - ay) * 0.85);
    ctx.stroke();
  }

  function feathers(ctx, L, hx, hy, t) {
    const cols = [L.feather || '#ff4fa3', L.accent, '#ffd43b', L.feather || '#ff4fa3', '#3fd3ff'];
    for (let i = 0; i < 9; i++) {
      const a = -1.35 + i * 0.34 + Math.sin(t * 3 + i) * 0.03;
      const r = 23 + (i % 2) * 4;
      const fx = hx - 3 + Math.sin(a) * r * 0.55, fy = hy - 9 - Math.cos(a) * r * 0.55;
      ell(ctx, fx, fy, 4.2, r * 0.55, a);
      fillOut(ctx, cols[i % cols.length], 1);
    }
  }

  function hairBack(ctx, L, hx, hy, ha, t, sw, lean) {
    const st = L.hairStyle;
    const col = L.hair, dk = shade(col, -0.2);
    const ca = Math.cos(ha), sa = Math.sin(ha);
    const W = (lx, ly) => [hx + lx * ca - ly * sa, hy + lx * sa + ly * ca];
    const sway = Math.sin(t * 2.4) * 0.07 - sw * 0.12;
    const lenK = Math.max(0.35, Math.cos(lean * 0.9));
    if (L.acc && L.acc.includes('feathers')) feathers(ctx, L, hx, hy, t);
    if (st === 'twintail') {
      let a = W(-3, -10);
      tail(ctx, a[0], a[1], -0.12 + sway * 1.2, 27 * lenK, 10, dk, -3);
      a = W(-9, -5);
      tail(ctx, a[0], a[1], -0.38 + sway, 26 * lenK, 10.5, col, -4);
    } else if (st === 'ponytail') {
      const a = W(-10, -8);
      tail(ctx, a[0], a[1], -0.75 + sway * 1.6, 25 * lenK, 10, col, -5);
    } else if (st === 'sidetail') {
      const a = W(-6, -10);
      tail(ctx, a[0], a[1], -0.3 + sway * 1.3, 24 * lenK, 9.5, col, -4);
    } else if (st === 'long' || st === 'hime' || st === 'wavy' || st === 'big') {
      const big = st === 'big';
      const len = (big ? 40 : 33) * lenK;
      const sx = sway * 22;
      const p0 = W(big ? -16 : -12.5, -2), p1 = W(big ? 7 : 4, 4);
      const b0x = hx - (big ? 22 : 15) + sx, b0y = hy + len;
      const b1x = hx + (big ? 6 : 1) + sx * 0.6, b1y = hy + len - 2;
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.quadraticCurveTo(hx - (big ? 26 : 18), hy + len * 0.5, b0x, b0y);
      const n = st === 'hime' ? 1 : 4;
      for (let i = 1; i <= n; i++) {
        const k = i / n;
        const bx = b0x + (b1x - b0x) * k, by = b0y + (b1y - b0y) * k;
        if (st === 'hime') ctx.lineTo(bx, by);
        else ctx.quadraticCurveTo(bx - (b1x - b0x) / n / 2, by + (st === 'long' ? 3 : 5), bx, by);
      }
      ctx.quadraticCurveTo(hx + (big ? 9 : 4), hy + len * 0.5, p1[0], p1[1]);
      ctx.closePath();
      fillOut(ctx, dk, 1.2);
      ctx.strokeStyle = 'rgba(42,21,49,.3)';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(hx - 8 + i * 4, hy + 6);
        ctx.quadraticCurveTo(hx - 12 + i * 4 + sx * 0.5, hy + len * 0.6, hx - 12 + i * 5 + sx, hy + len - 4);
        ctx.stroke();
      }
    }
  }

  // 頭の中の描画（頭の向きに回転した座標系）
  function headInner(ctx, L, face, t) {
    const st = L.hairStyle, col = L.hair;
    const R = 12;
    // 後ろ髪のかたまり
    if (st === 'bob') { ell(ctx, -1.5, 2, 14.6, 14.4); fillOut(ctx, col, 1.2); }
    else if (st === 'big') { circ(ctx, -1.5, -1, 16.5); fillOut(ctx, col, 1.2); }
    else { circ(ctx, -1.3, -0.8, 13.8); fillOut(ctx, col, 1.2); }
    if (st === 'buns') {
      circ(ctx, -7.5, -11, 5.6); fillOut(ctx, col, 1.2);
      circ(ctx, 2, -13.5, 5.2); fillOut(ctx, col, 1.2);
    }
    if (st === 'spiky') {
      ctx.beginPath();
      ctx.moveTo(-8, -9); ctx.lineTo(-6, -20); ctx.lineTo(-2, -11); ctx.lineTo(1, -21); ctx.lineTo(4, -11); ctx.lineTo(8, -17); ctx.lineTo(9, -7);
      ctx.closePath();
      fillOut(ctx, L.accent, 1.1);
    }
    // 顔
    circ(ctx, 0, 0, R);
    fillOut(ctx, L.skin, 1.2);
    faceDraw(ctx, L, face, t);
    // 前髪
    ctx.beginPath();
    if (st === 'hime') {
      ctx.moveTo(-14, 6);
      ctx.arc(-1, -0.5, 13.6, Math.PI * 0.86, -0.12);
      ctx.lineTo(10.5, -1.6);
      ctx.lineTo(-6, -1.6);
      ctx.lineTo(-8, 12);
      ctx.lineTo(-12.5, 12);
    } else {
      ctx.moveTo(-14.2, 5);
      ctx.arc(-1, -0.5, 13.6, Math.PI * 0.88, -0.16);
      ctx.lineTo(10.4, -0.4);
      ctx.lineTo(8, -4.5);
      ctx.lineTo(6.2, 0.2);
      ctx.lineTo(3.4, -4.8);
      ctx.lineTo(0.8, -0.8);
      ctx.lineTo(-2.2, -5);
      ctx.lineTo(-4.4, 1.5);
      ctx.lineTo(-7, 9);
      ctx.lineTo(-10.5, 10);
    }
    ctx.closePath();
    fillOut(ctx, col, 1.2);
    // つやの輪
    ctx.strokeStyle = shade(col, 0.45);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(-1, -0.5, 10.5, Math.PI * 1.12, Math.PI * 1.55);
    ctx.stroke();
    if (L.acc) for (const a of L.acc) accessory(ctx, L, a, t);
  }

  function eyeOpen(ctx, x, y, w, h, iris, evil, hypno) {
    if (evil) h *= 0.8;
    ctx.fillStyle = OUT;
    ell(ctx, x, y, w, h);
    ctx.fill();
    ctx.fillStyle = iris;
    ell(ctx, x, y + h * 0.18, w * 0.78, h * 0.72);
    ctx.fill();
    ctx.fillStyle = shade(iris, -0.5);
    ell(ctx, x, y + h * 0.12, w * (evil ? 0.22 : 0.4), h * 0.45);
    ctx.fill();
    if (hypno) {
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 0.5;
      ell(ctx, x, y + h * 0.18, w * 0.5, h * 0.48);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    circ(ctx, x - w * 0.28, y - h * 0.35, w * 0.36);
    ctx.fill();
    circ(ctx, x + w * 0.3, y + h * 0.45, w * 0.17);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x - w - 0.7, y - h * 0.5);
    ctx.quadraticCurveTo(x, y - h - 1.4, x + w + 0.9, y - h * 0.35);
    ctx.stroke();
  }

  function faceDraw(ctx, L, face, t) {
    const ex1 = 5.6, ex2 = -1.3, ey = 1.6;
    let f = face;
    if (f === 'normal' && ((t * 0.9) % 3.7) < 0.1) f = 'blink';
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.3;
    if (f === 'hurt') {
      ctx.beginPath();
      ctx.moveTo(ex1 - 2, ey - 2.5); ctx.lineTo(ex1 + 1.8, ey); ctx.lineTo(ex1 - 2, ey + 2.4);
      ctx.moveTo(ex2 + 1.6, ey - 2.5); ctx.lineTo(ex2 - 1.8, ey); ctx.lineTo(ex2 + 1.6, ey + 2.4);
      ctx.stroke();
    } else if (f === 'ko') {
      for (const ex of [ex1, ex2]) {
        ctx.beginPath();
        for (let i = 0; i < 14; i++) {
          const a = i * 0.9, r = i * 0.18;
          const px = ex + Math.cos(a) * r, py = ey + Math.sin(a) * r;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
    } else if (f === 'happy' || f === 'blink') {
      ctx.beginPath();
      if (f === 'happy') {
        ctx.moveTo(ex1 - 2.4, ey + 1); ctx.quadraticCurveTo(ex1, ey - 2.6, ex1 + 2.4, ey + 1);
        ctx.moveTo(ex2 - 1.9, ey + 1); ctx.quadraticCurveTo(ex2, ey - 2.4, ex2 + 1.9, ey + 1);
      } else {
        ctx.moveTo(ex1 - 2.4, ey + 1); ctx.quadraticCurveTo(ex1, ey + 2.2, ex1 + 2.4, ey + 0.6);
        ctx.moveTo(ex2 - 1.9, ey + 1); ctx.quadraticCurveTo(ex2, ey + 2.2, ex2 + 1.9, ey + 0.6);
      }
      ctx.stroke();
    } else {
      const evil = f === 'evil' || f === 'angry' || L.evil;
      eyeOpen(ctx, ex1, ey, 2.5, 3.4, L.eye, evil, L.hypno);
      eyeOpen(ctx, ex2, ey, 1.9, 3.2, L.eye, evil, L.hypno);
      if (evil) {
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(ex1 - 2.6, ey - 5.2); ctx.lineTo(ex1 + 2.8, ey - 3.6);
        ctx.moveTo(ex2 - 2.2, ey - 4.2); ctx.lineTo(ex2 + 2.0, ey - 5.2);
        ctx.stroke();
      }
    }
    // ほっぺ
    ctx.fillStyle = 'rgba(255,105,140,.42)';
    ell(ctx, 8, 5.4, 2.1, 1.1); ctx.fill();
    ell(ctx, -3.6, 5.4, 1.8, 1.0); ctx.fill();
    // 口
    const mx = 3.3, my = 7.2;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.0;
    if (f === 'shout' || f === 'hurt') {
      ell(ctx, mx, my + 0.4, 1.9, f === 'hurt' ? 1.5 : 2.4);
      ctx.fillStyle = '#7a1f3a';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff8fa8';
      ell(ctx, mx, my + 1.4, 1.2, 0.8);
      ctx.fill();
    } else if (f === 'happy') {
      ctx.beginPath();
      ctx.moveTo(mx - 2.2, my - 0.4);
      ctx.quadraticCurveTo(mx, my + 3.6, mx + 2.2, my - 0.4);
      ctx.closePath();
      ctx.fillStyle = '#7a1f3a';
      ctx.fill();
      ctx.stroke();
    } else if (f === 'ko') {
      circ(ctx, mx, my + 0.5, 1.2);
      ctx.stroke();
    } else if (f === 'angry') {
      ctx.beginPath();
      ctx.moveTo(mx - 1.8, my + 1); ctx.quadraticCurveTo(mx, my - 0.6, mx + 1.8, my + 1);
      ctx.stroke();
    } else if (f === 'evil') {
      ctx.beginPath();
      ctx.moveTo(mx - 1.8, my); ctx.quadraticCurveTo(mx + 0.3, my + 1.6, mx + 2.4, my - 1);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(mx - 1.5, my); ctx.quadraticCurveTo(mx, my + 1.4, mx + 1.5, my);
      ctx.stroke();
    }
  }

  function accessory(ctx, L, a, t) {
    const ac = L.hat || L.accent;
    switch (a) {
      case 'ribbon': {
        ctx.save();
        ctx.translate(-8, -10.5);
        ctx.rotate(-0.4);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-6, -4.5); ctx.lineTo(-6, 4.5); ctx.closePath();
        ctx.moveTo(0, 0); ctx.lineTo(6, -4.5); ctx.lineTo(6, 4.5); ctx.closePath();
        fillOut(ctx, L.accent, 1);
        circ(ctx, 0, 0, 1.8); fillOut(ctx, shade(L.accent, -0.15), 1);
        ctx.restore();
        break;
      }
      case 'star':
        starPath(ctx, 6.5, -9, 4, 1.8, 5, 0.2);
        fillOut(ctx, '#ffd93b', 1);
        break;
      case 'flower':
        for (let i = 0; i < 5; i++) {
          const an = i * TAU / 5;
          circ(ctx, -8 + Math.cos(an) * 2.4, -9 + Math.sin(an) * 2.4, 2);
          fillOut(ctx, '#ffffff', 0.8);
        }
        circ(ctx, -8, -9, 1.6); fillOut(ctx, '#ffcf3b', 0.8);
        break;
      case 'cap':
        ctx.beginPath();
        ctx.arc(-0.5, -1.5, 13.8, Math.PI * 1.02, -0.1);
        ctx.closePath();
        fillOut(ctx, ac, 1.2);
        ctx.beginPath();
        ctx.moveTo(8, -5); ctx.quadraticCurveTo(15, -6, 19, -3); ctx.lineTo(9, -2.5); ctx.closePath();
        fillOut(ctx, shade(ac, -0.2), 1.1);
        break;
      case 'beret':
        ell(ctx, -1, -11, 13.5, 5, -0.2); fillOut(ctx, ac, 1.2);
        circ(ctx, -1.5, -16, 1.4); fillOut(ctx, ac, 1);
        break;
      case 'crown':
        ctx.beginPath();
        ctx.moveTo(-8, -10); ctx.lineTo(-9, -21); ctx.lineTo(-4.5, -15); ctx.lineTo(-1, -23);
        ctx.lineTo(2.5, -15); ctx.lineTo(7, -21); ctx.lineTo(6, -10); ctx.closePath();
        fillOut(ctx, '#ffcc33', 1.2);
        circ(ctx, -1, -13, 1.8); fillOut(ctx, '#ff3f7a', 0.8);
        break;
      case 'tiara':
        ctx.beginPath();
        ctx.moveTo(-6, -11); ctx.quadraticCurveTo(1, -16, 8, -9.5);
        ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = '#e6e9ff'; ctx.lineWidth = 1.7; ctx.stroke();
        starPath(ctx, 2, -15, 2.8, 1.2, 4); fillOut(ctx, '#bfefff', 0.8);
        break;
      case 'headphones':
        ctx.beginPath();
        ctx.arc(-1, -0.5, 14.5, Math.PI * 1.15, Math.PI * 1.85);
        ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = ac; ctx.lineWidth = 2.4; ctx.stroke();
        ell(ctx, -3, 0.5, 3.6, 4.8); fillOut(ctx, ac, 1.2);
        ell(ctx, -3, 0.5, 1.6, 2.6); fillOut(ctx, shade(ac, 0.4), 0.8);
        break;
      case 'tophat':
        ctx.save();
        ctx.translate(-1, -12);
        ctx.rotate(-0.25);
        ctx.beginPath(); ctx.rect(-5, -10, 10, 9); fillOut(ctx, ac, 1.1);
        ctx.beginPath(); ctx.rect(-9, -1.5, 18, 2.6); fillOut(ctx, ac, 1.1);
        ctx.fillStyle = L.accent2 || '#ff3f7a'; ctx.fillRect(-5, -4, 10, 2);
        ctx.restore();
        break;
      case 'sunglasses':
        ctx.beginPath();
        ctx.moveTo(-4.2, -0.6); ctx.lineTo(9, -1.2); ctx.lineTo(8.6, 3.6); ctx.lineTo(3.4, 4); ctx.lineTo(2.2, 1.8);
        ctx.lineTo(0.5, 3.8); ctx.lineTo(-3.6, 3.6); ctx.closePath();
        fillOut(ctx, '#20142a', 1);
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(5, 0.2); ctx.lineTo(7.4, 0.1); ctx.stroke();
        break;
      case 'band':
        ctx.beginPath();
        ctx.arc(-1, -0.5, 13.4, Math.PI * 1.2, Math.PI * 1.8);
        ctx.strokeStyle = OUT; ctx.lineWidth = 3.4; ctx.stroke();
        ctx.strokeStyle = L.accent; ctx.lineWidth = 2; ctx.stroke();
        break;
      case 'hairpin':
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(4, -9); ctx.lineTo(9, -6.5); ctx.stroke();
        ctx.strokeStyle = L.accent; ctx.lineWidth = 1.4; ctx.stroke();
        break;
      case 'moon':
        ctx.beginPath();
        ctx.arc(-8, -9, 4.4, 0.6, 0.6 + Math.PI * 1.4);
        ctx.arc(-6.5, -10, 3.4, 0.6 + Math.PI * 1.4, 0.6, true);
        ctx.closePath();
        fillOut(ctx, '#ffe58a', 0.9);
        break;
    }
  }

  // ---------- 小物（手に持つもの） ----------
  function prop(ctx, L, kind, x, y, a, o) {
    const dx = Math.sin(a), dy = Math.cos(a);
    switch (kind) {
      case 'micstand': {
        ctx.strokeStyle = OUT; ctx.lineWidth = 3.2;
        ctx.beginPath(); ctx.moveTo(x - dx * 8, y - dy * 8); ctx.lineTo(x + dx * 36, y + dy * 36); ctx.stroke();
        ctx.strokeStyle = L.propC || '#c9ccd8'; ctx.lineWidth = 1.6; ctx.stroke();
        ell(ctx, x + dx * 38, y + dy * 38, 3.2, 4, -a);
        fillOut(ctx, '#3a3a48', 1);
        circ(ctx, x + dx * 39, y + dy * 39, 1.4);
        ctx.fillStyle = L.accent; ctx.fill();
        break;
      }
      case 'mic':
        ctx.strokeStyle = OUT; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(x - dx * 2, y - dy * 2); ctx.lineTo(x + dx * 6, y + dy * 6); ctx.stroke();
        ctx.strokeStyle = L.propC || '#e8e8f0'; ctx.lineWidth = 2; ctx.stroke();
        circ(ctx, x + dx * 7.5, y + dy * 7.5, 2.6); fillOut(ctx, '#55556a', 1);
        break;
      case 'guitar': {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-a + Math.PI);
        // ネック（手の先へ伸びる）・ボディ（手元側）
        ctx.strokeStyle = OUT; ctx.lineWidth = 3.6;
        ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -26); ctx.stroke();
        ctx.strokeStyle = '#6b3b1f'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.rect(-2.6, -31, 5.2, 6); fillOut(ctx, '#2a1a30', 1);
        ell(ctx, 0, 10, 8.5, 7); fillOut(ctx, L.propC || '#e0303f', 1.2);
        ell(ctx, 0, 17, 10, 8); fillOut(ctx, L.propC || '#e0303f', 1.2);
        ell(ctx, 0, 13, 7.8, 9.5); ctx.fillStyle = L.propC || '#e0303f'; ctx.fill();
        circ(ctx, 0, 11, 2.4); ctx.fillStyle = '#2a1a30'; ctx.fill();
        ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-3.2, 15.5, 6.4, 1.6);
        ctx.restore();
        break;
      }
      case 'fan': {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-a + Math.PI);
        for (let i = -3; i <= 3; i++) {
          ell(ctx, Math.sin(i * 0.38) * 9, -Math.cos(i * 0.38) * 9, 2.6, 8, i * 0.38);
          fillOut(ctx, i % 2 ? (L.feather || '#ff4fa3') : '#ffd43b', 0.8);
        }
        ctx.restore();
        break;
      }
      case 'parasol': {
        if (o && o.propOpen) {
          ctx.strokeStyle = OUT; ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x, y - 26); ctx.stroke();
          ctx.strokeStyle = '#f5f0e6'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x - 22, y - 18);
          ctx.quadraticCurveTo(x, y - 40, x + 22, y - 18);
          for (let i = 0; i < 5; i++) ctx.quadraticCurveTo(x + 22 - i * 8.8 - 4.4, y - 14, x + 22 - (i + 1) * 8.8, y - 18);
          ctx.closePath();
          fillOut(ctx, L.propC || '#ff9ac6', 1.2);
          ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(x, y - 29); ctx.lineTo(x - 9, y - 18); ctx.moveTo(x, y - 29); ctx.lineTo(x + 9, y - 18); ctx.stroke();
        } else {
          ctx.strokeStyle = OUT; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x - dx * 6, y - dy * 6); ctx.lineTo(x + dx * 30, y + dy * 30); ctx.stroke();
          ctx.strokeStyle = '#f5f0e6'; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + dx * 8 + dy * 3.4, y + dy * 8 - dx * 3.4);
          ctx.lineTo(x + dx * 30, y + dy * 30);
          ctx.lineTo(x + dx * 8 - dy * 3.4, y + dy * 8 + dx * 3.4);
          ctx.closePath();
          fillOut(ctx, L.propC || '#ff9ac6', 1);
        }
        break;
      }
      case 'pompom':
        for (let i = 0; i < 6; i++) {
          circ(ctx, x + Math.cos(i) * 3, y + Math.sin(i * 1.7) * 3, 3.2);
          ctx.fillStyle = i % 2 ? (L.propC || '#ffd43b') : shade(L.propC || '#ffd43b', 0.35);
          ctx.fill();
        }
        break;
      case 'penlight': {
        const c = L.propC || '#ff5fb0';
        ctx.strokeStyle = rgba(c, 0.35); ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * 13, y + dy * 13); ctx.stroke();
        ctx.strokeStyle = c; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.9; ctx.stroke();
        break;
      }
      case 'maracas':
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * 5, y + dy * 5); ctx.stroke();
        ell(ctx, x + dx * 9, y + dy * 9, 3.4, 4.4, -a); fillOut(ctx, L.propC || '#3fd36b', 1);
        break;
    }
  }

  function cape(ctx, L, shX, shY, px, py, t, sw) {
    const wv = Math.sin(t * 3) * 2.5 - sw * 4;
    ctx.beginPath();
    ctx.moveTo(shX - px * 6, shY - py * 6);
    ctx.lineTo(shX + px * 3, shY + py * 3);
    ctx.quadraticCurveTo(shX - 6, -16, shX - 4 + wv * 0.4, -1);
    for (let i = 1; i <= 4; i++) ctx.quadraticCurveTo(shX - 4 - i * 6.5 + 3 + wv, 2, shX - 4 - i * 6.5 + wv, -1);
    ctx.quadraticCurveTo(shX - 26 + wv, -18, shX - px * 6, shY - py * 6);
    ctx.closePath();
    fillOut(ctx, L.cape, 1.3);
    ctx.strokeStyle = shade(L.cape, -0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(shX - 6, shY + 6); ctx.quadraticCurveTo(shX - 12, -16, shX - 14 + wv, -3);
    ctx.stroke();
  }

  // ---------- 全身 ----------
  // o: { t, flash, alpha, scale, sx（横つぶし、回転演出用）, swing（前進速度）, propOpen }
  function draw(ctx, look, pose, x, y, facing, o) {
    o = o || NO;
    const L = o.flash ? flashed(look) : look;
    const s = (look.size || 1) * (o.scale || 1);
    const t = o.t || 0, sw = o.swing || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing * s * (o.sx == null ? 1 : o.sx), s);
    if (pose.rot) { ctx.translate(0, -26); ctx.rotate(pose.rot); ctx.translate(0, 26); }
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const hx = pose.bx, hy = -28 + pose.by, ln = pose.lean;
    const ux = Math.sin(ln), uy = -Math.cos(ln);
    const px = -uy, py = ux;
    const shX = hx + ux * 16, shY = hy + uy * 16;
    const nkX = hx + ux * 19, nkY = hy + uy * 19;
    const ha = ln + pose.head;
    const hdX = nkX + Math.sin(ha) * 11, hdY = nkY - Math.cos(ha) * 11;
    const face = pose.face || o.face || 'normal';
    const dk = -0.2;

    if (L.cape) cape(ctx, L, shX, shY, px, py, t, sw);
    hairBack(ctx, L, hdX, hdY, ha, t, sw, ln);

    // 奥の腕
    const sk = L.skin;
    const fa = limb(ctx, shX - px * 1.6, shY - py * 1.6, pose.fU, 10, pose.fF, 10, 4.3, 4,
      shade(L.sleeve || sk, dk), shade(sk, dk), L.glove ? shade(L.glove, dk) : null, 0.45);
    hand(ctx, fa[2], fa[3], shade(L.glove || sk, dk));
    if (L.prop2) prop(ctx, L, L.prop2, fa[2], fa[3], pose.fF, o);

    // 脚（奥 → 手前）
    const thigh = L.legs || sk, shin = L.shin || thigh, boots = L.boots;
    const fl = limb(ctx, hx - px * 1.8, hy - py * 1.8, pose.fT, 13, pose.fS, 14, 5.8, 4.8,
      shade(thigh, dk), shade(shin, dk), boots ? shade(boots, dk) : null, 0.42);
    foot(ctx, fl[2], fl[3], pose.fS, shade(boots || shin, dk));
    const nl = limb(ctx, hx + px * 1.8, hy + py * 1.8, pose.nT, 13, pose.nS, 14, 5.8, 4.8,
      thigh, shin, boots, 0.42);
    foot(ctx, nl[2], nl[3], pose.nS, boots || shin);

    // スカート（太ももの向きに沿って広がる）
    const wx = hx + ux * 3, wy = hy + uy * 3;
    if (!L.pants) {
      let dx = Math.sin(pose.nT) + Math.sin(pose.fT) - ux * 0.8;
      let dy = Math.cos(pose.nT) + Math.cos(pose.fT) - uy * 0.8;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const qx = -dy, qy = dx;
      const flare = 10 + pose.skirt * 4 + (L.skirtW || 0);
      const len = 11 + (L.skirtL || 0);
      const bx = wx + dx * len, by = wy + dy * len;
      ctx.beginPath();
      ctx.moveTo(wx - qx * 5.5, wy - qy * 5.5);
      ctx.lineTo(bx - qx * flare, by - qy * flare);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const k0 = -1 + i * 2 / n, k1 = -1 + (i + 1) * 2 / n, km = (k0 + k1) / 2;
        ctx.quadraticCurveTo(bx + qx * flare * km + dx * 2.6, by + qy * flare * km + dy * 2.6,
          bx + qx * flare * k1, by + qy * flare * k1);
      }
      ctx.lineTo(wx + qx * 5.5, wy + qy * 5.5);
      ctx.closePath();
      fillOut(ctx, L.skirt, 1.2);
      ctx.strokeStyle = shade(L.skirt, -0.25);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const k of [-0.45, 0.1, 0.6]) {
        ctx.moveTo(wx + qx * 5.5 * k, wy + qy * 5.5 * k);
        ctx.lineTo(bx + qx * flare * k, by + qy * flare * k);
      }
      ctx.stroke();
      if (L.hem) {
        ctx.strokeStyle = L.hem;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bx - qx * flare * 0.98 - dx * 1.2, by - qy * flare * 0.98 - dy * 1.2);
        ctx.lineTo(bx + qx * flare * 0.98 - dx * 1.2, by + qy * flare * 0.98 - dy * 1.2);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(wx - px * 5.6, wy - py * 5.6);
      ctx.lineTo(wx + px * 5.6, wy + py * 5.6);
      ctx.lineTo(hx + px * 5.2 - ux * 3, hy + py * 5.2 - uy * 3);
      ctx.lineTo(hx - px * 5.2 - ux * 3, hy - py * 5.2 - uy * 3);
      ctx.closePath();
      fillOut(ctx, L.legs, 1.2);
    }

    // 胴
    ctx.beginPath();
    ctx.moveTo(hx + ux * 2 - px * 5, hy + uy * 2 - py * 5);
    ctx.lineTo(hx + ux * 2 + px * 5, hy + uy * 2 + py * 5);
    ctx.lineTo(hx + ux * 17 + px * 6.4, hy + uy * 17 + py * 6.4);
    ctx.quadraticCurveTo(nkX + px * 2, nkY + py * 2, nkX, nkY);
    ctx.quadraticCurveTo(nkX - px * 2, nkY - py * 2, hx + ux * 17 - px * 6.4, hy + uy * 17 - py * 6.4);
    ctx.closePath();
    fillOut(ctx, L.top, 1.2);
    if (L.jacket) {
      ctx.beginPath();
      ctx.moveTo(hx + ux * 2 - px * 5.2, hy + uy * 2 - py * 5.2);
      ctx.lineTo(hx + ux * 17 - px * 6.6, hy + uy * 17 - py * 6.6);
      ctx.lineTo(nkX - px * 0.5, nkY - py * 0.5);
      ctx.lineTo(hx + ux * 8 + px * 1, hy + uy * 8 + py * 1);
      ctx.lineTo(hx + ux * 2 + px * 0.5, hy + uy * 2 + py * 0.5);
      ctx.closePath();
      fillOut(ctx, L.jacket, 1);
    }
    // 腰のライン
    ctx.strokeStyle = L.accent;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(hx + ux * 4 - px * 4.8, hy + uy * 4 - py * 4.8);
    ctx.lineTo(hx + ux * 4 + px * 4.8, hy + uy * 4 + py * 4.8);
    ctx.stroke();
    // 胸の飾り
    const cx = hx + ux * 13 + px * 3.2, cy = hy + uy * 13 + py * 3.2;
    if (L.chest === 'bow' || !L.chest) {
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx - 3.6, cy - 2.6); ctx.lineTo(cx - 3.6, cy + 2.6); ctx.closePath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx + 3.6, cy - 2.6); ctx.lineTo(cx + 3.6, cy + 2.6); ctx.closePath();
      fillOut(ctx, L.accent, 0.9);
    } else if (L.chest === 'star') {
      starPath(ctx, cx, cy, 3.4, 1.5, 5);
      fillOut(ctx, L.accent, 0.9);
    } else if (L.chest === 'heart') {
      heartPath(ctx, cx, cy, 2.6);
      fillOut(ctx, L.accent, 0.9);
    } else if (L.chest === 'tie') {
      ctx.beginPath();
      ctx.moveTo(cx - 1.4, cy - 4); ctx.lineTo(cx + 1.4, cy - 4); ctx.lineTo(cx + 2, cy + 3); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 2, cy + 3);
      ctx.closePath();
      fillOut(ctx, L.accent, 0.9);
    } else if (L.chest === 'gem') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 3.4); ctx.lineTo(cx + 2.6, cy); ctx.lineTo(cx, cy + 3.4); ctx.lineTo(cx - 2.6, cy);
      ctx.closePath();
      fillOut(ctx, L.accent, 0.9);
    }

    // 首と頭
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(nkX, nkY + 1); ctx.lineTo(nkX + Math.sin(ha) * 4, nkY - Math.cos(ha) * 4); ctx.stroke();
    ctx.strokeStyle = sk;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.translate(hdX, hdY);
    ctx.rotate(ha);
    headInner(ctx, L, face, t);
    ctx.restore();

    // 手前の腕と小物
    const na = limb(ctx, shX + px * 1.6, shY + py * 1.6, pose.nU, 10, pose.nF, 10, 4.5, 4.2,
      L.sleeve || sk, sk, L.glove || null, 0.45);
    if (L.prop) prop(ctx, L, L.prop, na[2], na[3], pose.nF, o);
    hand(ctx, na[2], na[3], L.glove || sk);
    if (L.prop2 === 'pompom') prop(ctx, L, 'pompom', na[2], na[3], pose.nF, o);
    ctx.restore();
  }

  // 胸から上の肖像（HUD やセレクト画面用）。頭の中心を (x, y) に合わせる
  function bust(ctx, look, x, y, sc, face, t) {
    const pose = P({ face: face || 'normal' });
    const s = sc / (look.size || 1);
    draw(ctx, look, pose, x - 2.4 * sc, y + 57.9 * sc, 1, { t: t || 0, scale: s });
  }

  return { draw, bust, POSES, P, lerp, idle, walk, run, shade, rgba, starPath, heartPath, noteGlyph, ell, circ, fillOut, OUT };
})();
