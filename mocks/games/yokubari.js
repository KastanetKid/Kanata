// ヨクバリ：深くもぐるほど宝は増えるが、サメに会えば今日の袋は空になる。
(() => {
  const T = { // 調整値
    days: 5,        // 【もぐれる日数】
    maxDepth: 8,    // 【海底の深さ】
    value: 10,      // 【深さ1あたりの宝の値段】
    dangerStep: .07,// 【深さ1あたり増えるサメ率】（深さ2から）
    pearl: .15,     // 【真珠（×3）の出る率】
    jackpot: 300,   // 【海底の宝箱】
    gap: 72,
  };
  let day, depth, vis, bag, phase, pt, bubbles, shark, lastGain;
  const danger = d => d <= 1 ? 0 : Math.min(.6, (d - 1) * T.dangerStep);
  function newDay() { depth = 0; bag = 0; phase = 'idle'; pt = 0; shark = null; lastGain = 0; }
  function init() { day = 1; vis = 0; bubbles = Array.from({ length: 14 }, () => ({ x: rnd(W), y: rnd(H), s: rnd(20, 60) })); newDay(); }
  function nextDay() { day++; if (day > T.days) { day = T.days; end(.3); } else newDay(); }
  function dive() {
    if (phase !== 'idle') return;
    phase = 'diving'; pt = .32; depth++; tone(300, .3, 'sine', .1, 140);
  }
  function back() {
    if (phase !== 'idle' || depth < 1) return;
    G.score += bag; phase = 'surface'; pt = .8;
    pop(W / 2, 230, '+' + bag + ' もちかえり!', '#ffd23e', 28); sfx.win(); burst(180, 300, '#ffd23e', 20, 260, .6); if (bag >= 200) confetti(30);
    depth = 0;
  }
  function resolve() {
    if (Math.random() < danger(depth)) {
      phase = 'shark'; pt = 1; shark = { x: -120 };
      hitstop(.2); shake(14); flash('#ff3b4e', .5); sfx.boom(); burst(180, 300, '#ffd23e', Math.min(30, 4 + bag / 10), 300, .8, 300);
      pop(W / 2, 230, 'サメだ! −' + bag, '#ff5d73', 30); bag = 0; return;
    }
    const pearl = Math.random() < T.pearl; lastGain = depth * T.value * (pearl ? 3 : 1); bag += lastGain;
    pop(180, 262, (pearl ? '真珠! ' : '') + '+' + lastGain, pearl ? '#fff' : '#ffd23e', pearl ? 26 : 20);
    burst(180, 300, pearl ? '#fff' : '#ffd23e', pearl ? 16 : 8, 180, .4); sfx.coin(); if (pearl) { hitstop(.06); shake(4); }
    phase = 'idle';
    if (depth >= T.maxDepth) { bag += T.jackpot; pop(W / 2, 200, '海底の宝箱 +' + T.jackpot + '!!', '#ffd23e', 24); flash('#fff', .5); hitstop(.15); confetti(50); back(); }
  }
  function update(dt) {
    vis += (depth - vis) * Math.min(1, 10 * dt);
    for (const b of bubbles) { b.y -= b.s * dt; if (b.y < -10) { b.y = H + 10; b.x = rnd(W); } }
    if (shark) shark.x += 900 * dt;
    if (phase !== 'idle') { pt -= dt; if (pt <= 0) { if (phase === 'diving') resolve(); else nextDay(); } }
  }
  function btn(x, w, label, sub, c, on) {
    rr(x, 536, w, 88, 14, on ? c : '#2a3350', on ? '#fff' : INK, 3);
    text(label, x + w / 2, 568, 24, on ? '#fff' : '#6a7390'); text(sub, x + w / 2, 600, 13, on ? '#fff' : '#6a7390');
  }
  function draw() {
    const dk = clamp(vis / T.maxDepth, 0, 1), g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgb(${lerp(60, 8, dk) | 0},${lerp(170, 30, dk) | 0},${lerp(230, 80, dk) | 0})`); g.addColorStop(1, `rgb(${lerp(20, 4, dk) | 0},${lerp(80, 12, dk) | 0},${lerp(160, 40, dk) | 0})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const b of bubbles) circ(b.x, b.y, b.s / 14, null, 'rgba(255,255,255,.35)', 1.5);
    const Y = d => 300 + (d - vis) * T.gap;
    if (Y(0) > 130) { ctx.fillStyle = '#bfe8ff'; ctx.fillRect(0, 0, W, Y(0) - 46); rr(120, Y(0) - 66, 120, 26, 8, '#b5693a', INK); text('ふね', 180, Y(0) - 52, 12, '#fff'); }
    for (let d = 1; d <= T.maxDepth; d++) {
      const y = Y(d); if (y < 96 || y > 496) continue;
      const p = danger(d), col = p < .1 ? '#6fe36a' : p < .3 ? '#ffd23e' : '#ff5d73', here = d === depth;
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(20, y + 30, W - 40, 2);
      text('深さ' + d, 26, y, 13, 'rgba(255,255,255,.85)', 'left');
      if (d > depth) {
        text('+' + d * T.value + (d === T.maxDepth ? ' +宝箱' : ''), 250, y - 9, 16, '#ffd23e', 'left');
        text('サメ ' + Math.round(p * 100) + '%', 250, y + 11, 13, col, 'left');
      } else if (!here) text('✓', 250, y, 16, 'rgba(255,255,255,.5)', 'left');
    }
    if (shark) { const y = 300; ctx.fillStyle = '#5a6a8a'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(shark.x, y, 90, 34, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(shark.x - 10, y - 30); ctx.lineTo(shark.x - 40, y - 70); ctx.lineTo(shark.x - 50, y - 26); ctx.fill(); ctx.stroke(); circ(shark.x + 55, y - 8, 5, '#fff', INK, 2); }
    // ダイバー
    const dy = 300 + (phase === 'diving' ? -pt * 60 : 0) + Math.sin(G.clock * 3) * 3;
    if (phase !== 'shark' || pt > .8) { rr(168, dy - 6, 24, 30, 8, '#ff8a3d', INK); circ(180, dy - 16, 13, '#ffe0c0', INK); rr(170, dy - 22, 20, 10, 4, '#3ec1ff', INK, 2); }
    if (bag > 0) { circ(140, dy + 6, 12 + Math.min(14, bag / 40), '#b5894a', INK); text(bag + '', 140, dy + 7, 13, '#fff'); }
    // 上の情報
    for (let i = 1; i <= T.days; i++) circ(W / 2 - 40 + (i - 1) * 20, 66, 6, i < day ? '#ffd23e' : i === day ? '#fff' : 'rgba(255,255,255,.2)', INK, 2);
    text(day + '日目 / ' + T.days, W - 12, 30, 13, '#fff', 'right');
    // 次の一手を数字で見せる
    const nd = depth + 1, np = danger(nd), can = phase === 'idle';
    btn(16, 156, 'かえる', depth ? '袋の ' + bag + ' を確定' : 'まだ手ぶら', '#2f9e5f', can && depth > 0);
    btn(188, 156, 'もぐる', nd <= T.maxDepth ? '+' + nd * T.value + ' / サメ' + Math.round(np * 100) + '%' : '', np >= .3 ? '#d9435a' : '#2f7fd9', can && nd <= T.maxDepth);
  }
  start({
    id: 'yokubari', title: 'ヨクバリ', genre: '運だめし・チキンレース', color: '#ffd23e', bg: '#0a2a50',
    how: ['もぐるたび 宝が袋に入る', '深いほど高いが サメ率も上がる', 'サメに会う前に「かえる」で確定'],
    init, update, draw,
    down(x, y) { if (y > 520) { if (x < W / 2) { if (depth < 1 && phase === 'idle') sfx.tick(); back(); } else dive(); } },
  });
})();
