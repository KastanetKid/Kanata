'use strict';

// ---------- 画面（タイトル・キャラ選択・ゲーム・エンディングなど）とメインループ ----------

function uiButton(b, focused) {
  const { x, y, w, h } = b;
  ctx.save();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (b.disabled) { g.addColorStop(0, 'rgba(60,40,70,.7)'); g.addColorStop(1, 'rgba(40,24,50,.7)'); }
  else if (focused) { g.addColorStop(0, '#ff9ac6'); g.addColorStop(1, '#ff4f8b'); }
  else { g.addColorStop(0, 'rgba(70,24,96,.92)'); g.addColorStop(1, 'rgba(40,12,60,.92)'); }
  ctx.fillStyle = g;
  rrect(x, y, w, h, Math.min(h / 2, 10));
  ctx.fill();
  ctx.strokeStyle = focused ? '#ffffff' : '#ff9ac6';
  ctx.lineWidth = focused ? 2.2 : 1.4;
  ctx.stroke();
  txt(b.label, x + w / 2, y + h / 2 + (b.sub ? -4 : 0.5), { size: b.size || 12, align: 'center', color: b.disabled ? '#9a8aa8' : '#ffffff', lw: 3 });
  if (b.sub) txt(b.sub, x + w / 2, y + h / 2 + 7, { size: 7, align: 'center', color: '#ffd1e6', lw: 2 });
  ctx.restore();
}
function hitBtn(btns, t) {
  return btns.find(b => !b.disabled && t.x >= b.x - 4 && t.x <= b.x + b.w + 4 && t.y >= b.y - 4 && t.y <= b.y + b.h + 4);
}

// メニュー共通：タップとキーボード（矢印・Enter・Esc）
function menuInput(scene, btns) {
  let act = null;
  for (const t of Input.taps) {
    const b = hitBtn(btns, t);
    if (b) { scene.focus = btns.indexOf(b); act = b; break; }
  }
  for (const k of Input.keyQueue) {
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'KeyS' || k === 'KeyD') { scene.focus = (scene.focus + 1) % btns.length; Sound.sfx('cursor'); }
    else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'KeyW' || k === 'KeyA') { scene.focus = (scene.focus - 1 + btns.length) % btns.length; Sound.sfx('cursor'); }
    else if (k === 'Enter' || k === 'Space' || k === 'KeyZ' || k === 'KeyJ') act = btns[scene.focus];
    else if (k === 'Escape' || k === 'KeyX') act = btns.find(b => b.back) || null;
  }
  while (btns[scene.focus] && btns[scene.focus].disabled) scene.focus = (scene.focus + 1) % btns.length;
  if (act && !act.disabled) {
    Sound.sfx(act.back ? 'cancel' : 'ok');
    act.act();
    return true;
  }
  return false;
}

// 共通の背景（ドームの観客席）
let menuBG = null;
function drawMenuBG(t) {
  if (!menuBG) menuBG = BG.make('tokyo', 4000, 9);
  menuBG.draw(ctx, t * 12, W, scale, t, Sound.beat(), null);
  menuBG.drawFx(ctx, t * 12, W, t, Sound.beat(), null);
  ctx.fillStyle = 'rgba(20,6,34,.35)';
  ctx.fillRect(0, 0, W, H);
}

function drawLogo(cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.rotate(-0.04);
  txt('ステラ☆ランブル', 0, 0, { size: 34, align: 'center', font: DFONT, w: 400, grad: ['#ffffff', '#ffd1e6', '#ff4f8b'], lw: 8, sc: '#2a1048' });
  txt('STELLA☆RUMBLE', 0, 26, { size: 12, align: 'center', font: DFONT, w: 400, color: '#ffe14a', lw: 4, sc: '#2a1048' });
  txt('〜 ワールドアイドル大乱闘 〜', 0, 42, { size: 9, align: 'center', color: '#ffffff', lw: 3, sc: '#2a1048' });
  ctx.restore();
}

const Scenes = {
  cur: null,
  set(s) {
    this.cur = s;
    Input.reset();
    Input.keyQueue.length = 0;
    Input.gameplay = !!s.gameplay;
    if (s.enter) s.enter();
  },
  pause() {
    const game = this.cur;
    Sound.suspend();
    Sound.stopSpeech();
    this.set(PauseScene(game));
  },
  nextStage() {
    const g = G;
    if (g.si >= STAGES.length - 1) {
      this.set(EndingScene(g));
      return;
    }
    this.set(GameScene(g.ci, g.si + 1, g.carry()));
  },
};

