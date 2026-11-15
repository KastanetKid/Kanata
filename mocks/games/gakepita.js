// ガケピタ：崖のふちに近いほど高得点。行きすぎたら落ちる。
(() => {
  const T = { // 調整値
    edge: 130,       // 【崖のふちのY】
    sx: 180, sy: 556, r: 16,
    reach: 3.4,      // 【引いた長さ1pxあたり進む距離】ふつうの床で（氷ではもっと伸びる）
    maxPull: 140,    // 【引ける長さの上限】
    decel: 520,      // 【ふつうの床の減速】px/秒²
    iceDecel: 330,   // 【氷の床の減速】
    zones: [[26, 100, '#ff5d73'], [72, 50, '#ffb03e'], [140, 30, '#ffe27a'], [240, 10, '#bfe8ff']], // ふちからの距離, 点, 色
    lives: 3,
  };
  let pk, lives, round, combo, ice, bump, aim, waitT, taught;
  function setup() {
    pk = { x: T.sx, y: T.sy, vx: 0, vy: 0, st: 'aim', t: 0, sc: 1 };
    ice = round % 3 === 2; aim = null;
    bump = round >= 4 ? { x: rnd(90, 270), y: rnd(290, 390), w: 76, h: 16, v: (round % 2 ? 1 : -1) * Math.min(150, 60 + round * 8) } : null;
  }
  function init() { lives = T.lives; round = 0; combo = 0; waitT = 0; taught = false; setup(); }
  function rest() {
    const gap = pk.y - T.edge; let pts = 0;
    for (const z of T.zones) if (gap <= z[0]) { pts = z[1]; break; }
    pk.st = 'rest'; waitT = .9;
    if (pts >= 50) combo++; else combo = 0;
    const mult = 1 + Math.max(0, combo - 1) * .5, got = Math.round(pts * mult); G.score += got;
    if (pts === 100) { hitstop(.2); flash('#fff', .5); shake(8); ring(pk.x, pk.y, '#ff5d73', 80); burst(pk.x, pk.y, '#ffd23e', 24, 260); sfx.win(); pop(W / 2, 240, 'ギリギリ!!', '#ff5d73', 36); }
    else if (pts >= 30) { sfx.coin(); ring(pk.x, pk.y, '#fff'); if (pts === 50) pop(W / 2, 240, 'ナイス!', '#ffd23e', 28); }
    else if (pts === 0) { sfx.tick(); pop(W / 2, 240, 'とどかず…', '#bfe8ff', 22); }
    else sfx.tap();
    if (got) pop(pk.x, pk.y - 30, '+' + got + (mult > 1 ? ' (×' + mult + ')' : ''), '#fff', 22);
  }
  function update(dt) {
    if (bump) { bump.x += bump.v * dt; if (bump.x < 40 + bump.w / 2 || bump.x > 320 - bump.w / 2) bump.v *= -1; }
    if (pk.st === 'move') {
      const s = Math.hypot(pk.vx, pk.vy), ns = s - (ice ? T.iceDecel : T.decel) * dt;
      if (ns <= 0) { rest(); return; }
      pk.vx *= ns / s; pk.vy *= ns / s;
      const py = pk.y; pk.x += pk.vx * dt; pk.y += pk.vy * dt;
      if (pk.x < 40 + T.r) { pk.x = 40 + T.r; pk.vx = Math.abs(pk.vx) * .8; sfx.tick(); shake(2); }
      if (pk.x > 320 - T.r) { pk.x = 320 - T.r; pk.vx = -Math.abs(pk.vx) * .8; sfx.tick(); shake(2); }
      if (pk.y > H - 50 - T.r) { pk.y = H - 50 - T.r; pk.vy = -Math.abs(pk.vy) * .8; }
      if (bump && Math.abs(pk.x - bump.x) < bump.w / 2 + T.r && Math.abs(pk.y - bump.y) < bump.h / 2 + T.r) {
        if (Math.abs(py - bump.y) >= bump.h / 2 + T.r - 1) { pk.vy *= -.8; pk.y = bump.y + Math.sign(py - bump.y) * (bump.h / 2 + T.r + 1); }
        else { pk.vx = Math.sign(pk.x - bump.x) * Math.abs(pk.vx || 80) * .8 + bump.v * .5; pk.x = bump.x + Math.sign(pk.x - bump.x) * (bump.w / 2 + T.r + 1); }
        sfx.hit(.4); shake(4); burst(pk.x, pk.y, '#fff', 5, 120, .3);
      }
      if (pk.y < T.edge) { pk.st = 'fall'; pk.t = 0; lives--; combo = 0; tone(700, .6, 'sine', .15, 90); shake(6); pop(W / 2, 240, 'おちた!', '#ff5d73', 30); }
    } else if (pk.st === 'fall') {
      pk.t += dt; pk.x += pk.vx * dt * .5; pk.y += pk.vy * dt * .5; pk.sc = Math.max(0, 1 - pk.t / .6);
      if (pk.t > .7) { if (lives <= 0) end(.3); else { round++; setup(); } }
    } else if (pk.st === 'rest') { waitT -= dt; if (waitT <= 0) { round++; setup(); } }
  }
  function draw() {
    // 谷（判定のない背景は控えめに）
    const g = ctx.createLinearGradient(0, 0, 0, T.edge + 40); g.addColorStop(0, '#0d1026'); g.addColorStop(1, '#2a2f5c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 台
    ctx.fillStyle = INK; ctx.fillRect(34, T.edge - 3, 292, H);
    ctx.fillStyle = ice ? '#cdeeff' : '#f3ead8'; ctx.fillRect(40, T.edge, 280, H - T.edge - 50);
    let prev = 0;
    for (const z of T.zones) { ctx.globalAlpha = ice ? .55 : .85; ctx.fillStyle = z[2]; ctx.fillRect(40, T.edge + prev, 280, z[0] - prev); ctx.globalAlpha = 1; text(z[1] + '', 62, T.edge + (prev + z[0]) / 2, z[1] === 100 ? 13 : 16, '#fff'); prev = z[0]; }
    ctx.fillStyle = '#3a2f55'; ctx.fillRect(40, H - 50, 280, 50);
    if (ice) text('ツルツル', 290, T.edge + 300, 14, '#3ec1ff');
    if (bump) rr(bump.x - bump.w / 2, bump.y - bump.h / 2, bump.w, bump.h, 6, '#7a5cff', INK);
    // 狙い
    if (aim && pk.st === 'aim') {
      const dx = aim.x, dy = aim.y, l = Math.hypot(dx, dy), n = Math.ceil(l / 14);
      for (let i = 1; i <= n; i++) circ(pk.x + dx / l * i * 16, pk.y + dy / l * i * 16, 5 - i * .2, i > n * .75 ? '#ff5d73' : '#fff', INK, 2);
      ctx.strokeStyle = 'rgba(10,12,24,.5)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(pk.x, pk.y); ctx.lineTo(pk.x - dx, pk.y - dy); ctx.stroke();
      text(Math.round(l / T.maxPull * 100) + '%', pk.x + 44, pk.y, 16, '#fff');
    }
    if (pk.sc > 0) {
      const wob = pk.st === 'move' && pk.y < T.edge + 80 ? rnd(-1, 1) : 0;
      circ(pk.x + 2, pk.y + 4, T.r * pk.sc, 'rgba(10,12,24,.3)');
      circ(pk.x + wob, pk.y, T.r * pk.sc, '#3ec1ff', INK); circ(pk.x + wob, pk.y, T.r * .55 * pk.sc, '#e8f6ff', INK, 2);
    }
    for (let i = 0; i < T.lives; i++) circ(W - 22 - i * 20, 30, 7, i < lives ? '#3ec1ff' : 'rgba(255,255,255,.15)', INK, 2);
    if (combo > 1) text('れんぞく ×' + (1 + (combo - 1) * .5), W / 2, 70, 16, '#ffd23e');
    if (!taught && pk.st === 'aim' && !aim && G.state === 'play') {
      const k = G.clock % 1.4 / 1.4, hy = pk.y + 14 + Math.min(1, k * 1.6) * 44;
      ctx.setLineDash([4, 6]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pk.x, pk.y + 16); ctx.lineTo(pk.x, hy); ctx.stroke(); ctx.setLineDash([]);
      circ(pk.x, hy, 11, 'rgba(255,255,255,.85)', INK);
      text('うしろに引いて はなす', W / 2, 470, 18, '#fff');
    }
  }
  start({
    id: 'gakepita', title: 'ガケピタ', genre: 'はじき・チキンレース', color: '#ff5d73', bg: '#0d1026',
    how: ['引っぱって はなすと すべる', 'ガケのふちに 近いほど高得点', '落ちたら 1ミス（3回で終了）'],
    init, update, draw,
    down() { if (pk.st === 'aim') aim = { x: 0, y: 0 }; },
    move(x, y) {
      if (!aim) return;
      let dx = P.sx - x, dy = P.sy - y; const l = Math.hypot(dx, dy);
      if (l > T.maxPull) { dx *= T.maxPull / l; dy *= T.maxPull / l; }
      if (Math.floor(l / 20) !== Math.floor(Math.hypot(aim.x, aim.y) / 20)) sfx.tick();
      aim.x = dx; aim.y = dy;
    },
    up() {
      if (!aim) return; const l = Math.hypot(aim.x, aim.y);
      if (l > 12 && pk.st === 'aim') { const sp = Math.sqrt(2 * T.decel * l * T.reach); pk.vx = aim.x / l * sp; pk.vy = aim.y / l * sp; pk.st = 'move'; taught = true; sfx.hit(l / T.maxPull); burst(pk.x, pk.y + 10, '#fff', 6, 120, .3); }
      aim = null;
    },
  });
})();
