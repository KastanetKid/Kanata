'use strict';

// ---------- ステージ進行・カメラ・アイテム・HUD ----------

const ITEM_INFO = {
  food1: { heal: 30 }, food2: { heal: 60 },
  score1: { score: 1000, name: 'サイン色紙' }, score2: { score: 3000, name: 'トロフィー' },
  sp: { sp: 100, name: 'ペンライト' }, life: { life: 1, name: '1UP' },
};

function buildWaves(S) {
  const R = BG.rng(S.seed);
  const n = S.waves.length;
  const start = 260, end = S.len - W - 380;
  const pool = Object.entries(S.pool);
  const total = pool.reduce((a, [, w]) => a + w, 0);
  return S.waves.map((count, i) => {
    const list = [];
    for (let k = 0; k < count; k++) {
      let r = R() * total, type = pool[0][0];
      for (const [t, w] of pool) { if ((r -= w) <= 0) { type = t; break; } }
      if (type === 'heavy' && i < S.heavyFrom) type = 'dancer';
      list.push(type);
    }
    if (i >= S.heavyFrom && !list.includes('heavy') && S.pool.heavy == null && i === n - 1) list[list.length - 1] = 'heavy';
    if (S.heavyFrom > 0 && i === n - 1 && !list.includes('heavy')) list[0] = 'heavy';
    return { cam: Math.round(start + (end - start) * i / Math.max(1, n - 1)), list, done: false };
  });
}

function buildProps(S, si, waves) {
  const R = BG.rng(S.seed * 7 + 3);
  const order = ['food1', 'score1', 'sp', 'food2', 'score2', 'food1', 'sp'];
  const props = [];
  waves.forEach((w, i) => {
    if (i % 2 === 0 || i === waves.length - 1) {
      let item = order[props.length % order.length];
      if ((si === 1 || si === 3) && i === 2) item = 'life';
      props.push({ x: w.cam + W * (0.55 + R() * 0.3), z: 10 + R() * 60, kind: R() < 0.5 ? 'box' : 'speaker', hp: 1, item, col: pick(['#ff6fa8', '#39d3ff', '#ffd43b', '#b07bff']) });
    }
  });
  props.forEach(p => { if (p.kind === 'speaker') p.hp = 2; });
  // ボス戦の前に回復を置いておく
  props.push({ x: S.len - W + 60, z: 70, kind: 'box', hp: 1, item: 'food2', col: '#ff6fa8' });
  return props;
}

function newStage(ci, si, carry) {
  const S = STAGES[si];
  carry = carry || {};
  const g = {
    ci, si, S, chr: CHARS[ci], bg: BG.make(S.id, S.len, S.seed),
    camX: 0, lock: null, frame: 0, phase: 'intro', phaseT: 0,
    player: null, enemies: [], boss: null, projs: [], hazards: [], items: [], props: [],
    waves: null, waveIdx: 0, wave: null, queue: [], spawnCD: 0,
    hitstop: 0, freeze: 0, shake: 0, flashT: 0, slow: 0,
    combo: 0, comboT: 0, maxCombo: carry.maxCombo || 0,
    score: carry.score || 0, lives: carry.lives != null ? carry.lives : 2, continues: carry.continues || 0,
    totalTime: carry.totalTime || 0, stageTime: 0,
    tokens: S.tokens, attackers: 0, aggro: 1,
    focus: null, banner: null, sub: null, cutin: null, ult: null, go: 0,
    god: params.has('god'), mood: null, hpTrail: 1, bossTrail: 1, result: null,
  };
  G = g;
  g.waves = buildWaves(S);
  g.props = buildProps(S, si, g.waves);
  const p = makePlayer(ci);
  p.x = -30;
  p.z = 46;
  if (carry.sp != null) p.sp = carry.sp;
  p.state = 'enter';
  g.player = p;
  FX.clear();
  Object.assign(g, STAGE_METHODS);
  return g;
}

