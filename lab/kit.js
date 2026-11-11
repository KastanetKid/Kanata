'use strict';
// Kanata Lab — 作品共通の道具（依存ライブラリなし）
//   Kit.gl      : WebGL2 の小さなラッパー（シェーダー、フルスクリーン描画、FBO）
//   Kit.Bloom   : HDR → ブルーム → トーンマップの後処理
//   Kit.Scaler  : フレーム時間を見て描画解像度を自動で上げ下げする
//   Kit.pointers: タッチ／マウスのドラッグとピンチをまとめて扱う
//   Kit.share   : 静止画・動画の撮影と、シェア／保存のシート
const Kit = (() => {
  // ---------- 乱数（名前やシードから毎回同じ値を作る） ----------
  function hashStr(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }
  function rng(seed) {
    let [a, b, c, d] = typeof seed === 'string' ? hashStr(seed) : hashStr(String(seed));
    const next = () => {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 12; i++) next();
    next.range = (lo, hi) => lo + (hi - lo) * next();
    next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
    next.pick = arr => arr[Math.floor(next() * arr.length)];
    next.chance = p => next() < p;
    return next;
  }

  // ---------- WebGL2 ----------
  const VS_FULL = `#version 300 es
  out vec2 vUv;
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  function initGL(canvas, opts) {
    const gl = canvas.getContext('webgl2', Object.assign({
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    }, opts || {}));
    if (!gl) return null;
    const halfFloat = !!gl.getExtension('EXT_color_buffer_half_float') || !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_float');
    const vao = gl.createVertexArray();

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
        console.error(log + '\n' + lines);
        throw new Error('shader: ' + log);
      }
      return s;
    }
    function program(fsSrc, vsSrc) {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc || VS_FULL));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        const name = info.name.replace(/\[0\]$/, '');
        u[name] = gl.getUniformLocation(p, name);
      }
      return { p, u, use() { gl.useProgram(p); return u; } };
    }
    function target(w, h, hdr, linear) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const useHdr = hdr && halfFloat;
      gl.texImage2D(gl.TEXTURE_2D, 0, useHdr ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, useHdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      const f = linear === false ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, w, h, free() { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); } };
    }
    function bind(t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
      gl.viewport(0, 0, t ? t.w : canvas.width, t ? t.h : canvas.height);
    }
    function tex(unit, t, loc) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t.tex || t);
      if (loc) gl.uniform1i(loc, unit);
    }
    function draw() {
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    return { gl, canvas, program, target, bind, tex, draw, halfFloat, VS_FULL };
  }

  // ---------- ブルーム（明るい所を縮小しながらぼかし、足し戻す） ----------
  const FS_DOWN = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uTex; uniform vec2 uPx; uniform float uThresh;
  void main() {
    vec3 a = texture(uTex, vUv + uPx * vec2(-1.0, -1.0)).rgb;
    vec3 b = texture(uTex, vUv + uPx * vec2( 1.0, -1.0)).rgb;
    vec3 c = texture(uTex, vUv + uPx * vec2(-1.0,  1.0)).rgb;
    vec3 d = texture(uTex, vUv + uPx * vec2( 1.0,  1.0)).rgb;
    vec3 e = texture(uTex, vUv).rgb;
    vec3 col = (a + b + c + d) * 0.2 + e * 0.2;
    if (uThresh > 0.0) {
      float l = max(col.r, max(col.g, col.b));
      col *= smoothstep(uThresh * 0.6, uThresh * 1.6, l);
      col = min(col, vec3(24.0));
    }
    o = vec4(col, 1.0);
  }`;
  const FS_UP = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uTex; uniform vec2 uPx;
  void main() {
    vec3 s = texture(uTex, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture(uTex, vUv + uPx * vec2(1.0, -1.0)).rgb
           + texture(uTex, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture(uTex, vUv + uPx * vec2(1.0, 1.0)).rgb;
    s += 2.0 * (texture(uTex, vUv + uPx * vec2(0.0, -1.4)).rgb + texture(uTex, vUv + uPx * vec2(0.0, 1.4)).rgb
           + texture(uTex, vUv + uPx * vec2(-1.4, 0.0)).rgb + texture(uTex, vUv + uPx * vec2(1.4, 0.0)).rgb);
    o = vec4(s / 12.0, 1.0);
  }`;
  const FS_FINAL = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 o;
  uniform sampler2D uTex, uBloom;
  uniform float uBloomAmt, uExposure, uVignette, uGrain, uTime;
  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  void main() {
    vec3 c = texture(uTex, vUv).rgb + texture(uBloom, vUv).rgb * uBloomAmt;
    c *= uExposure;
    vec2 q = vUv - 0.5;
    c *= 1.0 - uVignette * dot(q, q) * 1.6;
    c = aces(c);
    c = pow(c, vec3(1.0 / 2.2));
    c += (h21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * uGrain;
    o = vec4(c, 1.0);
  }`;

  function Bloom(G, levels) {
    const gl = G.gl;
    const pDown = G.program(FS_DOWN), pUp = G.program(FS_UP), pFinal = G.program(FS_FINAL);
    let scene = null, chain = [];
    const n = levels || 5;
    function resize(w, h) {
      if (scene && scene.w === w && scene.h === h) return;
      if (scene) scene.free();
      chain.forEach(t => t.free());
      scene = G.target(w, h, true);
      chain = [];
      let cw = w, ch = h;
      for (let i = 0; i < n; i++) {
        cw = Math.max(2, cw >> 1); ch = Math.max(2, ch >> 1);
        chain.push(G.target(cw, ch, true));
      }
    }
    // scene に描いたあとで呼ぶ。画面（または out）へ仕上げて出す
    function finish(o) {
      o = Object.assign({ bloom: 0.8, threshold: 1.0, exposure: 1.0, vignette: 0.5, grain: 0.03, time: 0, out: null }, o);
      gl.disable(gl.BLEND);
      let src = scene, u = pDown.use();
      for (let i = 0; i < chain.length; i++) {
        G.bind(chain[i]);
        G.tex(0, src, u.uTex);
        gl.uniform2f(u.uPx, 1 / src.w, 1 / src.h);
        gl.uniform1f(u.uThresh, i === 0 ? o.threshold : 0);
        G.draw();
        src = chain[i];
      }
      u = pUp.use();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = chain.length - 1; i > 0; i--) {
        G.bind(chain[i - 1]);
        G.tex(0, chain[i], u.uTex);
        gl.uniform2f(u.uPx, 1 / chain[i].w, 1 / chain[i].h);
        G.draw();
      }
      gl.disable(gl.BLEND);
      u = pFinal.use();
      G.bind(o.out);
      G.tex(0, scene, u.uTex);
      G.tex(1, chain[0], u.uBloom);
      gl.uniform1f(u.uBloomAmt, o.bloom / chain.length * 2.0);
      gl.uniform1f(u.uExposure, o.exposure);
      gl.uniform1f(u.uVignette, o.vignette);
      gl.uniform1f(u.uGrain, o.grain);
      gl.uniform1f(u.uTime, o.time);
      G.draw();
    }
    return { resize, finish, get scene() { return scene; } };
  }

  // ---------- 解像度の自動調整 ----------
  // 重いシェーダーでも止まらないように、フレーム時間を見て描画倍率を変える
  function Scaler(o) {
    o = Object.assign({ min: 0.3, max: Math.min(window.devicePixelRatio || 1, 2), start: 0, target: 1000 / 50 }, o);
    let scale = o.start || Math.min(o.max, 1);
    let acc = 0, cnt = 0, locked = false;
    return {
      get scale() { return scale; },
      set scale(v) { scale = v; },
      lock(v) { locked = v; },
      // dt はミリ秒。倍率が変わったら true
      tick(dt) {
        if (locked || dt > 250) return false;
        acc += dt; cnt++;
        if (cnt < 20) return false;
        const avg = acc / cnt;
        acc = 0; cnt = 0;
        let s = scale;
        if (avg > o.target * 1.25) s = Math.max(o.min, scale * Math.max(0.7, Math.sqrt(o.target / avg)));
        else if (avg < o.target * 0.72) s = Math.min(o.max, scale * 1.12);
        if (Math.abs(s - scale) < 0.02) return false;
        scale = s;
        return true;
      },
    };
  }
  // キャンバスの実ピクセル数を CSS サイズ × 倍率に合わせる
  function fit(canvas, scale) {
    const w = Math.max(2, Math.round(canvas.clientWidth * scale));
    const h = Math.max(2, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
    return false;
  }

  // ---------- ポインター ----------
  // onDrag(dx, dy, p), onPinch(ratio, cx, cy), onTap(x, y), onDown/onMove/onUp(p)
  function pointers(el, h) {
    const pts = new Map();
    let pinchD = 0, moved = 0, downT = 0;
    const dist = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      const p = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      pts.set(e.pointerId, p);
      if (pts.size === 1) { moved = 0; downT = performance.now(); }
      if (pts.size === 2) pinchD = dist();
      if (h.onDown) h.onDown(p, pts.size, e);
    });
    el.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p) { if (h.onHover) h.onHover(e.clientX, e.clientY); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) {
        if (h.onDrag) h.onDrag(dx, dy, p, e);
      } else if (pts.size === 2) {
        const d = dist();
        const [a, b] = [...pts.values()];
        if (pinchD > 0 && h.onPinch) h.onPinch(d / pinchD, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinchD = d;
      }
      if (h.onMove) h.onMove(p, pts.size, e);
    });
    const up = e => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      pts.delete(e.pointerId);
      if (pts.size === 0 && moved < 10 && performance.now() - downT < 400 && h.onTap) h.onTap(p.x, p.y);
      if (h.onUp) h.onUp(p, pts.size, e);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      if (h.onPinch) h.onPinch(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    return { get count() { return pts.size; }, pts };
  }

  // ---------- UI の小物 ----------
  const ICON = {
    back: '<svg viewBox="0 0 18 18"><path d="M11 3 5 9l6 6"/></svg>',
    cam: '<svg viewBox="0 0 18 18"><path d="M2 5h3l1.5-2h5L13 5h3v9H2z"/><circle cx="9" cy="9.5" r="2.6"/></svg>',
    rec: '<svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="5" fill="currentColor"/></svg>',
  };
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  let hintEl = null, hintT = 0;
  function hint(text, ms) {
    if (!hintEl) { hintEl = el('div', { class: 'k-hint', role: 'status' }); document.body.appendChild(hintEl); }
    hintEl.textContent = text;
    hintEl.classList.add('show');
    clearTimeout(hintT);
    hintT = setTimeout(() => hintEl.classList.remove('show'), ms || 3200);
  }
  function fail(msg) {
    document.body.appendChild(el('div', { class: 'k-fail' }, msg || 'この端末では WebGL2 が使えないため表示できません。<br>最近の Chrome / Safari / Firefox で開いてください。'));
  }

  // ---------- 撮影・録画・シェア ----------
  let sheet = null;
  function showResult(blob, name, text) {
    if (!sheet) { sheet = el('div', { class: 'k-sheet', hidden: '' }); document.body.appendChild(sheet); }
    const url = URL.createObjectURL(blob);
    const isVideo = blob.type.startsWith('video');
    const file = new File([blob], name, { type: blob.type });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    sheet.innerHTML = '';
    const card = el('div', { class: 'k-card' });
    const media = isVideo
      ? el('video', { class: 'k-media', src: url, autoplay: '', loop: '', muted: '', playsinline: '' })
      : el('img', { class: 'k-media', src: url, alt: '撮影した画像' });
    if (isVideo) media.muted = true;
    card.appendChild(media);
    const row = el('div', { class: 'k-row' });
    const close = () => { sheet.hidden = true; sheet.innerHTML = ''; setTimeout(() => URL.revokeObjectURL(url), 1000); };
    if (canShare) {
      row.appendChild(el('button', {
        class: 'k-btn on', onclick: async () => {
          try { await navigator.share({ files: [file], text: text || '' }); } catch (e) { /* キャンセルは無視 */ }
        },
      }, 'シェア'));
    }
    row.appendChild(el('a', { class: 'k-btn' + (canShare ? '' : ' on'), href: url, download: name }, '保存'));
    row.appendChild(el('button', { class: 'k-btn', onclick: close }, '閉じる'));
    card.appendChild(row);
    if (!canShare) card.appendChild(el('p', null, isVideo ? '保存した動画をそのまま SNS に投稿できます' : '保存した画像をそのまま SNS に投稿できます'));
    sheet.appendChild(card);
    sheet.hidden = false;
    sheet.onclick = e => { if (e.target === sheet) close(); };
  }

  const stamp = () => {
    const d = new Date(), z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  };

  // 静止画：render() で描き直した直後に 2D キャンバスへ写す（WebGL のバッファが消える前に）
  function snap(canvas, o) {
    o = o || {};
    if (o.render) o.render();
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const x = c.getContext('2d');
    x.drawImage(canvas, 0, 0);
    if (o.decorate) o.decorate(x, c.width, c.height);
    else watermark(x, c.width, c.height, o.label);
    c.toBlob(b => { if (b) showResult(b, `${o.name || 'kanata-lab'}-${stamp()}.png`, o.text); }, 'image/png');
  }
  function watermark(x, w, h, label) {
    const s = Math.max(10, Math.round(Math.min(w, h) * 0.026));
    x.font = `600 ${s}px ui-monospace, Menlo, Consolas, monospace`;
    x.textBaseline = 'alphabetic';
    x.fillStyle = 'rgba(242,239,230,.8)';
    x.shadowColor = '#000'; x.shadowBlur = s * 0.5;
    try { x.letterSpacing = `${s * 0.22}px`; } catch (e) { /* 古いブラウザ */ }
    x.fillText(label || 'KANATA LAB', s * 1.1, h - s * 1.1);
  }

  let recorder = null;
  const recType = () => {
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
    return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || null;
  };
  function record(canvas, o) {
    o = Object.assign({ seconds: 8, name: 'kanata-lab' }, o);
    if (recorder) { recorder.stop(); return; }
    const type = recType();
    if (!type) { hint('このブラウザは録画に対応していません'); return; }
    let stream;
    try { stream = canvas.captureStream(30); } catch (e) { hint('このブラウザは録画に対応していません'); return; }
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 9e6 });
    recorder = rec;
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      recorder = null;
      clearTimeout(timer);
      stream.getTracks().forEach(t => t.stop());
      if (o.onState) o.onState(false);
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      if (blob.size) showResult(blob, `${o.name}-${stamp()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, o.text);
    };
    rec.start(250);
    if (o.onState) o.onState(true);
    const timer = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, o.seconds * 1000);
  }

  // ---------- 画面の骨組み ----------
  // 上バー（戻る・題名・撮影・録画）と下の操作列を作る
  function chrome(o) {
    const top = el('div', { class: 'k-top' });
    top.appendChild(el('a', { class: 'k-btn', href: './', 'aria-label': 'ラボの一覧に戻る' }, ICON.back));
    top.appendChild(el('div', { class: 'k-title' }, `<b>${o.title}</b><span>${o.sub || ''}</span>`));
    const shot = el('button', { class: 'k-btn', 'aria-label': '画像を撮る', onclick: () => o.onSnap && o.onSnap() }, ICON.cam);
    top.appendChild(shot);
    let recBtn = null;
    if (o.canvas && recType()) {
      recBtn = el('button', {
        class: 'k-btn rec', 'aria-label': '8 秒の動画を録る',
        onclick: () => record(o.canvas, {
          name: o.name, text: o.text,
          onState: on => { recBtn.classList.toggle('on', on); if (on) hint('録画中… 8 秒で自動停止（もう一度押すと止まる）', 2600); },
        }),
      }, ICON.rec);
      top.appendChild(recBtn);
    }
    document.body.appendChild(top);
    const bar = el('div', { class: 'k-bar' + (o.center === false ? '' : ' center') });
    document.body.appendChild(bar);
    const api = {
      top, bar,
      button(label, fn, cls) {
        const b = el('button', { class: 'k-btn' + (cls ? ' ' + cls : ''), onclick: () => fn(b) }, label);
        bar.appendChild(b);
        return b;
      },
      toggle(label, initial, fn) {
        const b = el('button', { class: 'k-btn' + (initial ? ' on' : ''), 'aria-pressed': String(!!initial) }, label);
        b.addEventListener('click', () => {
          const v = !b.classList.contains('on');
          b.classList.toggle('on', v);
          b.setAttribute('aria-pressed', String(v));
          fn(v, b);
        });
        bar.appendChild(b);
        return b;
      },
    };
    return api;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return { hashStr, rng, initGL, Bloom, Scaler, fit, pointers, el, hint, fail, snap, watermark, record, showResult, chrome, clamp, lerp, reduced, stamp };
})();
