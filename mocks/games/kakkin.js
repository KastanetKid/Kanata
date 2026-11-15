// カッキーン：フルスイングは飛距離1.5倍、でも当たるタイミングはずっと狭い。
(() => {
  const T = { // 調整値
    meet: [.05, .12],   // 【ミートの判定幅】ジャスト・ヒット（±秒）
    full: [.03, .075],  // 【フルスイングの判定幅】
    fullMul: 1.5,       // 【フルスイングの飛距離倍率】
    baseT: .8,          // 【球が届くまでの時間】最初
    minT: .44,          // 【同】下限
    stepT: .012,        // 【1球ごとの短縮】
    lock: .4,           // 【スイング後の硬直】
    strikes: 3,
    y0: 168, y1: 516,
  };
  let phase, pt, dur, type, n, strikes, lock, swingT, swingKind, fly, judged;
  function next() { phase = 'wait'; pt = n ? .55 : .9; fly = null; judged = false; }
  function init() { n = 0; strikes = 0; lock = 0; swingT = 9; swingKind = 0; next(); }
  function pitch() {
    const r = Math.random(); type = n < 3 ? 0 : r < .4 ? 0 : r < .65 ? 1 : n >= 8 && r < .82 ? 3 : 2;
    dur = Math.max(T.minT, T.baseT - n * T.stepT) * (type === 1 ? 1.6 : type === 2 ? 1.25 : 1);
    phase = 'pitch'; pt = 0; n++; tone(900, .08, 'sine', .06, 300);
  }
  const prog = p => type === 2 ? (p < .5 ? p * .5 : .25 + (p - .5) * 1.5) : p; // 2=とまって伸びる球
  function strike(msg) {
    strikes++; judged = true; pop(W / 2, 300, msg, '#ff5d73', 26); sfx.bad(); shake(5);
    if (strikes >= T.strikes) { flash('#ff3b4e', .3); end(.7); } else { phase = 'result'; pt = .6; }
  }
  function swing(x) {
    if (lock > 0 || phase === 'result' && fly) return;
    const full = x >= W / 2, w = full ? T.full : T.meet;
    lock = T.lock; swingT = 0; swingKind = full ? 1 : 0; noise(.08, full ? .12 : .07, 3000);
    if (phase !== 'pitch' || judged) return;
    const err = pt - dur, a = Math.abs(err);
    if (a > w[1]) { if (a < .3) pop(W / 2, 360, err < 0 ? 'はやい!' : 'おそい!', '#fff', 20); return; } // 空振り：球はそのまま通りすぎる
    judged = true;
    const perfect = a <= w[0], q = perfect ? 1 : 1 - (a - w[0]) / (w[1] - w[0]);
    const d = Math.round((perfect ? rnd(100, 125) : 30 + 60 * q) * (full ? T.fullMul : 1));
    fly = { x: 180, y: T.y1, a: -Math.PI / 2 + clamp(err / w[1], -1, 1) * .9, t: 0, d, perfect };
    G.score += d; phase = 'result'; pt = perfect ? 1.3 : .9;
    hitstop(perfect ? .24 : .07 + q * .05); shake(perfect ? 14 : 5); sfx.hit(perfect ? 1 : .5); ring(180, T.y1, '#fff', perfect ? 90 : 50);
    burst(180, T.y1, perfect ? '#ffd23e' : '#fff', perfect ? 26 : 10, perfect ? 360 : 200, .5);
    if (perfect) { flash('#fff', .6); tone(1400, .5, 'triangle', .12, 2200); pop(W / 2, 250, full ? '特大ホームラン!!' : 'ホームラン!', '#ffd23e', full ? 34 : 30); confetti(full ? 60 : 30); sfx.win(); }
    else pop(W / 2, 270, q > .5 ? 'ナイスヒット' : 'ヒット', '#fff', 22);
    pop(W / 2, 320, d + 'm', '#fff', 30);
  }
  function update(dt) {
    lock -= dt; swingT += dt;
    if (phase === 'wait') { pt -= dt; if (pt <= 0) { phase = 'windup'; pt = .5; } }
    else if (phase === 'windup') { pt -= dt; if (pt <= 0) pitch(); }
    else if (phase === 'pitch') { pt += dt; if (!judged && pt > dur + .16) strike(swingT < .3 ? '空ぶり!' : '見のがし!'); }
    else { pt -= dt; if (fly) fly.t += dt; if (pt <= 0) next(); }
  }
  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2d7fd0'); g.addColorStop(.25, '#8fd0ff'); g.addColorStop(.26, '#3f9e52'); g.addColorStop(1, '#2c7a40'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c99a5b'; ctx.beginPath(); ctx.moveTo(180, 190); ctx.lineTo(330, 520); ctx.lineTo(30, 520); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(180, T.y1 + 20); ctx.lineTo(-20, 250); ctx.moveTo(180, T.y1 + 20); ctx.lineTo(380, 250); ctx.stroke();
    // ピッチャー（振りかぶりで予告）
    const wu = phase === 'windup' ? 1 - pt / .5 : 0;
    rr(168, 140 - wu * 6, 24, 34, 8, '#e8eef8', INK); circ(180, 128 - wu * 8, 11, '#ffe0c0', INK); rr(168, 116 - wu * 8, 24, 8, 4, '#d9435a', INK, 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(192, 148); ctx.lineTo(206, 148 - wu * 34); ctx.stroke();
    // ホームベースと打点
    circ(180, T.y1, 20, null, 'rgba(255,255,255,.55)', 3); rr(166, T.y1 + 16, 28, 10, 3, '#fff', INK, 2);
    if (phase === 'pitch') {
      const u = prog(pt / dur), y = lerp(T.y0, T.y1, u), r = lerp(5, 12, Math.min(u, 1.2));
      if (!(type === 3 && u > .35 && u < .75)) { circ(180, y + 8, r * .8, 'rgba(10,12,24,.25)'); circ(180, y, r, '#fff', INK, 2.5); }
    }
    if (fly) { const k = fly.t, x = fly.x + Math.cos(fly.a) * k * 520, y = fly.y + Math.sin(fly.a) * k * 620, r = Math.max(2, 12 - k * 12); if (y > -20) { circ(x, y, r, '#fff', INK, 2.5); for (let i = 1; i < 5; i++) circ(x - Math.cos(fly.a) * i * 14, y - Math.sin(fly.a) * i * 14, r * (1 - i * .2), 'rgba(255,255,255,.35)'); } }
    // バッター：構え → 一瞬で振り抜き → フォロースルー
    const bx = 128, by = T.y1 + 6, sw = Math.min(1, swingT / .04), fol = clamp((swingT - .04) / .3, 0, 1);
    const ang = swingT > T.lock ? -2.3 : lerp(-2.3, .5, sw) + fol * 1.5;
    rr(bx - 13, by - 14, 26, 38, 9, '#3ec1ff', INK); circ(bx, by - 26, 12, '#ffe0c0', INK); rr(bx - 13, by - 38, 26, 9, 4, '#2f5fd9', INK, 2);
    if (swingT < .16) { ctx.globalAlpha = 1 - swingT / .16; ctx.beginPath(); ctx.moveTo(bx + 10, by); ctx.arc(bx + 10, by, swingKind ? 74 : 62, -2.2, .7); ctx.closePath(); ctx.fillStyle = swingKind ? '#ffd23e' : '#fff'; ctx.fill(); ctx.globalAlpha = 1; } // 風切り
    ctx.save(); ctx.translate(bx + 10, by); ctx.rotate(ang); rr(0, -4, 62, 8, 4, '#e0b070', INK, 2.5); ctx.restore();
    for (let i = 0; i < T.strikes; i++) circ(70 + i * 20, 30, 7, i < strikes ? '#ff5d73' : 'rgba(255,255,255,.25)', INK, 2);
    text('S', 52, 30, 14, '#fff');
    const rdy = lock <= 0;
    rr(10, 556, 166, 74, 14, rdy ? '#2f7fd9' : '#2a3350', '#fff', 3); text('ミート', 93, 582, 22, '#fff'); text('当てやすい', 93, 610, 12, '#fff');
    rr(184, 556, 166, 74, 14, rdy ? '#d9435a' : '#2a3350', '#fff', 3); text('フルスイング', 267, 582, 20, '#fff'); text('飛距離 ×' + T.fullMul + ' / むずかしい', 267, 610, 11, '#fff');
    if (n <= 1 && G.state === 'play') text('球が ◯ に来たら タップ!', W / 2, 440, 17, '#fff');
  }
  start({
    id: 'kakkin', title: 'カッキーン', genre: 'スポーツ・タイミング', color: '#ffd23e', bg: '#2c7a40',
    how: ['球が ◯ に重なる瞬間に タップ', '左=ミート / 右=フルスイング', '3ストライクで 終了'],
    fmt: s => s + 'm', init, update, draw, down: swing,
  });
})();
