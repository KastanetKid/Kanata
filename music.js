'use strict';

// ---------- BGM（テクノポップ風チップチューン）とリズム判定 ----------
// Web Audio で 16 分音符単位に先読みスケジュールし、拍の時刻を記録しておく。
// 判定はその拍の時刻とタップ時刻の差で行う。

const Music = (() => {
  const BPM = 128;
  const STEP = 60 / BPM / 4;     // 16 分音符の長さ（秒）
  const BEAT = 60 / BPM;
  const LOOKAHEAD = 0.12;

  // F → G → Em → Am（IV-V-iii-vi）
  const CHORDS = [[53, 57, 60], [55, 59, 62], [52, 55, 59], [57, 60, 64]];
  // 通常時のメロディ（コードトーンの番号、3 = ルートの 1 オクターブ上、null = 休符）
  const MELODY = [
    [2, null, 1, null, 0, null, 1, 2, 3, null, 2, null, 1, null, null, null],
    [2, null, 3, null, 2, null, 1, null, 0, null, 1, null, 2, null, null, null],
    [1, null, 2, null, 3, null, 2, 1, 0, null, null, 1, 2, null, null, null],
    [3, null, 2, null, 1, 2, 3, null, 3, null, 2, null, 1, null, 0, null],
  ];
  // フィーバー時の 16 分アルペジオ
  const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 3, 2, 1, 2];

  let ac = null;
  let master, filter, normalBus, feverBus, noiseBuf;
  let nextTime = 0;
  let step = 0;
  let timer = null;
  const beats = [];   // 直近の拍 {time, index}
  let beatIndex = 0;

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ac) return true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      ac = null;
      return false;
    }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 18000;
    master = ac.createGain();
    master.gain.value = 0.55;
    normalBus = ac.createGain();
    feverBus = ac.createGain();
    feverBus.gain.value = 0;
    normalBus.connect(filter);
    feverBus.connect(filter);
    filter.connect(master).connect(comp).connect(ac.destination);

    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    document.addEventListener('visibilitychange', () => {
      if (!ac) return;
      if (document.hidden) ac.suspend();
      else ac.resume();
    });
    return true;
  }

  function start() {
    if (!ac) return;
    ac.resume();
    if (timer) return;
    nextTime = ac.currentTime + 0.1;
    step = 0;
    timer = setInterval(schedule, 25);
    schedule();
  }

  // ---- 音源 ----
  function env(g, t, vol, dur) {
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function osc(type, freq, t, dur, vol, bus, cutoff) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    env(g, t, vol, dur);
    if (cutoff) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(cutoff, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff / 4), t + dur);
      o.connect(f).connect(g);
    } else {
      o.connect(g);
    }
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(t, dur, vol, type, freq, bus) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ac.createGain();
    env(g, t, vol, dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  function kick(t, bus) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, 0.9, 0.22);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.25);
  }

  // ---- 1 ステップ分の譜面 ----
  function playStep(s, t) {
    const inBar = s % 16;
    const bar = Math.floor(s / 16) % 4;
    const chord = CHORDS[bar];
    const tone = i => (i === 3 ? chord[0] + 12 : chord[i]);

    // 通常レイヤー
    if (inBar % 4 === 0) kick(t, normalBus);
    if (inBar % 4 === 2) noise(t, 0.04, 0.12, 'highpass', 8000, normalBus);
    if (inBar % 2 === 0) {
      const root = chord[0] - 24 + (inBar % 4 === 2 ? 12 : 0);
      osc('sawtooth', mtof(root), t, STEP * 1.8, 0.16, normalBus, 900);
    }
    if (inBar === 6 || inBar === 14) {
      for (const n of chord) osc('square', mtof(n), t, STEP * 1.5, 0.035, normalBus, 3000);
    }
    const m = MELODY[bar][inBar];
    if (m !== null) osc('square', mtof(tone(m) + 12), t, STEP * 1.6, 0.05, normalBus, 5000);

    // フィーバーレイヤー（常に鳴らしておき、音量で出し入れする）
    osc('square', mtof(tone(ARP[inBar]) + 24), t, STEP * 0.9, 0.04, feverBus, 7000);
    if (inBar === 4 || inBar === 12) {
      noise(t, 0.14, 0.35, 'bandpass', 1400, feverBus);
      osc('triangle', 190, t, 0.08, 0.2, feverBus);
    }
    if (inBar % 4 === 2) noise(t, 0.12, 0.1, 'highpass', 6000, feverBus);
    if (inBar % 2 === 1) noise(t, 0.02, 0.06, 'highpass', 10000, feverBus);
  }

  function schedule() {
    if (!ac) return;
    // タブ復帰などで大きく遅れていたら今に合わせる
    if (nextTime < ac.currentTime - 0.2) nextTime = ac.currentTime + 0.05;
    while (nextTime < ac.currentTime + LOOKAHEAD) {
      playStep(step, nextTime);
      if (step % 4 === 0) {
        beats.push({ time: nextTime, index: beatIndex++ });
        if (beats.length > 16) beats.shift();
      }
      nextTime += STEP;
      step++;
    }
  }

  // ---- 時刻・判定 ----
  function latency() {
    if (!ac) return 0;
    return (ac.outputLatency || 0) + (ac.baseLatency || 0);
  }

  // 実際に耳に届いている「今」
  function now() {
    return ac ? ac.currentTime - latency() : 0;
  }

  // 今の時刻に一番近い拍 {index, time, offset(秒, +なら遅れ)}
  function nearestBeat(t = now()) {
    let best = null;
    // まだ記録されていない次の拍も候補に入れる
    const list = beats.slice();
    if (list.length) {
      const last = list[list.length - 1];
      list.push({ time: last.time + BEAT, index: last.index + 1 });
    }
    for (const b of list) {
      const off = t - b.time;
      if (!best || Math.abs(off) < Math.abs(best.offset)) best = { index: b.index, time: b.time, offset: off };
    }
    return best;
  }

  // 0（拍の瞬間）〜 1（次の拍の直前）
  function phase(t = now()) {
    const b = nearestBeat(t);
    if (!b) return 0;
    const p = (t - b.time) / BEAT;
    return p < 0 ? p + 1 : p;
  }

  function lastBeatTime(t = now()) {
    for (let i = beats.length - 1; i >= 0; i--) if (beats[i].time <= t) return beats[i].time;
    return null;
  }

  // ---- 演出 ----
  function setFever(on) {
    if (!ac) return;
    const t = ac.currentTime;
    feverBus.gain.cancelScheduledValues(t);
    feverBus.gain.setValueAtTime(on ? 1 : 0, t);
    if (on) {
      // 突入時の上昇スウィープ
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(200, t);
      o.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
      env(g, t, 0.12, 0.4);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.45);
      noise(t, 0.6, 0.25, 'highpass', 3000, master);
    } else {
      // 一気に落とす：こもらせてから戻す＋下降音
      filter.frequency.cancelScheduledValues(t);
      filter.frequency.setValueAtTime(350, t);
      filter.frequency.setValueAtTime(350, t + 0.25);
      filter.frequency.exponentialRampToValueAtTime(18000, t + 0.9);
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(700, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.45);
      env(g, t, 0.14, 0.5);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.55);
    }
  }

  function setMuffled(on) {
    if (!ac) return;
    const t = ac.currentTime;
    filter.frequency.cancelScheduledValues(t);
    filter.frequency.setValueAtTime(filter.frequency.value, t);
    filter.frequency.exponentialRampToValueAtTime(on ? 500 : 18000, t + (on ? 0.3 : 0.15));
  }

  function sfx(kind, n = 0) {
    if (!ac) return;
    const t = ac.currentTime;
    if (kind === 'great') osc('square', mtof(84 + [0, 4, 7, 12][n % 4]), t, 0.06, 0.05, master);
    else if (kind === 'good') osc('square', mtof(79), t, 0.05, 0.035, master);
    else if (kind === 'off') osc('triangle', 150, t, 0.08, 0.12, master);
    else if (kind === 'fall') {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(260, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.6);
      env(g, t, 0.25, 0.65);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.7);
    }
  }

  return { BPM, BEAT, init, start, now, nearestBeat, phase, lastBeatTime, setFever, setMuffled, sfx, get ready() { return !!ac; } };
})();