// ---------- タイトル ----------
function TitleScene() {
  return {
    t: 0, focus: 0, ready: false,
    enter() { if (Sound.ready) { this.ready = true; Sound.play('title'); } },
    btns() {
      const bw = 132, bh = 24, y0 = 126;
      const u = Save.d.unlocked;
      const list = [
        { label: 'はじめから', act: () => Scenes.set(SelectScene(0, true)) },
        { label: u > 0 ? `つづきから（STAGE ${u + 1}）` : 'つづきから', disabled: u === 0, act: () => Scenes.set(SelectScene(u, false)) },
        { label: 'あそびかた', act: () => Scenes.set(HowtoScene()) },
        { label: 'せってい', act: () => Scenes.set(OptionsScene(() => Scenes.set(TitleScene()))) },
      ];
      return list.map((b, i) => Object.assign(b, { x: W / 2 + (i % 2 ? 4 : -bw - 4), y: y0 + Math.floor(i / 2) * (bh + 6), w: bw, h: bh, size: 11 }));
    },
    update() {
      this.t++;
      if (!this.ready) {
        if (Input.taps.length || Input.keyQueue.length) {
          boot();
          this.ready = true;
          Sound.play('title');
          Sound.sfx('ok');
        }
        return;
      }
      if (Input.taps.some(t => t.x > W - 40 - safe.r && t.y < 34) && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
      }
      menuInput(this, this.btns());
    },
    draw() {
      const t = this.t / 60;
      drawMenuBG(t);
      // アイドルたちが拍に合わせて跳ねる
      const bt = Sound.beat();
      CHARS.forEach((C, i) => {
        const x = W / 2 + (i - 2) * Math.min(80, W / 6);
        const pose = Object.assign({}, (i + Math.floor(t * 2.6)) % 2 ? Fig.POSES.cheer : Fig.POSES.victory);
        pose.by = -Math.abs(Math.sin((bt + i * 0.25) * Math.PI)) * 4;
        ctx.fillStyle = 'rgba(10,0,20,.35)';
        ctx.beginPath(); ctx.ellipse(x, 262, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
        Fig.draw(ctx, C.look, pose, x, 262, i < 2 ? 1 : i > 2 ? -1 : 1, { t, scale: 0.95 });
      });
      drawLogo(W / 2, 60, Math.min(1.2, W / 400));
      if (!this.ready) {
        if (Math.floor(this.t / 30) % 2 === 0) txt('TAP TO START', W / 2, 140, { size: 16, align: 'center', font: DFONT, w: 400, color: '#ffffff', lw: 5 });
        txt('音が出ます。音量に気をつけてね', W / 2, 162, { size: 8, align: 'center', color: '#ffd1e6', lw: 3 });
        return;
      }
      const B = this.btns();
      B.forEach((b, i) => uiButton(b, i === this.focus));
      if (Save.d.best) txt(`BEST ${Save.d.best}`, 10 + safe.l, H - 10, { size: 8, color: '#ffe14a', lw: 3 });
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        txt('⛶', W - 22 - safe.r, 18, { size: 16, align: 'center', color: '#ffffff', lw: 3 });
      }
    },
  };
}