const STAGE_METHODS = {
  say(name, text, color, tts, prio) {
    this.sub = { name, text, color, t: 0, dur: Math.max(110, text.length * 7 + 40) };
    Sound.speak(text, Object.assign({ prio }, tts || {}));
  },

  summon(f, s) {
    const n = s.n;
    for (let i = 0; i < n; i++) {
      const type = s.type === 'mix' ? pick(['dancer', 'cheer', 'slider', 'thrower']) : s.type;
      const side = i % 2 ? -1 : 1;
      const e = makeGrunt(type, this.si, side < 0 ? this.camX - 30 : this.camX + W + 30, rnd(10, DEPTH - 10));
      e.cd = 60;
      this.enemies.push(e);
    }
    FX.notes(f.x, FLOOR + f.z - 70, 5);
    Sound.sfx('cheer');
  },

  spawnHazard(f, h) {
    const p = this.player;
    if (h.kind === 'spot') {
      for (let i = 0; i < h.n + (f.phase === 2 ? 2 : 0); i++) {
        const x = i === 0 ? p.x : clamp(p.x + rnd(-150, 150), this.camX + 30, this.camX + W - 30);
        const z = i === 0 ? p.z : rnd(8, DEPTH - 8);
        this.hazards.push({ kind: 'spot', x, z, r: 24, t: -i * 9, warn: f.phase === 2 ? 48 : 58 });
      }
    } else if (h.kind === 'laser') {
      this.hazards.push({ kind: 'laser', t: 0, warn: 44, sweep: 70, dir: Math.random() < 0.5 ? 1 : -1, z: 0 });
      Sound.sfx('warn');
    }
  },

  startUlt(p) {
    p.sp = 0;
    p.inv = 240;
    p.move = null;
    p.vx = p.vz = 0;
    p.setState('cheer');
    this.cutin = { t: 0, dur: 76 };
    this.projs = this.projs.filter(q => q.team === 'p');
    Sound.sfx('ult');
    playerSay('ult', 3);
  },

  bossPhase(b) {
    const B = b.def;
    this.say(B.name, B.lines.phase, '#ff6f9a', B.tts, 3);
    this.flashT = 14;
    this.shake = 10;
    startMove(b, 'burst');
    if (b.bossId === 'aurora') this.mood = 'red';
    FX.starBurst(b.x, FLOOR + b.z - 60, '#ff6f9a', 10);
  },

  onDefeat(f) {
    if (f.team === 'p') {
      this.playerDown();
      return;
    }
    if (f.kind === 'boss') return;
    this.score += f.score;
    f.look = Object.assign({}, f.look, { hypno: false, eye: '#6a4a8a' });
    Sound.sfx('free');
  },

  playerDown() {
    const p = this.player;
    Sound.sfx('ko');
    playerSay('ko', 3);
    if (this.lives > 0) {
      this.lives--;
      this.prevPhase = this.phase;
      this.phase = 'respawn';
      this.phaseT = 0;
    } else {
      this.phase = 'over';
      this.phaseT = 0;
      this.contT = 600;
      Sound.jingle('gameover');
    }
    p.grabbing = null;
  },

  respawn() {
    const p = this.player;
    p.hp = p.maxHp;
    p.ko = false;
    p.inv = 150;
    p.y = 60;
    p.vy = 0;
    p.x = clamp(p.x, this.camX + 40, this.camX + W - 40);
    p.setState('jump');
    p.airAtk = true;
    p.sp = Math.max(p.sp, 100);
    FX.ring(p.x, FLOOR + p.z, 120, this.chr.color, 24);
    FX.starBurst(p.x, FLOOR + p.z - 40, this.chr.color, 10);
    // 復活の衝撃で周りの敵を押し返す
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'grabbed') continue;
      if (Math.abs(e.x - p.x) < 140) {
        e.move = null;
        e.setState('fall');
        e.vy = 3.5;
        e.vx = (e.x > p.x ? 1 : -1) * 3;
        e.y = 1;
        e.bounced = false;
      }
    }
    if (this.boss && this.boss.state !== 'dead') { this.boss.cd = 90; this.boss.x = clamp(this.boss.x + (this.boss.x > p.x ? 60 : -60), this.camX + 30, this.camX + W - 30); }
    this.projs.length = 0;
    this.hazards.length = 0;
    playerSay('revive', 2);
    Sound.sfx('sp');
  },

  continueGame() {
    this.continues++;
    this.lives = 2;
    this.phase = this.prevPhase || (this.boss ? 'boss' : 'play');
    if (this.phase === 'respawn' || this.phase === 'over') this.phase = this.boss ? 'boss' : 'play';
    this.respawn();
    Sound.play(this.boss ? this.S.bossSong : this.S.song);
  },

  carry() {
    return {
      score: this.score, lives: this.lives, continues: this.continues,
      totalTime: this.totalTime, maxCombo: this.maxCombo, sp: this.player ? this.player.sp : 100,
    };
  },

  // 主人公の差し替え（コンティニュー時のキャラ変更）
  swapPlayer(ci) {
    const old = this.player;
    const p = makePlayer(ci);
    p.x = old.x; p.z = old.z; p.sp = old.sp;
    p.ko = true;
    p.setState('dead');
    this.player = p;
    this.ci = ci;
    this.chr = CHARS[ci];
  },

  startWave(w) {
    this.wave = w;
    this.lock = w.cam;
    this.queue = w.list.slice();
    const first = Math.min(this.S.maxOn, this.queue.length);
    for (let i = 0; i < first; i++) this.spawnNext(i);
    this.spawnCD = 50;
  },
  spawnNext(i) {
    const type = this.queue.shift();
    if (!type) return;
    const right = (i == null ? Math.random() < 0.6 : i % 3 !== 1);
    const x = right ? this.camX + W + 24 + rnd(0, 40) : this.camX - 24 - rnd(0, 40);
    const e = makeGrunt(type, this.si, x, rnd(6, DEPTH - 6));
    e.cd = rnd(50, 110);
    this.enemies.push(e);
  },

  update() {
    const p = this.player;
    this.frame++;
    this.phaseT++;
    if (this.flashT > 0) this.flashT--;
    if (this.shake > 0) this.shake *= 0.85, this.shake < 0.3 && (this.shake = 0);
    if (this.sub && ++this.sub.t > this.sub.dur) this.sub = null;
    if (this.banner && ++this.banner.t > 70) this.banner = null;
    FX.update();

    // 超必殺技のカットイン中は世界を止める
    if (this.cutin) {
      if (++this.cutin.t >= this.cutin.dur) {
        this.cutin = null;
        this.ult = { kind: this.chr.ult, t: 0, dur: 100 };
      }
      return;
    }
    if (this.freeze > 0) { this.freeze--; return; }
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (this.slow > 0) { this.slow--; if (this.slow % 3) return; }

    const I = Input;
    const pressed = I.consume();
    const control = ['play', 'boss'].includes(this.phase) || (this.phase === 'respawn' && this.phaseT > 70);
    if (pressed.pause && ['play', 'boss', 'intro', 'bossIntro'].includes(this.phase)) { Scenes.pause(); return; }
    if (Bot.on) Bot.drive(pressed);
    this.pressed = pressed;

    if (['play', 'boss', 'bossIntro'].includes(this.phase) || this.phase === 'respawn') {
      this.stageTime++;
      this.totalTime++;
    }

    // ---- プレイヤー ----
    if (p) {
      if (this.phase === 'intro') {
        if (p.x < this.camX + 90) { p.vx = this.chr.walk; p.state = 'enter'; p.facing = 1; }
        else if (p.state === 'enter') { p.vx = 0; p.state = 'idle'; }
        updateFighter(p);
      } else if (this.phase === 'bossIntro') {
        if (p.state === 'walk' || p.state === 'run') p.state = 'idle';
        p.vx *= 0.8; p.vz *= 0.8;
        if (this.boss) p.facing = this.boss.x > p.x ? 1 : -1;
        updateFighter(p);
      } else if (this.phase === 'clear' || this.phase === 'bossDown') {
        if (p.state === 'walk' || p.state === 'run' || p.state === 'idle') { p.vx = 0; p.vz = 0; p.state = this.phase === 'clear' ? 'victory' : 'idle'; }
        updateFighter(p);
      } else if (p.state !== 'dead') {
        if (control) playerControl(p, { mx: I.mx, mz: I.mz, pressed });
        if (!control && (p.state === 'walk' || p.state === 'run')) { p.state = 'idle'; p.vx = p.vz = 0; }
        if (p.state === 'cheer') { p.vx = p.vz = 0; if (!this.ult && !this.cutin) p.setState('idle'); }
        updateFighter(p);
        playerGrabMoves(p);
      }
      // HP の減りを遅れて追う
      this.hpTrail += (p.hp / p.maxHp - this.hpTrail) * (p.hp / p.maxHp < this.hpTrail ? 0.04 : 1);
    }

    // ---- 超必殺技 ----
    if (this.ult && !ultUpdate(this.ult)) this.ult = null;

    // ---- 敵 ----
    this.attackers = this.enemies.filter(e => e.state === 'attack').length;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.state === 'dead') {
        e.st++;
        if (e.st === 30) {
          FX.hearts(e.x, FLOOR + e.z - 40, 4);
          if (Math.random() < 0.3) FX.float(e.x, FLOOR + e.z - 70, pick(['ありがとう♡', 'あれ…わたし？', '目が覚めた！', 'たのしかった♪']), '#ffd1e6', 8);
        }
        if (e.st > 72) this.enemies.splice(i, 1);
        continue;
      }
      // 念のため：体力 0 なのに立っている敵は倒す
      if (e.hp <= 0 && !['fall', 'thrown', 'down', 'grabbed'].includes(e.state)) {
        e.ko = true; e.move = null; e.setState('fall'); e.vy = 3; e.y = Math.max(e.y, 1); e.bounced = false;
      }
      if (this.phase === 'play' || this.phase === 'boss' || this.phase === 'respawn') gruntAI(e);
      else if (e.state === 'walk') { e.state = 'idle'; e.vx = e.vz = 0; }
      updateFighter(e);
    }
    separate(this.enemies);

    // ---- ボス ----
    const b = this.boss;
    if (b) {
      if (b.state === 'enter') {
        b.vx = -b.spd * 0.8;
        if (b.x < this.camX + W - 110) { b.vx = 0; b.setState('taunt'); }
        updateFighter(b);
      } else if (b.state === 'freed' || b.state === 'taunt') {
        b.st++; b.t++;
      } else {
        if (this.phase === 'boss' || this.phase === 'respawn') bossAI(b);
        updateFighter(b);
      }
      if (b.ko && this.phase === 'boss') this.startBossDown();
      this.bossTrail += (Math.max(0, b.hp) / b.maxHp - this.bossTrail) * 0.04;
    }

    updateProjs();
    updateHazards();
    this.updateItems();
    for (const pr of this.props) if (pr.shake > 0) pr.shake--;

    if (this.comboT > 0 && --this.comboT === 0) this.combo = 0;
    if (this.focus && --this.focus.t <= 0) this.focus = null;
    if (this.go > 0) this.go--;

    this.updateCamera();
    this.updatePhase();
  },

  updateCamera() {
    const p = this.player;
    const S = this.S;
    const w = this.waves[this.waveIdx];
    let maxCam = this.lock != null ? this.lock : S.len - W;
    if (this.lock == null && w && !w.done) maxCam = Math.min(maxCam, w.cam);
    if (p && this.phase !== 'intro') {
      const want = clamp(p.x - W * 0.42, 0, maxCam);
      if (want > this.camX) this.camX += Math.max(Math.min(want - this.camX, 0.6), (want - this.camX) * 0.14);
      if (this.camX > maxCam) this.camX = maxCam;
    }
    if (this.phase === 'play' && this.lock == null && w && !w.done && this.camX >= w.cam - 0.5) {
      this.camX = w.cam;
      this.startWave(w);
    }
  },

  updatePhase() {
    const S = this.S, T = this.phaseT;
    switch (this.phase) {
      case 'intro':
        if (T === 20) Sound.jingle('start');
        if (T === 70) playerSay('start', 2);
        if (T >= 150) {
          this.phase = 'play';
          this.phaseT = 0;
          Sound.play(S.song);
        }
        break;
      case 'play': {
        const w = this.wave;
        if (w && !w.done) {
          const alive = this.enemies.filter(e => e.state !== 'dead').length;
          if (this.queue.length) {
            if (--this.spawnCD <= 0 && alive < S.maxOn) { this.spawnNext(); this.spawnCD = 45; }
          } else if (alive === 0 && this.enemies.length === 0) {
            w.done = true;
            this.wave = null;
            this.lock = null;
            this.waveIdx++;
            this.go = 200;
            Sound.sfx('go');
          }
        }
        if (!this.wave && this.waveIdx >= this.waves.length && this.camX >= S.len - W - 1) this.startBossIntro();
        break;
      }
      case 'bossIntro': {
        const B = this.boss.def;
        if (T === 70) this.say(B.name, B.lines.intro, '#ff6f9a', B.tts, 3);
        const need = 70 + Math.max(150, B.lines.intro.length * 9);
        if (T >= need || (T > 110 && Bot.on)) {
          this.phase = 'boss';
          this.phaseT = 0;
          this.boss.setState('idle');
          this.boss.cd = 50;
          Sound.play(S.bossSong);
          playerSay('boss', 1);
        }
        break;
      }
      case 'bossDown': {
        const b = this.boss;
        if (T === 100) {
          b.move = null;
          b.vx = b.vz = 0;
          b.y = 0;
          b.look = Object.assign({}, b.look, { evil: false });
          b.setState('freed');
          this.say(b.def.name, b.def.lines.defeat, '#ffb3d1', Object.assign({}, b.def.tts, { pitch: (b.def.tts.pitch || 1) + 0.15 }), 3);
          FX.hearts(b.x, FLOOR + b.z - 60, 8);
        }
        if (T >= 100 + Math.max(170, b.def.lines.defeat.length * 9) || (T > 140 && Bot.on)) this.startClear();
        break;
      }
      case 'clear': {
        const R = this.result;
        if (T === 40) playerSay('clear', 2);
        if (T > 60 && R.shown < R.total) R.shown = Math.min(R.total, R.shown + Math.max(37, Math.round(R.total / 50)));
        if (T > 140 && (Input.taps.length || this.pressed.a || this.pressed.b || Bot.on && T > 160)) {
          Input.taps.length = 0;
          Scenes.nextStage();
        }
        break;
      }
      case 'respawn':
        if (T === 70) this.respawn();
        if (T >= 90) { this.phase = this.prevPhase === 'boss' ? 'boss' : 'play'; this.phaseT = 0; }
        break;
      case 'over':
        break;
    }
  },

  startBossIntro() {
    this.phase = 'bossIntro';
    this.phaseT = 0;
    this.lock = this.S.len - W;
    this.camX = this.lock;
    Sound.stop(0.8);
    Sound.jingle('warning');
    const b = makeBoss(this.S.boss, this.camX + W + 40, 44);
    b.setState('enter');
    b.facing = -1;
    this.boss = b;
  },

  startBossDown() {
    this.phase = 'bossDown';
    this.phaseT = 0;
    this.slow = 90;
    this.flashT = 16;
    this.shake = 14;
    this.score += 10000 + 5000 * this.si;
    Sound.stop(0.5);
    Sound.sfx('boom');
    this.hazards.length = 0;
    this.projs.length = 0;
    // 呼ばれていた子たちも一緒に正気に戻る
    for (const e of this.enemies) {
      if (e.state !== 'dead') { e.hp = 0; e.ko = true; e.move = null; e.setState('fall'); e.vy = 3; e.y = 1; e.vx = 0; }
    }
  },

  startClear() {
    const p = this.player;
    this.phase = 'clear';
    this.phaseT = 0;
    const secs = Math.round(this.stageTime / 60);
    const life = Math.round(Math.max(0, p.hp) / p.maxHp * 5000);
    const time = Math.max(0, 300 - secs) * 20;
    this.result = { secs, life, time, total: life + time, shown: 0 };
    this.score += life + time;
    p.move = null;
    p.vx = p.vz = 0;
    if (p.state !== 'dead') p.setState('victory');
    Sound.jingle('clear');
    const next = this.si + 1;
    Save.d.unlocked = Math.max(Save.d.unlocked, Math.min(next, STAGES.length - 1));
    Save.d.best = Math.max(Save.d.best, this.score);
    Save.store();
  },

  updateItems() {
    const p = this.player;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t++;
      if (it.y > 0 || it.vy) { it.vy -= 0.2; it.y += it.vy; if (it.y <= 0) { it.y = 0; it.vy = 0; } }
      if (p && p.state !== 'dead' && it.t > 20 && it.y < 4 && Math.abs(p.x - it.x) < 16 && Math.abs(p.z - it.z) < 9 && p.y < 10) {
        const info = ITEM_INFO[it.kind];
        let name = info.name;
        if (info.heal) {
          const big = it.kind === 'food2';
          name = this.S.food[big ? 1 : 0];
          p.hp = Math.min(p.maxHp, p.hp + info.heal * (Save.d.opts.easy ? 1.5 : 1));
          Sound.sfx('heal');
          Sound.say('hai', this.chr.f0, { who: p.id, gain: 0.6 });
        } else {
          Sound.sfx('item');
        }
        if (info.score) this.score += info.score;
        if (info.sp) { p.sp = Math.min(300, p.sp + info.sp); Sound.sfx('sp'); }
        if (info.life) this.lives++;
        FX.float(it.x, FLOOR + it.z - 30, name + (info.heal ? ' 回復!' : info.score ? ` +${info.score}` : info.sp ? ' SP+' : '!'), '#fff27a', 9);
        FX.starBurst(it.x, FLOOR + it.z - 12, '#fff27a', 4);
        this.items.splice(i, 1);
      }
    }
  },
};

