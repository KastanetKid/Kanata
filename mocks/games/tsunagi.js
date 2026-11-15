// ツナギ：長くつなぐほど得点は二乗で増えるが、探している間も時間は減る。
(() => {
  const T = { // 調整値
    cols: 6, rows: 7, cs: 52, ox: 24, oy: 190,
    time: 45,      // 【持ち時間】秒
    bonusFrom: 5,  // 【時間が戻るつながりの数】
    bonusPer: .35, // 【1個あたり戻る秒】
    colors: ['#ff5d73', '#3ec1ff', '#ffd23e', '#6fe36a'],
  };
  let grid, chain, time, praiseT;
  const cx = c => T.ox + c * T.cs + T.cs / 2, cy = r => T.oy + r * T.cs + T.cs / 2;
  const mk = off => ({ k: rint(0, 3), off });
  function hasMove() {
    const seen = new Set();
    for (let c = 0; c < T.cols; c++) for (let r = 0; r < T.rows; r++) {
      if (seen.has(c * 9 + r)) continue;
      const k = grid[c][r].k, st = [[c, r]]; let n = 0; seen.add(c * 9 + r);
      while (st.length) {
        const [a, b] = st.pop(); n++;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const x = a + i, y = b + j;
          if (x >= 0 && y >= 0 && x < T.cols && y < T.rows && !seen.has(x * 9 + y) && grid[x][y].k === k) { seen.add(x * 9 + y); st.push([x, y]); }
        }
      }
      if (n >= 3) return true;
    }
    return false;
  }
  function init() {
    do { grid = Array.from({ length: T.cols }, () => Array.from({ length: T.rows }, () => mk(0))); } while (!hasMove());
    chain = []; time = T.time; praiseT = 0;
  }
  function cellAt(x, y) {
    const c = Math.floor((x - T.ox) / T.cs), r = Math.floor((y - T.oy) / T.cs);
    if (c < 0 || r < 0 || c >= T.cols || r >= T.rows) return null;
    if (dist(x, y, cx(c), cy(r)) > T.cs * .44) return null; // 斜めに通しやすいよう角は反応させない
    return { c, r };
  }
  function touch(x, y) {
    const p = cellAt(x, y); if (!p) return;
    const n = chain.length;
    if (!n) { chain.push(p); tone(330, .05, 'triangle', .1); return; }
    const l = chain[n - 1];
    if (p.c === l.c && p.r === l.r) return;
    if (n > 1 && chain[n - 2].c === p.c && chain[n - 2].r === p.r) { chain.pop(); sfx.tick(); return; }
    if (Math.abs(p.c - l.c) > 1 || Math.abs(p.r - l.r) > 1) return;
    if (grid[p.c][p.r].k !== grid[l.c][l.r].k || chain.some(q => q.c === p.c && q.r === p.r)) return;
    chain.push(p); tone(330 * Math.pow(2, n / 6), .06, 'triangle', .12);
  }
  function release() {
    const n = chain.length;
    if (n >= 3) {
      const k = grid[chain[0].c][chain[0].r].k, pts = n * n * 10, l = chain[n - 1];
      for (const p of chain) { burst(cx(p.c), cy(p.r), T.colors[k], 6, 180, .4); grid[p.c][p.r] = null; }
      G.score += pts; pop(cx(l.c), cy(l.r) - 20, '+' + pts, '#fff', 18 + n * 2);
      if (n >= T.bonusFrom) { time = Math.min(T.time, time + n * T.bonusPer); pop(W / 2, 96, '+' + (n * T.bonusPer).toFixed(1) + '秒', '#6fe36a', 18); }
      hitstop(Math.min(.02 * n, .16)); shake(n * 1.2); sfx.hit(Math.min(1, n / 8));
      if (n >= 6) { flash('#fff', .35); sfx.win(); }
      const w = n >= 9 ? '神ツナギ!!' : n >= 7 ? 'すごい!' : n >= 5 ? 'ナイス!' : '';
      if (w) pop(W / 2, 150, w, '#ffd23e', 30);
      for (let c = 0; c < T.cols; c++) {
        const keep = grid[c].filter(Boolean), miss = T.rows - keep.length;
        // 残った玉は落ちた段数ぶん上から、新しい玉は盤の上から降ってくる
        let seenNull = 0; const offs = [];
        for (let r = T.rows - 1; r >= 0; r--) { if (!grid[c][r]) seenNull++; else offs.unshift(seenNull); }
        keep.forEach((d, i) => { d.off = Math.min(d.off, 0) - offs[i] * T.cs; });
        grid[c] = Array.from({ length: miss }, () => mk(-miss * T.cs)).concat(keep);
      }
      if (!hasMove()) { for (const col of grid) for (const d of col) d.k = rint(0, 3); pop(W / 2, 150, 'シャッフル', '#fff', 22); if (!hasMove()) grid[0][0].k = grid[0][1].k = grid[0][2].k; }
    } else if (n) sfx.tick();
    chain = [];
  }
  function update(dt) {
    time -= dt;
    for (const col of grid) for (const d of col) if (d.off < 0) d.off = Math.min(0, d.off + 1100 * dt);
    if (time <= 0) { time = 0; chain = []; sfx.bad(); end(.4); }
  }
  function shape(k, x, y, s) {
    const c = T.colors[k];
    if (k === 0) circ(x, y, s, c, INK);
    else if (k === 1) rr(x - s * .88, y - s * .88, s * 1.76, s * 1.76, 6, c, INK);
    else {
      ctx.beginPath();
      if (k === 2) { ctx.moveTo(x, y - s * 1.05); ctx.lineTo(x + s, y + s * .8); ctx.lineTo(x - s, y + s * .8); }
      else { ctx.moveTo(x, y - s * 1.1); ctx.lineTo(x + s * 1.1, y); ctx.lineTo(x, y + s * 1.1); ctx.lineTo(x - s * 1.1, y); }
      ctx.closePath(); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    }
    circ(x - s * .3, y - s * .35, s * .18, 'rgba(255,255,255,.75)'); // 上からの光
  }
  function draw() {
    rr(20, 70, 320, 14, 7, 'rgba(255,255,255,.12)');
    const k = time / T.time; if (k > 0) rr(20, 70, Math.max(14, 320 * k), 14, 7, time < 10 ? '#ff5d73' : '#6fe36a');
    text(Math.ceil(time) + '', W - 30, 100, 16, time < 10 ? '#ff5d73' : '#fff');
    rr(T.ox - 8, T.oy - 8, T.cols * T.cs + 16, T.rows * T.cs + 16, 16, 'rgba(255,255,255,.07)');
    ctx.save(); ctx.beginPath(); ctx.rect(0, T.oy - 8, W, T.rows * T.cs + 16); ctx.clip();
    if (chain.length > 1) {
      ctx.beginPath(); chain.forEach((p, i) => i ? ctx.lineTo(cx(p.c), cy(p.r)) : ctx.moveTo(cx(p.c), cy(p.r)));
      ctx.lineJoin = ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 16; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.stroke();
    }
    for (let c = 0; c < T.cols; c++) for (let r = 0; r < T.rows; r++) {
      const d = grid[c][r], sel = chain.some(p => p.c === c && p.r === r);
      if (sel) circ(cx(c), cy(r), 25, null, '#fff', 4);
      shape(d.k, cx(c), cy(r) + d.off, sel ? 20 + Math.sin(G.clock * 14) * 1.5 : 17);
    }
    ctx.restore();
    const n = chain.length;
    if (n >= 3) text(n + 'こ → ' + n * n * 10 + '点' + (n >= T.bonusFrom ? ' +時間' : ''), W / 2, 150, 20, '#fff');
    else if (n) text('あと ' + (3 - n) + 'こ つなごう', W / 2, 150, 16, 'rgba(255,255,255,.8)');
    else if (G.t < 6 && !G.score) text('同じ色を なぞって 3こ以上', W / 2, 150, 16, '#fff');
    text('5こ以上で 時間がもどる', W / 2, 588, 13, 'rgba(255,255,255,.7)', 'center', 0);
  }
  start({
    id: 'tsunagi', title: 'ツナギ', genre: 'パズル', color: '#3ec1ff', bg: '#1c1840',
    how: ['同じ色を なぞって 3こ以上で消える', '長いほど 得点は二乗', 'でも 時間は止まらない'],
    init, update, draw, debug: () => grid, down: touch, move: touch, up: release,
  });
})();
