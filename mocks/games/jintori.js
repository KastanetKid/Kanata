// ジントリ：兵を半分送れば陣地が取れる。送ったぶん、自分の陣地は手薄になる。
(() => {
  const T = { // 調整値
    grow: 1,       // 【陣地の兵が増える速さ】人/秒
    cap: 40,       // 【陣地の兵の上限】
    speed: 115,    // 【部隊の移動速度】
    nodeR: 23,
    aiBase: 2.8, aiStep: .22, aiMin: .9, // 【敵が動く間隔】初期・ステージごとの短縮・下限
  };
  const COL = ['#8a90a8', '#3ec1ff', '#ff5d73'];
  let nodes, fleets, stage, aiT, sel, stageT, clearT, taught;
  function initStage() {
    const n = 7 + Math.min(3, stage >> 1); nodes = []; let tries = 0;
    while (nodes.length < n && tries++ < 3000) {
      const x = rnd(46, 314), y = rnd(124, 588);
      if (nodes.every(o => dist(o.x, o.y, x, y) > 82)) nodes.push({ x, y, own: 0, n: rint(4, 13), pulse: 0 });
    }
    nodes.sort((a, b) => b.y - a.y);
    nodes[0].own = 1; nodes[0].n = 20;
    const en = stage < 3 ? 1 : stage < 6 ? 2 : 3;
    for (let i = 1; i <= en; i++) { const e = nodes[nodes.length - i]; e.own = 2; e.n = 8 + stage * 2; }
    fleets = []; aiT = T.aiBase; sel = null; stageT = 0; clearT = 0;
  }
  function init() { stage = 1; taught = false; initStage(); }
  function send(a, b) {
    const k = Math.floor(a.n / 2); if (k < 1) return false;
    a.n -= k; a.pulse = 1; fleets.push({ x: a.x, y: a.y, to: b, own: a.own, n: k }); return true;
  }
  function arrive(f) {
    const t = f.to;
    if (t.own === f.own) { t.n += f.n; t.pulse = .6; return; }
    t.n -= f.n; burst(t.x, t.y, COL[f.own], 6, 140, .3); sfx.hit(.3);
    if (t.n < 0) {
      const was = t.own; t.own = f.own; t.n = -t.n; t.pulse = 1; ring(t.x, t.y, COL[f.own], 70); burst(t.x, t.y, COL[f.own], 16, 220);
      if (f.own === 1) { G.score += 100; pop(t.x, t.y - 34, '+100', '#fff', 20); sfx.coin(); hitstop(.06); shake(4); }
      else if (was === 1) { sfx.bad(); shake(8); flash('#ff3b4e', .25); pop(t.x, t.y - 34, 'とられた!', '#ff5d73', 18); }
    }
  }
  function ai() {
    const mine = nodes.filter(o => o.own === 2).sort((a, b) => b.n - a.n), s = mine[0];
    if (!s || s.n < 8) return;
    let best = null, bc = 1e9;
    for (const t of nodes) if (t.own !== 2) { const c = t.n + dist(s.x, s.y, t.x, t.y) / 40 * (t.own ? 1 : 0); if (c < bc) { bc = c; best = t; } }
    if (best && Math.floor(s.n / 2) > best.n + 1) send(s, best);
  }
  function update(dt) {
    stageT += dt;
    for (const o of nodes) { o.pulse *= .88; if (o.own && o.n < T.cap) o.n = Math.min(T.cap, o.n + T.grow * dt); }
    for (const f of fleets) {
      const d = dist(f.x, f.y, f.to.x, f.to.y), st = T.speed * dt;
      if (d <= T.nodeR) { arrive(f); f.n = 0; } else { f.x += (f.to.x - f.x) / d * st; f.y += (f.to.y - f.y) / d * st; }
    }
    fleets = fleets.filter(f => f.n > 0);
    if (clearT > 0) { clearT -= dt; if (clearT <= 0) { stage++; initStage(); } return; }
    aiT -= dt; if (aiT <= 0) { aiT = Math.max(T.aiMin, T.aiBase - stage * T.aiStep) * rnd(.8, 1.2); ai(); }
    const has = k => nodes.some(o => o.own === k) || fleets.some(f => f.own === k);
    if (!has(2)) {
      const b = 300 + Math.max(0, 60 - Math.floor(stageT)) * 10; G.score += b; clearT = 1.3;
      pop(W / 2, 300, 'ステージ ' + stage + ' せいは!', '#ffd23e', 28); pop(W / 2, 340, 'はやさボーナス +' + b, '#fff', 18); sfx.win(); confetti(40); flash('#fff', .3);
    } else if (!has(1)) { sfx.boom(); shake(10); end(.6); }
  }
  const at = (x, y, pad) => nodes.find(o => dist(o.x, o.y, x, y) < T.nodeR + pad);
  function draw() {
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const tgt = sel && P.down ? at(P.x, P.y, 18) : null;
    if (sel && P.down) {
      const ex = tgt && tgt !== sel ? tgt.x : P.x, ey = tgt && tgt !== sel ? tgt.y : P.y;
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(sel.x, sel.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.stroke();
      if (tgt && tgt !== sel) { circ(tgt.x, tgt.y, T.nodeR + 9, null, '#fff', 4); text(Math.floor(sel.n / 2) + ' 人おくる', tgt.x, tgt.y - T.nodeR - 22, 14, '#fff'); }
    }
    for (const f of fleets) {
      const k = Math.min(6, f.n);
      for (let i = 0; i < k; i++) { const a = i * 2.4 + G.clock * 3; circ(f.x + Math.cos(a) * (4 + i), f.y + Math.sin(a) * (4 + i), 4, COL[f.own], INK, 1.5); }
      text(f.n + '', f.x, f.y - 16, 12, '#fff');
    }
    for (const o of nodes) {
      const r = T.nodeR * (1 + o.pulse * .25) + (o === sel ? 3 : 0);
      if (o.own === 2) { ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.PI / 4); rr(-r * .9, -r * .9, r * 1.8, r * 1.8, 6, COL[2], INK); ctx.restore(); } // 敵は形でも見分ける
      else circ(o.x, o.y, r, COL[o.own], INK);
      if (o.own === 1) circ(o.x, o.y, r - 6, null, 'rgba(255,255,255,.6)', 2);
      text(Math.floor(o.n) + '', o.x, o.y + 1, 18, '#fff');
    }
    text('ステージ ' + stage, W - 12, 30, 14, '#fff', 'right');
    if (!taught && G.state === 'play' && !sel) {
      const a = nodes.find(o => o.own === 1), b = nodes.filter(o => o.own === 0).sort((p, q) => dist(a.x, a.y, p.x, p.y) - dist(a.x, a.y, q.x, q.y))[0];
      if (a && b) { const k = G.clock % 1.2 / 1.2; circ(lerp(a.x, b.x, k), lerp(a.y, b.y, k), 10, 'rgba(255,255,255,.85)', INK); }
      text('青い陣地から ドラッグで 兵を送る', W / 2, 84, 15, '#fff');
    }
  }
  start({
    id: 'jintori', title: 'ジントリ', genre: 'ストラテジー', color: '#3ec1ff', bg: '#141a2e',
    how: ['青から ドラッグで 兵を半分おくる', '数で上まわれば 陣地がとれる', '赤をぜんぶ 取ればクリア'],
    init, update, draw, debug: () => nodes,
    down(x, y) { const o = at(x, y, 14); sel = o && o.own === 1 ? o : null; if (sel) sfx.tap(); },
    up(x, y) {
      const t = at(x, y, 18);
      if (sel && t && t !== sel && sel.own === 1 && send(sel, t)) { taught = true; sfx.up(); }
      sel = null;
    },
  });
})();