// ---------- 描画 ----------
function drawShadow(x, z, y, r) {
  const k = Math.max(0.35, 1 - y / 120);
  ctx.fillStyle = 'rgba(10,0,20,.32)';
  ctx.beginPath();
  ctx.ellipse(x - G.camX, FLOOR + z, r * k, r * 0.32 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFighter(f) {
  const [pose, sx] = poseOf(f);
  const x = f.x - G.camX, y = FLOOR + f.z - f.y;
  const o = { t: f.t / 60, sx, swing: f.vx * f.facing * 0.5, propOpen: f.move && f.move.float && f.mf > f.move.st && f.mf < f.move.st + 62 };
  if (f.flash > 0 && f.flash % 2 === 0) o.flash = true;
  if (f.team === 'p' && f.inv > 0 && f.state !== 'cheer' && Math.floor(f.t / 3) % 2 === 0) o.alpha = 0.45;
  if (f.state === 'dead' && f.kind === 'grunt') {
    // 正気に戻って手を振り、消えていく
    const k = f.st;
    let ps = Fig.POSES.down;
    if (k > 14) ps = Fig.lerp(Fig.POSES.down, Fig.POSES.crouch, Math.min(1, (k - 14) / 14));
    if (k > 28) { ps = Object.assign({}, Fig.POSES.wave, { face: 'happy', nU: 2.7 + Math.sin(k * 0.4) * 0.3 }); }
    o.alpha = k > 48 ? Math.max(0, 1 - (k - 48) / 24) : 1;
    Fig.draw(ctx, f.look, ps, x, y - (k > 48 ? (k - 48) * 0.6 : 0), f.facing, o);
    return;
  }
  if (f.kind === 'boss' && f.phase === 2 && f.state !== 'freed') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(f.t * 0.2);
    const g = ctx.createRadialGradient(x, y - 40 * f.size, 4, x, y - 40 * f.size, 50 * f.size);
    g.addColorStop(0, 'rgba(255,80,140,.8)');
    g.addColorStop(1, 'rgba(255,80,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 60 * f.size, y - 100 * f.size, 120 * f.size, 110 * f.size);
    ctx.restore();
  }
  Fig.draw(ctx, f.look, pose, x, y, f.facing, o);
  f.lastPose = pose;
  f.lastSx = sx;
  // 予告の「！」
  if (f.state === 'attack' && f.move && f.move.warn && f.mf <= f.move.st && Math.floor(f.mf / 3) % 2 === 0) {
    txt('!', x, y - f.h - 12, { size: 16, color: '#ff4f7a', align: 'center', font: DFONT, w: 400, lw: 4 });
  }
  if (f.team === 'p' && G.enemies.length > 1 && f.state !== 'dead') {
    ctx.fillStyle = G.chr.color;
    ctx.beginPath();
    const ty = y - f.h - 8 - (f.state === 'attack' ? 0 : Math.sin(f.t * 0.15));
    ctx.moveTo(x - 4, ty - 5); ctx.lineTo(x + 4, ty - 5); ctx.lineTo(x, ty);
    ctx.fill();
  }
}

function drawItem(it) {
  const x = it.x - G.camX, y = FLOOR + it.z - it.y - 6 - Math.abs(Math.sin(it.t * 0.08)) * 2;
  drawItemIcon(it.kind, x, y, G.si, it.t);
}

function drawItemIcon(kind, x, y, si, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = Fig.OUT;
  const F = (c) => { ctx.fillStyle = c; ctx.fill(); ctx.stroke(); };
  if (kind === 'food1' || kind === 'food2') {
    ctx.beginPath(); ctx.ellipse(0, 4, 10, 3.4, 0, 0, Math.PI * 2); F('#ffffff');
    const big = kind === 'food2';
    switch (si) {
      case 0: // トッポッキ / キンパ
        if (!big) for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-5 + i * 3.4, 0, 1.8, 4, 0.4, 0, Math.PI * 2); F('#ff4a3a'); }
        else for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-6 + i * 6, 0, 3.4, 0, Math.PI * 2); F('#1a2a1a'); ctx.beginPath(); ctx.arc(-6 + i * 6, 0, 2.2, 0, Math.PI * 2); F('#fff8e8'); ctx.fillStyle = '#ffb000'; ctx.fillRect(-7 + i * 6, -1, 2, 2); }
        break;
      case 1: // ホットドッグ / ベーグル
        if (!big) { ctx.beginPath(); ctx.ellipse(0, 0, 9, 3.4, 0, 0, Math.PI * 2); F('#e8a85a'); ctx.beginPath(); ctx.ellipse(0, -1, 9.5, 2, 0, 0, Math.PI * 2); F('#c8463a'); ctx.strokeStyle = '#ffd34a'; ctx.beginPath(); ctx.moveTo(-6, -2); for (let i = 0; i < 6; i++) ctx.lineTo(-6 + i * 2.4, -1 + (i % 2 ? -1.2 : 0)); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(0, -1, 7, 0, Math.PI * 2); F('#d8904a'); ctx.beginPath(); ctx.arc(0, -1, 2.4, 0, Math.PI * 2); F('#ffffff'); }
        break;
      case 2: // スコーン / フィッシュ&チップス
        if (!big) { ctx.beginPath(); ctx.ellipse(0, -1, 7, 5, 0, 0, Math.PI * 2); F('#e8c07a'); ctx.beginPath(); ctx.ellipse(2, -4, 3, 1.4, 0, 0, Math.PI * 2); F('#ff6a7a'); }
        else { ctx.beginPath(); ctx.rect(-8, -6, 16, 9); F('#ff3a4a'); for (let i = 0; i < 5; i++) { ctx.fillStyle = '#ffd36a'; ctx.fillRect(-6 + i * 3, -10, 2, 6); } ctx.beginPath(); ctx.ellipse(-2, -6, 6, 3, -0.3, 0, Math.PI * 2); F('#e8a85a'); }
        break;
      case 3: // シュラスコ / アサイー
        if (!big) { ctx.strokeStyle = '#8a8a9a'; ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(10, -4); ctx.stroke(); ctx.strokeStyle = Fig.OUT; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-5 + i * 5, -0.5 - i * 1.4, 3, 3.4, 0, 0, Math.PI * 2); F('#9a4a2a'); } }
        else { ctx.beginPath(); ctx.arc(0, -1, 7, 0, Math.PI); F('#8a5ad8'); ctx.beginPath(); ctx.ellipse(0, -1, 7, 2.4, 0, 0, Math.PI * 2); F('#5a2a8a'); ctx.fillStyle = '#ffd34a'; ctx.fillRect(-4, -3, 2, 2); ctx.fillStyle = '#ff4a6a'; ctx.fillRect(1, -3, 2, 2); }
        break;
      case 4: // クロワッサン / マカロン
        if (!big) { ctx.beginPath(); ctx.moveTo(-9, 2); ctx.quadraticCurveTo(0, -10, 9, 2); ctx.quadraticCurveTo(0, -3, -9, 2); F('#e8a24a'); }
        else for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-5 + i * 5, -1 - (i === 1 ? 3 : 0), 3.6, 2.6, 0, 0, Math.PI * 2); F(['#ffb3d1', '#b8f0c8', '#d8c8ff'][i]); }
        break;
      default: // おにぎり / いちご大福
        if (!big) { ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(8, 2, 6, 3); ctx.lineTo(-6, 3); ctx.quadraticCurveTo(-8, 2, 0, -8); F('#ffffff'); ctx.fillStyle = '#1a2a1a'; ctx.fillRect(-3, -1, 6, 4); }
        else { ctx.beginPath(); ctx.arc(0, -1, 6.5, 0, Math.PI * 2); F('#fff2f6'); ctx.beginPath(); ctx.arc(0, -6, 3, 0, Math.PI * 2); F('#ff3a5a'); }
    }
  } else if (kind === 'score1') {
    ctx.rotate(-0.15);
    ctx.beginPath(); ctx.rect(-7, -9, 14, 16); F('#fff8f0');
    ctx.strokeStyle = '#ff4f8b';
    ctx.beginPath(); ctx.moveTo(-4, -2); ctx.bezierCurveTo(-2, -8, 2, 4, 4, -4); ctx.stroke();
    ctx.fillStyle = '#ffd43b';
    Fig.starPath(ctx, 3, 3, 2.5, 1, 5); ctx.fill();
  } else if (kind === 'score2') {
    ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(6, -9); ctx.quadraticCurveTo(6, 0, 0, 1); ctx.quadraticCurveTo(-6, 0, -6, -9); F('#ffcc33');
    ctx.beginPath(); ctx.rect(-1.5, 1, 3, 4); F('#ffcc33');
    ctx.beginPath(); ctx.rect(-5, 5, 10, 3); F('#8a5a2a');
  } else if (kind === 'sp') {
    ctx.rotate(0.5 + Math.sin(t * 0.1) * 0.3);
    ctx.strokeStyle = 'rgba(255,100,200,.4)'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 5); ctx.stroke();
    ctx.strokeStyle = '#ff6fd0'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#3a3a4a'; ctx.fillRect(-2, 5, 4, 5);
  } else if (kind === 'life') {
    ctx.fillStyle = '#ffd43b';
    Fig.starPath(ctx, 0, -2, 9, 4, 5);
    F('#ffd43b');
    txt('1UP', 0, -1, { size: 6, align: 'center', color: '#ff3d7f', lw: 2 });
  }
  ctx.restore();
}