// ---------- キャラクター選択 ----------
function SelectScene(stage, fresh, onPick) {
  return {
    t: 0, sel: Save.d.lastChar || 0, focus: 0,
    enter() { if (Sound.current() !== 'title') Sound.play('title'); },
    cards() {
      const n = CHARS.length;
      const cw = Math.min(70, (W - 40 - safe.l - safe.r) / n - 6);
      const total = n * (cw + 6) - 6;
      const x0 = W / 2 - total / 2;
      return CHARS.map((C, i) => ({ x: x0 + i * (cw + 6), y: 30, w: cw, h: 56, i }));
    },
    choose(i) {
      if (i === this.sel && this.t > 10) return;
      this.sel = i;
      this.pickT = 0;
      const C = CHARS[i];
      Sound.sfx('cursor');
      Sound.say('hai', C.f0, { who: 'sel' });
      Sound.speak(C.lines.select, Object.assign({ prio: 2 }, C.tts));
    },
    confirm() {
      Save.d.lastChar = this.sel;
      Save.store();
      Sound.sfx('ok');
      if (onPick) { onPick(this.sel); return; }
      if (fresh && stage === 0) Scenes.set(StoryScene(this.sel));
      else Scenes.set(GameScene(this.sel, stage, null));
    },
    btns() {
      return [
        { label: 'もどる', back: true, x: 10 + safe.l, y: H - 30, w: 70, h: 22, size: 10, act: () => onPick ? onPick(null) : Scenes.set(TitleScene()) },
        { label: 'けってい！', x: W - 120 - safe.r, y: H - 34, w: 110, h: 26, size: 13, act: () => this.confirm() },
      ];
    },
    update() {
      this.t++;
      this.pickT = (this.pickT || 0) + 1;
      for (const t of Input.taps) {
        const c = this.cards().find(c => t.x >= c.x && t.x <= c.x + c.w && t.y >= c.y && t.y <= c.y + c.h);
        if (c) this.choose(c.i);
      }
      for (const k of Input.keyQueue) {
        if (k === 'ArrowLeft' || k === 'KeyA') this.choose((this.sel + CHARS.length - 1) % CHARS.length);
        if (k === 'ArrowRight' || k === 'KeyD') this.choose((this.sel + 1) % CHARS.length);
      }
      Input.keyQueue = Input.keyQueue.filter(k => !['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(k));
      this.focus = 1;
      menuInput(this, this.btns());
    },
    draw() {
      const t = this.t / 60;
      drawMenuBG(t);
      txt('アイドルをえらんでね', W / 2, 16, { size: 13, align: 'center', color: '#ffffff', lw: 4 });
      for (const c of this.cards()) {
        const C = CHARS[c.i], on = c.i === this.sel;
        ctx.save();
        ctx.fillStyle = on ? C.color : 'rgba(40,12,60,.85)';
        rrect(c.x, c.y - (on ? 3 : 0), c.w, c.h, 8);
        ctx.fill();
        ctx.strokeStyle = on ? '#ffffff' : Fig.rgba(C.color, 0.8);
        ctx.lineWidth = on ? 2.5 : 1.5;
        ctx.stroke();
        ctx.beginPath();
        rrect(c.x + 2, c.y + 2 - (on ? 3 : 0), c.w - 4, c.h - 16, 6);
        ctx.clip();
        Fig.bust(ctx, C.look, c.x + c.w / 2, c.y + 24 - (on ? 3 : 0), Math.min(1.5, c.w / 44), on ? 'happy' : 'normal', t);
        ctx.restore();
        txt(C.name, c.x + c.w / 2, c.y + c.h - 7 - (on ? 3 : 0), { size: 9, align: 'center', color: '#ffffff', lw: 3 });
      }
      // 大きく表示
      const C = CHARS[this.sel];
      const fx = W * 0.2 + safe.l * 0.5;
      const k = Math.min(1, this.pickT / 10);
      const pose = this.pickT < 40 ? Fig.lerp(Fig.POSES.crouch, Fig.POSES.victory, k) : Fig.idle(t);
      ctx.fillStyle = 'rgba(10,0,20,.4)';
      ctx.beginPath(); ctx.ellipse(fx, 236, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
      Fig.draw(ctx, C.look, pose, fx, 236, 1, { t, scale: 1.9 });
      // 情報
      const ix = W * 0.37, iw = W - ix - 10 - safe.r;
      ctx.fillStyle = 'rgba(25,8,40,.8)';
      rrect(ix, 96, iw, 138, 8);
      ctx.fill();
      ctx.strokeStyle = C.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      txt(C.en, ix + 10, 108, { size: 15, font: DFONT, w: 400, color: C.color, sc: '#ffffff', lw: 3 });
      txt(`${C.name}  ／  ${C.role}`, ix + 12 + txtW(C.en, 15, 400, DFONT) + 4, 109, { size: 9, color: '#ffffff', lw: 2.5 });
      C.desc.split('\n').forEach((l, i) => txt(l, ix + 10, 124 + i * 11, { size: 8, color: '#ffd1e6', lw: 2.5 }));
      const st = [['パワー', 'power'], ['スピード', 'speed'], ['ジャンプ', 'jump'], ['リーチ', 'reach']];
      st.forEach(([lb, key], i) => {
        const sx = ix + 10 + (i % 2) * (iw / 2 - 4), sy = 150 + Math.floor(i / 2) * 11;
        txt(lb, sx, sy, { size: 7, color: '#ffffff', lw: 2 });
        for (let j = 0; j < 5; j++) {
          ctx.fillStyle = j < C.stats[key] ? '#ffd23b' : 'rgba(255,255,255,.2)';
          Fig.starPath(ctx, sx + 40 + j * 9, sy, 3.6, 1.6, 5);
          ctx.fill();
        }
      });
      const mv = C.moves;
      const lines = [
        ['S', mv[C.spA].name], ['→+S', mv[C.spB].name], ['ジャンプ中S', mv[C.spC].name], ['★', C.ultName],
      ];
      lines.forEach(([k2, n], i) => {
        const y = 177 + i * 13;
        ctx.fillStyle = i === 3 ? '#ffcc33' : '#a070ff';
        rrect(ix + 10, y - 5, txtW(k2, 7) + 8, 10, 3);
        ctx.fill();
        txt(k2, ix + 14, y, { size: 7, color: '#ffffff', lw: 2 });
        txt(n, ix + 22 + txtW(k2, 7), y, { size: 9, color: '#ffffff', lw: 2.5 });
      });
      if (stage > 0 && !onPick) txt(`STAGE ${stage + 1} から`, W - 66 - safe.r, H - 44, { size: 8, align: 'center', color: '#ffe14a', lw: 2.5 });
      this.btns().forEach(b => uiButton(b, !b.back));
    },
  };
}

// ---------- ストーリー ----------
function StoryScene(ci) {
  return {
    t: 0,
    enter() { Sound.play('title'); },
    update() {
      this.t++;
      if (Input.taps.length || Input.keyQueue.some(k => ['Enter', 'Space', 'KeyZ', 'Escape'].includes(k))) {
        if (this.t < STORY.length * 70 + 40) this.t = STORY.length * 70 + 40;
        else Scenes.set(GameScene(ci, 0, null));
      }
    },
    draw() {
      const t = this.t / 60;
      drawMenuBG(t);
      ctx.fillStyle = 'rgba(10,0,20,.6)';
      ctx.fillRect(0, 0, W, H);
      STORY.forEach((l, i) => {
        const k = this.t - i * 70;
        if (k < 0) return;
        const n = Math.min(l.length, Math.floor(k / 2.2));
        txt(l.slice(0, n), W / 2, 56 + i * 26, { size: Math.min(11, (W - 40) / l.length * 1.05), align: 'center', color: i === STORY.length - 1 ? '#ffe14a' : '#ffffff', lw: 3 });
      });
      if (this.t > STORY.length * 70 + 40) {
        CHARS.forEach((C, i) => Fig.draw(ctx, C.look, Fig.POSES.wave, W / 2 + (i - 2) * 46, 250, 1, { t, scale: 0.9 }));
        if (Math.floor(this.t / 25) % 2 === 0) txt('タップでスタート', W / 2, 196, { size: 11, align: 'center', color: '#ffffff', lw: 3 });
      } else {
        txt('タップでスキップ', W - 12 - safe.r, H - 12, { size: 8, align: 'right', color: '#ffd1e6', lw: 2 });
      }
    },
  };
}

// ---------- あそびかた ----------
function HowtoScene() {
  return {
    t: 0, focus: 0,
    btns() { return [{ label: 'もどる', back: true, x: W / 2 - 50, y: H - 30, w: 100, h: 22, size: 10, act: () => Scenes.set(TitleScene()) }]; },
    update() { this.t++; menuInput(this, this.btns()); },
    draw() {
      drawMenuBG(this.t / 60);
      ctx.fillStyle = 'rgba(20,6,34,.82)';
      rrect(14 + safe.l, 10, W - 28 - safe.l - safe.r, H - 46, 10);
      ctx.fill();
      txt('あそびかた', W / 2, 24, { size: 14, align: 'center', color: '#ffe14a', lw: 4 });
      const rows = [
        ['左側をなぞる', '移動（同じ向きに倒し続けると ダッシュ）'],
        ['A', 'こうげき。連打でコンボ！ ダッシュ中は ダッシュ攻撃'],
        ['B', 'ジャンプ。ジャンプ中に A で 空中攻撃（ハナは二段ジャンプ）'],
        ['S', 'ひっさつ技。→+S、ジャンプ中S で技が変わる'],
        ['', '　SP(★)を 1 つ使う。足りないと HP を少し使う'],
        ['★', '超必殺技。SP が 3 つたまると使える（ボタンが光る）'],
        ['つかみ', '敵に向かって歩くと つかむ → A でひざ蹴り・投げ'],
        ['', '　（逆方向+A で後ろに投げる。投げた敵は他の敵に当たる）'],
        ['アイテム', '箱やスピーカーを壊すと、回復アイテムなどが出てくる'],
        ['PC', '矢印/WASD 移動・Z こうげき・X ジャンプ・C ひっさつ・V 超必殺・P ポーズ'],
      ];
      rows.forEach(([k, v], i) => {
        const y = 44 + i * 18;
        if (k) {
          ctx.fillStyle = k === '★' ? '#ffcc33' : k === 'A' ? '#ff4f8b' : k === 'B' ? '#39a9ff' : k === 'S' ? '#a070ff' : '#5a3a7a';
          rrect(28 + safe.l, y - 7, 64, 14, 5);
          ctx.fill();
          txt(k, 60 + safe.l, y, { size: 8, align: 'center', color: '#ffffff', lw: 2 });
        }
        txt(v, 100 + safe.l, y, { size: Math.min(9, (W - 130) / v.length * 1.1), color: '#ffffff', lw: 2.5 });
      });
      this.btns().forEach(b => uiButton(b, true));
    },
  };
}

// ---------- 設定 ----------
function OptionsScene(back) {
  const o = Save.d.opts;
  const pct = v => Math.round(v * 100) + '%';
  const step = v => (Math.round(v * 5) + 1) % 6 / 5;
  return {
    t: 0, focus: 0,
    btns() {
      const bw = 200, x = W / 2 - bw / 2, y0 = 44, bh = 24;
      const ttsInfo = !Sound.TTS.ok ? '（この端末は非対応）' : Sound.TTS.hasJa ? '' : '（日本語の音声なし）';
      const list = [
        { label: `BGM の音量：${pct(o.music)}`, act: () => { o.music = step(o.music); applyOptions(); } },
        { label: `効果音の音量：${pct(o.sfx)}`, act: () => { o.sfx = step(o.sfx); applyOptions(); Sound.sfx('hitH'); } },
        { label: `ボイスの音量：${pct(o.voice)}`, act: () => { o.voice = step(o.voice); applyOptions(); Sound.say('ya', 500); } },
        { label: `セリフ読み上げ：${o.tts ? 'ON' : 'OFF'}`, sub: ttsInfo || '端末の日本語音声でセリフを話します', act: () => { o.tts = !o.tts; applyOptions(); if (o.tts) Sound.speak('いっくよー！', CHARS[0].tts); } },
        { label: `難易度：${o.easy ? 'かんたん' : 'ふつう'}`, sub: o.easy ? '受けるダメージ・ボスの体力が少なめ' : '', act: () => { o.easy = !o.easy; } },
        { label: 'もどる', back: true, act: () => { Save.store(); back(); } },
      ];
      return list.map((b, i) => Object.assign(b, { x, y: y0 + i * (bh + 6), w: bw, h: bh, size: 11 }));
    },
    update() { this.t++; if (menuInput(this, this.btns())) Save.store(); },
    draw() {
      drawMenuBG(this.t / 60);
      ctx.fillStyle = 'rgba(20,6,34,.7)';
      ctx.fillRect(0, 0, W, H);
      txt('せってい', W / 2, 24, { size: 14, align: 'center', color: '#ffe14a', lw: 4 });
      this.btns().forEach((b, i) => uiButton(b, i === this.focus));
    },
  };
}

// ---------- ポーズ ----------
function PauseScene(game) {
  return {
    t: 0, focus: 0,
    btns() {
      const bw = 170, x = W / 2 - bw / 2;
      return [
        { label: 'つづける', back: true, act: () => { Sound.resume(); Scenes.set(game); } },
        { label: 'せってい', act: () => Scenes.set(OptionsScene(() => Scenes.set(this))) },
        { label: 'タイトルへもどる', act: () => { Sound.resume(); Sound.stop(0.3); Scenes.set(TitleScene()); } },
      ].map((b, i) => Object.assign(b, { x, y: 104 + i * 32, w: bw, h: 26 }));
    },
    update() { this.t++; if (Input.keyQueue.includes('KeyP')) Input.keyQueue.push('Escape'); menuInput(this, this.btns()); },
    draw() {
      game.draw(true);
      ctx.fillStyle = 'rgba(15,4,26,.7)';
      ctx.fillRect(0, 0, W, H);
      txt('PAUSE', W / 2, 74, { size: 26, align: 'center', font: DFONT, w: 400, color: '#ffffff', lw: 5 });
      this.btns().forEach((b, i) => uiButton(b, i === this.focus));
    },
  };
}

// ---------- ゲーム本編 ----------
function GameScene(ci, si, carry) {
  const sc = {
    gameplay: true, g: null, focus: 0,
    enter() {
      if (!this.g) this.g = newStage(ci, si, carry);
      G = this.g;
      Input.gameplay = true;
    },
    overBtns() {
      const bw = 160, x = W / 2 - bw / 2;
      return [
        { label: 'コンティニュー！', act: () => { this.g.continueGame(); } },
        { label: 'アイドルを変える', act: () => Scenes.set(SelectScene(si, false, (pick) => { if (pick != null) { this.g.swapPlayer(pick); this.g.continueGame(); } Scenes.set(this); })) },
        { label: 'あきらめる', back: true, act: () => { Sound.stop(0.3); Scenes.set(TitleScene()); } },
      ].map((b, i) => Object.assign(b, { x, y: 140 + i * 30, w: bw, h: 24 }));
    },
    update() {
      const g = this.g;
      G = g;
      if (portrait) return;
      if (g.phase === 'over') {
        g.phaseT++;
        FX.update();
        if (g.phaseT > 40) {
          if (--g.contT <= 0) { Sound.stop(0.3); Scenes.set(TitleScene()); return; }
          if (g.contT % 60 === 0) Sound.sfx('tick');
          if (Bot.on) { g.continueGame(); return; }
          Input.gameplay = false;
          if (menuInput(this, this.overBtns())) Input.gameplay = true;
        }
        Input.taps.length = 0;
        return;
      }
      Input.gameplay = true;
      g.update();
    },
    draw(paused) {
      const g = this.g;
      G = g;
      drawWorld();
      if (g.phase === 'intro') drawStageCard();
      if (g.phase === 'bossIntro' && g.boss) drawBossCard();
      if (g.cutin) drawCutin();
      drawHUD();
      if (g.phase === 'clear') {
        ctx.fillStyle = 'rgba(15,4,26,.35)';
        ctx.fillRect(0, 0, W, H);
        drawResult();
      }
      if (g.phase === 'over') {
        ctx.fillStyle = `rgba(15,4,26,${Math.min(0.8, g.phaseT / 40)})`;
        ctx.fillRect(0, 0, W, H);
        if (g.phaseT > 40) {
          txt('CONTINUE?', W / 2, 70, { size: 28, align: 'center', font: DFONT, w: 400, color: '#ffffff', lw: 5 });
          txt(String(Math.ceil(g.contT / 60) - 1 < 0 ? 0 : Math.ceil(g.contT / 60) - 1), W / 2, 110, { size: 34, align: 'center', font: DFONT, w: 400, grad: ['#ffffff', '#ffe14a', '#ff6fa8'], lw: 6 });
          this.overBtns().forEach((b, i) => uiButton(b, i === this.focus));
        }
      } else if (!paused && ['play', 'boss', 'respawn', 'intro', 'bossIntro'].includes(g.phase)) {
        drawControls();
      }
      if (!Input.touchUsed && !('ontouchstart' in window) && g.phase === 'intro') {
        txt('矢印/WASD 移動・Z こうげき・X ジャンプ・C ひっさつ・V 超必殺・P ポーズ', W / 2, H - 10, { size: 8, align: 'center', color: '#ffffff', lw: 3 });
      }
    },
  };
  return sc;
}

// ---------- エンディング ----------
function EndingScene(g) {
  const C = CHARS[g.ci];
  const bosses = Object.values(BOSSES);
  const secs = Math.round(g.totalTime / 60);
  const credits = [
    'THANK YOU FOR PLAYING!',
    '',
    '世界中のアイドルたちは「好き」を取り戻し、',
    'ワールド・アイドル・グランプリは 最高のフィナーレを迎えた。',
    '',
    `プレイタイム  ${Math.floor(secs / 60)}分${String(secs % 60).padStart(2, '0')}秒`,
    `スコア  ${g.score}`,
    `最大コンボ  ${g.maxCombo} HITS`,
    `コンティニュー  ${g.continues} 回`,
    '',
    'STELLA☆LINE',
    CHARS.map(c => c.name).join('・'),
    '',
    'WORLD IDOLS',
    bosses.map(b => b.name).join('・'),
    '',
    'ステラ☆ランブル 〜ワールドアイドル大乱闘〜',
    'おしまい',
  ];
  return {
    t: 0,
    enter() {
      Sound.play('ending');
      Save.d.clears = (Save.d.clears || 0) + 1;
      Save.d.best = Math.max(Save.d.best, g.score);
      Save.store();
    },
    update() {
      this.t++;
      if (this.t === 90) Sound.speak(C.lines.ending, Object.assign({ prio: 3 }, C.tts));
      if (this.t === 400) Sound.speak(BOSSES.aurora.lines.defeat.replace('…ありがとう。', 'みんな、ありがとう。'), Object.assign({ prio: 2 }, BOSSES.aurora.tts, { pitch: 1.2 }));
      if (this.t > 360 && (Input.taps.length || Input.keyQueue.length)) { Sound.stop(0.6); Scenes.set(TitleScene()); }
    },
    draw() {
      const t = this.t / 60;
      drawMenuBG(t);
      // 全員集合
      const all = bosses.map(b => b.look).concat(CHARS.map(c => c.look));
      const n = all.length;
      const sp = Math.min(46, (W - 40) / n);
      all.forEach((L, i) => {
        const x = W / 2 + (i - (n - 1) / 2) * sp;
        const look = Object.assign({}, L, { evil: false });
        const pose = Object.assign({}, (i + Math.floor(t * 2)) % 2 ? Fig.POSES.cheer : Fig.POSES.wave, { by: -Math.abs(Math.sin((Sound.beat() + i * 0.3) * Math.PI)) * 3 });
        pose.face = 'happy';
        Fig.draw(ctx, look, pose, x, 262, x < W / 2 ? 1 : -1, { t, scale: 0.75 / (look.size || 1) * (L === C.look ? 1.25 : 1) });
      });
      if (this.t % 6 === 0) FX.add({ k: 'star', x: rnd(0, W), y: -5, vx: rnd(-0.5, 0.5), vy: rnd(1, 2), life: 140, col: pick(['#ffe14a', '#ff6fa8', '#39d3ff', '#ffffff']), s: rnd(2, 4), rot: 0 });
      FX.update();
      FX.draw(0);
      // クレジット
      const y0 = 30 + Math.max(0, 200 - this.t * 0.6);
      ctx.fillStyle = 'rgba(15,4,26,.55)';
      ctx.fillRect(W / 2 - 170, 8, 340, 172);
      credits.forEach((l, i) => {
        const y = y0 + i * 12 - Math.max(0, this.t - 420) * 0.25;
        if (y < 12 || y > 176) return;
        txt(l, W / 2, y, { size: i === 0 ? 14 : 9, align: 'center', color: i === 0 ? '#ffe14a' : '#ffffff', font: i === 0 ? DFONT : FONT, w: i === 0 ? 400 : 800, lw: 3 });
      });
      if (this.t > 360 && Math.floor(this.t / 30) % 2 === 0) txt('タップでタイトルへ', W - 12 - safe.r, H - 10, { size: 8, align: 'right', color: '#ffffff', lw: 2 });
    },
  };
}

// ---------- 自動操作（動作確認用：?bot） ----------
const Bot = {
  on: params.has('bot'),
  t: 0,
  drive(pressed) {
    const g = G, p = g.player;
    this.t++;
    Input.mx = 0;
    Input.mz = 0;
    if (!p || p.state === 'dead') return;
    const foes = g.enemies.filter(e => !['dead', 'down', 'fall', 'thrown', 'getup'].includes(e.state));
    if (g.boss && !['down', 'fall', 'getup', 'freed', 'enter'].includes(g.boss.state) && g.phase === 'boss') foes.push(g.boss);
    // 危険地帯はジャンプで避ける
    for (const h of g.hazards) {
      if (h.kind === 'laser' && h.t - h.warn > -4 && Math.abs(p.z - h.z) < 14 && p.state !== 'jump') pressed.b++;
      if (h.kind === 'spot' && h.t > h.warn - 30 && Math.hypot(p.x - h.x, (p.z - h.z) * 2.2) < 34) { Input.mz = p.z > h.z ? 1 : -1; Input.mx = p.x > h.x ? 1 : -1; return; }
    }
    if (p.sp >= 300 && foes.length >= (g.boss ? 1 : 3)) pressed.u++;
    if (p.state === 'grab') { pressed.a++; return; }
    const item = g.items.find(it => it.x > g.camX + 16 && it.x < g.camX + W - 16);
    if (!foes.length) {
      if (item && Math.abs(item.x - p.x) < 220) { Input.mx = Math.sign(item.x - p.x); Input.mz = clamp((item.z - p.z) / 10, -1, 1); }
      else Input.mx = 1;
      return;
    }
    let tg = foes[0], bd = 1e9;
    for (const e of foes) { const d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z) * 2; if (d < bd) { bd = d; tg = e; } }
    const dx = tg.x - p.x, dz = tg.z - p.z;
    const side = dx > 0 ? -1 : 1;
    const want = tg.x + side * (g.chr.id === 'luna' ? 40 : 24);
    if (Math.abs(dz) > 3) Input.mz = clamp(dz / 8, -1, 1);
    if (Math.abs(want - p.x) > 6) Input.mx = clamp((want - p.x) / 14, -1, 1) * 0.6;
    const facing = dx > 0 ? 1 : -1;
    if (p.facing !== facing && Math.abs(Input.mx) < 0.25) Input.mx = facing * 0.3;
    if (Math.abs(dz) < 7 && Math.abs(dx) < (g.chr.id === 'luna' ? 56 : 36) && p.facing === facing && this.t % 5 === 0) pressed.a++;
    const near = foes.filter(e => Math.abs(e.x - p.x) < 70 && Math.abs(e.z - p.z) < 20).length;
    if (p.sp >= 100 && near >= 3 && this.t % 30 === 0) pressed.s++;
  },
};

// ---------- メインループ ----------
const FAST = Math.max(1, +(params.get('fast') || 1));
function step() {
  Input.poll();
  Scenes.cur.update();
  Input.taps.length = 0;
  Input.keyQueue.length = 0;
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0610';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  try {
    Scenes.cur.draw();
    if (portrait) drawPortraitWarning();
  } catch (e) {
    if (!render.warned) { render.warned = true; console.error(e); }
  } finally {
    ctx.restore();
  }
}
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  let n = 0;
  if (window.__hold) acc = 0;
  while (acc >= 1 / 60 && n < 5) {
    for (let i = 0; i < FAST; i++) step();
    acc -= 1 / 60;
    n++;
  }
  if (n === 5) acc = 0;
  render();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    Sound.stopSpeech();
    if (Scenes.cur && Scenes.cur.gameplay && G && ['play', 'boss', 'intro', 'bossIntro', 'respawn'].includes(G.phase)) Scenes.pause();
    else Sound.suspend();
  } else if (!(Scenes.cur && Scenes.cur.btns && Scenes.cur.btns().some(b => b.label === 'つづける'))) {
    Sound.resume();
  }
});

// フォントの読み込みを待ってから背景を作り直す（タイルに古いフォントが焼き付かないように）
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('400 20px "Dela Gothic One"'), document.fonts.load('800 12px "M PLUS Rounded 1c"')])
    .then(() => { menuBG = null; if (G) G.bg = BG.make(G.S.id, G.S.len, G.S.seed); }).catch(() => {});
}

// URL パラメータ（動作確認用）：?stage=3&char=2 で直接そのステージから
(function start() {
  const st = params.get('stage'), ch = params.get('char');
  if (st != null) {
    const ci = Math.max(0, CHARS.findIndex(c => c.id === ch));
    Scenes.set(GameScene(ci, clamp(+st - 1, 0, STAGES.length - 1), null));
  } else if (params.has('ending')) {
    newStage(0, 5, { score: 123456, totalTime: 60 * 60 * 27 });
    Scenes.set(EndingScene(G));
  } else {
    Scenes.set(TitleScene());
  }
  requestAnimationFrame(frame);
})();

window.__stella = {
  get G() { return G; }, Scenes, Bot, step, render,
  simulate(n) { for (let i = 0; i < n; i++) step(); },
};
