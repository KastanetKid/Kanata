// カベキック：コインはトゲのすぐそば。待てば狙えるが、溶岩は待ってくれない。
(() => {
  const T = { // 調整値
    wallL: 46, wallR: 314,
    jumpVx: 560,   // 【壁キックの横速度】
    jumpVy: 430,   // 【壁キックの上向き初速】
    grav: 900,     // 【重力】
    slide: 60,     // 【壁でずり落ちる速さ】
    grip: .18,     // 【着地してからずり落ち始めるまで】秒
    lava0: 34, lavaAcc: 1.0, lavaMax: 92, // 【溶岩の速さ】初期・毎秒の増加・上限
    spikeLen: 46, coin: 5,
  };
  let p, cam, lavaY, spikes, coins, nextY, maxH, bonus;
  function gen(to) {
    while (nextY < to) {
      const side = pick([-1, 1]); spikes.push({ side, y: nextY });
      if (Math.random() < .6) coins.push({ side, y: nextY + (Math.random() < .5 ? T.spikeLen + 30 : -30), got: false });
      nextY += Math.max(120, 200 - nextY / 160) + rnd(0, 70);
    }
  }
  function init() {
    p = { x: T.wallL, y: 120, vx: 0, vy: 0, on: -1, buf: 0, sq: 0, grip: 1 };
    cam = -100; lavaY = -170; spikes = []; coins = []; nextY = 360; maxH = 0; bonus = 0; gen(1200);
  }
  function jump() {
    if (!p.on) { p.buf = .16; return; }
    p.vx = -p.on * T.jumpVx; p.vy = T.jumpVy; p.on = 0; p.sq = -1;
    tone(420, .09, 'square', .09, 760); burst(p.x, H - (p.y - cam), '#fff', 5, 120, .25);
  }
  function die(c) { burst(p.x, H - (p.y - cam), c, 26, 320, .7); ring(p.x, H - (p.y - cam), '#fff', 80); hitstop(.15); shake(12); flash('#ff3b4e', .4); sfx.boom(); p.dead = true; end(.7); }
  function update(dt) {
    if (p.dead) return;
    p.buf -= dt; p.sq *= .8;
    if (p.on) {
      p.grip -= dt; if (p.grip <= 0) p.y -= T.slide * dt;
    } else {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= T.grav * dt;
      const hitL = p.x <= T.wallL, hitR = p.x >= T.wallR;
      if (hitL || hitR) {
        p.x = hitL ? T.wallL : T.wallR; p.on = hitL ? -1 : 1; p.vx = p.vy = 0; p.grip = T.grip; p.sq = 1;
        sfx.hit(.25); shake(2); burst(p.x, H - (p.y - cam), '#d8d8ff', 4, 90, .25);
      }
    }
    if (p.on) for (const s of spikes) if (s.side === p.on && p.y > s.y - 9 && p.y < s.y + T.spikeLen + 9) return die('#ff5d73');
    if (p.on && p.buf > 0) jump(); // 先行入力はトゲの判定のあとで受け付ける
    for (const c of coins) if (!c.got && c.side === p.on && Math.abs(c.y - p.y) < 22) {
      c.got = true; bonus += T.coin; sfx.coin(); pop(p.x - p.on * 36, H - (p.y - cam) - 20, '+' + T.coin + 'm', '#ffd23e', 20); burst(p.x, H - (c.y - cam), '#ffd23e', 8, 160, .4);
    }
    maxH = Math.max(maxH, p.y - 120); G.score = Math.floor(maxH / 10) + bonus;
    cam += (p.y - 230 - cam) * Math.min(1, 6 * dt);
    lavaY += Math.min(T.lavaMax, T.lava0 + G.t * T.lavaAcc) * dt; lavaY = Math.max(lavaY, cam - 150);
    if (p.y < lavaY + 8) return die('#ff8a3d');
    gen(cam + 1200);
    spikes = spikes.filter(s => s.y > cam - 100); coins = coins.filter(c => c.y > cam - 100);
  }
  const sy = wy => H - (wy - cam);
  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b1440'); g.addColorStop(1, '#3a1c4a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) { const y = ((i * 97 + cam * .3) % H + H) % H; ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(60 + i * 53 % 220, y, 30, 6); }
    // 壁
    for (const [x, w] of [[0, T.wallL - 12], [T.wallR + 12, W - T.wallR - 12]]) {
      ctx.fillStyle = '#5b4a8a'; ctx.fillRect(x, 0, w, H); ctx.fillStyle = INK; ctx.fillRect(x ? x - 3 : w, 0, 3, H);
      ctx.fillStyle = 'rgba(10,12,24,.25)'; for (let y = ((cam % 40) + 40) % 40 - 40; y < H; y += 40) ctx.fillRect(x, y, w, 3);
    }
    for (const s of spikes) {
      const x = s.side < 0 ? T.wallL - 12 : T.wallR + 12, d = -s.side * 20, y0 = sy(s.y + T.spikeLen), n = 3, h = T.spikeLen / n;
      ctx.beginPath(); for (let i = 0; i < n; i++) { ctx.moveTo(x, y0 + i * h); ctx.lineTo(x + d, y0 + i * h + h / 2); ctx.lineTo(x, y0 + (i + 1) * h); }
      ctx.closePath(); ctx.fillStyle = '#ff5d73'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    }
    for (const c of coins) if (!c.got) { const x = c.side < 0 ? T.wallL + 4 : T.wallR - 4, w = Math.abs(Math.cos(G.clock * 4)) * 8 + 2; ctx.beginPath(); ctx.ellipse(x, sy(c.y), w, 10, 0, 0, TAU); ctx.fillStyle = '#ffd23e'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke(); }
    if (!p.dead && p.on) { // 次の着地点の目印（トゲに重なると赤）
      const t = (T.wallR - T.wallL) / T.jumpVx, ly2 = p.y + T.jumpVy * t - T.grav * t * t / 2, x = p.on < 0 ? T.wallR : T.wallL;
      const bad = spikes.some(s => s.side === -p.on && ly2 > s.y - 9 && ly2 < s.y + T.spikeLen + 9);
      circ(x, sy(ly2), 9, null, bad ? '#ff5d73' : 'rgba(255,255,255,.7)', 3); if (bad) text('✕', x, sy(ly2), 14, '#ff5d73');
    }
    if (!p.dead) {
      // 着地でつぶれ、空中でのびる
      const y = sy(p.y), w = 22 * (1 - p.sq * .25), h = 22 * (1 + p.sq * .25) * (p.on ? 1 : 1.12);
      rr(p.x - w / 2, y - h / 2, w, h, 6, '#6fe36a', INK);
      const dir = p.on ? -p.on : Math.sign(p.vx);
      circ(p.x + dir * 4 - 3, y - 3, 2.5, INK); circ(p.x + dir * 4 + 4, y - 3, 2.5, INK);
    }
    // 溶岩
    const ly = sy(lavaY);
    if (ly < H + 20) {
      ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, ly + Math.sin(x * .05 + G.clock * 4) * 5); ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = '#ff8a3d'; ctx.fill(); ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 4; ctx.stroke();
    }
    const near = clamp(1 - (p.y - lavaY) / 170, 0, 1);
    if (near > 0) { const v = ctx.createLinearGradient(0, H - 160, 0, H); v.addColorStop(0, 'rgba(255,60,40,0)'); v.addColorStop(1, `rgba(255,60,40,${near * .55})`); ctx.fillStyle = v; ctx.fillRect(0, H - 160, W, 160); }
    if (G.t < 5 && G.state === 'play') { text('タップで かべキック!', W / 2, 150, 20, '#fff'); text('かべでは ずり落ちる → 着地点をえらべる', W / 2, 180, 12, '#ffd23e'); }
  }
  start({
    id: 'kabekick', title: 'カベキック', genre: 'アクション', color: '#6fe36a', bg: '#1b1440',
    how: ['タップで 反対のかべへ キック', 'トゲに注意、コインは そのすぐそば', '下から 溶岩がせまる'],
    fmt: s => s + 'm', init, update, draw, down: jump,
  });
})();
