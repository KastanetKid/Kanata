// シワケ：急ぐほどコンボで点が伸びる。まちがえればコンボも時間も失う。
(() => {
  const T = { // 調整値
    max: 5,          // 【ゲージの最大】秒
    gain: .5,        // 【正解で戻る秒】
    lose: 1.2,       // 【まちがいで減る秒】
    drain: .7,       // 【ゲージの減る速さ】初期
    drainUp: .018,   // 【同・1秒ごとの増加】
    gold: .08,       // 【金（どちらでもOK）の出る率】
    swapMin: 12, swapMax: 18, // 【何個ごとに左右が入れかわるか】
    grace: .9,       // 【入れかわり直後、ゲージが止まる秒】
  };
  const COL = ['#ff5d73', '#3ec1ff', '#ffd23e'];
  let queue, leftK, gauge, combo, flies, swapIn, grace, started, bump, slideT;
  const mk = () => ({ k: Math.random() < T.gold ? 2 : rint(0, 1) });
  function init() { queue = Array.from({ length: 6 }, mk); queue[0].k = 0; queue[1].k = 1; leftK = 0; gauge = T.max; combo = 0; flies = []; swapIn = rint(T.swapMin, T.swapMax); grace = 0; started = false; bump = [0, 0]; slideT = 0; }
  function icon(k, x, y, s) {
    if (k === 0) circ(x, y, s, COL[0], INK);
    else if (k === 1) rr(x - s * .9, y - s * .9, s * 1.8, s * 1.8, s * .25, COL[1], INK);
    else { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * .5 : s * 1.15; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = COL[2]; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(); }
    circ(x - s * .3, y - s * .35, s * .16, 'rgba(255,255,255,.7)');
  }
  function sort(x) {
    const left = x < W / 2, it = queue.shift(); queue.push(mk()); started = true; slideT = 1;
    const ok = it.k === 2 || left === (it.k === leftK), tx = left ? 60 : 300;
    flies.push({ k: it.k, x: 180, y: 430, tx, t: 0, ok });
    if (ok) {
      combo++; gauge = Math.min(T.max, gauge + T.gain); bump[left ? 0 : 1] = 1;
      const pts = (it.k === 2 ? 50 : 10) * (1 + Math.floor(combo / 10)); G.score += pts;
      tone(440 * Math.pow(2, Math.min(combo, 24) / 12), .06, 'square', .08); if (it.k === 2) sfx.coin();
      burst(tx, 470, COL[it.k], 5, 150, .3);
      if (combo % 10 === 0) { pop(W / 2, 200, combo + ' コンボ!  点 ×' + (1 + combo / 10), '#ffd23e', 24); flash('#fff', .2); sfx.up(); shake(4); }
    } else {
      combo = 0; gauge -= T.lose; hitstop(.12); shake(10); flash('#ff3b4e', .35); sfx.bad(); pop(tx, 400, '✕', '#ff5d73', 40);
    }
    if (--swapIn <= 0) { swapIn = rint(T.swapMin, T.swapMax); leftK = 1 - leftK; grace = T.grace; pop(W / 2, 300, 'チェンジ!', '#fff', 36); flash('#fff', .3); tone(600, .2, 'square', .1, 1200); bump = [1, 1]; }
  }
  function update(dt) {
    bump = bump.map(v => v * .85); slideT *= .7;
    for (const f of flies) f.t += dt * 6; flies = flies.filter(f => f.t < 1);
    if (grace > 0) grace -= dt; else if (started) gauge -= (T.drain + G.t * T.drainUp) * dt;
    if (gauge <= 0) { gauge = 0; sfx.boom(); shake(8); end(.5); }
  }
  function bin(side) {
    const k = side ? 1 - leftK : leftK, x = side ? 240 : 0, b = bump[side] * 10;
    rr(x + 8 - b / 2, 400 - b, 104 + b, 170 + b, 16, 'rgba(255,255,255,.1)', COL[k], 5);
    icon(k, x + 60, 470, 26 + b / 2); text(side ? 'みぎ ▶' : '◀ ひだり', x + 60, 540, 14, '#fff');
  }
  function draw() {
    rr(20, 64, 320, 14, 7, 'rgba(255,255,255,.12)'); const g = gauge / T.max; if (g > 0) rr(20, 64, Math.max(14, 320 * g), 14, 7, grace > 0 ? '#fff' : gauge < 1.5 ? '#ff5d73' : '#6fe36a');
    bin(0); bin(1);
    rr(140, 110, 80, 370, 14, 'rgba(255,255,255,.06)');
    for (let i = 4; i >= 0; i--) { const y = 430 - i * 64 - slideT * 64, s = i ? 18 : 30; ctx.globalAlpha = i ? 1 - i * .16 : 1; icon(queue[i].k, 180, y, s); }
    ctx.globalAlpha = 1;
    for (const f of flies) { const e = 1 - (1 - f.t) * (1 - f.t); icon(f.k, lerp(f.x, f.tx, e), f.y + Math.sin(e * Math.PI) * -40 + e * 40, 30 * (1 - e * .45)); }
    if (combo >= 2) text(combo + ' コンボ', W / 2, 100, 16 + Math.min(10, combo / 3), combo >= 10 ? '#ffd23e' : '#fff');
    if (!started && G.state === 'play') { text('おなじ形の箱へ タップで仕分け', W / 2, 600, 15, '#fff'); if (G.clock % .8 < .5) circ(queue[0].k === leftK ? 60 : 300, 470, 46, null, '#fff', 4); }
    else text('★ は どっちでもOK', W / 2, 600, 13, 'rgba(255,255,255,.7)', 'center', 0);
  }
  start({
    id: 'shiwake', title: 'シワケ', genre: '反射・仕分け', color: '#ff5d73', bg: '#221c3a',
    how: ['左右タップで 同じ形の箱へ', 'つづけるほど コンボで点が増える', 'ときどき 箱が入れかわる'],
    init, update, draw, down: sort,
  });
})();
