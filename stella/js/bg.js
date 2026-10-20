'use strict';

// ---------- ステージ背景 ----------
// 遠景・中景・建物・床をそれぞれ横に長い「層」として持ち、スクロール速度を変えて重ねる（視差）。
// 動かない層は 256px 幅のタイルに描いてキャッシュし、雨・紙吹雪・観客のペンライトなど動くものは毎フレーム描く。

const BG = (() => {
  const H = 270, FLOOR = 170;

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = Math.imul(n, 9);
    n ^= n >>> 4;
    n = Math.imul(n, 0x27d4eb2d);
    n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  }

  class Layer {
    constructor(par, y0, h, objs, drawFn) {
      this.par = par; this.y0 = y0; this.h = h; this.objs = objs; this.drawFn = drawFn;
      this.tw = 256; this.cache = new Map(); this.scale = 0;
    }
    tile(i, scale) {
      if (scale !== this.scale) { this.cache.clear(); this.scale = scale; }
      let cv = this.cache.get(i);
      if (cv) { this.cache.delete(i); this.cache.set(i, cv); return cv; }
      cv = document.createElement('canvas');
      cv.width = Math.ceil(this.tw * scale);
      cv.height = Math.ceil(this.h * scale);
      const c = cv.getContext('2d');
      c.scale(cv.width / this.tw, cv.height / this.h);
      c.translate(-i * this.tw, -this.y0);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      this.drawFn(c, i * this.tw, (i + 1) * this.tw, this.objs);
      this.cache.set(i, cv);
      if (this.cache.size > 14) this.cache.delete(this.cache.keys().next().value);
      return cv;
    }
    draw(ctx, camX, W, scale) {
      const lx = camX * this.par;
      const a = Math.floor(lx / this.tw), b = Math.floor((lx + W) / this.tw);
      for (let i = a; i <= b; i++) {
        const sx = Math.round((i * this.tw - lx) * scale) / scale;
        const ex = Math.round(((i + 1) * this.tw - lx) * scale) / scale;
        ctx.drawImage(this.tile(i, scale), sx, this.y0, ex - sx, this.h);
      }
    }
  }
  // x 範囲に重なる物だけ描く
  function each(objs, x0, x1, fn) {
    for (const o of objs) if (o.x + o.w > x0 - 4 && o.x < x1 + 4) fn(o);
  }
  // 一定の間隔で物を並べる
  function strip(len, R, minW, maxW, gap, mk) {
    const out = [];
    let x = -200;
    while (x < len + 600) {
      const w = minW + R() * (maxW - minW);
      const o = mk(x, w, R);
      o.x = x; o.w = w;
      out.push(o);
      x += w + gap * R();
    }
    return out;
  }

  function windows(c, x, y, w, h, cw, ch, lit, R, dark) {
    for (let yy = y + 4; yy < y + h - ch; yy += ch * 2) {
      for (let xx = x + 3; xx < x + w - cw - 2; xx += cw * 2) {
        c.fillStyle = R() < 0.45 ? lit : dark;
        c.fillRect(xx, yy, cw, ch);
      }
    }
  }
  function glowText(c, text, x, y, size, col, font, rot) {
    c.save();
    c.translate(x, y);
    if (rot) c.rotate(rot);
    c.font = `900 ${size}px ${font || '"M PLUS Rounded 1c", sans-serif'}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = col;
    c.shadowBlur = 6;
    c.fillStyle = col;
    c.fillText(text, 0, 0);
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.6;
    c.fillText(text, 0, 0);
    c.restore();
  }
  function vText(c, text, x, y, size, col) {
    const chars = [...text];
    chars.forEach((ch, i) => glowText(c, ch, x, y + i * size * 1.05, size, col));
  }
  function sky(ctx, W, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, FLOOR);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, FLOOR + 2);
  }
  function stars(ctx, W, camX, n, t, seed) {
    for (let i = 0; i < n; i++) {
      const x = ((hash(i * 7 + seed) * 1400 - camX * 0.05) % 1400 + 1400) % 1400;
      if (x > W) continue;
      const y = hash(i * 13 + seed) * 110;
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + hash(i) * 2) + i));
      ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
      ctx.fillRect(x, y, 1.2, 1.2);
    }
  }
  // 床：斜めの目地と横の目地（カメラに依存しない斜投影）
  function floorGrid(c, x0, x1, base, line, step, rows) {
    c.fillStyle = base;
    c.fillRect(x0, FLOOR, x1 - x0, H - FLOOR);
    c.strokeStyle = line;
    c.lineWidth = 1;
    c.beginPath();
    for (let gx = Math.floor((x0 - 60) / step) * step; gx < x1 + 60; gx += step) {
      c.moveTo(gx, FLOOR);
      c.lineTo(gx - 34, H);
    }
    for (const r of rows) {
      c.moveTo(x0, r);
      c.lineTo(x1, r);
    }
    c.stroke();
  }

  // ================= テーマ =================
  const THEMES = {};

  // ---------- ソウル ----------
  THEMES.seoul = (len, R) => {
    const far = strip(len * 0.15 + 900, R, 26, 60, 6, (x, w, R) => ({ h: 40 + R() * 70 }));
    const tower = [{ x: 300, w: 40 }];
    const mid = strip(len * 0.45 + 900, R, 40, 80, 14, (x, w, R) => ({ h: 70 + R() * 60, sign: R() < 0.7, sc: ['#ff4fa3', '#39d3ff', '#b6ff3b', '#ffcf3b'][Math.floor(R() * 4)], txt: ['노래방', 'CAFE', '치킨', 'K-POP', 'PC방', 'STAR'][Math.floor(R() * 6)] }));
    const shops = strip(len + 600, R, 110, 150, 0, (x, w, R) => ({
      kind: Math.floor(R() * 4), col: ['#ff4fa3', '#39d3ff', '#b6ff3b', '#ffcf3b', '#b07bff'][Math.floor(R() * 5)],
      txt: ['노래방', 'CAFÉ', '치킨', 'IDOL', '편의점', 'DANCE', '24H', 'LIVE'][Math.floor(R() * 8)], seed: Math.floor(R() * 1e6),
    }));
    const signs = shops.map(s => ({ x: s.x, w: s.w, col: s.col }));
    return {
      sky: (ctx, W, camX, t) => { sky(ctx, W, ['#07061c', '#1d1145', '#4a1a66', '#7a2a7a']); stars(ctx, W, camX, 50, t, 3); },
      layers: [
        new Layer(0.15, 20, 150, { far, tower }, (c, x0, x1, o) => {
          each(o.tower, x0, x1, t => {
            c.fillStyle = '#2a1850';
            c.fillRect(t.x + 18, 30, 4, 110);
            c.beginPath(); c.moveTo(t.x + 12, 140); c.lineTo(t.x + 20, 60); c.lineTo(t.x + 28, 140); c.fill();
            c.fillRect(t.x + 10, 66, 20, 7);
            c.fillStyle = '#ff6fa8';
            c.fillRect(t.x + 11, 68, 18, 2);
            c.fillRect(t.x + 19, 26, 2, 4);
          });
          each(o.far, x0, x1, b => {
            c.fillStyle = '#251648';
            c.fillRect(b.x, 140 - b.h, b.w, b.h + 30);
            const r = rng(Math.floor(b.x));
            windows(c, b.x, 140 - b.h, b.w, b.h, 2, 2, 'rgba(255,215,120,.5)', r, 'rgba(0,0,0,0)');
          });
        }),
        new Layer(0.45, 30, 140, { mid }, (c, x0, x1, o) => {
          each(o.mid, x0, x1, b => {
            c.fillStyle = '#2e1f55';
            c.fillRect(b.x, 170 - b.h, b.w, b.h);
            c.fillStyle = '#3a2866';
            c.fillRect(b.x, 170 - b.h, b.w, 3);
            const r = rng(Math.floor(b.x) + 7);
            windows(c, b.x, 172 - b.h, b.w, b.h - 30, 4, 3, 'rgba(255,200,140,.55)', r, 'rgba(10,6,30,.6)');
            if (b.sign) {
              c.fillStyle = 'rgba(10,6,30,.8)';
              c.fillRect(b.x + b.w - 14, 176 - b.h, 11, 40);
              vText(c, b.txt.slice(0, 3), b.x + b.w - 8.5, 182 - b.h, 8, b.sc);
            }
          });
        }),
        new Layer(1, 60, 112, { shops }, (c, x0, x1, o) => {
          each(o.shops, x0, x1, s => {
            const r = rng(s.seed);
            c.fillStyle = '#211736';
            c.fillRect(s.x, 64, s.w, 108);
            c.fillStyle = '#2c1f48';
            c.fillRect(s.x, 64, s.w, 4);
            // 2 階の窓
            for (let i = 0; i < 3; i++) {
              c.fillStyle = r() < 0.5 ? 'rgba(255,190,120,.5)' : 'rgba(40,30,70,1)';
              c.fillRect(s.x + 10 + i * (s.w - 20) / 3, 74, (s.w - 20) / 3 - 8, 16);
            }
            // 看板
            c.fillStyle = 'rgba(10,6,25,.9)';
            c.fillRect(s.x + 8, 96, s.w - 16, 16);
            glowText(c, s.txt, s.x + s.w / 2, 104, 11, s.col);
            // 店先
            if (s.kind === 0) { // ガラス張りの店
              c.fillStyle = Fig.rgba(s.col, 0.25);
              c.fillRect(s.x + 8, 118, s.w - 16, 50);
              c.strokeStyle = 'rgba(255,255,255,.25)';
              c.strokeRect(s.x + 8.5, 118.5, s.w - 17, 49);
              c.fillStyle = 'rgba(255,255,255,.12)';
              c.beginPath(); c.moveTo(s.x + 20, 118); c.lineTo(s.x + 34, 118); c.lineTo(s.x + 16, 168); c.lineTo(s.x + 8, 168); c.fill();
            } else if (s.kind === 1) { // シャッター＋ポスター
              c.fillStyle = '#3a3450';
              c.fillRect(s.x + 8, 118, s.w - 16, 50);
              c.strokeStyle = '#2a2440';
              for (let y = 121; y < 168; y += 4) { c.beginPath(); c.moveTo(s.x + 8, y); c.lineTo(s.x + s.w - 8, y); c.stroke(); }
              const px = s.x + s.w / 2 - 14;
              c.fillStyle = s.col;
              c.fillRect(px, 124, 28, 36);
              c.fillStyle = '#1a1030';
              c.beginPath(); c.arc(px + 14, 136, 6, 0, Math.PI * 2); c.fill();
              c.fillRect(px + 8, 141, 12, 14);
              c.fillStyle = '#fff';
              c.font = '900 5px sans-serif';
              c.textAlign = 'center';
              c.fillText('WORLD IDOL', px + 14, 158);
            } else if (s.kind === 2) { // 自販機と入口
              for (let i = 0; i < 2; i++) {
                const vx = s.x + 12 + i * 20;
                c.fillStyle = i ? '#e83f5b' : '#3f7be8';
                c.fillRect(vx, 128, 17, 40);
                c.fillStyle = 'rgba(255,255,255,.75)';
                c.fillRect(vx + 2, 131, 13, 14);
                c.fillStyle = '#ffd34a';
                for (let k = 0; k < 4; k++) c.fillRect(vx + 3 + (k % 2) * 6, 133 + Math.floor(k / 2) * 6, 4, 4);
              }
              c.fillStyle = '#120c22';
              c.fillRect(s.x + s.w - 44, 122, 30, 46);
              c.fillStyle = Fig.rgba(s.col, 0.5);
              c.fillRect(s.x + s.w - 42, 124, 26, 3);
            } else { // 屋台
              c.fillStyle = '#5a2a3a';
              c.fillRect(s.x + 10, 140, s.w - 20, 28);
              c.fillStyle = '#ff6a4a';
              c.beginPath(); c.moveTo(s.x + 6, 128); c.lineTo(s.x + s.w - 6, 128); c.lineTo(s.x + s.w - 12, 138); c.lineTo(s.x + 12, 138); c.fill();
              c.fillStyle = '#ffd56a';
              for (let i = 0; i < 6; i++) c.fillRect(s.x + 16 + i * ((s.w - 32) / 6), 143, 6, 3);
            }
            // 柱
            c.fillStyle = '#16102a';
            c.fillRect(s.x, 64, 4, 108);
          });
        }),
        new Layer(1, FLOOR - 2, H - FLOOR + 2, { signs }, (c, x0, x1, o) => {
          floorGrid(c, x0, x1, '#1b1730', 'rgba(120,100,180,.25)', 42, [178, 190, 206, 226, 252]);
          c.fillStyle = '#2a2244';
          c.fillRect(x0, FLOOR - 2, x1 - x0, 6);
          // ネオンの映り込み
          each(o.signs, x0, x1, s => {
            const g = c.createLinearGradient(0, FLOOR, 0, FLOOR + 60);
            g.addColorStop(0, Fig.rgba(s.col, 0.16));
            g.addColorStop(1, Fig.rgba(s.col, 0));
            c.fillStyle = g;
            for (let k = 0; k < 5; k++) c.fillRect(s.x + 24 + k * (s.w - 48) / 5, FLOOR + 4 + k % 2 * 3, (s.w - 48) / 5 - 6, 46);
          });
        }),
      ],
      fx: null,
    };
  };

  // ---------- ニューヨーク ----------
  THEMES.ny = (len, R) => {
    const far = strip(len * 0.15 + 900, R, 22, 50, 4, (x, w, R) => ({ h: 50 + R() * 80, spire: R() < 0.15 }));
    const mid = strip(len * 0.45 + 900, R, 50, 90, 6, (x, w, R) => ({ h: 80 + R() * 60, bb: R() < 0.6, bc: ['#ff2e63', '#1d4ed8', '#ffcf3b', '#2ecc71'][Math.floor(R() * 4)], txt: ['LIVE', 'IDOL GP', '♥ NYC', 'SHOW', 'POP!'][Math.floor(R() * 5)] }));
    const bld = strip(len + 600, R, 130, 170, 0, (x, w, R) => ({ kind: Math.floor(R() * 3), col: ['#8a3a2e', '#7a4a3a', '#6a3a4a'][Math.floor(R() * 3)], seed: Math.floor(R() * 1e6) }));
    return {
      sky: (ctx, W) => sky(ctx, W, ['#3a2a7a', '#8a4a9a', '#ff6e7e', '#ffb36a']),
      layers: [
        new Layer(0.15, 20, 150, { far }, (c, x0, x1, o) => {
          each(o.far, x0, x1, b => {
            c.fillStyle = '#4a2f6e';
            c.fillRect(b.x, 150 - b.h, b.w, b.h + 20);
            if (b.spire) {
              c.beginPath(); c.moveTo(b.x + b.w * 0.2, 150 - b.h); c.lineTo(b.x + b.w / 2, 150 - b.h - 40); c.lineTo(b.x + b.w * 0.8, 150 - b.h); c.fill();
              c.fillRect(b.x + b.w / 2 - 1, 150 - b.h - 55, 2, 16);
            }
            const r = rng(Math.floor(b.x) * 3);
            windows(c, b.x, 150 - b.h, b.w, b.h, 2, 2, 'rgba(255,220,150,.45)', r, 'rgba(0,0,0,0)');
          });
        }),
        new Layer(0.45, 30, 140, { mid }, (c, x0, x1, o) => {
          each(o.mid, x0, x1, b => {
            c.fillStyle = '#5a3a6a';
            c.fillRect(b.x, 170 - b.h, b.w, b.h);
            const r = rng(Math.floor(b.x) * 5);
            windows(c, b.x, 172 - b.h, b.w, b.h, 4, 3, 'rgba(255,220,160,.5)', r, 'rgba(40,20,50,.5)');
            if (b.bb) {
              const bx = b.x + 6, by = 178 - b.h, bw = b.w - 12, bh = 30;
              c.fillStyle = '#111';
              c.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
              const g = c.createLinearGradient(bx, by, bx + bw, by + bh);
              g.addColorStop(0, b.bc);
              g.addColorStop(1, '#2a1040');
              c.fillStyle = g;
              c.fillRect(bx, by, bw, bh);
              glowText(c, b.txt, bx + bw / 2, by + bh / 2, 10, '#ffffff', '"Dela Gothic One", sans-serif');
            }
          });
        }),
        new Layer(1, 50, 122, { bld }, (c, x0, x1, o) => {
          each(o.bld, x0, x1, b => {
            c.fillStyle = b.col;
            c.fillRect(b.x, 54, b.w, 118);
            // れんが
            c.strokeStyle = 'rgba(0,0,0,.18)';
            c.lineWidth = 0.6;
            c.beginPath();
            for (let y = 56; y < 120; y += 5) { c.moveTo(b.x, y); c.lineTo(b.x + b.w, y); }
            c.stroke();
            // 窓と非常階段
            for (let i = 0; i < 3; i++) {
              const wx = b.x + 14 + i * (b.w - 28) / 3;
              c.fillStyle = '#2a1a2a';
              c.fillRect(wx, 60, 24, 20);
              c.fillStyle = 'rgba(255,200,120,.55)';
              c.fillRect(wx + 2, 62, 20, 16);
            }
            c.strokeStyle = '#1a1018';
            c.lineWidth = 1.4;
            c.strokeRect(b.x + 10, 84, b.w - 20, 1);
            for (let xx = b.x + 12; xx < b.x + b.w - 10; xx += 6) { c.beginPath(); c.moveTo(xx, 84); c.lineTo(xx, 90); c.stroke(); }
            c.beginPath(); c.moveTo(b.x + 10, 90); c.lineTo(b.x + b.w - 10, 90); c.stroke();
            if (b.kind === 0) { // 劇場のマーキー
              c.fillStyle = '#1a1020';
              c.fillRect(b.x + 8, 100, b.w - 16, 26);
              c.fillStyle = '#fff4d0';
              c.fillRect(b.x + 12, 104, b.w - 24, 18);
              c.fillStyle = '#c0182f';
              c.font = '900 10px "Dela Gothic One", sans-serif';
              c.textAlign = 'center';
              c.textBaseline = 'middle';
              c.fillText('IDOL SHOW', b.x + b.w / 2, 113.5);
              c.fillStyle = '#ffd56a';
              for (let xx = b.x + 10; xx < b.x + b.w - 8; xx += 6) { c.fillRect(xx, 100.5, 2, 2); c.fillRect(xx, 123.5, 2, 2); }
              c.fillStyle = '#3a1a20';
              c.fillRect(b.x + b.w / 2 - 22, 130, 44, 42);
              c.fillStyle = 'rgba(255,220,150,.4)';
              c.fillRect(b.x + b.w / 2 - 20, 132, 18, 40);
              c.fillRect(b.x + b.w / 2 + 2, 132, 18, 40);
            } else if (b.kind === 1) { // お店
              c.fillStyle = '#2a7a5a';
              c.beginPath(); c.moveTo(b.x + 6, 112); c.lineTo(b.x + b.w - 6, 112); c.lineTo(b.x + b.w - 14, 124); c.lineTo(b.x + 14, 124); c.fill();
              c.fillStyle = 'rgba(255,240,200,.35)';
              c.fillRect(b.x + 16, 128, b.w - 32, 44);
              c.strokeStyle = '#1a1018';
              c.strokeRect(b.x + 16, 128, b.w - 32, 44);
            } else { // 階段のある入口
              c.fillStyle = '#2a1a2a';
              c.fillRect(b.x + 20, 120, 30, 52);
              c.fillStyle = '#6a4a4a';
              for (let i = 0; i < 4; i++) c.fillRect(b.x + 14 - i * 2, 160 + i * 3, 42 + i * 4, 3);
              c.fillStyle = '#ffcf3b';
              c.beginPath(); c.arc(b.x + b.w - 30, 120, 6, 0, Math.PI * 2); c.fill();
            }
            c.fillStyle = 'rgba(0,0,0,.25)';
            c.fillRect(b.x, 54, 3, 118);
          });
        }),
        new Layer(1, FLOOR - 2, H - FLOOR + 2, {}, (c, x0, x1) => {
          floorGrid(c, x0, x1, '#a89cb4', 'rgba(70,50,80,.35)', 48, [184, 202, 224]);
          c.fillStyle = '#d8d0dc';
          c.fillRect(x0, FLOOR - 2, x1 - x0, 5);
          c.fillStyle = '#6a6070';
          c.fillRect(x0, 238, x1 - x0, 32);
          c.fillStyle = '#c8c0cc';
          c.fillRect(x0, 236, x1 - x0, 3);
          c.fillStyle = '#ffd34a';
          for (let x = Math.floor(x0 / 40) * 40; x < x1; x += 40) c.fillRect(x, 256, 22, 2);
        }),
      ],
    };
  };

  // ---------- ロンドン ----------
  THEMES.london = (len, R) => {
    const far = strip(len * 0.15 + 900, R, 30, 60, 8, (x, w, R) => ({ h: 30 + R() * 40 }));
    const marks = [{ x: 220, w: 40, k: 'clock' }, { x: 520, w: 90, k: 'wheel' }];
    const mid = strip(len * 0.45 + 900, R, 46, 70, 0, (x, w, R) => ({ h: 70 + R() * 30, col: ['#3a4358', '#434a60', '#38404f'][Math.floor(R() * 3)] }));
    const bld = strip(len + 600, R, 120, 160, 0, (x, w, R) => ({ kind: Math.floor(R() * 3), col: ['#4a3a40', '#3e3a48', '#523a3a'][Math.floor(R() * 3)], seed: Math.floor(R() * 1e6) }));
    const lamps = strip(len + 600, R, 10, 10, 220, () => ({}));
    return {
      sky: (ctx, W) => sky(ctx, W, ['#1a2033', '#2a3348', '#4a5670', '#6a6a80']),
      layers: [
        new Layer(0.15, 20, 150, { far, marks }, (c, x0, x1, o) => {
          c.fillStyle = '#2a3045';
          each(o.marks, x0, x1, m => {
            if (m.k === 'clock') {
              c.fillRect(m.x + 10, 40, 20, 110);
              c.beginPath(); c.moveTo(m.x + 8, 40); c.lineTo(m.x + 20, 10); c.lineTo(m.x + 32, 40); c.fill();
              c.fillStyle = '#e8d890';
              c.beginPath(); c.arc(m.x + 20, 52, 6, 0, Math.PI * 2); c.fill();
              c.strokeStyle = '#2a3045'; c.lineWidth = 1;
              c.beginPath(); c.moveTo(m.x + 20, 52); c.lineTo(m.x + 20, 48); c.moveTo(m.x + 20, 52); c.lineTo(m.x + 23, 52); c.stroke();
              c.fillStyle = '#2a3045';
            } else {
              c.strokeStyle = '#2a3045'; c.lineWidth = 2;
              c.beginPath(); c.arc(m.x + 45, 80, 40, 0, Math.PI * 2); c.stroke();
              c.lineWidth = 0.7;
              for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(m.x + 45, 80); c.lineTo(m.x + 45 + Math.cos(a) * 40, 80 + Math.sin(a) * 40); c.stroke(); }
              c.lineWidth = 2;
              c.beginPath(); c.moveTo(m.x + 45, 80); c.lineTo(m.x + 30, 150); c.moveTo(m.x + 45, 80); c.lineTo(m.x + 60, 150); c.stroke();
            }
          });
          each(o.far, x0, x1, b => {
            c.fillStyle = '#2a3045';
            c.fillRect(b.x, 150 - b.h, b.w, b.h + 20);
          });
        }),
        new Layer(0.45, 40, 130, { mid }, (c, x0, x1, o) => {
          each(o.mid, x0, x1, b => {
            c.fillStyle = b.col;
            c.fillRect(b.x, 170 - b.h, b.w, b.h);
            c.beginPath(); c.moveTo(b.x - 2, 170 - b.h); c.lineTo(b.x + b.w / 2, 158 - b.h); c.lineTo(b.x + b.w + 2, 170 - b.h); c.fill();
            c.fillRect(b.x + 8, 154 - b.h, 6, 12);
            const r = rng(Math.floor(b.x) * 11);
            windows(c, b.x + 2, 174 - b.h, b.w - 4, b.h - 10, 5, 6, 'rgba(255,214,140,.55)', r, 'rgba(20,24,36,.6)');
          });
        }),
        new Layer(1, 50, 122, { bld, lamps }, (c, x0, x1, o) => {
          each(o.bld, x0, x1, b => {
            c.fillStyle = b.col;
            c.fillRect(b.x, 56, b.w, 116);
            c.strokeStyle = 'rgba(0,0,0,.2)';
            c.lineWidth = 0.6;
            c.beginPath();
            for (let y = 58; y < 168; y += 5) { c.moveTo(b.x, y); c.lineTo(b.x + b.w, y); }
            c.stroke();
            for (let i = 0; i < 3; i++) {
              const wx = b.x + 12 + i * (b.w - 24) / 3;
              c.fillStyle = '#e8e0d0';
              c.fillRect(wx - 2, 62, 24, 26);
              c.fillStyle = 'rgba(255,200,120,.6)';
              c.fillRect(wx, 64, 20, 22);
              c.fillStyle = '#e8e0d0';
              c.fillRect(wx + 9, 64, 2, 22);
            }
            if (b.kind === 0) { // パブ
              c.fillStyle = '#1e3a2a';
              c.fillRect(b.x + 6, 98, b.w - 12, 74);
              c.fillStyle = '#c8a24a';
              c.font = '900 8px serif';
              c.textAlign = 'center';
              c.textBaseline = 'middle';
              c.fillText('THE ROCK & ROLL', b.x + b.w / 2, 104);
              c.fillStyle = 'rgba(255,200,110,.5)';
              c.fillRect(b.x + 14, 112, b.w / 2 - 20, 40);
              c.fillStyle = '#3a2a1a';
              c.fillRect(b.x + b.w / 2 + 6, 114, 24, 58);
            } else if (b.kind === 1) { // 電話ボックス
              c.fillStyle = '#3a2a2a';
              c.fillRect(b.x + 10, 100, b.w - 20, 72);
              const px = b.x + b.w - 40;
              c.fillStyle = '#c8202a';
              c.fillRect(px, 112, 22, 60);
              c.fillRect(px - 1, 108, 24, 6);
              c.fillStyle = 'rgba(255,230,180,.7)';
              for (let k = 0; k < 3; k++) c.fillRect(px + 3, 118 + k * 12, 16, 9);
              c.fillStyle = '#1a1a1a';
              c.fillRect(b.x + 18, 112, 40, 8);
              c.fillStyle = '#fff';
              c.font = '900 6px sans-serif';
              c.textAlign = 'center';
              c.fillText('RECORDS', b.x + 38, 117);
              c.fillStyle = 'rgba(255,200,110,.4)';
              c.fillRect(b.x + 18, 124, 40, 34);
            } else { // 黒い扉
              c.fillStyle = '#e8e0d0';
              c.fillRect(b.x + 30, 108, 34, 64);
              c.fillStyle = '#16161e';
              c.fillRect(b.x + 33, 112, 28, 60);
              c.fillStyle = '#d0b050';
              c.beginPath(); c.arc(b.x + 56, 142, 1.6, 0, Math.PI * 2); c.fill();
              c.fillStyle = '#5a6a3a';
              c.fillRect(b.x + 80, 150, 40, 22);
              c.fillStyle = '#7a9a4a';
              for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(b.x + 84 + k * 6.5, 150, 5, 0, Math.PI * 2); c.fill(); }
            }
          });
          each(o.lamps, x0, x1, l => {
            c.fillStyle = '#1a1a22';
            c.fillRect(l.x + 3, 96, 3, 76);
            c.fillRect(l.x, 94, 9, 4);
            c.fillRect(l.x + 1, 86, 7, 8);
            const g = c.createRadialGradient(l.x + 4.5, 90, 1, l.x + 4.5, 90, 26);
            g.addColorStop(0, 'rgba(255,230,160,.8)');
            g.addColorStop(1, 'rgba(255,230,160,0)');
            c.fillStyle = g;
            c.fillRect(l.x - 22, 64, 54, 54);
          });
        }),
        new Layer(1, FLOOR - 2, H - FLOOR + 2, { lamps }, (c, x0, x1, o) => {
          c.fillStyle = '#353a48';
          c.fillRect(x0, FLOOR - 2, x1 - x0, H - FLOOR + 2);
          // 石畳
          for (let r = 0, y = FLOOR + 2; y < H; r++) {
            const hgt = 6 + r * 1.6;
            const step = 14 + r * 2;
            for (let x = Math.floor(x0 / step) * step - (r % 2) * step / 2; x < x1 + step; x += step) {
              const k = hash(Math.floor(x * 7) + r * 1000);
              c.fillStyle = k < 0.5 ? '#3e4454' : '#444a5c';
              c.fillRect(x + 1, y + 1, step - 2, hgt - 2);
            }
            y += hgt;
          }
          each(o.lamps, x0, x1, l => {
            c.fillStyle = 'rgba(255,220,150,.13)';
            c.fillRect(l.x - 8, FLOOR + 6, 26, 90);
          });
          c.fillStyle = '#585e70';
          c.fillRect(x0, FLOOR - 2, x1 - x0, 5);
        }),
      ],
      fx: 'rain',
    };
  };

  // ---------- リオ ----------
  THEMES.rio = (len, R) => {
    const mts = [{ x: 60, w: 180 }, { x: 330, w: 140 }, { x: 600, w: 220 }, { x: 900, w: 160 }];
    const houses = strip(len * 0.45 + 900, R, 14, 24, 2, (x, w, R) => ({ h: 10 + R() * 14, y: 110 + R() * 40, col: ['#ff6a8a', '#ffd23b', '#3fd3a5', '#6ab0ff', '#ff9a4a', '#c87aff'][Math.floor(R() * 6)] }));
    const front = strip(len + 600, R, 110, 150, 0, (x, w, R) => ({ kind: Math.floor(R() * 3), col: ['#ffd23b', '#3fd3a5', '#ff6a8a', '#6ab0ff'][Math.floor(R() * 4)], seed: Math.floor(R() * 1e6) }));
    return {
      sky: (ctx, W) => sky(ctx, W, ['#5a3a90', '#c05a8a', '#ff8a5a', '#ffd06a']),
      layers: [
        new Layer(0.15, 40, 130, { mts }, (c, x0, x1, o) => {
          c.fillStyle = '#ffe9a0';
          c.beginPath(); c.arc(480, 100, 22, 0, Math.PI * 2); c.fill();
          each(o.mts, x0, x1, m => {
            c.fillStyle = '#6a3a7a';
            c.beginPath();
            c.moveTo(m.x, 150);
            c.quadraticCurveTo(m.x + m.w * 0.3, 150 - m.w * 0.55, m.x + m.w * 0.5, 150 - m.w * 0.6);
            c.quadraticCurveTo(m.x + m.w * 0.7, 150 - m.w * 0.55, m.x + m.w, 150);
            c.fill();
          });
          c.fillStyle = '#ff9a7a';
          c.fillRect(x0, 148, x1 - x0, 22);
          c.fillStyle = 'rgba(255,255,255,.35)';
          for (let x = Math.floor(x0 / 30) * 30; x < x1; x += 30) c.fillRect(x + (x % 60 ? 0 : 12), 154, 12, 1);
        }),
        new Layer(0.45, 80, 90, { houses }, (c, x0, x1, o) => {
          c.fillStyle = '#4a7a5a';
          c.beginPath(); c.moveTo(x0, 170); c.lineTo(x0, 120 + Math.sin(x0 * 0.01) * 10);
          for (let x = x0; x <= x1; x += 8) c.lineTo(x, 115 + Math.sin(x * 0.01) * 12);
          c.lineTo(x1, 170); c.fill();
          each(o.houses, x0, x1, h => {
            c.fillStyle = h.col;
            c.fillRect(h.x, h.y, h.w, h.h);
            c.fillStyle = 'rgba(0,0,0,.25)';
            c.fillRect(h.x + 3, h.y + 3, 3, 4);
            c.fillRect(h.x + h.w - 7, h.y + 3, 3, 4);
          });
        }),
        new Layer(1, 50, 122, { front }, (c, x0, x1, o) => {
          each(o.front, x0, x1, b => {
            const r = rng(b.seed);
            c.fillStyle = b.col;
            c.fillRect(b.x, 86, b.w, 86);
            c.fillStyle = 'rgba(255,255,255,.4)';
            c.fillRect(b.x, 86, b.w, 3);
            if (b.kind === 0) { // 窓と扉
              c.fillStyle = '#5a3a2a';
              c.fillRect(b.x + 16, 120, 24, 52);
              c.fillStyle = '#2a7a9a';
              c.fillRect(b.x + 54, 106, 22, 22);
              c.fillRect(b.x + 86, 106, 22, 22);
            } else if (b.kind === 1) { // ヤシの木
              c.fillStyle = 'rgba(255,255,255,.3)';
              c.fillRect(b.x + 8, 100, b.w - 16, 30);
              c.strokeStyle = '#7a4a2a';
              c.lineWidth = 5;
              c.beginPath(); c.moveTo(b.x + b.w / 2, 172); c.quadraticCurveTo(b.x + b.w / 2 + 10, 110, b.x + b.w / 2 - 4, 66); c.stroke();
              c.fillStyle = '#2a9a4a';
              for (let i = 0; i < 6; i++) {
                const a = -Math.PI / 2 + (i - 2.5) * 0.55;
                c.save(); c.translate(b.x + b.w / 2 - 4, 66); c.rotate(a + Math.PI / 2);
                c.beginPath(); c.ellipse(0, -16, 4, 18, 0, 0, Math.PI * 2); c.fill();
                c.restore();
              }
            } else { // パレードの山車
              c.fillStyle = '#ff4fa3';
              c.fillRect(b.x + 6, 120, b.w - 12, 40);
              c.fillStyle = '#ffd23b';
              for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(b.x + 14 + i * (b.w - 28) / 5, 120, 7, Math.PI, 0); c.fill(); }
              c.fillStyle = '#2a1a3a';
              c.beginPath(); c.arc(b.x + 24, 162, 8, 0, Math.PI * 2); c.arc(b.x + b.w - 24, 162, 8, 0, Math.PI * 2); c.fill();
              c.font = '900 12px "Dela Gothic One", sans-serif';
              c.textAlign = 'center'; c.textBaseline = 'middle';
              c.fillStyle = '#fff';
              c.fillText('CARNAVAL', b.x + b.w / 2, 140);
            }
            // 万国旗の紐
            c.strokeStyle = 'rgba(40,20,40,.6)';
            c.lineWidth = 0.6;
            c.beginPath(); c.moveTo(b.x, 70); c.quadraticCurveTo(b.x + b.w / 2, 82, b.x + b.w, 70); c.stroke();
            for (let i = 1; i < 10; i++) {
              const k = i / 10, fx = b.x + b.w * k, fy = 70 + Math.sin(k * Math.PI) * 6;
              c.fillStyle = ['#ff4fa3', '#ffd23b', '#3fd3a5', '#6ab0ff', '#ff6a4a'][Math.floor(r() * 5)];
              c.beginPath(); c.moveTo(fx - 3, fy); c.lineTo(fx + 3, fy); c.lineTo(fx, fy + 7); c.fill();
            }
          });
        }),
        new Layer(1, FLOOR - 2, H - FLOOR + 2, {}, (c, x0, x1) => {
          c.fillStyle = '#f4ecdc';
          c.fillRect(x0, FLOOR - 2, x1 - x0, H - FLOOR + 2);
          // コパカバーナの波模様
          c.fillStyle = '#2a2430';
          for (let row = 0; row < 6; row++) {
            const y0 = FLOOR + 8 + row * 16;
            c.beginPath();
            c.moveTo(x0 - 10, y0);
            for (let x = x0 - 10; x <= x1 + 10; x += 4) c.lineTo(x, y0 + Math.sin(x * 0.11 + row) * 3.5);
            for (let x = x1 + 10; x >= x0 - 10; x -= 4) c.lineTo(x, y0 + 6 + Math.sin(x * 0.11 + row + 0.6) * 3.5);
            c.closePath();
            c.fill();
          }
          c.fillStyle = '#c8b898';
          c.fillRect(x0, FLOOR - 2, x1 - x0, 4);
        }),
      ],
      fx: 'confetti',
    };
  };

  // ---------- パリ ----------
  THEMES.paris = (len, R) => {
    const eif = [{ x: 380, w: 70 }];
    const far = strip(len * 0.15 + 900, R, 30, 50, 10, (x, w, R) => ({ h: 20 + R() * 20 }));
    const mid = strip(len * 0.45 + 900, R, 60, 90, 0, (x, w, R) => ({ h: 70 + R() * 20 }));
    const front = strip(len + 600, R, 120, 150, 0, (x, w, R) => ({ kind: Math.floor(R() * 3), aw: ['#c8203a', '#2a4a9a', '#2a7a4a', '#d86a9a'][Math.floor(R() * 4)], seed: Math.floor(R() * 1e6) }));
    return {
      sky: (ctx, W, camX, t) => { sky(ctx, W, ['#3a2a7a', '#8a5ab0', '#e58ab8', '#ffc8b0']); stars(ctx, W, camX, 20, t, 9); },
      layers: [
        new Layer(0.15, 10, 160, { eif, far }, (c, x0, x1, o) => {
          each(o.far, x0, x1, b => { c.fillStyle = '#6a4a8a'; c.fillRect(b.x, 160 - b.h, b.w, b.h + 10); });
          each(o.eif, x0, x1, e => {
            const cx = e.x + 35;
            c.fillStyle = '#4a3060';
            c.beginPath();
            c.moveTo(cx - 32, 165); c.quadraticCurveTo(cx - 10, 110, cx - 3, 20); c.lineTo(cx + 3, 20); c.quadraticCurveTo(cx + 10, 110, cx + 32, 165);
            c.lineTo(cx + 20, 165); c.quadraticCurveTo(cx, 135, cx - 20, 165); c.closePath(); c.fill();
            c.fillRect(cx - 18, 118, 36, 4);
            c.fillRect(cx - 10, 78, 20, 3);
            c.fillRect(cx - 1, 8, 2, 14);
            c.fillStyle = 'rgba(255,230,160,.9)';
            for (let i = 0; i < 26; i++) {
              const k = hash(i * 31 + 7), yy = 24 + k * 138, sp = (yy - 20) / 145 * 28;
              c.fillRect(cx + (hash(i * 17) - 0.5) * 2 * sp, yy, 1.2, 1.2);
            }
          });
        }),
        new Layer(0.45, 50, 120, { mid }, (c, x0, x1, o) => {
          each(o.mid, x0, x1, b => {
            const top = 170 - b.h;
            c.fillStyle = '#e0d0b8';
            c.fillRect(b.x, top, b.w, b.h);
            c.fillStyle = '#6a7090';
            c.beginPath(); c.moveTo(b.x - 2, top); c.lineTo(b.x + 6, top - 12); c.lineTo(b.x + b.w - 6, top - 12); c.lineTo(b.x + b.w + 2, top); c.fill();
            for (let yy = top + 6; yy < 160; yy += 16) {
              for (let xx = b.x + 6; xx < b.x + b.w - 10; xx += 14) {
                c.fillStyle = hash(Math.floor(xx * 3 + yy)) < 0.5 ? 'rgba(255,210,140,.75)' : '#5a6080';
                c.fillRect(xx, yy, 7, 10);
              }
              c.fillStyle = '#3a3a4a';
              c.fillRect(b.x + 4, yy + 10, b.w - 8, 1.4);
            }
            c.fillStyle = 'rgba(0,0,0,.15)';
            c.fillRect(b.x + b.w - 2, top, 2, b.h);
          });
        }),
        new Layer(1, 50, 122, { front }, (c, x0, x1, o) => {
          each(o.front, x0, x1, b => {
            c.fillStyle = '#efe2cc';
            c.fillRect(b.x, 56, b.w, 116);
            c.fillStyle = '#d8c8b0';
            c.fillRect(b.x, 56, b.w, 3);
            c.fillRect(b.x, 96, b.w, 3);
            for (let i = 0; i < 3; i++) {
              const wx = b.x + 12 + i * (b.w - 24) / 3;
              c.fillStyle = '#5a6080';
              c.fillRect(wx, 64, 20, 26);
              c.fillStyle = 'rgba(255,214,150,.6)';
              c.fillRect(wx + 2, 66, 16, 22);
              c.fillStyle = '#2a2a3a';
              c.fillRect(wx - 3, 88, 26, 2);
              for (let k = 0; k < 6; k++) c.fillRect(wx - 2 + k * 4.6, 84, 1, 4);
              c.fillStyle = '#e04a7a';
              for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(wx + 2 + k * 5, 85, 2, 0, Math.PI * 2); c.fill(); }
            }
            // 日よけ
            for (let i = 0; i < 10; i++) {
              c.fillStyle = i % 2 ? '#fff' : b.aw;
              const ax = b.x + 6 + i * (b.w - 12) / 10;
              c.beginPath(); c.moveTo(ax, 104); c.lineTo(ax + (b.w - 12) / 10, 104); c.lineTo(ax + (b.w - 12) / 10 + 2, 118); c.lineTo(ax + 2, 118); c.fill();
            }
            c.fillStyle = 'rgba(255,220,170,.45)';
            c.fillRect(b.x + 12, 122, b.w - 24, 50);
            c.fillStyle = '#2a2a3a';
            c.font = '900 8px serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(['CAFÉ', 'BOUTIQUE', 'DÉFILÉ'][b.kind], b.x + b.w / 2, 100);
            if (b.kind === 0) {
              for (let i = 0; i < 2; i++) {
                const tx = b.x + 30 + i * 50;
                c.fillStyle = '#3a3a4a';
                c.fillRect(tx - 1, 152, 2, 20);
                c.beginPath(); c.ellipse(tx, 152, 9, 2, 0, 0, Math.PI * 2); c.fill();
              }
            }
          });
        }),
        new Layer(1, FLOOR - 2, H - FLOOR + 2, {}, (c, x0, x1) => {
          floorGrid(c, x0, x1, '#bfaea8', 'rgba(90,70,80,.3)', 22, [178, 188, 200, 214, 230, 250]);
          c.fillStyle = 'rgba(255,140,180,.45)';
          c.fillRect(x0, 206, x1 - x0, 26);
          c.fillStyle = 'rgba(212,175,55,.8)';
          c.fillRect(x0, 205, x1 - x0, 1.5);
          c.fillRect(x0, 232, x1 - x0, 1.5);
          c.fillStyle = '#d8c8c0';
          c.fillRect(x0, FLOOR - 2, x1 - x0, 4);
        }),
      ],
      fx: 'petals',
    };
  };

  // ---------- 東京ドーム（最終面） ----------
  THEMES.tokyo = (len, R) => {
    const screens = strip(len * 0.45 + 900, R, 90, 110, 120, (x, w, R) => ({ txt: ['WORLD IDOL GP', 'STELLA☆LINE', 'AURORA', 'FINAL STAGE'][Math.floor(R() * 4)] }));
    const panels = strip(len + 600, R, 64, 64, 0, () => ({}));
    const stacks = strip(len + 600, R, 24, 24, 260, () => ({}));
    return {
      sky: (ctx, W, camX, t) => {
        sky(ctx, W, ['#04020c', '#0c0620', '#1a0c36', '#2a1048']);
        // 天井のトラス
        ctx.strokeStyle = 'rgba(120,110,160,.35)';
        ctx.lineWidth = 1;
        const off = -(camX * 0.1) % 40;
        ctx.beginPath();
        ctx.moveTo(0, 14); ctx.lineTo(W, 14); ctx.moveTo(0, 22); ctx.lineTo(W, 22);
        for (let x = off - 40; x < W + 40; x += 20) { ctx.moveTo(x, 14); ctx.lineTo(x + 10, 22); ctx.lineTo(x + 20, 14); }
        ctx.stroke();
      },
      crowd: true,
      layers: [
        new Layer(0.45, 26, 100, { screens }, (c, x0, x1, o) => {
          each(o.screens, x0, x1, s => {
            c.fillStyle = '#0a0a14';
            c.fillRect(s.x - 3, 33, s.w + 6, 64);
            const g = c.createLinearGradient(s.x, 36, s.x + s.w, 94);
            g.addColorStop(0, '#3a0a5a');
            g.addColorStop(0.5, '#ff4fa3');
            g.addColorStop(1, '#2a1a7a');
            c.fillStyle = g;
            c.fillRect(s.x, 36, s.w, 58);
            c.fillStyle = 'rgba(0,0,0,.25)';
            for (let y = 36; y < 94; y += 2) c.fillRect(s.x, y, s.w, 1);
            glowText(c, s.txt, s.x + s.w / 2, 65, 9, '#ffffff', '"Dela Gothic One", sans-serif');
            c.fillStyle = '#222232';
            c.fillRect(s.x + s.w / 2 - 2, 97, 4, 30);
          });
        }),
        new Layer(1, 110, 62, { panels, stacks }, (c, x0, x1, o) => {
          // ステージの縁と LED パネル
          each(o.panels, x0, x1, p => {
            c.fillStyle = '#120a22';
            c.fillRect(p.x, 128, p.w, 44);
            c.strokeStyle = 'rgba(255,255,255,.08)';
            c.strokeRect(p.x + 0.5, 128.5, p.w - 1, 43);
          });
          each(o.stacks, x0, x1, s => {
            c.fillStyle = '#16161e';
            c.fillRect(s.x, 112, s.w, 60);
            c.fillStyle = '#2a2a36';
            for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(s.x + 12, 122 + k * 18, 7, 0, Math.PI * 2); c.fill(); }
            c.fillStyle = '#0a0a10';
            for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(s.x + 12, 122 + k * 18, 3, 0, Math.PI * 2); c.fill(); }
          });
        }),
        new Layer(1, FLOOR - 2, H - FLOOR + 2, {}, (c, x0, x1) => {
          floorGrid(c, x0, x1, '#120c22', 'rgba(140,110,220,.22)', 48, [182, 198, 220, 246]);
          c.fillStyle = '#d4af37';
          c.fillRect(x0, FLOOR - 2, x1 - x0, 2);
          c.fillStyle = 'rgba(255,255,255,.05)';
          c.fillRect(x0, FLOOR, x1 - x0, 14);
        }),
      ],
      fx: 'stage',
    };
  };

  // ================= 動く演出 =================
  function crowdDraw(ctx, W, camX, t, beat) {
    // 観客席（ペンライトが拍に合わせて揺れる）
    ctx.fillStyle = '#0a0618';
    ctx.fillRect(0, 96, W, 34);
    const cols = ['#ff4fa3', '#39d3ff', '#b6ff3b', '#ffd43b', '#b07bff', '#ffffff'];
    const sw = Math.sin(beat * Math.PI * 2);
    const off = camX * 0.3;
    ctx.lineCap = 'round';
    for (let row = 0; row < 3; row++) {
      const y = 104 + row * 9;
      const sp = 7 - row;
      const start = Math.floor(off / sp) - 1;
      for (let i = start; i < start + W / sp + 3; i++) {
        const x = i * sp - off + (row % 2) * 3;
        const h = hash(i * 7 + row * 1000);
        ctx.fillStyle = '#1c1430';
        ctx.beginPath(); ctx.arc(x, y + 4, 2.4, 0, Math.PI * 2); ctx.fill();
        if (h < 0.75) {
          const c = cols[Math.floor(h * 8) % cols.length];
          const a = sw * 0.5 * (h < 0.5 ? 1 : -1);
          ctx.strokeStyle = c;
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x, y + 2);
          ctx.lineTo(x + Math.sin(a) * 6, y + 2 - Math.cos(a) * 6);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function makeFx(kind) {
    const parts = [];
    return {
      kind,
      draw(ctx, W, camX, t, beat, mood) {
        if (kind === 'rain') {
          ctx.strokeStyle = 'rgba(190,210,255,.35)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          for (let i = 0; i < 90; i++) {
            const x = (hash(i * 3) * (W + 60) - camX * 1.1 + t * 60) % (W + 60);
            const xx = x < 0 ? x + W + 60 : x;
            const y = (hash(i * 5) * 300 + t * 420) % 300 - 20;
            ctx.moveTo(xx, y);
            ctx.lineTo(xx - 3, y + 9);
          }
          ctx.stroke();
          ctx.strokeStyle = 'rgba(200,220,255,.4)';
          for (let i = 0; i < 6; i++) {
            const p = (t * 1.6 + hash(i * 9)) % 1;
            const x = hash(i * 9 + Math.floor(t * 1.6 + hash(i * 9))) * W;
            const y = FLOOR + 10 + hash(i * 13 + Math.floor(t * 1.6 + hash(i * 9))) * 90;
            ctx.beginPath(); ctx.ellipse(x, y, 2 + p * 6, 0.6 + p * 1.5, 0, 0, Math.PI * 2); ctx.globalAlpha = 1 - p; ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else if (kind === 'confetti' || kind === 'petals') {
          const cols = kind === 'confetti' ? ['#ff4fa3', '#ffd23b', '#3fd3a5', '#6ab0ff', '#ff6a4a', '#fff'] : ['#ffc2dc', '#ff9ac6', '#ffe0ec'];
          for (let i = 0; i < 40; i++) {
            const sp = 20 + hash(i) * 30;
            const x = ((hash(i * 7) * (W + 40) + Math.sin(t + i) * 20 - camX * 0.8 + t * 10) % (W + 40) + W + 40) % (W + 40) - 20;
            const y = (hash(i * 11) * 300 + t * sp) % 290 - 15;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(t * 2 + i);
            ctx.fillStyle = cols[i % cols.length];
            if (kind === 'confetti') ctx.fillRect(-1.5, -1, 3 * Math.abs(Math.cos(t * 3 + i)) + 0.5, 2);
            else { ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 1.4 * Math.abs(Math.cos(t * 2 + i)) + 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
            ctx.restore();
          }
        } else if (kind === 'stage') {
          // ステージライトの光の筋
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const red = mood === 'red';
          for (let i = 0; i < 5; i++) {
            const bx = (i + 0.5) * W / 5;
            const a = Math.sin(t * 0.7 + i * 1.3) * 0.5;
            const col = red ? 'rgba(255,40,80,' : ['rgba(255,80,180,', 'rgba(80,200,255,', 'rgba(255,220,90,', 'rgba(180,120,255,', 'rgba(120,255,180,'][i];
            const g = ctx.createLinearGradient(bx, 20, bx, FLOOR + 80);
            g.addColorStop(0, col + '0.22)');
            g.addColorStop(1, col + '0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(bx - 2, 22);
            ctx.lineTo(bx + 2, 22);
            ctx.lineTo(bx + Math.sin(a) * 200 + 34, FLOOR + 90);
            ctx.lineTo(bx + Math.sin(a) * 200 - 34, FLOOR + 90);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      },
    };
  }

  function make(theme, len, seed) {
    const R = rng(seed || 1);
    const th = THEMES[theme](len, R);
    const fx = th.fx ? makeFx(th.fx) : null;
    return {
      theme,
      draw(ctx, camX, W, scale, t, beat, mood) {
        th.sky(ctx, W, camX, t);
        if (th.crowd) crowdDraw(ctx, W, camX, t, beat);
        for (const L of th.layers) L.draw(ctx, camX, W, scale);
        if (mood === 'red') {
          ctx.fillStyle = 'rgba(255,0,60,.12)';
          ctx.fillRect(0, 0, W, H);
        }
      },
      drawFx(ctx, camX, W, t, beat, mood) {
        if (fx) fx.draw(ctx, W, camX, t, beat, mood);
      },
    };
  }

  return { make, hash, rng, crowdDraw };
})();
