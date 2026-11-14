// ピカピカ：こすって稼ぎ、稼いだお金で道具を買うと、こするのが楽になる。
(() => {
  const T = { // 調整値
    cols: 18, rows: 21, cs: 18, ox: 18, oy: 84,
    time: 60,        // 【制限時間】秒
    radius: 22,      // 【スポンジの半径】初期
    radiusUp: 9,     // 【スポンジ強化1回あたり】
    amt: .25,        // 【ひとこすりで落ちる量】
    soapUp: .6,      // 【洗剤1回あたりの倍率加算】
    coinPer: .06,    // 【落とした汚れ1あたりのコイン】
    done: .04,       // 【残りがこの割合を切ったら完了】
    cost: [20, 25, 45], costMul: 1.6,
  };
  const SHOP = [['スポンジ', '大きくなる'], ['せんざい', 'よく落ちる'], ['ロボ', '自動でふく']];
  let dirt, hard, total, left, coins, lv, stage, time, robots, sqT, wiped, nextT, btnShake;
  function newWindow() {
    const h = 1 + stage * .6; dirt = new Float32Array(T.cols * T.rows); total = 0;
    for (let i = 0; i < dirt.length; i++) dirt[i] = h * rnd(.7, 1.3);
    for (let b = 0; b < 3 + stage; b++) { // しつこい汚れ
      const bc = rint(1, T.cols - 2), br = rint(1, T.rows - 2);
      for (let c = bc - 2; c <= bc + 2; c++) for (let r = br - 2; r <= br + 2; r++) if (c >= 0 && r >= 0 && c < T.cols && r < T.rows && dist(c, r, bc, br) < 2.3) dirt[r * T.cols + c] = h * 3;
    }
    for (const d of dirt) total += d; left = total; hard = h; nextT = 0;
  }
  function init() { coins = 0; lv = [0, 0, 0]; stage = 0; time = T.time; robots = { x: T.ox, y: T.oy + 10, v: 1 }; sqT = 0; wiped = false; btnShake = [0, 0, 0]; newWindow(); }
  function wipeAt(x, y, R, amt) {
    const c0 = Math.max(0, Math.floor((x - R - T.ox) / T.cs)), c1 = Math.min(T.cols - 1, Math.floor((x + R - T.ox) / T.cs));
    const r0 = Math.max(0, Math.floor((y - R - T.oy) / T.cs)), r1 = Math.min(T.rows - 1, Math.floor((y + R - T.oy) / T.cs));
    let rem = 0;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * T.cols + c; if (dirt[i] <= 0) continue;
      const px = T.ox + c * T.cs + 9, py = T.oy + r * T.cs + 9; if (dist(px, py, x, y) > R + 6) continue;
      const d = Math.min(dirt[i], amt); dirt[i] -= d; rem += d;
      if (dirt[i] <= 0 && Math.random() < .25) burst(px, py, '#fff', 1, 40, .35);
    }
    left -= rem; coins += rem * T.coinPer; return rem;
  }
  const amt = () => T.amt * (1 + lv[1] * T.soapUp), rad = () => T.radius + lv[0] * T.radiusUp;
  function swipe(x0, y0, x1, y1) {
    if (nextT > 0) return;
    const l = dist(x0, y0, x1, y1), n = Math.max(1, Math.ceil(l / 8)); let rem = 0;
    for (let i = 1; i <= n; i++) rem += wipeAt(lerp(x0, x1, i / n), lerp(y0, y1, i / n), rad(), amt());
    if (rem > 0) { wiped = true; if (sqT <= 0) { sqT = .07; tone(rnd(900, 1500), .05, 'sine', .035, rnd(900, 1500)); } }
  }
  const cost = i => Math.round(T.cost[i] * Math.pow(T.costMul, lv[i]));
  function update(dt) {
    time -= dt; sqT -= dt; btnShake = btnShake.map(v => v * .85);
    if (time <= 0) { time = 0; sfx.up(); end(.4); return; }
    if (nextT > 0) { nextT -= dt; if (nextT <= 0) { stage++; newWindow(); } return; }
    if (lv[2]) {
      robots.x += robots.v * (200 + lv[2] * 60) * dt;
      if (robots.x > T.ox + T.cols * T.cs || robots.x < T.ox) { robots.v *= -1; robots.x = clamp(robots.x, T.ox, T.ox + T.cols * T.cs); robots.y += 32; if (robots.y > T.oy + T.rows * T.cs) robots.y = T.oy + 10; }
      wipeAt(robots.x, robots.y, 20, amt() * lv[2] * dt * 14);
    }
    if (left / total < T.done) {
      dirt.fill(0); left = 0; const b = 10 + stage * 5; coins += b; G.score++; nextT = .55;
      flash('#fff', .55); hitstop(.1); sfx.win(); pop(W / 2, 250, 'ピカッ!', '#fff', 44); pop(W / 2, 300, 'コイン +' + b, '#ffd23e', 20);
      for (let i = 0; i < 14; i++) burst(rnd(40, 320), rnd(110, 440), '#fff', 3, 80, .6);
    }
  }
  function scene() { // 窓の向こう（きれいになるほど見えてくる）
    const v = stage % 3, x = T.ox, y = T.oy, w = T.cols * T.cs, h = T.rows * T.cs;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (v === 0) { g.addColorStop(0, '#4fb4ff'); g.addColorStop(1, '#d6f3ff'); } else if (v === 1) { g.addColorStop(0, '#ff8a5c'); g.addColorStop(1, '#ffe08a'); } else { g.addColorStop(0, '#141a4a'); g.addColorStop(1, '#4a3a8a'); }
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    circ(x + 240, y + 90, 34, v === 2 ? '#fff6c8' : '#fff3a0'); circ(x + 240, y + 90, 46, null, 'rgba(255,255,255,.35)', 6);
    ctx.fillStyle = v === 2 ? '#1d2a55' : '#58c46a'; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.quadraticCurveTo(x + 90, y + h - 150, x + 200, y + h - 40); ctx.quadraticCurveTo(x + 270, y + h - 110, x + w, y + h - 50); ctx.lineTo(x + w, y + h); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(x + 40, y); ctx.lineTo(x + 90, y); ctx.lineTo(x + 20, y + 140); ctx.lineTo(x, y + 140); ctx.lineTo(x, y + 80); ctx.fill(); // ガラスの光
  }
  function draw() {
    scene();
    for (let r = 0; r < T.rows; r++) for (let c = 0; c < T.cols; c++) {
      const d = dirt[r * T.cols + c]; if (d <= 0) continue;
      const k = d / hard; ctx.globalAlpha = Math.min(.96, .35 + k * .45); ctx.fillStyle = k > 1.6 ? '#3a2a1c' : '#7a6248';
      ctx.fillRect(T.ox + c * T.cs, T.oy + r * T.cs, T.cs + .5, T.cs + .5);
    }
    ctx.globalAlpha = 1;
    rr(T.ox - 3, T.oy - 3, T.cols * T.cs + 6, T.rows * T.cs + 6, 6, null, '#f3ead8', 8); rr(T.ox - 7, T.oy - 7, T.cols * T.cs + 14, T.rows * T.cs + 14, 9, null, INK, 3);
    if (lv[2]) { rr(robots.x - 20, robots.y - 8, 40, 16, 6, '#c9d2e6', INK); circ(robots.x - 8, robots.y, 3, '#3ec1ff'); circ(robots.x + 8, robots.y, 3, '#3ec1ff'); }
    if (P.down && P.y < T.oy + T.rows * T.cs + 10 && G.state === 'play') { circ(P.x, P.y, rad(), 'rgba(255,225,90,.35)', '#ffe15a', 3); }
    // 進み具合と時間
    rr(20, 62, 320, 10, 5, 'rgba(255,255,255,.14)'); const k = time / T.time; if (k > 0) rr(20, 62, Math.max(10, 320 * k), 10, 5, time < 10 ? '#ff5d73' : '#3ec1ff');
    text('のこり ' + Math.ceil(time) + '秒', 60, 34, 13, '#fff', 'left'); text(Math.round((1 - left / total) * 100) + '%', W - 16, 34, 18, '#fff', 'right');
    circ(30, 488, 9, '#ffd23e', INK, 2.5); text(Math.floor(coins) + '', 46, 489, 20, '#ffd23e', 'left');
    for (let i = 0; i < 3; i++) {
      const x = 14 + i * 113 + Math.sin(G.clock * 60) * btnShake[i], c = cost(i), ok = coins >= c;
      rr(x, 506, 106, 104, 12, ok ? '#ffe9a8' : '#3a3f58', ok ? '#fff' : INK, 3);
      text(SHOP[i][0], x + 53, 528, 16, ok ? INK : '#9aa0b8', 'center', 0); text(SHOP[i][1], x + 53, 550, 11, ok ? '#5a4a20' : '#7a8098', 'center', 0);
      text('Lv' + lv[i], x + 53, 572, 12, ok ? '#5a4a20' : '#7a8098', 'center', 0);
      circ(x + 30, 593, 7, '#ffd23e', INK, 2); text(c + '', x + 42, 594, 16, ok ? INK : '#9aa0b8', 'left', 0);
    }
    if (!wiped && G.state === 'play') text('こすって ピカピカに!', W / 2, 270, 22, '#fff');
  }
  start({
    id: 'pikapika', title: 'ピカピカ', genre: '作業・育成', color: '#ffe15a', bg: '#22263c',
    how: ['まどを こすって よごれを落とす', 'コインで 道具を買うと 楽になる', '60秒で 何枚みがける?'],
    fmt: s => s + 'まい', init, update, draw,
    down(x, y) {
      if (y >= 506) {
        const i = clamp(Math.floor((x - 14) / 113), 0, 2), c = cost(i);
        if (coins >= c) { coins -= c; lv[i]++; sfx.coin(); pop(14 + i * 113 + 53, 496, 'Lv' + lv[i] + '!', '#fff', 20); burst(14 + i * 113 + 53, 540, '#ffd23e', 12, 200, .4); }
        else { btnShake[i] = 5; sfx.bad(); pop(14 + i * 113 + 53, 496, 'あと ' + Math.ceil(c - coins), '#ff9aa8', 14); }
      } else swipe(x, y, x, y);
    },
    move(x, y) { if (P.sy < 506) swipe(P.lx === undefined ? x : P.lx, P.ly === undefined ? y : P.ly, x, y); P.lx = x; P.ly = y; },
    up() { P.lx = P.ly = undefined; },
  });
})();
