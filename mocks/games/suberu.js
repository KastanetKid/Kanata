// スベール：止まれないペンギンを、岩を使って魚まで届ける。解くほど時間が戻る。
(() => {
  const T = { // 調整値
    cols: 7, rows: 8, cs: 44, ox: 26, oy: 140,
    time: 60,       // 【持ち時間】秒
    bonus: 7,       // 【1問とくと戻る秒】
    rock: .16,      // 【岩の割合】
    speed: 1300,    // 【すべる速さ】px/秒
    swipe: 22,      // 【スワイプと判定する長さ】
  };
  const DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let rocks, pg, goal, home, level, par, moves, time, queued, used, waitT, sq, trail, taught;
  const rock = (c, r) => c < 0 || r < 0 || c >= T.cols || r >= T.rows || rocks[r * T.cols + c];
  function slide(c, r, d, g) { // 岩か壁の手前まで。魚のマスに入ったらそこで止まる
    while (!rock(c + d[0], r + d[1])) { c += d[0]; r += d[1]; if (g && c === g.c && r === g.r) break; }
    return { c, r };
  }
  function steps(from, g) {
    const seen = new Map([[from.r * T.cols + from.c, 0]]), q = [from];
    while (q.length) {
      const p = q.shift(), n = seen.get(p.r * T.cols + p.c);
      if (p.c === g.c && p.r === g.r) return n;
      for (const d of DIR) { const e = slide(p.c, p.r, d, g), k = e.r * T.cols + e.c; if (!seen.has(k)) { seen.set(k, n + 1); q.push(e); } }
    }
    return -1;
  }
  function gen() {
    let want = Math.min(7, 2 + Math.floor(level / 2));
    for (let tries = 0; ; tries++) {
      if (tries && tries % 60 === 0 && want > 2) want--;
      rocks = Array.from({ length: T.cols * T.rows }, () => Math.random() < T.rock);
      const free = []; rocks.forEach((v, i) => { if (!v) free.push({ c: i % T.cols, r: Math.floor(i / T.cols) }); });
      const s = pick(free), cand = free.filter(g => (g.c !== s.c || g.r !== s.r) && steps(s, g) === want);
      if (cand.length) { home = s; goal = pick(cand); par = want; break; }
    }
    pg = { c: home.c, r: home.r, x: X(home.c), y: Y(home.r), tx: 0, ty: 0, mv: false, d: DIR[0] }; moves = 0; queued = null; waitT = 0; sq = 0; trail = [];
  }
  const X = c => T.ox + c * T.cs + T.cs / 2, Y = r => T.oy + r * T.cs + T.cs / 2;
  function init() { level = 1; time = T.time; used = false; taught = false; gen(); }
  function go(d) {
    if (waitT > 0) return;
    if (pg.mv) { queued = d; return; }
    const e = slide(pg.c, pg.r, d, goal);
    if (e.c === pg.c && e.r === pg.r) { sfx.tick(); shake(2); sq = .6; return; }
    pg.c = e.c; pg.r = e.r; pg.tx = X(e.c); pg.ty = Y(e.r); pg.mv = true; pg.d = d; moves++; taught = true; tone(500, .12, 'sine', .06, 900);
  }
  function land() {
    pg.mv = false; sq = 1; burst(pg.x + pg.d[0] * 16, pg.y + pg.d[1] * 16, '#fff', 5, 110, .25);
    if (pg.c === goal.c && pg.r === goal.r) {
      G.score++; time = Math.min(T.time, time + T.bonus); waitT = .5; queued = null;
      const best = moves <= par; hitstop(.1); shake(6); sfx.win(); ring(pg.x, pg.y, '#ffd23e', 70); burst(pg.x, pg.y, '#ff8a3d', 16, 220);
      pop(W / 2, 100, best ? '最短クリア!' : 'クリア!', '#ffd23e', 26); pop(W - 60, 80, '+' + T.bonus + '秒', '#6fe36a', 16); if (best) confetti(24);
      level++; return;
    }
    sfx.hit(.3); shake(3);
    if (steps(pg, goal) < 0) { waitT = .45; queued = null; pop(pg.x, pg.y - 30, 'おっと! もどるよ', '#fff', 16); } // 詰みは作らない
    else if (queued) { const d = queued; queued = null; go(d); }
  }
  function update(dt) {
    time -= dt; sq *= .82;
    if (time <= 0) { time = 0; sfx.bad(); end(.4); return; }
    for (const t of trail) t.a -= dt * 4; trail = trail.filter(t => t.a > 0);
    if (pg.mv) {
      const d = dist(pg.x, pg.y, pg.tx, pg.ty), st = T.speed * dt;
      trail.push({ x: pg.x, y: pg.y, a: 1 });
      if (d <= st) { pg.x = pg.tx; pg.y = pg.ty; land(); } else { pg.x += (pg.tx - pg.x) / d * st; pg.y += (pg.ty - pg.y) / d * st; }
    } else if (waitT > 0) {
      waitT -= dt;
      if (waitT <= 0) { if (pg.c === goal.c && pg.r === goal.r) gen(); else { pg.c = home.c; pg.r = home.r; pg.x = X(home.c); pg.y = Y(home.r); burst(pg.x, pg.y, '#fff', 10, 140, .3); sfx.tap(); } }
    }
  }
  function draw() {
    rr(20, 62, 320, 10, 5, 'rgba(255,255,255,.14)'); const k = time / T.time; if (k > 0) rr(20, 62, Math.max(10, 320 * k), 10, 5, time < 10 ? '#ff5d73' : '#3ec1ff');
    text('レベル ' + level, 24, 100, 15, '#fff', 'left'); text('最短 ' + par + '手 / いま ' + moves + '手', W - 24, 100, 13, moves > par ? '#ffb0b8' : '#fff', 'right');
    rr(T.ox - 8, T.oy - 8, T.cols * T.cs + 16, T.rows * T.cs + 16, 12, '#5b6f9a', INK);
    ctx.fillStyle = '#dff4ff'; ctx.fillRect(T.ox, T.oy, T.cols * T.cs, T.rows * T.cs);
    ctx.strokeStyle = 'rgba(80,140,200,.25)'; ctx.lineWidth = 1;
    for (let c = 1; c < T.cols; c++) { ctx.beginPath(); ctx.moveTo(T.ox + c * T.cs, T.oy); ctx.lineTo(T.ox + c * T.cs, T.oy + T.rows * T.cs); ctx.stroke(); }
    for (let r = 1; r < T.rows; r++) { ctx.beginPath(); ctx.moveTo(T.ox, T.oy + r * T.cs); ctx.lineTo(T.ox + T.cols * T.cs, T.oy + r * T.cs); ctx.stroke(); }
    for (let i = 0; i < rocks.length; i++) if (rocks[i]) { const x = T.ox + i % T.cols * T.cs, y = T.oy + Math.floor(i / T.cols) * T.cs; rr(x + 3, y + 3, T.cs - 6, T.cs - 6, 9, '#566080', INK); rr(x + 8, y + 7, T.cs - 22, 8, 4, 'rgba(255,255,255,.25)'); }
    // 魚
    const gx = X(goal.c), gy = Y(goal.r), pu = 1 + Math.sin(G.clock * 6) * .08;
    circ(gx, gy, 19 * pu, 'rgba(255,210,62,.35)');
    ctx.fillStyle = '#ff8a3d'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(gx - 2, gy, 11 * pu, 7 * pu, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx + 8, gy); ctx.lineTo(gx + 16, gy - 7); ctx.lineTo(gx + 16, gy + 7); ctx.closePath(); ctx.fill(); ctx.stroke(); circ(gx - 7, gy - 2, 1.8, INK);
    for (const t of trail) circ(t.x, t.y, 10 * t.a, `rgba(120,190,240,${t.a * .4})`);
    // ペンギン（止まった瞬間につぶれる）
    const hz = Math.abs(pg.d[0]), w = 15 * (1 + sq * (hz ? -.25 : .25)), h = 17 * (1 + sq * (hz ? .25 : -.25));
    ctx.beginPath(); ctx.ellipse(pg.x, pg.y, w, h, 0, 0, TAU); ctx.fillStyle = '#20243a'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(pg.x, pg.y + 3, w * .62, h * .66, 0, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    circ(pg.x - 4, pg.y - 5, 2, INK); circ(pg.x + 4, pg.y - 5, 2, INK);
    ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(pg.x - 3, pg.y - 1); ctx.lineTo(pg.x + 3, pg.y - 1); ctx.lineTo(pg.x, pg.y + 4); ctx.fill();
    if (!taught && G.state === 'play') { const k2 = G.clock % 1.2 / 1.2; circ(120 + k2 * 120, 550, 11, 'rgba(255,255,255,.85)', INK); }
    text('スワイプで すべる。魚で止まる', W / 2, 580, 14, 'rgba(255,255,255,.85)');
  }
  function sw(x, y) {
    if (used) return; const dx = x - P.sx, dy = y - P.sy;
    if (Math.hypot(dx, dy) < T.swipe) return;
    used = true; go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIR[0] : DIR[1]) : (dy > 0 ? DIR[2] : DIR[3]));
  }
  start({
    id: 'suberu', title: 'スベール', genre: 'すべるパズル', color: '#8fd8ff', bg: '#1d2b52',
    how: ['スワイプした向きに 止まるまで すべる', '魚のマスに 止まればクリア', 'とくほど 時間がもどる'],
    fmt: s => s + '問', init, update, draw,
    down() { used = false; }, move: sw, up: sw,
  });
})();
