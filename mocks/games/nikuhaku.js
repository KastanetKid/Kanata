// ニクハク：近づくほど弾が強い。当たる距離は被弾する距離。
(() => {
  const T = { // 調整値
    fireInt: .11,   // 【連射の間隔】秒
    bulletSp: 760,  // 【弾の速さ】px/秒
    near: 80,       // 【×3になる距離】
    mid: 160,       // 【×2になる距離】
    shipR: 6,       // 【自機の当たり判定】
    hp: 3, inv: 1.5,
  };
  const MC = ['', '#fff', '#3ec1ff', '#ffd23e'];
  let ship, bullets, ens, ebs, spawnT, fireT, stars, lx, ly;
  function init() {
    ship = { x: 180, y: 520, hp: T.hp, inv: 0 }; bullets = []; ens = []; ebs = []; spawnT = .4; fireT = 0; lx = ly = 0;
    stars = Array.from({ length: 36 }, () => ({ x: rnd(W), y: rnd(H), s: rnd(20, 110) }));
  }
  function spawn() {
    const t = G.t, r = Math.random(); let e;
    if (t > 25 && r < .12) e = { k: 2, hp: 18, r: 26, vy: 26, pts: 60, ft: 1.5 };
    else if (t > 8 && r < .4 && ens.filter(o => o.k === 1).length < 3) e = { k: 1, hp: 6, r: 16, vy: 80, pts: 25, stopY: rnd(110, 250), ft: rnd(.8, 1.6) };
    else e = { k: 0, hp: 3, r: 14, vy: rnd(60, 95) + Math.min(60, t * .8), pts: 10 };
    e.bx = e.x = rnd(40, W - 40); e.y = -30; e.ph = rnd(TAU); e.hit = 0; ens.push(e);
  }
  function hurt() {
    ship.hp--; ship.inv = T.inv; ebs = [];
    hitstop(.18); shake(12); flash('#ff3b4e', .45); sfx.boom(); burst(ship.x, ship.y, '#ff5d73', 18, 260);
    if (ship.hp <= 0) { burst(ship.x, ship.y, '#ffd23e', 30, 340, .8); ring(ship.x, ship.y, '#fff', 90); end(.7); }
  }
  function update(dt) {
    for (const s of stars) { s.y += s.s * dt; if (s.y > H) { s.y = 0; s.x = rnd(W); } }
    ship.inv -= dt;
    fireT -= dt; if (fireT <= 0) { fireT = T.fireInt; bullets.push({ x: ship.x - 6, y: ship.y - 14 }, { x: ship.x + 6, y: ship.y - 14 }); }
    spawnT -= dt; if (spawnT <= 0) { spawnT = Math.max(.35, 1.1 - G.t * .012); spawn(); }
    for (const e of ens) {
      e.hit -= dt;
      if (e.k === 0) { e.y += e.vy * dt; e.x = e.bx + Math.sin(e.ph + G.t * 2) * 30; }
      else if (e.k === 1) {
        if (e.y < e.stopY) e.y += e.vy * dt; else { e.x = e.bx + Math.sin(e.ph + G.t) * 20; e.ft -= dt; if (e.ft <= 0) { e.ft = 1.7; const a = Math.atan2(ship.y - e.y, ship.x - e.x); ebs.push({ x: e.x, y: e.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150 }); } }
      } else {
        e.y += e.vy * dt; e.ft -= dt;
        if (e.ft <= 0) { e.ft = 2.2; for (const a of [-.35, 0, .35]) ebs.push({ x: e.x, y: e.y + 20, vx: Math.sin(a) * 130, vy: Math.cos(a) * 130 }); }
      }
      if (ship.inv <= 0 && ship.hp > 0 && dist(e.x, e.y, ship.x, ship.y) < e.r + T.shipR) hurt();
    }
    for (const b of bullets) {
      b.y -= T.bulletSp * dt;
      for (const e of ens) {
        if (e.hp > 0 && Math.abs(b.x - e.x) < e.r + 4 && Math.abs(b.y - e.y) < e.r + 8) {
          const d = dist(e.x, e.y, ship.x, ship.y), m = d < T.near + e.r ? 3 : d < T.mid + e.r ? 2 : 1;
          e.hp -= m; e.hit = .06; b.y = -99;
          burst(b.x, e.y + e.r, MC[m], m, 120, .25); tone(500 + m * 260, .03, 'square', .03);
          if (e.hp <= 0) {
            const pts = e.pts * m; G.score += pts;
            pop(e.x, e.y, (m > 1 ? '×' + m + ' ' : '') + pts, MC[m], 14 + m * 4);
            burst(e.x, e.y, MC[m], 6 + m * 5, 160 + m * 60); ring(e.x, e.y, MC[m], e.r * 2 + m * 8);
            hitstop(.02 * m + (e.k === 2 ? .1 : 0)); shake(2 + m * 2 + (e.k === 2 ? 6 : 0)); sfx.hit(m / 3);
          }
          break;
        }
      }
    }
    for (const b of ebs) { b.x += b.vx * dt; b.y += b.vy * dt; if (ship.inv <= 0 && ship.hp > 0 && dist(b.x, b.y, ship.x, ship.y) < 4 + T.shipR) { hurt(); break; } }
    bullets = bullets.filter(b => b.y > -20);
    ens = ens.filter(e => e.hp > 0 && e.y < H + 40);
    ebs = ebs.filter(b => b.y < H + 10 && b.y > -10 && b.x > -10 && b.x < W + 10);
  }
  function draw() {
    for (const s of stars) { ctx.fillStyle = `rgba(255,255,255,${s.s / 160})`; ctx.fillRect(s.x, s.y, 2, s.s / 12); }
    // 距離の目安（近い輪ほど強い）
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.arc(ship.x, ship.y, T.mid, Math.PI * 1.15, Math.PI * 1.85); ctx.strokeStyle = 'rgba(62,193,255,.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(ship.x, ship.y, T.near, Math.PI * 1.15, Math.PI * 1.85); ctx.strokeStyle = 'rgba(255,210,62,.5)'; ctx.stroke();
    ctx.setLineDash([]);
    text('×3', ship.x + T.near * .78, ship.y - T.near * .5, 11, '#ffd23e'); text('×2', ship.x + T.mid * .86, ship.y - T.mid * .42, 11, '#3ec1ff');
    for (const b of bullets) { ctx.fillStyle = INK; ctx.fillRect(b.x - 3, b.y - 8, 6, 16); ctx.fillStyle = '#ffe98a'; ctx.fillRect(b.x - 2, b.y - 7, 4, 14); }
    for (const e of ens) {
      const c = e.hit > 0 ? '#fff' : ['#6fe36a', '#c084fc', '#ff8a3d'][e.k];
      const w = 1 + (e.hit > 0 ? .15 : 0);
      circ(e.x, e.y, e.r * w, c, INK);
      circ(e.x - e.r * .35, e.y + e.r * .1, e.r * .22, INK); circ(e.x + e.r * .35, e.y + e.r * .1, e.r * .22, INK);
      if (e.k === 2) { ctx.fillStyle = INK; ctx.fillRect(e.x - 18, e.y - e.r - 9, 36, 6); ctx.fillStyle = '#ff5d73'; ctx.fillRect(e.x - 17, e.y - e.r - 8, 34 * e.hp / 18, 4); }
    }
    for (const b of ebs) { circ(b.x, b.y, 6, '#ff4d8d', INK, 2); circ(b.x, b.y, 2.5, '#fff'); }
    if (ship.hp > 0 && (ship.inv <= 0 || G.clock * 14 % 2 < 1)) {
      ctx.beginPath(); ctx.moveTo(ship.x, ship.y - 18); ctx.lineTo(ship.x + 14, ship.y + 12); ctx.lineTo(ship.x, ship.y + 5); ctx.lineTo(ship.x - 14, ship.y + 12); ctx.closePath();
      ctx.fillStyle = '#e8f1ff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      circ(ship.x, ship.y, T.shipR - 2, '#ff5d73', '#fff', 1.5);
    }
    for (let i = 0; i < T.hp; i++) circ(W - 22 - i * 20, 30, 7, i < ship.hp ? '#ff5d73' : 'rgba(255,255,255,.15)', INK, 2);
    if (G.t < 6 && G.state === 'play') text('ちかづくほど 強い!', W / 2, 600, 18, '#ffd23e');
  }
  start({
    id: 'nikuhaku', title: 'ニクハク', genre: 'シューティング', color: '#ffd23e', bg: '#10122a',
    how: ['ドラッグで移動（弾は自動）', '敵に近いほど 弾が ×2 ×3 に', 'でも 近いほど あぶない'],
    init, update, draw,
    down(x, y) { lx = x; ly = y; },
    move(x, y) { ship.x = clamp(ship.x + (x - lx) * 1.15, 16, W - 16); ship.y = clamp(ship.y + (y - ly) * 1.15, 90, H - 24); lx = x; ly = y; },
  });
})();