function drawProp(p) {
  if (p.broken) return;
  const x = p.x - G.camX + (p.shake ? Math.sin(p.shake * 2) * 1.5 : 0), y = FLOOR + p.z;
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = Fig.OUT;
  if (p.kind === 'box') {
    ctx.beginPath(); ctx.rect(x - 11, y - 20, 22, 20); ctx.fillStyle = p.col; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 2, y - 20, 4, 20);
    ctx.fillRect(x - 11, y - 12, 22, 3);
    ctx.beginPath(); ctx.rect(x - 12, y - 24, 24, 5); ctx.fillStyle = Fig.shade(p.col, 0.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(x - 4, y - 26, 4, 2.4, -0.5, 0, Math.PI * 2); ctx.ellipse(x + 4, y - 26, 4, 2.4, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.rect(x - 11, y - 30, 22, 30); ctx.fillStyle = '#26222e'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a3646';
    ctx.beginPath(); ctx.arc(x, y - 20, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 7, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#12101a';
    ctx.beginPath(); ctx.arc(x, y - 20, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.col;
    ctx.fillRect(x - 9, y - 28, 4, 2);
  }
  ctx.restore();
}

function drawWorld() {
  const g = G;
  ctx.save();
  if (g.shake > 0) ctx.translate(rnd(-g.shake, g.shake) * 0.6, rnd(-g.shake, g.shake) * 0.6);
  const t = g.frame / 60;
  g.bg.draw(ctx, g.camX, W, scale, t, Sound.beat(), g.mood);
  // 床の上のもの
  for (const h of g.hazards) if (h.kind !== 'laser') drawHazard(h);
  const all = [];
  if (g.player) all.push(g.player);
  for (const e of g.enemies) all.push(e);
  if (g.boss) all.push(g.boss);
  for (const f of all) drawShadow(f.x, f.z, f.y, 15 * f.size);
  for (const p of g.props) if (!p.broken) drawShadow(p.x, p.z, 0, 14);
  for (const it of g.items) drawShadow(it.x, it.z, it.y, 8);
  for (const p of g.projs) drawShadow(p.x, p.z, p.y, 6);
  const list = [];
  for (const f of all) list.push([f.z + (f.state === 'grabbed' ? 0.6 : 0), 0, f]);
  for (const p of g.props) if (!p.broken) list.push([p.z, 1, p]);
  for (const it of g.items) list.push([it.z, 2, it]);
  for (const p of g.projs) list.push([p.z + 0.1, 3, p]);
  list.sort((a, b) => a[0] - b[0]);
  for (const [, k, o] of list) {
    if (k === 0) drawFighter(o);
    else if (k === 1) drawProp(o);
    else if (k === 2) drawItem(o);
    else drawProj(o);
  }
  // オーロラの光線
  const b = g.boss;
  if (b && b.state === 'attack' && b.move && b.move.beam) drawBeam(b);
  for (const h of g.hazards) if (h.kind === 'laser') drawHazard(h);
  g.bg.drawFx(ctx, g.camX, W, t, Sound.beat(), g.mood);
  FX.draw(g.camX);
  if (g.ult) ultDraw(g.ult);
  ctx.restore();
  if (g.flashT > 0) {
    ctx.fillStyle = `rgba(255,255,255,${g.flashT / 16})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBeam(b) {
  const m = b.move, mf = b.mf;
  const x = b.x - G.camX, y = FLOOR + b.z - 50 * b.size;
  const dir = b.facing;
  ctx.save();
  if (mf <= m.st) {
    ctx.globalAlpha = 0.3 + 0.3 * Math.abs(Math.sin(mf * 0.4));
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dir * W, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,215,0,.12)';
    ctx.fillRect(dir > 0 ? x : x - W, FLOOR + b.z - 10, W, 20);
  } else if (mf <= m.st + m.ac) {
    ctx.globalCompositeOperation = 'lighter';
    const w = 10 + Math.sin(mf * 0.8) * 3;
    ctx.fillStyle = 'rgba(255,200,60,.4)';
    ctx.fillRect(dir > 0 ? x : x - W, y - w, W, w * 2);
    ctx.fillStyle = 'rgba(255,255,220,.9)';
    ctx.fillRect(dir > 0 ? x : x - W, y - w * 0.35, W, w * 0.7);
    ctx.beginPath(); ctx.arc(x + dir * 10, y, 14, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- HUD ----------
function bar(x, y, w, h, k, trail, col, bg) {
  ctx.fillStyle = bg || '#2a1531';
  rrect(x - 1.5, y - 1.5, w + 3, h + 3, 2.5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w * clamp(trail, 0, 1), h);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, Fig.shade(col, 0.35));
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w * clamp(k, 0, 1), h);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fillRect(x, y, w * clamp(k, 0, 1), h * 0.35);
}

function drawHUD() {
  const g = G, p = g.player;
  const L = 8 + safe.l, top = 6 + safe.t * 0.3;
  // プレイヤー
  ctx.save();
  ctx.fillStyle = 'rgba(30,10,40,.55)';
  rrect(L - 2, top - 2, 176, 44, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(L + 19, top + 20, 17, 0, Math.PI * 2);
  ctx.fillStyle = g.chr.color;
  ctx.fill();
  ctx.save();
  ctx.clip();
  Fig.bust(ctx, g.chr.look, L + 20, top + 23, 1.05, p.hp < p.maxHp * 0.3 ? 'hurt' : 'normal', g.frame / 60);
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(L + 19, top + 20, 17, 0, Math.PI * 2); ctx.stroke();
  txt(g.chr.en, L + 40, top + 6, { size: 9, color: '#ffffff', font: DFONT, w: 400, lw: 3 });
  txt('×' + g.lives, L + 28, top + 37, { size: 8, color: '#fff27a', lw: 3 });
  bar(L + 40, top + 12, 128, 8, p.hp / p.maxHp, g.hpTrail, p.hp < p.maxHp * 0.3 ? '#ff4f6a' : '#ffd23b');
  // SP（3 ストック）
  for (let i = 0; i < 3; i++) {
    const k = clamp((p.sp - i * 100) / 100, 0, 1);
    const sx = L + 46 + i * 15, sy = top + 29;
    ctx.fillStyle = '#2a1531';
    Fig.starPath(ctx, sx, sy, 6.5, 3, 5);
    ctx.fill();
    if (k > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(sx - 7, sy + 7 - k * 14, 14, 14); ctx.clip();
      ctx.fillStyle = k >= 1 ? (p.sp >= 300 && g.frame % 20 < 10 ? '#ffffff' : '#ffd23b') : '#b07bff';
      Fig.starPath(ctx, sx, sy, 5, 2.2, 5);
      ctx.fill();
      ctx.restore();
    }
  }
  txt(String(g.score).padStart(7, '0'), L + 168, top + 30, { size: 9, color: '#ffffff', align: 'right', lw: 3 });
  ctx.restore();

  // 直前に殴った敵
  const f = g.focus && g.focus.f;
  if (f && f.kind === 'grunt') {
    const ex = W - safe.r - 190, ey = top + 2;
    txt(f.name, ex, ey + 4, { size: 8, color: '#ffd1e6', lw: 3 });
    bar(ex, ey + 11, 140, 5, Math.max(0, f.hp) / f.maxHp, Math.max(0, f.hp) / f.maxHp, '#ff6fa8');
  }
  // ボス
  const b = g.boss;
  if (b && ['boss', 'respawn', 'over', 'bossDown'].includes(g.phase)) {
    const bw = Math.min(260, W - 200), bx = W / 2 - bw / 2, by = top + 44;
    txt(b.def.title + '  ' + b.name, W / 2, by - 6, { size: 9, color: '#ffffff', align: 'center', lw: 3 });
    bar(bx, by, bw, 7, Math.max(0, b.hp) / b.maxHp, g.bossTrail, b.phase === 2 ? '#ff3f6a' : '#ff6fa8');
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillRect(bx + bw * 0.5 - 0.5, by, 1, 7);
  }
  // コンボ
  if (g.combo >= 3 && g.comboT > 0) {
    const cx = W - safe.r - 20, cy = 96;
    const s = 1 + Math.max(0, (g.comboT - 100) / 10) * 0.25;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    txt(String(g.combo), 0, 0, { size: 26, align: 'right', font: DFONT, w: 400, grad: ['#ffffff', '#ffe14a', '#ff6fa8'], lw: 5 });
    txt('HITS', 0, 18, { size: 9, align: 'right', color: '#ffffff', font: DFONT, w: 400, lw: 3 });
    const rate = g.combo >= 40 ? 'LEGEND!!' : g.combo >= 25 ? 'AMAZING!' : g.combo >= 12 ? 'GREAT!' : '';
    if (rate) txt(rate, 0, 31, { size: 10, align: 'right', color: '#ff6fd0', font: DFONT, w: 400, lw: 3 });
    ctx.restore();
  }
  // GO →
  if (g.go > 0 && g.phase === 'play' && Math.floor(g.go / 12) % 2 === 0) {
    const gx = W - safe.r - 70, gy = 128;
    txt('GO', gx, gy, { size: 22, color: '#ffe14a', font: DFONT, w: 400, lw: 5 });
    ctx.fillStyle = '#ffe14a';
    ctx.strokeStyle = '#2a1531';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(gx + 38, gy - 9); ctx.lineTo(gx + 54, gy); ctx.lineTo(gx + 38, gy + 9); ctx.closePath();
    ctx.stroke(); ctx.fill();
  }
  // 技名
  if (g.banner) {
    const k = g.banner.t;
    const a = k < 8 ? k / 8 : k > 55 ? (70 - k) / 15 : 1;
    const x = W / 2 + (k < 8 ? (8 - k) * 8 : 0);
    txt(g.banner.text, x, top + 112, { size: 15, align: 'center', color: '#ffffff', font: DFONT, w: 400, alpha: a, sc: g.banner.col, lw: 5 });
  }
  // セリフ
  if (g.sub) drawSubtitle(g.sub);
}

function wrapText(s, size, maxW) {
  const lines = [];
  let cur = '';
  for (const ch of s) {
    if (txtW(cur + ch, size) > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawSubtitle(sub) {
  const k = sub.t;
  const a = Math.min(1, k / 8, (sub.dur - k) / 12);
  const size = 10;
  const lines = wrapText(sub.text, size, Math.min(W - 120, 380));
  const y = G && G.phase === 'bossIntro' ? 184 : 74 + safe.t * 0.3;
  const w = Math.min(W - 100, Math.max(...lines.map(l => txtW(l, size))) + 24);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(25,8,35,.78)';
  rrect(W / 2 - w / 2, y - 6, w, lines.length * 13 + 10, 6);
  ctx.fill();
  ctx.fillStyle = sub.color;
  rrect(W / 2 - w / 2 + 6, y - 13, txtW(sub.name, 8) + 12, 12, 4);
  ctx.fill();
  txt(sub.name, W / 2 - w / 2 + 12, y - 7, { size: 8, color: '#ffffff', lw: 2 });
  lines.forEach((l, i) => txt(l, W / 2, y + 6 + i * 13, { size, color: '#ffffff', align: 'center', lw: 2.5 }));
  ctx.restore();
}

// ---------- 演出カード ----------
function drawStageCard() {
  const g = G, T = g.phaseT;
  if (T > 150) return;
  const a = Math.min(1, T / 10, (150 - T) / 15);
  const slide = T < 14 ? (14 - T) * 30 : T > 135 ? -(T - 135) * 30 : 0;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(25,8,40,.7)';
  ctx.beginPath();
  ctx.moveTo(0, 96); ctx.lineTo(W, 84); ctx.lineTo(W, 150); ctx.lineTo(0, 162);
  ctx.fill();
  ctx.fillStyle = g.chr.color;
  ctx.fillRect(0, 96 - 3 + 0, W, 2);
  ctx.translate(slide, 0);
  txt(`STAGE ${g.si + 1}`, W / 2, 106, { size: 13, align: 'center', color: '#ffe14a', font: DFONT, w: 400, lw: 4 });
  txt(g.S.name, W / 2, 128, { size: 28, align: 'center', font: DFONT, w: 400, grad: ['#ffffff', '#ffd1e6', '#ff6fa8'], lw: 6 });
  txt(g.S.jp, W / 2, 150, { size: 10, align: 'center', color: '#ffffff', lw: 3 });
  ctx.restore();
}

function drawBossCard() {
  const g = G, T = g.phaseT, b = g.boss;
  if (T < 40) {
    if (Math.floor(T / 8) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,40,90,.25)';
      ctx.fillRect(0, 100, W, 40);
      txt('WARNING', W / 2, 120, { size: 24, align: 'center', color: '#ff4f7a', font: DFONT, w: 400, lw: 5 });
    }
    return;
  }
  const k = T - 40;
  const slide = k < 12 ? (12 - k) * 40 : 0;
  ctx.save();
  ctx.fillStyle = 'rgba(25,8,40,.8)';
  ctx.beginPath(); ctx.moveTo(0, 70); ctx.lineTo(W, 52); ctx.lineTo(W, 150); ctx.lineTo(0, 168); ctx.fill();
  ctx.fillStyle = '#ff6fa8';
  ctx.fillRect(0, 66, W, 2);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, 70); ctx.lineTo(W, 52); ctx.lineTo(W, 150); ctx.lineTo(0, 168); ctx.clip();
  Fig.bust(ctx, b.look, W * 0.27 - slide, 108, 2.4, 'evil', g.frame / 60);
  ctx.restore();
  ctx.translate(slide * 0.5, 0);
  txt(`${b.def.from}  STAGE BOSS`, W * 0.48, 82, { size: 9, color: '#ffe14a', lw: 3 });
  txt(b.def.title, W * 0.48, 100, { size: 12, color: '#ffffff', lw: 3 });
  txt(b.name, W * 0.48, 126, { size: 30, font: DFONT, w: 400, grad: ['#ffffff', '#ffb3d1', '#ff3f7a'], lw: 6 });
  ctx.restore();
}

function drawCutin() {
  const c = G.cutin, C = G.chr;
  const k = c.t;
  ctx.save();
  ctx.fillStyle = `rgba(10,0,20,${Math.min(0.6, k / 10)})`;
  ctx.fillRect(0, 0, W, H);
  const band = Math.min(1, k / 8) * (k > c.dur - 10 ? (c.dur - k) / 10 : 1);
  const y0 = 64, y1 = 206;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, y0 + 20 - (1 - band) * 60); ctx.lineTo(W, y0 - (1 - band) * 60); ctx.lineTo(W, y1 - 20 + (1 - band) * 60); ctx.lineTo(0, y1 + (1 - band) * 60);
  ctx.closePath();
  const gr = ctx.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, C.color);
  gr.addColorStop(1, '#2a1048');
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.clip();
  // 集中線
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    const yy = y0 + BG.hash(i * 13 + Math.floor(k / 2)) * (y1 - y0);
    const xx = ((BG.hash(i * 7) * W * 2 - k * 30) % (W * 1.5) + W * 1.5) % (W * 1.5) - W * 0.25;
    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 80, yy); ctx.stroke();
  }
  const px = W * 0.3 + (k < 12 ? -(12 - k) * 25 : (k - 12) * 0.4);
  Fig.bust(ctx, C.look, px, 120, 4.2, k < 40 ? 'shout' : 'happy', k / 60);
  ctx.restore();
  const tx = W * 0.56 + (k < 16 ? (16 - k) * 30 : 0);
  txt('ULTIMATE', tx, 104, { size: 11, color: '#ffe14a', font: DFONT, w: 400, lw: 3 });
  const nm = C.ultName;
  const sz = Math.min(24, (W * 0.42) / (nm.length * 0.95));
  txt(nm, tx, 130, { size: sz, font: DFONT, w: 400, grad: ['#ffffff', '#fff2b0', '#ffd23b'], lw: 6 });
  ctx.restore();
}

function drawResult() {
  const g = G, R = g.result, T = g.phaseT;
  if (!R) return;
  const a = Math.min(1, T / 15);
  ctx.save();
  ctx.globalAlpha = a;
  txt('STAGE CLEAR!', W / 2, 58, { size: 30, align: 'center', font: DFONT, w: 400, grad: ['#ffffff', '#fff27a', '#ff6fa8'], lw: 6 });
  if (T > 40) {
    const x0 = W / 2 - 110, x1 = W / 2 + 110;
    ctx.fillStyle = 'rgba(25,8,40,.75)';
    rrect(x0 - 10, 72, 240, 84, 8);
    ctx.fill();
    const rows = [
      ['クリアタイム', `${Math.floor(R.secs / 60)}:${String(R.secs % 60).padStart(2, '0')}`],
      ['最大コンボ', `${g.maxCombo} HITS`],
      ['ライフボーナス', `+${R.life}`],
      ['タイムボーナス', `+${R.time}`],
    ];
    rows.forEach(([k, v], i) => {
      txt(k, x0, 84 + i * 15, { size: 10, color: '#ffd1e6', lw: 3 });
      txt(v, x1, 84 + i * 15, { size: 10, color: '#ffffff', align: 'right', lw: 3 });
    });
    txt('SCORE', x0, 146, { size: 11, color: '#ffe14a', font: DFONT, w: 400, lw: 3 });
    txt(String(g.score - R.total + R.shown).padStart(7, '0'), x1, 146, { size: 13, color: '#ffffff', align: 'right', font: DFONT, w: 400, lw: 4 });
  }
  if (T > 140 && Math.floor(T / 20) % 2 === 0) txt(g.si === STAGES.length - 1 ? 'タップでエンディングへ' : 'タップで次のステージへ', W / 2, 172, { size: 11, align: 'center', color: '#ffffff', lw: 3 });
  ctx.restore();
}

// ---------- タッチ操作の表示 ----------
function drawControls() {
  if (!Input.touchUsed && !('ontouchstart' in window)) return;
  const B = Input.buttons();
  const p = G.player;
  ctx.save();
  // スティック
  const s = Input.stick;
  const ox = s ? s.ox : 74 + safe.l, oy = s ? s.oy : H - 62;
  ctx.globalAlpha = s ? 0.55 : 0.25;
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(ox, oy, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const [vx, vy] = Input.stickVec;
  ctx.globalAlpha = s ? 0.8 : 0.35;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath(); ctx.arc(ox + vx * 26, oy + vy * 26, 14, 0, Math.PI * 2); ctx.fill();
  // ボタン
  const col = { a: '#ff4f8b', b: '#39a9ff', s: '#a070ff', u: '#ffcc33', pause: '#ffffff' };
  for (const k of ['a', 'b', 's', 'u', 'pause']) {
    const bt = B[k];
    const held = Input.held[k];
    let alpha = held ? 0.85 : 0.5;
    if (k === 'u') alpha = p && p.sp >= 300 ? (0.6 + 0.3 * Math.sin(G.frame * 0.2)) : 0.18;
    if (k === 'pause') alpha = 0.6;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = Fig.rgba(col[k], k === 'pause' ? 0.15 : 0.45);
    ctx.strokeStyle = col[k];
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bt.x, bt.y + (held ? 1 : 0), bt.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const lbl = { a: 'こうげき', b: 'ジャンプ', s: 'ひっさつ', u: '超必殺', pause: '' }[k];
    txt(bt.label, bt.x, bt.y - (lbl ? 3 : 0), { size: k === 'a' ? 15 : 11, align: 'center', color: '#ffffff', font: DFONT, w: 400, lw: 3 });
    if (lbl) txt(lbl, bt.x, bt.y + bt.r * 0.45, { size: 6, align: 'center', color: '#ffffff', lw: 2 });
  }
  ctx.restore();
}

function drawPortraitWarning() {
  ctx.fillStyle = 'rgba(20,6,30,.92)';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2 - 30);
  ctx.rotate(Math.sin(performance.now() / 500) * 0.4 - 0.4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  rrect(-14, -24, 28, 48, 5);
  ctx.stroke();
  ctx.restore();
  txt('スマホを横向きにしてね', W / 2, H / 2 + 30, { size: 16, align: 'center', color: '#ffffff' });
  txt('このゲームは横画面で遊ぶよ', W / 2, H / 2 + 52, { size: 10, align: 'center', color: '#ffd1e6' });
}
