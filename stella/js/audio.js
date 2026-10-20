'use strict';

// ---------- サウンド ----------
// 音源ファイルは使わず、すべて Web Audio で合成する。
//  - BGM：曲ごとの設定（テンポ・キー・コード進行・ドラムの型）から、メロディを乱数の種で自動作曲して鳴らす
//  - 効果音：ノイズとオシレーターの組み合わせ
//  - ボイス：フォルマント合成の掛け声（「ハッ！」「きゃっ！」など）＋ 端末の日本語読み上げ（セリフ）

const Sound = (() => {
  let ac = null;
  let master, comp, musicBus, sfxBus, voiceBus, revIn, noiseBuf, pulse25, pulse12;
  const vol = { music: 0.7, sfx: 0.9, voice: 1 };
  let duckLevel = 1;

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function build(ctx) {
    ac = ctx;
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(comp).connect(ac.destination);
    musicBus = ac.createGain();
    sfxBus = ac.createGain();
    voiceBus = ac.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    voiceBus.connect(master);
    applyVolume();

    // ノイズ（1 秒）
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // 残響（ノイズを減衰させたインパルス）
    const len = Math.floor(ac.sampleRate * 1.6);
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ac.createConvolver();
    conv.buffer = ir;
    revIn = ac.createGain();
    const revOut = ac.createGain();
    revOut.gain.value = 0.32;
    revIn.connect(conv).connect(revOut).connect(master);

    pulse25 = pulseWave(0.25);
    pulse12 = pulseWave(0.125);
  }

  function pulseWave(duty) {
    const n = 40, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      re[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
      im[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
    }
    return ac.createPeriodicWave(re, im);
  }

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      build(new AC({ latencyHint: 'interactive' }));
    } catch (e) {
      ac = null;
    }
  }
  function suspend() { if (ac && ac.state === 'running') ac.suspend(); }
  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

  function applyVolume() {
    if (!ac) return;
    const t = ac.currentTime;
    musicBus.gain.setTargetAtTime(vol.music * 0.55 * duckLevel, t, 0.08);
    sfxBus.gain.setTargetAtTime(vol.sfx * 0.7, t, 0.03);
    voiceBus.gain.setTargetAtTime(vol.voice * 0.9, t, 0.03);
  }
  function setVolume(k, v) { vol[k] = v; applyVolume(); }
  function duck(on) { duckLevel = on ? 0.45 : 1; applyVolume(); }

  // ---------- 部品 ----------
  function G(v, dest) {
    const g = ac.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }
  function noise(t, dur, dest, offset) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.connect(dest);
    s.start(t, offset == null ? Math.random() * 0.5 : offset, dur + 0.05);
    return s;
  }
  function filt(type, f, q, dest) {
    const b = ac.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    if (q != null) b.Q.value = q;
    if (dest) b.connect(dest);
    return b;
  }
  // 短い減衰エンベロープ
  function env(t, peak, dur, dest, attack) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + (attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    return g;
  }
  function tone(type, f, t, dur, dest) {
    const o = ac.createOscillator();
    if (type === 'p25') o.setPeriodicWave(pulse25);
    else if (type === 'p12') o.setPeriodicWave(pulse12);
    else o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // ---------- 楽器 ----------
  const VOW = { a: [900, 1500, 2900], i: [350, 2550, 3400], u: [380, 1350, 2600], e: [560, 2200, 3100], o: [560, 950, 2800] };

  // 「ラララ」と歌っているようなリード（ノコギリ波をフォルマントで母音っぽくする）
  function vocalLead(t, m, dur, vel, vowel, dest) {
    const f = mtof(m);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.03);
    g.gain.setValueAtTime(vel * 0.85, t + Math.max(0.035, dur - 0.03));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.07);
    g.connect(dest);
    g.connect(G(0.35, revIn));
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.linearRampToValueAtTime(f, t + 0.045);
    const lfo = ac.createOscillator();
    lfo.frequency.value = 5.6;
    const lg = ac.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.014, t + Math.min(dur, 0.4) + 0.01);
    lfo.connect(lg).connect(o.frequency);
    const F = VOW[vowel] || VOW.a;
    const Q = [5, 9, 12], A = [1.7, 1.05, 0.55];
    for (let i = 0; i < 3; i++) o.connect(filt('bandpass', F[i] * 1.06, Q[i], G(A[i], g)));
    o.connect(filt('lowpass', 1800, 0.5, G(0.16, g)));
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.12); lfo.stop(t + dur + 0.12);
  }

  function pulseLead(t, m, dur, vel, dest, type) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.01);
    g.gain.setValueAtTime(vel * 0.7, t + 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    g.connect(dest);
    g.connect(G(0.25, revIn));
    const o = tone(type || 'p25', mtof(m), t, dur + 0.06, g);
    const lfo = ac.createOscillator();
    lfo.frequency.value = 6;
    const lg = G(0, null);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(mtof(m) * 0.01, t + Math.min(0.3, dur));
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.08);
  }

  function brassLead(t, m, dur, vel, dest) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.03);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    g.connect(dest);
    g.connect(G(0.2, revIn));
    const lp = filt('lowpass', 600, 2, g);
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(3200, t + 0.05);
    lp.frequency.linearRampToValueAtTime(1600, t + dur);
    tone('sawtooth', mtof(m), t, dur + 0.06, lp);
    tone('sawtooth', mtof(m) * 1.006, t, dur + 0.06, lp);
  }

  let distCurve = null;
  function curve() {
    if (!distCurve) {
      distCurve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) distCurve[i] = Math.tanh((i / 512 - 1) * 4);
    }
    return distCurve;
  }
  function distLead(t, m, dur, vel, dest) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.01);
    g.gain.setValueAtTime(vel * 0.8, t + Math.max(0.02, dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
    g.connect(dest);
    g.connect(G(0.2, revIn));
    const ws = ac.createWaveShaper();
    ws.curve = curve();
    const lp = filt('lowpass', 2600, 1, g);
    ws.connect(lp);
    const pre = G(0.6, ws);
    const o = tone('sawtooth', mtof(m), t, dur + 0.05, pre);
    tone('square', mtof(m) * 0.5, t, dur + 0.05, G(0.4, pre));
    const lfo = ac.createOscillator();
    lfo.frequency.value = 6.5;
    const lg = G(0, null);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(mtof(m) * 0.012, t + Math.min(0.3, dur));
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.06);
  }

  // グロッケン風のベル（FM）
  function bell(t, m, dur, vel, dest) {
    const f = mtof(m);
    const g = env(t, vel, dur + 0.5, dest, 0.002);
    g.connect(G(0.4, revIn));
    const car = tone('sine', f, t, dur + 0.5, g);
    const mod = ac.createOscillator();
    mod.frequency.value = f * 3.5;
    const mg = ac.createGain();
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 0.5);
    mod.connect(mg).connect(car.frequency);
    mod.start(t);
    mod.stop(t + dur + 0.55);
  }

  function bass(t, m, dur, vel, kind, dest) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.setValueAtTime(vel * 0.8, t + Math.max(0.01, dur - 0.03));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    g.connect(dest);
    if (kind === 'sub') {
      const o = tone('sine', mtof(m), t, dur + 0.03, g);
      tone('triangle', mtof(m) * 2, t, dur + 0.03, G(0.25, g));
      o.frequency.setValueAtTime(mtof(m) * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.05);
    } else {
      const lp = filt('lowpass', 400, 4, g);
      lp.frequency.setValueAtTime(kind === 'saw' ? 2200 : 1500, t);
      lp.frequency.exponentialRampToValueAtTime(350, t + Math.min(0.25, dur + 0.05));
      tone(kind === 'saw' ? 'sawtooth' : 'p25', mtof(m), t, dur + 0.03, lp);
      tone('sine', mtof(m), t, dur + 0.03, G(0.6, g));
    }
  }

  function stab(t, notes, dur, vel, dest) {
    const g = env(t, vel, dur + 0.12, dest, 0.004);
    g.connect(G(0.3, revIn));
    const lp = filt('lowpass', 2600, 1, g);
    for (const n of notes) {
      tone('sawtooth', mtof(n), t, dur + 0.12, G(0.35, lp));
      tone('triangle', mtof(n) * 1.003, t, dur + 0.12, G(0.4, lp));
    }
  }

  function pad(t, notes, dur, vel, dest, choir) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + Math.min(0.25, dur * 0.3));
    g.gain.setValueAtTime(vel, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
    g.connect(dest);
    g.connect(G(0.6, revIn));
    let target;
    if (choir) {
      target = G(1, null);
      const F = VOW.a;
      for (let i = 0; i < 2; i++) target.connect(filt('bandpass', F[i] * 0.9, 6, G(1.4 - i * 0.5, g)));
    } else {
      target = filt('lowpass', 1500, 0.7, g);
    }
    for (const n of notes) {
      tone('sawtooth', mtof(n) * 0.997, t, dur + 0.3, G(0.22, target));
      tone('sawtooth', mtof(n) * 1.004, t, dur + 0.3, G(0.22, target));
    }
  }

  function power(t, root, dur, vel, dest) {
    const g = env(t, vel, dur + 0.08, dest, 0.003);
    const lp = filt('lowpass', 2400, 0.8, g);
    const ws = ac.createWaveShaper();
    ws.curve = curve();
    ws.connect(lp);
    const pre = G(0.5, ws);
    for (const n of [root, root + 7, root + 12]) tone('sawtooth', mtof(n), t, dur + 0.08, pre);
  }

  // ---------- ドラム ----------
  function kick(t, v, dest) {
    const g = env(t, v, 0.32, dest);
    const o = tone('sine', 150, t, 0.32, g);
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    noise(t, 0.01, filt('highpass', 3000, 0.5, env(t, v * 0.3, 0.015, dest)));
  }
  function snare(t, v, dest) {
    noise(t, 0.18, filt('bandpass', 1900, 0.7, env(t, v, 0.17, dest)));
    tone('triangle', 195, t, 0.1, env(t, v * 0.7, 0.09, dest));
    const r = env(t, v * 0.25, 0.25, revIn);
    noise(t, 0.2, filt('bandpass', 2500, 0.8, r));
  }
  function clap(t, v, dest) {
    const b = filt('bandpass', 1300, 1.2, dest);
    for (let i = 0; i < 3; i++) noise(t + i * 0.011, 0.02, env(t + i * 0.011, v * (i === 2 ? 1 : 0.6), i === 2 ? 0.14 : 0.012, b));
    noise(t, 0.2, env(t, v * 0.3, 0.25, filt('bandpass', 1300, 1, revIn)));
  }
  function hat(t, v, open, dest) {
    noise(t, open ? 0.26 : 0.05, filt('highpass', 7500, 0.6, env(t, v, open ? 0.25 : 0.045, dest)));
  }
  function crash(t, v, dest) {
    noise(t, 1.3, filt('highpass', 4500, 0.4, env(t, v, 1.25, dest)));
  }
  function tom(t, f, v, dest) {
    const o = tone('sine', f, t, 0.3, env(t, v, 0.28, dest));
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.25);
  }
  function surdo(t, v, dest) {
    const o = tone('sine', 95, t, 0.5, env(t, v, 0.45, dest));
    o.frequency.exponentialRampToValueAtTime(58, t + 0.3);
  }
  function agogo(t, hi, v, dest) {
    const f = hi ? 920 : 690;
    tone('sine', f, t, 0.12, env(t, v, 0.11, dest));
    tone('square', f * 1.5, t, 0.06, env(t, v * 0.15, 0.05, dest));
  }
  function shaker(t, v, dest) {
    noise(t, 0.05, filt('bandpass', 6500, 1.5, env(t, v, 0.04, dest, 0.01)));
  }
  function whistle(t, dur, v, dest) {
    const o = tone('sine', 2900, t, dur, env(t, v, dur, dest, 0.01));
    const m = ac.createOscillator();
    m.frequency.value = 38;
    const mg = G(140, o.frequency);
    m.connect(mg);
    m.start(t);
    m.stop(t + dur + 0.05);
  }

  // ---------- 声（フォルマント合成） ----------
  // 各単語は [音素, 秒] の並び。h/k/t は子音（ノイズ）
  const WORDS = {
    ha: [['h', 0.035], ['a', 0.13]],
    ya: [['i', 0.03], ['a', 0.14]],
    ei: [['e', 0.08], ['i', 0.08]],
    tou: [['t', 0.015], ['o', 0.1], ['u', 0.09]],
    sei: [['h', 0.05], ['e', 0.08], ['i', 0.1]],
    kya: [['k', 0.02], ['i', 0.035], ['a', 0.2]],
    un: [['u', 0.13]],
    fu: [['h', 0.04], ['u', 0.14]],
    yaa: [['i', 0.04], ['a', 0.36]],
    aa: [['a', 0.55]],
    hai: [['h', 0.03], ['a', 0.1], ['i', 0.08]],
    oi: [['o', 0.1], ['i', 0.08]],
    ufu: [['u', 0.08], ['h', 0.04], ['u', 0.12]],
    hu: [['h', 0.06], ['u', 0.2]],
    yeah: [['i', 0.04], ['e', 0.12], ['a', 0.2]],
  };
  const PITCH = {
    kya: [1.0, 1.3, 0.95], aa: [1.1, 1.0, 0.55], yaa: [1.0, 1.2, 0.9], hai: [1.0, 1.05, 0.9],
    fu: [1.05, 0.95, 0.8], ufu: [1.0, 1.1, 0.9],
  };
  let lastVoice = {};
  function say(word, f0, opts) {
    if (!ac) return;
    opts = opts || {};
    const seq = WORDS[word];
    if (!seq) return;
    const dest = opts.dest || voiceBus;
    const t = (opts.t || ac.currentTime) + 0.005;
    const fs = opts.formant || 1.05;
    const total = seq.reduce((a, s) => a + s[1], 0);
    const amp = opts.gain == null ? 0.9 : opts.gain;
    // 同じ話者の前の声は止める
    const key = opts.who;
    if (key && lastVoice[key]) {
      try { lastVoice[key].gain.cancelScheduledValues(t); lastVoice[key].gain.setTargetAtTime(0, t, 0.01); } catch (e) { /* 無視 */ }
    }
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.connect(dest);
    if (!opts.dry) out.connect(G(0.25, revIn));
    if (key) lastVoice[key] = out;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    const pc = PITCH[word] || [1.0, 1.12, 0.86];
    const jit = 1 + (Math.random() - 0.5) * 0.04;
    o.frequency.setValueAtTime(f0 * pc[0] * jit, t);
    o.frequency.linearRampToValueAtTime(f0 * pc[1] * jit, t + total * 0.3);
    o.frequency.linearRampToValueAtTime(f0 * pc[2] * jit, t + total);
    const vib = ac.createOscillator();
    vib.frequency.value = 7;
    vib.connect(G(f0 * 0.02, o.frequency));
    const bands = [];
    const Q = [6, 10, 12], A = [2.2, 1.4, 0.8];
    const voiced = ac.createGain();
    voiced.gain.setValueAtTime(0, t);
    const unv = ac.createGain();
    unv.gain.setValueAtTime(0, t);
    o.connect(voiced);
    const nz = ac.createBufferSource();
    nz.buffer = noiseBuf;
    nz.connect(unv);
    for (let i = 0; i < 3; i++) {
      const b = filt('bandpass', 800, Q[i], G(A[i], out));
      voiced.connect(b);
      unv.connect(b);
      bands.push(b);
    }
    const click = filt('highpass', 2500, 0.7, G(0.6, out));
    let tt = t;
    out.gain.linearRampToValueAtTime(amp, t + 0.012);
    for (let i = 0; i < seq.length; i++) {
      const [ph, d] = seq[i];
      if (ph === 'h' || ph === 'k' || ph === 't') {
        const next = seq[i + 1] ? VOW[seq[i + 1][0]] || VOW.a : VOW.a;
        for (let j = 0; j < 3; j++) bands[j].frequency.setValueAtTime(next[j] * fs, tt);
        if (ph === 'h') {
          unv.gain.setValueAtTime(0.7, tt);
          unv.gain.setValueAtTime(0, tt + d);
          voiced.gain.setValueAtTime(0, tt);
        } else {
          const cg = env(tt, 0.9, 0.03, click);
          noise(tt, 0.03, cg);
        }
      } else {
        const F = VOW[ph];
        for (let j = 0; j < 3; j++) {
          if (i === 0) bands[j].frequency.setValueAtTime(F[j] * fs, tt);
          else bands[j].frequency.linearRampToValueAtTime(F[j] * fs, tt + Math.min(0.04, d * 0.5));
        }
        voiced.gain.setValueAtTime(1, tt);
        unv.gain.setValueAtTime(0, tt);
      }
      tt += d;
    }
    out.gain.setValueAtTime(amp, Math.max(t + 0.013, tt - 0.05));
    out.gain.linearRampToValueAtTime(0.0001, tt + 0.03);
    o.start(t); vib.start(t); nz.start(t, Math.random() * 0.4);
    o.stop(tt + 0.06); vib.stop(tt + 0.06); nz.stop(tt + 0.06);
  }

  // 観客のコール（「ハイ！」を何人かで）
  function crowd(word, t, dest, v) {
    const base = [220, 260, 300, 340];
    for (let i = 0; i < 4; i++) {
      say(word, base[i] * (1 + Math.random() * 0.03), { t: t + Math.random() * 0.015, gain: (v || 0.3), dest, formant: 0.95 + i * 0.05, dry: true });
    }
  }

  // ---------- 作曲 ----------
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
  const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
  // 2 小節ぶんのリズム（[開始 16 分, 長さ]）
  const RHY_VERSE = [
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2], [16, 2], [18, 2], [20, 4], [24, 6]],
    [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4], [16, 3], [19, 3], [22, 2], [24, 8]],
    [[2, 2], [4, 2], [6, 4], [10, 2], [12, 2], [14, 2], [16, 4], [20, 2], [22, 2], [24, 4], [28, 4]],
    [[0, 2], [2, 1], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4], [16, 2], [18, 2], [20, 2], [22, 2], [24, 7]],
  ];
  const RHY_CHORUS = [
    [[0, 4], [4, 2], [6, 4], [10, 2], [12, 4], [16, 6], [22, 2], [24, 8]],
    [[0, 2], [2, 4], [6, 2], [8, 2], [10, 4], [14, 2], [16, 4], [20, 4], [24, 4], [28, 4]],
    [[0, 3], [3, 3], [6, 6], [12, 2], [14, 2], [16, 3], [19, 3], [22, 10]],
    [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4], [16, 2], [18, 2], [20, 2], [22, 2], [24, 8]],
  ];

  function chordOf(key, scale, deg, minor) {
    const s = i => key + scale[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7);
    const n = [s(deg), s(deg + 2), s(deg + 4)];
    if (minor && deg % 7 === 4) n[1] += 1; // 和声的短音階の V
    return n;
  }

  function buildSong(def) {
    const R = rng(def.seed || 1);
    const minor = !!def.minor;
    const scale = minor ? MINOR : MAJOR;
    const key = def.key;
    const bars = [];
    const melody = [];
    let loopBar = 0;
    // メロディの基準音は G3〜B4 あたりに収める
    let base = key;
    while (base < 60) base += 12;
    while (base > 71) base -= 12;
    const degToMidi = d => base + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const chordDegs = deg => [deg, deg + 2, deg + 4];
    // 一番近いコードトーンの度数
    const snap = (d, deg) => {
      let best = d, bd = 99;
      for (const c of chordDegs(deg)) {
        for (let o = -14; o <= 14; o += 7) {
          const cand = c + o;
          if (Math.abs(cand - d) < bd) { bd = Math.abs(cand - d); best = cand; }
        }
      }
      return best;
    };
    // 動いた向きにあるコードトーンへ寄せる（同じ音が続きすぎないように）
    const snapDir = (d, deg, dir) => {
      if (!dir) return snap(d, deg);
      let best = null;
      for (const c of chordDegs(deg)) {
        for (let o = -14; o <= 21; o += 7) {
          const cand = c + o;
          if (dir > 0 ? cand >= d : cand <= d) {
            if (best == null || Math.abs(cand - d) < Math.abs(best - d)) best = cand;
          }
        }
      }
      return best == null ? snap(d, deg) : best;
    };
    for (let si = 0; si < def.sections.length; si++) {
      const sec = def.sections[si];
      if (si === def.loop) loopBar = bars.length;
      const start = bars.length;
      for (let b = 0; b < sec.bars; b++) {
        const deg = sec.prog[b % sec.prog.length];
        bars.push({ sec: sec.name, kind: sec.kind, b, n: sec.bars, deg, chord: chordOf(key, scale, deg, minor), energy: sec.energy || 0 });
        melody.push([]);
      }
      if (!sec.mel) continue;
      const chorus = sec.mel === 'chorus';
      const lo = chorus ? 2 : 0, hi = chorus ? 10 : 8;
      const rhyPool = chorus ? RHY_CHORUS : RHY_VERSE;
      const phrases = sec.bars / 2;
      // a, a', b, a''（サビは c, c', d, 終止）
      const shapeA = { rhy: rhyPool[Math.floor(R() * rhyPool.length)], steps: [] };
      const shapeB = { rhy: rhyPool[Math.floor(R() * rhyPool.length)], steps: [] };
      const mkSteps = shape => {
        shape.steps = [];
        for (let i = 0; i < shape.rhy.length; i++) {
          const r = R();
          let st = r < 0.42 ? 1 : r < 0.75 ? -1 : r < 0.85 ? 2 : r < 0.95 ? -2 : 0;
          shape.steps.push(st);
        }
      };
      mkSteps(shapeA);
      mkSteps(shapeB);
      let prev = chorus ? 7 : 4;
      for (let p = 0; p < phrases; p++) {
        const shape = (p === 2) ? shapeB : shapeA;
        const barA = start + p * 2;
        let d = snap(prev + (p === 0 ? 0 : shape.steps[0]), bars[barA].deg);
        for (let i = 0; i < shape.rhy.length; i++) {
          const [s0, len] = shape.rhy[i];
          const bi = barA + (s0 >= 16 ? 1 : 0);
          const st = s0 % 16;
          const dir = i > 0 ? Math.sign(shape.steps[i]) : 0;
          if (i > 0) {
            d += shape.steps[i];
            // 4 度と 7 度は少しだけ避けて、ペンタトニック寄りに
            const m = ((d % 7) + 7) % 7;
            if (!minor && (m === 3 || m === 6) && R() < 0.6) d += shape.steps[i] >= 0 ? 1 : -1;
          }
          if (d > hi) d -= 2 + Math.floor(R() * 2);
          if (d < lo) d += 2 + Math.floor(R() * 2);
          if (st % 8 === 0 || len >= 4) {
            d = snapDir(d, bars[bi].deg, dir);
            if (d > hi + 1) d = snapDir(d - 3, bars[bi].deg, -1);
            if (d < lo - 1) d = snapDir(d + 3, bars[bi].deg, 1);
          }
          let L = len;
          // セクションの最後は主音で長くのばす
          if (p === phrases - 1 && i === shape.rhy.length - 1) {
            d = snap(d, 0);
            if (chorus) d = Math.round(d / 7) * 7;
          }
          const vowels = chorus ? 'aaoaeaou' : 'aiueoaoi';
          melody[bi].push({ s: st, d: L, m: degToMidi(d), v: vowels[(i + p) % vowels.length] });
        }
        prev = d;
      }
    }
    return { def, bars, melody, loopBar, minor, key };
  }

  // ---------- 曲データ ----------
  // 度数：0 = I（短調なら i）
  const SONGS = {
    title: {
      bpm: 156, key: 62, seed: 11, drums: 'pop', lead: 'vocal', bassKind: 'pulse', chants: true, loop: 1,
      sections: [
        { name: 'I', bars: 4, prog: [3, 4, 2, 5], energy: 1 },
        { name: 'A', bars: 8, prog: [0, 4, 5, 2, 3, 0, 1, 4], mel: 'verse', energy: 1 },
        { name: 'B', bars: 8, prog: [3, 4, 2, 5, 1, 2, 3, 4], mel: 'verse', energy: 2 },
        { name: 'C', bars: 8, prog: [3, 4, 2, 5, 3, 4, 0, 0], mel: 'chorus', energy: 3 },
      ],
    },
    seoul: {
      bpm: 148, key: 61, seed: 23, drums: 'kpop', lead: 'p25', bassKind: 'sub', minor: true, loop: 1,
      sections: [
        { name: 'I', bars: 4, prog: [0, 5, 6, 4], energy: 1 },
        { name: 'A', bars: 8, prog: [0, 5, 2, 6, 0, 5, 3, 4], mel: 'verse', energy: 1 },
        { name: 'B', bars: 8, prog: [5, 6, 0, 0, 5, 6, 4, 4], mel: 'verse', energy: 2 },
        { name: 'C', bars: 8, prog: [5, 6, 0, 0, 5, 6, 4, 0], mel: 'chorus', energy: 3 },
      ],
    },
    ny: {
      bpm: 132, key: 65, seed: 37, drums: 'disco', lead: 'brass', bassKind: 'saw', chants: true, loop: 1,
      sections: [
        { name: 'I', bars: 4, prog: [1, 4, 0, 5], energy: 1 },
        { name: 'A', bars: 8, prog: [1, 4, 0, 5, 1, 4, 0, 0], mel: 'verse', energy: 1 },
        { name: 'B', bars: 8, prog: [3, 2, 1, 4, 3, 2, 1, 4], mel: 'verse', energy: 2 },
        { name: 'C', bars: 8, prog: [0, 5, 1, 4, 0, 5, 1, 4], mel: 'chorus', energy: 3 },
      ],
    },
    london: {
      bpm: 168, key: 64, seed: 41, drums: 'rock', lead: 'vocal', bassKind: 'saw', minor: true, guitar: true, oi: true, loop: 1,
      sections: [
        { name: 'I', bars: 4, prog: [0, 5, 6, 6], energy: 2 },
        { name: 'A', bars: 8, prog: [0, 6, 5, 6, 0, 6, 5, 4], mel: 'verse', energy: 2 },
        { name: 'B', bars: 8, prog: [3, 4, 5, 6, 3, 4, 2, 4], mel: 'verse', energy: 2 },
        { name: 'C', bars: 8, prog: [0, 6, 5, 6, 0, 6, 4, 0], mel: 'chorus', energy: 3 },
      ],
    },
    rio: {
      bpm: 150, key: 67, seed: 53, drums: 'samba', lead: 'vocal', bassKind: 'pulse', bells: true, loop: 1,
      sections: [
        { name: 'I', bars: 4, prog: [0, 4, 0, 4], energy: 2 },
        { name: 'A', bars: 8, prog: [0, 5, 1, 4, 0, 5, 1, 4], mel: 'verse', energy: 2 },
        { name: 'B', bars: 8, prog: [3, 4, 2, 5, 3, 4, 1, 4], mel: 'verse', energy: 2 },
        { name: 'C', bars: 8, prog: [3, 4, 2, 5, 3, 4, 0, 0], mel: 'chorus', energy: 3 },
      ],
    },
    paris: {
      bpm: 128, key: 63, seed: 67, drums: 'disco', lead: 'vocal', bassKind: 'pulse', strings: true, loop: 1,
      sections: [
        { name: 'I', bars: 4, prog: [0, 2, 3, 4], energy: 1 },
        { name: 'A', bars: 8, prog: [0, 2, 3, 4, 0, 2, 1, 4], mel: 'verse', energy: 1 },
        { name: 'B', bars: 8, prog: [5, 2, 3, 0, 5, 2, 1, 4], mel: 'verse', energy: 2 },
        { name: 'C', bars: 8, prog: [3, 4, 2, 5, 1, 4, 0, 0], mel: 'chorus', energy: 3 },
      ],
    },
    tokyo: {
      bpm: 172, key: 62, seed: 79, drums: 'pop', lead: 'vocal', bassKind: 'pulse', chants: true, bells: true, loop: 1,
      sections: [
        { name: 'I', bars: 4, prog: [3, 4, 2, 5], energy: 2 },
        { name: 'A', bars: 8, prog: [0, 4, 5, 2, 3, 0, 3, 4], mel: 'verse', energy: 2 },
        { name: 'B', bars: 8, prog: [1, 2, 3, 4, 1, 2, 3, 4], mel: 'verse', energy: 2 },
        { name: 'C', bars: 8, prog: [3, 4, 2, 5, 3, 4, 0, 0], mel: 'chorus', energy: 3 },
      ],
    },
    boss: {
      bpm: 164, key: 57, seed: 97, drums: 'boss', lead: 'dist', bassKind: 'saw', minor: true, loop: 1,
      sections: [
        { name: 'I', bars: 4, prog: [0, 0, 5, 4], energy: 2 },
        { name: 'A', bars: 8, prog: [0, 5, 6, 0, 0, 5, 3, 4], mel: 'verse', energy: 2 },
        { name: 'C', bars: 8, prog: [5, 6, 0, 0, 5, 6, 4, 4], mel: 'chorus', energy: 3 },
      ],
    },
    final: {
      bpm: 176, key: 62, seed: 113, drums: 'boss', lead: 'dist', bassKind: 'saw', minor: true, choir: true, bells: true, loop: 1,
      sections: [
        { name: 'I', bars: 4, prog: [0, 5, 3, 4], energy: 2 },
        { name: 'A', bars: 8, prog: [0, 5, 6, 2, 0, 5, 3, 4], mel: 'verse', energy: 2 },
        { name: 'B', bars: 8, prog: [5, 6, 2, 5, 3, 6, 4, 4], mel: 'verse', energy: 3 },
        { name: 'C', bars: 8, prog: [5, 6, 0, 3, 5, 6, 4, 0], mel: 'chorus', energy: 3 },
      ],
    },
    ending: {
      bpm: 120, key: 60, seed: 131, drums: 'ballad', lead: 'vocal', bassKind: 'pulse', bells: true, strings: true, loop: 0,
      sections: [
        { name: 'A', bars: 8, prog: [0, 4, 5, 2, 3, 0, 3, 4], mel: 'verse', energy: 1 },
        { name: 'C', bars: 8, prog: [3, 4, 2, 5, 3, 4, 0, 0], mel: 'chorus', energy: 2 },
      ],
    },
  };
  const built = {};
  function getSong(id) {
    if (!built[id]) built[id] = buildSong(SONGS[id]);
    return built[id];
  }

  // ---------- 1 ステップぶんを鳴らす ----------
  function playStep(song, bi, st, t, dest, spb) {
    const def = song.def;
    const bar = song.bars[bi];
    const e = bar.energy;
    const last = bar.b === bar.n - 1;
    const first = bar.b === 0;
    const chorus = bar.sec === 'C';
    const ch = bar.chord;
    const root = ch[0] - 24;
    const s16 = spb / 4;
    // 和音を 60〜72 付近に寄せる
    const voiced = ch.map(n => { let m = n; while (m < 60) m += 12; while (m > 72) m -= 12; return m; }).sort((a, b) => a - b);

    // ドラム
    const D = def.drums;
    const fill = last && st >= 8 && D !== 'ballad';
    if (first && st === 0 && bar.sec !== 'I') crash(t, 0.22, dest);
    if (D === 'pop' || D === 'disco') {
      if (st % 4 === 0) kick(t, 0.9, dest);
      if (st === 4 || st === 12) { snare(t, 0.5, dest); clap(t, 0.35, dest); }
      if (D === 'disco' || e >= 3) { if (st % 4 === 2) hat(t, 0.2, true, dest); else if (st % 2 === 0) hat(t, 0.12, false, dest); }
      else if (st % 2 === 0) hat(t, st % 4 === 2 ? 0.16 : 0.1, false, dest);
      if (e >= 3 && st % 2 === 1) hat(t, 0.06, false, dest);
      if (fill && st % 2 === 0 && st !== 12) snare(t, 0.2 + (st - 8) * 0.04, dest);
    } else if (D === 'kpop') {
      if (st === 0 || st === 7 || st === 10) kick(t, 0.95, dest);
      if (st === 4 || st === 12) { clap(t, 0.5, dest); snare(t, 0.25, dest); }
      hat(t, st % 4 === 2 ? 0.14 : 0.07, false, dest);
      if (last && st >= 12) { hat(t + s16 / 2, 0.08, false, dest); }
    } else if (D === 'rock') {
      if (st === 0 || st === 6 || st === 8 || st === 10) kick(t, 0.9, dest);
      if (st === 4 || st === 12) snare(t, 0.6, dest);
      if (st % 2 === 0) hat(t, 0.14, e >= 3 && st % 4 === 2, dest);
      if (fill && st % 2 === 0) tom(t, 200 - (st - 8) * 12, 0.5, dest);
    } else if (D === 'samba') {
      if (st === 0 || st === 8) kick(t, 0.6, dest);
      if (st === 4 || st === 12) surdo(t, 0.9, dest);
      if ([0, 3, 6, 8, 10, 13].includes(st)) snare(t, 0.12, dest);
      if ([0, 2, 5, 8, 10, 13].includes(st)) agogo(t, st % 8 < 4, 0.12, dest);
      shaker(t, st % 4 === 0 ? 0.16 : 0.08, dest);
      if (first && st === 0) { whistle(t, 0.08, 0.12, dest); whistle(t + s16 * 2, 0.08, 0.12, dest); whistle(t + s16 * 4, 0.2, 0.12, dest); }
    } else if (D === 'boss') {
      if (st % 4 === 0 || st === 10 || st === 14) kick(t, 0.95, dest);
      if (st === 4 || st === 12) snare(t, 0.6, dest);
      hat(t, st % 2 === 0 ? 0.13 : 0.07, false, dest);
      if (fill && st % 2 === 0) tom(t, 220 - (st - 8) * 15, 0.5, dest);
    } else if (D === 'ballad') {
      if (st === 0 || st === 10) kick(t, 0.7, dest);
      if (st === 8) snare(t, 0.35, dest);
      if (st % 2 === 0) hat(t, 0.06, false, dest);
    }

    // ベース
    const bk = def.bassKind;
    if (D === 'boss') {
      if (st % 2 === 0) bass(t, root + (st % 8 === 6 ? 12 : 0), s16 * 1.6, 0.5, bk, dest);
    } else if (D === 'kpop') {
      if (st === 0 || st === 7 || st === 10) bass(t, root, s16 * (st === 0 ? 6 : 3), 0.65, 'sub', dest);
    } else if (D === 'samba') {
      if ([0, 3, 4, 8, 11, 12].includes(st)) bass(t, root + (st === 4 || st === 12 ? 7 : 0), s16 * 1.5, 0.45, bk, dest);
    } else if (D === 'ballad') {
      if (st === 0 || st === 8) bass(t, root, s16 * 7, 0.45, bk, dest);
    } else if (st % 2 === 0) {
      bass(t, root + (st % 4 === 2 ? 12 : 0), s16 * 1.5, 0.45, bk, dest);
    }

    // 和音
    if (def.guitar) {
      if (st % 2 === 0) power(t, ch[0] - 12, s16 * (e >= 3 ? 1.8 : 1.2), 0.16, dest);
    } else if (def.choir) {
      if (st === 0) pad(t, voiced, spb * 4, 0.12, dest, true);
      if (e >= 3 && st % 4 === 2) stab(t, voiced, s16, 0.08, dest);
    } else if (def.strings || D === 'ballad') {
      if (st === 0) pad(t, voiced, spb * 4, 0.1, dest, false);
      if (D !== 'ballad' && st % 4 === 2) stab(t, voiced, s16, 0.08, dest);
    } else if (bar.sec === 'I' && D !== 'boss') {
      if (st === 0) pad(t, voiced, spb * 4, 0.1, dest);
      if (st % 4 === 2) stab(t, voiced, s16, 0.08, dest);
    } else if (st % 4 === 2 || (D === 'kpop' && st === 0)) {
      stab(t, voiced, s16 * 1.2, 0.1, dest);
    }
    // サビの 16 分アルペジオ
    if (e >= 3 && D !== 'samba') {
      const arp = [0, 1, 2, 3, 2, 1, 0, 1];
      const n = voiced[arp[st % 8] % 3] + 12 + (arp[st % 8] === 3 ? 12 : 0);
      pulseLead(t, n, s16 * 0.8, 0.045, dest, 'p12');
    }

    // メロディ
    const notes = song.melody[bi];
    for (const n of notes) {
      if (n.s !== st) continue;
      const dur = n.d * s16 * 0.92;
      const lead = def.lead;
      if (lead === 'vocal') vocalLead(t, n.m, dur, 0.34, n.v, dest);
      else if (lead === 'brass') brassLead(t, n.m, dur, 0.13, dest);
      else if (lead === 'dist') distLead(t, n.m, dur, 0.11, dest);
      else pulseLead(t, n.m, dur, 0.14, dest, lead);
      if (def.bells && chorus) bell(t, n.m + 12, dur, 0.07, dest);
      else if (chorus && lead !== 'dist') bell(t, n.m + 12, dur, 0.04, dest);
    }

    // 観客のコール
    if (def.chants && chorus && (bar.b % 4 < 2) && st % 4 === 2) crowd('hai', t, dest, 0.16);
    if (def.oi && chorus && (st === 4 || st === 12) && bar.b % 2 === 0) crowd('oi', t, dest, 0.18);
  }

  // ---------- 再生管理 ----------
  const M = {
    id: null, song: null, gain: null, timer: null,
    bar: 0, step: 0, next: 0, start: 0,
  };
  const LOOK = 0.16;

  function tick() {
    if (!ac || !M.song) return;
    const spb = 60 / M.song.def.bpm;
    const s16 = spb / 4;
    while (M.next < ac.currentTime + LOOK) {
      if (M.next > ac.currentTime - 0.05) playStep(M.song, M.bar, M.step, M.next, M.gain, spb);
      M.next += s16;
      M.step++;
      if (M.step >= 16) {
        M.step = 0;
        M.bar++;
        if (M.bar >= M.song.bars.length) M.bar = M.song.loopBar;
      }
    }
  }

  function play(id) {
    if (!ac) return;
    if (M.id === id && M.song) return;
    stopMusic(0.4);
    M.id = id;
    M.song = getSong(id);
    M.gain = G(1, musicBus);
    M.bar = 0;
    M.step = 0;
    M.next = ac.currentTime + 0.08;
    M.start = M.next;
    if (!M.timer) M.timer = setInterval(tick, 25);
    tick();
  }
  function stopMusic(fade) {
    if (!ac) return;
    if (M.gain) {
      const g = M.gain;
      g.gain.setTargetAtTime(0, ac.currentTime, (fade || 0.3) / 3);
      setTimeout(() => g.disconnect(), (fade || 0.3) * 1000 + 600);
    }
    M.id = null;
    M.song = null;
    M.gain = null;
  }
  // 今の拍の位置（0〜1）。背景のペンライトなどを曲に合わせる
  function beat() {
    if (!ac || !M.song) return (performance.now() / 1000 * 2.5) % 1;
    const spb = 60 / M.song.def.bpm;
    const x = (ac.currentTime - M.start) / spb;
    return x - Math.floor(x);
  }
  function current() { return M.id; }

  // ---------- ジングル ----------
  function jingle(kind) {
    if (!ac) return 0;
    const t = ac.currentTime + 0.05;
    const d = sfxBus;
    if (kind === 'start') {
      stopMusic(0.2);
      const n = [62, 66, 69, 74];
      n.forEach((m, i) => { bell(t + i * 0.09, m + 12, 0.15, 0.12, d); brassLead(t + i * 0.09, m, 0.12, 0.1, d); });
      stab(t + 0.4, [66, 69, 74], 0.6, 0.18, d);
      bell(t + 0.4, 86, 0.6, 0.15, d);
      crash(t + 0.4, 0.3, d);
      kick(t + 0.4, 0.9, d);
      return 1.3;
    }
    if (kind === 'clear') {
      stopMusic(0.2);
      const seq = [[0, 67], [0.12, 71], [0.24, 74], [0.36, 79], [0.6, 76], [0.72, 79], [0.9, 83]];
      for (const [dt, m] of seq) { pulseLead(t + dt, m, 0.14, 0.12, d, 'p25'); bell(t + dt, m + 12, 0.14, 0.08, d); }
      stab(t + 0.9, [67, 71, 74, 79], 1.0, 0.18, d);
      crash(t + 0.9, 0.3, d);
      kick(t + 0.9, 0.9, d);
      for (let i = 0; i < 8; i++) hat(t + i * 0.12, 0.12, false, d);
      crowd('yeah', t + 1.0, d, 0.25);
      return 2.2;
    }
    if (kind === 'gameover') {
      stopMusic(0.2);
      const seq = [[0, 69], [0.3, 67], [0.6, 64], [0.9, 62]];
      for (const [dt, m] of seq) pulseLead(t + dt, m, 0.28, 0.12, d, 'p25');
      pad(t + 1.2, [57, 60, 64], 1.6, 0.12, d);
      return 2.5;
    }
    if (kind === 'warning') {
      for (let i = 0; i < 3; i++) {
        tone('square', 880, t + i * 0.5, 0.22, env(t + i * 0.5, 0.12, 0.22, d));
        tone('square', 660, t + i * 0.5 + 0.25, 0.22, env(t + i * 0.5 + 0.25, 0.12, 0.22, d));
      }
      return 1.5;
    }
    return 0;
  }

  // ---------- 効果音 ----------
  function sfx(name, p) {
    if (!ac) return;
    const t = ac.currentTime + 0.005;
    const d = sfxBus;
    p = p || 1;
    switch (name) {
      case 'hitL': {
        const o = tone('sine', 220 * p, t, 0.1, env(t, 0.5, 0.09, d));
        o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
        noise(t, 0.06, filt('bandpass', 2400, 0.8, env(t, 0.5, 0.05, d)));
        break;
      }
      case 'hitH': {
        const o = tone('sine', 160 * p, t, 0.2, env(t, 0.8, 0.18, d));
        o.frequency.exponentialRampToValueAtTime(50, t + 0.16);
        noise(t, 0.14, filt('lowpass', 2600, 0.6, env(t, 0.7, 0.13, d)));
        noise(t, 0.05, filt('highpass', 3500, 0.6, env(t, 0.4, 0.04, d)));
        break;
      }
      case 'hitS': { // 必殺技のきらきらヒット
        const o = tone('sine', 180, t, 0.2, env(t, 0.7, 0.16, d));
        o.frequency.exponentialRampToValueAtTime(60, t + 0.15);
        noise(t, 0.1, filt('bandpass', 3000, 0.7, env(t, 0.5, 0.09, d)));
        bell(t, 84 + Math.floor(Math.random() * 3) * 4, 0.1, 0.08, d);
        break;
      }
      case 'swing':
        noise(t, 0.1, filt('bandpass', 1200 * p, 1.4, env(t, 0.22, 0.09, d, 0.02)));
        break;
      case 'jump': {
        const o = tone('p25', 300, t, 0.12, env(t, 0.1, 0.12, d));
        o.frequency.exponentialRampToValueAtTime(700, t + 0.1);
        break;
      }
      case 'land':
        tone('sine', 90, t, 0.08, env(t, 0.35, 0.07, d));
        noise(t, 0.05, filt('lowpass', 900, 0.7, env(t, 0.2, 0.05, d)));
        break;
      case 'thud': {
        const o = tone('sine', 120, t, 0.25, env(t, 0.8, 0.24, d));
        o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
        noise(t, 0.2, filt('lowpass', 700, 0.7, env(t, 0.5, 0.18, d)));
        break;
      }
      case 'grab':
        noise(t, 0.05, filt('bandpass', 800, 1, env(t, 0.3, 0.05, d)));
        break;
      case 'throw':
        noise(t, 0.25, filt('bandpass', 700, 0.8, env(t, 0.3, 0.25, d, 0.08)));
        break;
      case 'break':
        noise(t, 0.3, filt('bandpass', 1800, 0.5, env(t, 0.6, 0.28, d)));
        tone('square', 120, t, 0.1, env(t, 0.2, 0.1, d));
        break;
      case 'item':
        [72, 76, 79, 84].forEach((m, i) => bell(t + i * 0.05, m + 12, 0.1, 0.1, d));
        break;
      case 'heal':
        [72, 79, 84, 88, 91].forEach((m, i) => bell(t + i * 0.04, m, 0.1, 0.08, d));
        break;
      case 'sp':
        [60, 64, 67, 72, 76].forEach((m, i) => pulseLead(t + i * 0.03, m + 12, 0.08, 0.06, d, 'p12'));
        break;
      case 'special': {
        const o = tone('sawtooth', 200, t, 0.35, env(t, 0.12, 0.35, filt('lowpass', 3000, 1, d)));
        o.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
        bell(t + 0.05, 88, 0.2, 0.08, d);
        break;
      }
      case 'ult': {
        const o = tone('sawtooth', 110, t, 1.1, env(t, 0.18, 1.1, filt('lowpass', 2500, 1, d), 0.3));
        o.frequency.exponentialRampToValueAtTime(880, t + 1.0);
        [74, 78, 81, 86, 90, 93].forEach((m, i) => bell(t + 0.5 + i * 0.07, m, 0.2, 0.09, d));
        crash(t + 1.0, 0.35, d);
        break;
      }
      case 'boom': {
        const o = tone('sine', 90, t, 0.8, env(t, 1, 0.75, d));
        o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
        noise(t, 0.8, filt('lowpass', 1200, 0.6, env(t, 0.9, 0.75, d)));
        break;
      }
      case 'shot': {
        const o = tone('p25', 900, t, 0.15, env(t, 0.1, 0.15, d));
        o.frequency.exponentialRampToValueAtTime(400, t + 0.14);
        break;
      }
      case 'note':
        bell(t, 76 + Math.floor(Math.random() * 5) * 2, 0.15, 0.1, d);
        break;
      case 'ko': {
        const o = tone('p25', 600, t, 0.6, env(t, 0.12, 0.6, d));
        o.frequency.exponentialRampToValueAtTime(100, t + 0.55);
        break;
      }
      case 'free': // 敵が正気に戻る
        [84, 88, 91].forEach((m, i) => bell(t + i * 0.06, m, 0.08, 0.05, d));
        break;
      case 'cursor':
        tone('p25', 880, t, 0.04, env(t, 0.08, 0.04, d));
        break;
      case 'ok':
        tone('p25', 988, t, 0.06, env(t, 0.1, 0.06, d));
        tone('p25', 1319, t + 0.06, 0.1, env(t + 0.06, 0.1, 0.1, d));
        break;
      case 'cancel':
        tone('p25', 660, t, 0.06, env(t, 0.08, 0.06, d));
        tone('p25', 440, t + 0.06, 0.08, env(t + 0.06, 0.08, 0.08, d));
        break;
      case 'go':
        bell(t, 84, 0.1, 0.1, d);
        bell(t + 0.12, 84, 0.1, 0.1, d);
        break;
      case 'tick':
        tone('square', 1200, t, 0.03, env(t, 0.06, 0.03, d));
        break;
      case 'warn':
        tone('square', 520, t, 0.12, env(t, 0.06, 0.12, d));
        break;
      case 'laser': {
        const o = tone('sawtooth', 1400, t, 0.4, env(t, 0.08, 0.4, filt('bandpass', 2000, 2, d)));
        o.frequency.exponentialRampToValueAtTime(300, t + 0.35);
        break;
      }
      case 'beam': {
        const o = tone('sawtooth', 220, t, 0.6, env(t, 0.12, 0.6, d, 0.05));
        tone('square', 221.5, t, 0.6, env(t, 0.06, 0.6, d, 0.05));
        o.frequency.linearRampToValueAtTime(240, t + 0.5);
        break;
      }
      case 'whoosh':
        noise(t, 0.4, filt('bandpass', 600, 1.2, env(t, 0.3, 0.4, d, 0.15)));
        break;
      case 'cheer':
        crowd('yeah', t, d, 0.22);
        break;
    }
  }

  // ---------- 端末の音声読み上げ（セリフ） ----------
  const TTS = {
    ok: typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
    enabled: true,
    voice: null,
    hasJa: false,
    prio: 0,
    until: 0,
  };
  function pickVoice() {
    if (!TTS.ok) return;
    const vs = speechSynthesis.getVoices() || [];
    const ja = vs.filter(v => /^ja/i.test(v.lang) || /Japanese|日本/.test(v.name));
    TTS.hasJa = ja.length > 0;
    const pref = ['Kyoko', 'O-ren', 'Nanami', 'Haruka', 'Ayumi', 'Sayaka', 'Mizuki', 'Google 日本語', 'Hattori'];
    TTS.voice = null;
    for (const p of pref) {
      const v = ja.find(x => x.name.includes(p));
      if (v) { TTS.voice = v; break; }
    }
    if (!TTS.voice && ja.length) TTS.voice = ja[0];
  }
  if (TTS.ok) {
    pickVoice();
    try { speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch (e) { speechSynthesis.onvoiceschanged = pickVoice; }
  }
  // 最初のタップで一度空の読み上げをして、iOS の読み上げを使えるようにしておく
  function unlockTTS() {
    if (!TTS.ok) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch (e) { /* 無視 */ }
  }
  function speak(text, opt) {
    opt = opt || {};
    if (!TTS.ok || !TTS.enabled || vol.voice <= 0) return false;
    if (!TTS.hasJa) pickVoice();
    if (!TTS.hasJa) return false;
    const now = performance.now();
    const prio = opt.prio || 1;
    if (now < TTS.until && prio < TTS.prio) return false;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (TTS.voice) u.voice = TTS.voice;
      u.pitch = Math.max(0, Math.min(2, opt.pitch || 1.5));
      u.rate = Math.max(0.5, Math.min(2, opt.rate || 1.1));
      u.volume = Math.min(1, vol.voice);
      u.onstart = () => duck(true);
      u.onend = u.onerror = () => duck(false);
      speechSynthesis.speak(u);
      TTS.prio = prio;
      TTS.until = now + 400 + text.length * 120 / (opt.rate || 1.1);
      return true;
    } catch (e) {
      return false;
    }
  }
  function stopSpeech() {
    if (TTS.ok) try { speechSynthesis.cancel(); } catch (e) { /* 無視 */ }
    duck(false);
  }

  // ---------- 検証用：曲をオフラインで書き出す ----------
  async function renderOffline(id, seconds) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const sr = 22050;
    const ctx = new OAC(2, Math.floor(sr * seconds), sr);
    const saved = [ac, master, comp, musicBus, sfxBus, voiceBus, revIn, noiseBuf, pulse25, pulse12];
    build(ctx);
    const song = buildSong(SONGS[id]);
    const spb = 60 / song.def.bpm, s16 = spb / 4;
    const g = G(1, musicBus);
    let bar = 0, st = 0;
    for (let t = 0.05; t < seconds - 0.3; t += s16) {
      playStep(song, bar, st, t, g, spb);
      if (++st >= 16) { st = 0; if (++bar >= song.bars.length) bar = song.loopBar; }
    }
    say('ha', 480, { t: 0.5 });
    say('kya', 520, { t: 1.0 });
    const buf = await ctx.startRendering();
    [ac, master, comp, musicBus, sfxBus, voiceBus, revIn, noiseBuf, pulse25, pulse12] = saved;
    return buf;
  }

  return {
    init, suspend, resume, setVolume, vol, play, stop: stopMusic, current, beat, jingle, sfx,
    say: (w, f0, o) => say(w, f0, o), speak, stopSpeech, unlockTTS, TTS, renderOffline, SONGS, getSong,
    get ready() { return !!ac; },
    get ctx() { return ac; },
  };
})();
