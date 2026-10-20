'use strict';

// ---------- ゲームデータ ----------
// フレーム数はすべて 60fps 基準。
// 技の当たり判定 hit は「向いている方向を + とした x の範囲」「足もとからの高さ y の範囲」「奥行き z の幅」。

// 技を作るヘルパー（よく使う既定値を埋める）
function MV(o) {
  const m = Object.assign({ st: 4, ac: 3, rc: 10 }, o);
  if (m.hit) m.hit = Object.assign({ x0: 4, x1: 30, y0: 30, y1: 60, z: 12, dmg: 4, kb: 'light', stun: 16, push: 1.2, stop: 4 }, m.hit);
  return m;
}
const LAUNCH = { kb: 'launch', lv: 4.2, lh: 2.4, stop: 7 };

const CHARS = [
  {
    id: 'hikari', name: 'ヒカリ', en: 'HIKARI', role: '王道センター',
    desc: 'なんでもこなすバランス型。\nセンターの輝きで道を切りひらく！',
    stats: { power: 3, speed: 3, jump: 3, reach: 3 },
    hp: 100, walk: 1.6, run: 3.0, jumpV: 5.6, atk: 1.0, grabMul: 1,
    f0: 500, tts: { pitch: 1.6, rate: 1.12 },
    look: {
      skin: '#ffe3d3', hair: '#ff6fa8', hairStyle: 'twintail', eye: '#ff3d7f',
      top: '#ffffff', accent: '#ff3d7f', skirt: '#ff4f8b', hem: '#ffffff',
      legs: '#ffe3d3', shin: '#ffffff', boots: '#ff4f8b', sleeve: '#ff4f8b',
      chest: 'star', acc: ['ribbon', 'star'], prop: null,
    },
    color: '#ff4f8b',
    chain: ['j1', 'j2', 'j3', 'j4'], jump: 'jatk', dash: 'datk', spA: 'spA', spB: 'spB', spC: 'spC', ult: 'starburst',
    moves: {
      j1: MV({ pose: 'jab', st: 4, ac: 3, rc: 9, hit: { x1: 30, dmg: 4 } }),
      j2: MV({ pose: 'cross', st: 4, ac: 3, rc: 10, hit: { x1: 32, dmg: 4 } }),
      j3: MV({ pose: 'kick', st: 6, ac: 4, rc: 12, hit: { x1: 36, y0: 22, y1: 50, dmg: 6, stun: 18 }, grunt: 'ha' }),
      j4: MV({ pose: 'upper', st: 7, ac: 5, rc: 18, hit: Object.assign({ x1: 30, y0: 28, y1: 74, dmg: 9 }, LAUNCH, { lv: 5, lh: 1.6 }), grunt: 'ei', sfx: 'hitH' }),
      jatk: MV({ pose: 'jkick', st: 3, ac: 16, rc: 0, air: true, hit: Object.assign({ x1: 30, y0: -12, y1: 30, dmg: 8 }, LAUNCH, { lv: 3, lh: 2.6 }), grunt: 'tou' }),
      datk: MV({ pose: 'dash', st: 3, ac: 14, rc: 14, vx: 4.2, decay: 0.92, hit: Object.assign({ x1: 28, y0: 18, y1: 60, dmg: 10 }, LAUNCH, { lh: 3.6 }), grunt: 'ya' }),
      spA: MV({ name: 'スピニング・スター', pose: 'spin', spin: 2, st: 5, ac: 26, rc: 12, invuln: true, multi: 9,
        hit: Object.assign({ x0: -32, x1: 34, y0: 8, y1: 64, dmg: 8, juggle: true, sfx: 'hitS' }, LAUNCH, { lv: 3.8, lh: 2.4 }), say: 'sp1', fx: 'stars' }),
      spB: MV({ name: 'シャイニング・ラッシュ', poseAlt: ['jab', 'cross'], st: 6, ac: 30, rc: 2, vx: 2.0, multi: 5, invuln: [0, 8],
        hit: { x1: 34, dmg: 3, stun: 22, push: 0.4, stop: 2, sfx: 'hitS' }, then: 'spBfin', say: 'sp2', fx: 'stars' }),
      spBfin: MV({ pose: 'upper', st: 3, ac: 6, rc: 18, hit: Object.assign({ x1: 34, y0: 20, y1: 80, dmg: 10, juggle: true, sfx: 'hitH' }, LAUNCH, { lv: 5.5, lh: 2 }), grunt: 'yaa' }),
      spC: MV({ name: 'メテオ・ヒール', pose: 'dive', st: 5, ac: 60, rc: 0, air: true, dive: { vx: 3.4, vy: -6.8 }, invuln: true,
        hit: Object.assign({ x0: -6, x1: 24, y0: -14, y1: 26, dmg: 12, juggle: true, sfx: 'hitS' }, LAUNCH),
        land: { r: 40, dmg: 8, lv: 4, lh: 2.4 }, say: 'sp3', fx: 'stars' }),
    },
    lines: {
      select: 'センターは、わたしにまかせて！', start: 'いっくよー！', sp1: 'スピニング・スター！', sp2: 'シャイニング・ラッシュ！',
      sp3: 'メテオ・ヒール！', ult: 'センター・オブ・ザ・ワールド！', ko: 'ごめん…みんな…', revive: 'まだまだ、これからだよ！',
      clear: 'やったね！ みんな、ありがとう！', boss: 'あなたの目、覚まさせてあげる！', ending: 'わたしたちのステージは、まだまだ続くよ！',
    },
    ultName: 'センター・オブ・ザ・ワールド',
  },
  {
    id: 'sora', name: 'ソラ', en: 'SORA', role: 'クールなダンサー',
    desc: '手数の多い蹴り技とスピードが武器。\n風のように駆け抜ける！',
    stats: { power: 2, speed: 5, jump: 4, reach: 3 },
    hp: 90, walk: 1.9, run: 3.4, jumpV: 5.8, atk: 0.9, grabMul: 0.9,
    f0: 440, tts: { pitch: 1.3, rate: 1.18 },
    look: {
      skin: '#fde2cf', hair: '#3d5bd9', hairStyle: 'bob', eye: '#2fb6ff',
      top: '#1d2a5e', accent: '#39d3ff', skirt: '#2a3f8f', hem: '#39d3ff',
      legs: '#1a1f3a', boots: '#ffffff', sleeve: '#ffffff', hat: '#39d3ff',
      chest: 'gem', acc: ['headphones'], prop: null,
    },
    color: '#39a9ff',
    chain: ['j1', 'j2', 'j3', 'j4', 'j5'], jump: 'jatk', dash: 'datk', spA: 'spA', spB: 'spB', spC: 'spC', ult: 'hurricane',
    moves: {
      j1: MV({ pose: 'jab', st: 3, ac: 3, rc: 8, hit: { x1: 30, dmg: 3 } }),
      j2: MV({ pose: 'cross', st: 3, ac: 3, rc: 8, hit: { x1: 30, dmg: 3 } }),
      j3: MV({ pose: 'lowkick', st: 4, ac: 3, rc: 9, hit: { x1: 34, y0: 8, y1: 34, dmg: 4 } }),
      j4: MV({ pose: 'kick', st: 4, ac: 3, rc: 10, hit: { x1: 38, y0: 24, y1: 54, dmg: 5 }, grunt: 'ha' }),
      j5: MV({ pose: 'spin', spin: 1, st: 5, ac: 6, rc: 16, hit: Object.assign({ x1: 40, y0: 20, y1: 60, dmg: 8, sfx: 'hitH' }, LAUNCH, { lh: 3 }), grunt: 'sei' }),
      jatk: MV({ pose: 'jkick', st: 2, ac: 16, rc: 0, air: true, hit: Object.assign({ x1: 32, y0: -12, y1: 30, dmg: 7 }, LAUNCH, { lv: 3, lh: 2.8 }), grunt: 'ha' }),
      datk: MV({ pose: 'slide', st: 3, ac: 18, rc: 12, vx: 4.8, decay: 0.93, hit: Object.assign({ x1: 34, y0: 0, y1: 26, dmg: 9 }, LAUNCH, { lv: 4.6, lh: 1 }), grunt: 'ya' }),
      spA: MV({ name: 'サイクロン・ターン', pose: 'spin', spin: 3, st: 4, ac: 40, rc: 10, vx: 1.3, multi: 6, invuln: true,
        hit: Object.assign({ x0: -30, x1: 36, y0: 8, y1: 66, dmg: 5, juggle: true, sfx: 'hitS', stop: 3 }, LAUNCH, { lv: 3.2, lh: 1.2 }), say: 'sp1', fx: 'wind' }),
      spB: MV({ name: 'ソニック・ステップ', pose: 'dash', st: 3, ac: 14, rc: 12, vx: 7.5, decay: 0.98, invuln: true,
        hit: Object.assign({ x0: -10, x1: 30, y0: 6, y1: 66, z: 16, dmg: 12, juggle: true, sfx: 'hitS' }, LAUNCH, { lv: 4.5, lh: -1.5 }), say: 'sp2', fx: 'after' }),
      spC: MV({ name: 'エアリアル・スピン', pose: 'spin', spin: 3, st: 3, ac: 34, rc: 0, air: true, hover: 0.15, multi: 6, invuln: true,
        hit: Object.assign({ x0: -30, x1: 34, y0: -26, y1: 50, dmg: 6, juggle: true, sfx: 'hitS', stop: 3 }, LAUNCH, { lv: 3.5, lh: 1.5 }), say: 'sp3', fx: 'wind' }),
    },
    lines: {
      select: 'クールに、きめるよ。', start: 'ついてこれる？', sp1: 'サイクロン・ターン！', sp2: 'ソニック・ステップ！',
      sp3: 'エアリアル・スピン！', ult: 'ブルー・ハリケーン！', ko: 'くっ…ここまで、か…', revive: 'まだ、踊れる。',
      clear: 'ふふ、完璧。', boss: '本気、見せてあげる。', ending: '次のステージも、いっしょに踊ろう。',
    },
    ultName: 'ブルー・ハリケーン',
  },
  {
    id: 'mirai', name: 'ミライ', en: 'MIRAI', role: 'パワフル元気っ娘',
    desc: '一撃が重いパワー型。投げ技も強力！\n元気いっぱい、ぶっとばす！',
    stats: { power: 5, speed: 2, jump: 2, reach: 3 },
    hp: 120, walk: 1.4, run: 2.7, jumpV: 5.2, atk: 1.25, grabMul: 1.7,
    f0: 470, tts: { pitch: 1.55, rate: 1.2 },
    look: {
      skin: '#f6d2b8', hair: '#ff8f2a', hairStyle: 'ponytail', eye: '#ff7a00',
      top: '#ffd23b', accent: '#ff6a00', skirt: '#ff8a1f', hem: '#ffd23b',
      legs: '#f6d2b8', boots: '#ff6a00', sleeve: '#ffd23b', glove: '#ff6a00',
      chest: 'star', acc: ['band'], prop: null,
    },
    color: '#ff9a1f',
    chain: ['j1', 'j2', 'j3'], jump: 'jatk', dash: 'datk', spA: 'spA', spB: 'spB', spC: 'spC', ult: 'explosion',
    moves: {
      j1: MV({ pose: 'hammer', st: 7, ac: 3, rc: 11, hit: { x1: 32, y0: 20, y1: 62, dmg: 7, stun: 20, stop: 6, sfx: 'hitH' }, grunt: 'un' }),
      j2: MV({ pose: 'hook', st: 6, ac: 3, rc: 12, hit: { x1: 34, dmg: 8, stun: 20, stop: 6, sfx: 'hitH' } }),
      j3: MV({ pose: 'upper', st: 9, ac: 5, rc: 20, hit: Object.assign({ x1: 34, y0: 22, y1: 78, dmg: 13, sfx: 'hitH' }, LAUNCH, { lv: 5.2, lh: 3, stop: 9 }), grunt: 'yaa' }),
      jatk: MV({ pose: 'jkick', st: 4, ac: 16, rc: 0, air: true, hit: Object.assign({ x1: 30, y0: -12, y1: 30, dmg: 11 }, LAUNCH, { lv: 3, lh: 3 }), grunt: 'tou' }),
      datk: MV({ pose: 'dash', st: 4, ac: 16, rc: 14, vx: 3.8, decay: 0.95, armor: true, hit: Object.assign({ x1: 30, y0: 10, y1: 66, dmg: 13, sfx: 'hitH' }, LAUNCH, { lh: 4 }), grunt: 'ya' }),
      spA: MV({ name: 'ダイナマイト・スラム', pose: 'pound', st: 12, ac: 6, rc: 18, invuln: true,
        area: { r: 56, dmg: 20, lv: 5.5, lh: 3, juggle: true }, say: 'sp1', fx: 'quake' }),
      spB: MV({ name: 'バーニング・タックル', pose: 'dash', st: 8, ac: 34, rc: 16, vx: 4.4, armor: true, invuln: [0, 10], multi: 7,
        hit: Object.assign({ x0: -4, x1: 30, y0: 6, y1: 70, z: 14, dmg: 6, juggle: true, sfx: 'hitH' }, LAUNCH, { lv: 3, lh: 4.4 }), say: 'sp2', fx: 'fire' }),
      spC: MV({ name: 'ギガ・プレス', pose: 'press', st: 8, ac: 80, rc: 0, air: true, dive: { vx: 0.6, vy: -8.5 }, invuln: true,
        hit: Object.assign({ x0: -20, x1: 24, y0: -16, y1: 20, dmg: 10, juggle: true, sfx: 'hitH' }, LAUNCH),
        land: { r: 58, dmg: 16, lv: 5, lh: 3 }, say: 'sp3', fx: 'quake' }),
    },
    lines: {
      select: 'パワーなら、負けないよっ！', start: 'よーし、やるぞー！', sp1: 'ダイナマイト・スラム！', sp2: 'バーニング・タックル！',
      sp3: 'ギガ・プレス！', ult: 'ミラクル・ダイナマイトー！', ko: 'うぅ…おなか、すいた…', revive: '元気チャージ、完了！',
      clear: 'いえーい！ 大勝利！', boss: 'どーんと、ぶつかっちゃうよ！', ending: 'ライブのあとは、みんなでごはんだー！',
    },
    ultName: 'ミラクル・ダイナマイト',
  },
  {
    id: 'luna', name: 'ルナ', en: 'LUNA', role: 'ミステリアス歌姫',
    desc: 'マイクスタンドのリーチと歌声の飛び道具。\n離れた敵も逃さない。',
    stats: { power: 3, speed: 2, jump: 3, reach: 5 },
    hp: 95, walk: 1.5, run: 2.9, jumpV: 5.5, atk: 1.0, grabMul: 1,
    f0: 410, tts: { pitch: 1.2, rate: 1.0 },
    look: {
      skin: '#fbe6dc', hair: '#7b4bd6', hairStyle: 'hime', eye: '#b07bff',
      top: '#2b1a40', accent: '#b07bff', skirt: '#3a2163', hem: '#d9c3ff',
      legs: '#2b1a40', boots: '#5b3a9a', sleeve: '#2b1a40', glove: '#f4ecff',
      chest: 'bow', acc: ['moon'], prop: 'micstand', propC: '#d9d9e8',
    },
    color: '#a070ff',
    chain: ['j1', 'j2', 'j3', 'j4'], jump: 'jatk', dash: 'datk', spA: 'spA', spB: 'spB', spC: 'spC', ult: 'aria',
    moves: {
      j1: MV({ pose: 'poke', st: 5, ac: 3, rc: 10, hit: { x1: 52, y0: 30, y1: 56, dmg: 4 } }),
      j2: MV({ pose: 'poke', st: 5, ac: 3, rc: 10, hit: { x1: 52, y0: 30, y1: 56, dmg: 4 } }),
      j3: MV({ pose: 'swing', st: 7, ac: 4, rc: 12, hit: { x1: 48, y0: 10, y1: 70, dmg: 6, stun: 20 }, grunt: 'ha' }),
      j4: MV({ pose: 'spin', spin: 1, st: 6, ac: 8, rc: 18, hit: Object.assign({ x0: -40, x1: 46, y0: 14, y1: 64, dmg: 8, sfx: 'hitH' }, LAUNCH), grunt: 'ei' }),
      jatk: MV({ pose: 'swing', st: 4, ac: 14, rc: 0, air: true, hit: Object.assign({ x1: 46, y0: -24, y1: 40, dmg: 8 }, LAUNCH, { lv: 3, lh: 2.4 }), grunt: 'ha' }),
      datk: MV({ pose: 'poke', st: 4, ac: 14, rc: 14, vx: 3.6, decay: 0.92, hit: Object.assign({ x1: 58, y0: 24, y1: 58, dmg: 9 }, LAUNCH, { lh: 3 }), grunt: 'ya' }),
      spA: MV({ name: 'ムーンライト・ノート', pose: 'sing', st: 10, ac: 4, rc: 16, proj: { kind: 'bignote', at: 10 }, say: 'sp1', fx: 'notes' }),
      spB: MV({ name: 'クレセント・ウェーブ', pose: 'swing', st: 9, ac: 4, rc: 18, proj: { kind: 'crescent', at: 9 }, invuln: [0, 12], say: 'sp2', fx: 'notes' }),
      spC: MV({ name: 'スターダスト・レイン', pose: 'sing', st: 4, ac: 26, rc: 0, air: true, hover: 0.08, proj: { kind: 'rain', at: 6, every: 5, count: 5 }, invuln: true, say: 'sp3', fx: 'notes' }),
    },
    lines: {
      select: '月の歌を、聴かせてあげる。', start: '幕が、上がるわ。', sp1: 'ムーンライト・ノート。', sp2: 'クレセント・ウェーブ！',
      sp3: 'スターダスト・レイン。', ult: '響け、ルナティック・アリア！', ko: '歌が…とぎれる…', revive: '第二楽章を、はじめましょう。',
      clear: '素敵なアンコールだったわ。', boss: 'あなたの心、取り戻してあげる。', ending: '世界中に、この歌を届けたい。',
    },
    ultName: 'ルナティック・アリア',
  },
  {
    id: 'hana', name: 'ハナ', en: 'HANA', role: 'ちびっこ元気印',
    desc: '小さな体で二段ジャンプ！\n連打の速さはピカイチ。',
    stats: { power: 2, speed: 4, jump: 5, reach: 2 },
    hp: 85, walk: 1.8, run: 3.2, jumpV: 5.9, atk: 0.9, grabMul: 0.9, doubleJump: true,
    f0: 610, tts: { pitch: 1.95, rate: 1.2 },
    look: {
      skin: '#ffe6d6', hair: '#4fcf6a', hairStyle: 'buns', eye: '#21a957',
      top: '#ffffff', accent: '#3fbf5f', skirt: '#7ce38c', hem: '#ffffff',
      legs: '#ffe6d6', shin: '#ffffff', boots: '#ff9ec0', sleeve: '#7ce38c',
      chest: 'heart', acc: ['flower'], prop: null, size: 0.88,
    },
    color: '#4fcf6a',
    chain: ['j1', 'j2', 'j3', 'j4', 'j5'], jump: 'jatk', dash: 'datk', spA: 'spA', spB: 'spB', spC: 'spC', ult: 'blossom',
    moves: {
      j1: MV({ pose: 'slap', st: 3, ac: 2, rc: 7, hit: { x1: 26, y0: 24, y1: 56, dmg: 2.5, stun: 14 } }),
      j2: MV({ pose: 'slap', st: 3, ac: 2, rc: 7, hit: { x1: 26, y0: 24, y1: 56, dmg: 2.5, stun: 14 } }),
      j3: MV({ pose: 'slap', st: 3, ac: 2, rc: 7, hit: { x1: 26, y0: 24, y1: 56, dmg: 2.5, stun: 16 } }),
      j4: MV({ pose: 'headbutt', st: 5, ac: 3, rc: 10, hit: { x1: 28, y0: 24, y1: 56, dmg: 5, stun: 18 }, grunt: 'ei' }),
      j5: MV({ pose: 'kick', st: 5, ac: 4, rc: 15, hit: Object.assign({ x1: 34, y0: 14, y1: 50, dmg: 7, sfx: 'hitH' }, LAUNCH, { lh: 3 }), grunt: 'ya' }),
      jatk: MV({ pose: 'jkick', st: 2, ac: 16, rc: 0, air: true, hit: Object.assign({ x1: 28, y0: -12, y1: 28, dmg: 6 }, LAUNCH, { lv: 3, lh: 2.4 }), grunt: 'ha' }),
      datk: MV({ pose: 'ball', roll: 0.5, st: 3, ac: 20, rc: 10, vx: 4.2, decay: 0.95, multi: 10,
        hit: Object.assign({ x0: -6, x1: 22, y0: 0, y1: 40, dmg: 5, juggle: true }, LAUNCH, { lv: 3, lh: 2.4 }), grunt: 'ya' }),
      spA: MV({ name: 'フラワー・シャワー', pose: 'cheer', st: 6, ac: 32, rc: 12, invuln: true, multi: 8,
        area: { r: 50, dmg: 6, lv: 3.5, lh: 1.5, juggle: true, every: 8 }, say: 'sp1', fx: 'petals' }),
      spB: MV({ name: 'ハナ・ローリング', pose: 'ball', roll: 0.6, st: 4, ac: 40, rc: 12, vx: 5, multi: 6, invuln: true,
        hit: Object.assign({ x0: -10, x1: 24, y0: 0, y1: 44, z: 16, dmg: 5, juggle: true, sfx: 'hitS' }, LAUNCH, { lv: 3.6, lh: 2 }), say: 'sp2', fx: 'petals' }),
      spC: MV({ name: 'ひらひらダイブ', pose: 'ball', roll: 0.7, st: 4, ac: 60, rc: 0, air: true, dive: { vx: 3.8, vy: -5.5 }, multi: 6, invuln: true,
        hit: Object.assign({ x0: -14, x1: 22, y0: -20, y1: 30, dmg: 6, juggle: true, sfx: 'hitS' }, LAUNCH, { lv: 3.5, lh: 2 }),
        land: { r: 38, dmg: 8, lv: 4, lh: 2 }, say: 'sp3', fx: 'petals' }),
    },
    lines: {
      select: 'ハナも、がんばるー！', start: 'しゅっぱーつ！', sp1: 'フラワー・シャワー！', sp2: 'ハナ・ローリング！',
      sp3: 'ひらひらダイブ！', ult: '満開、ブロッサムー！', ko: 'ふぇぇ…', revive: 'ハナ、ふっかーつ！',
      clear: 'わーい！ みんな、だいすきー！', boss: 'まけないもんっ！', ending: 'またみんなで、歌おうね！',
    },
    ultName: '満開ブロッサム',
  },
];

// つかみ・投げ（全員共通、ダメージは grabMul 倍）
const GRAB_MOVES = {
  knee: MV({ pose: 'knee', st: 4, ac: 2, rc: 10 }),
  throwF: MV({ pose: 'throwP', st: 10, ac: 2, rc: 16 }),
};

// ---------- 雑魚敵 ----------
const ENEMY_TYPES = {
  dancer: {
    hp: 28, spd: 1.25, score: 100, range: 26, size: 1,
    moves: {
      atk: MV({ pose: 'jab', st: 13, ac: 3, rc: 18, hit: { x1: 28, dmg: 6, stun: 18 } }),
      atk2: MV({ pose: 'kick', st: 15, ac: 4, rc: 22, hit: Object.assign({ x1: 34, y0: 20, y1: 54, dmg: 7 }, LAUNCH, { lv: 3, lh: 2 }) }),
    },
  },
  cheer: {
    hp: 24, spd: 1.5, score: 150, range: 26, size: 0.96,
    moves: {
      atk: MV({ pose: 'kick', st: 12, ac: 4, rc: 18, hit: { x1: 32, y0: 20, y1: 54, dmg: 6, stun: 18 } }),
      leap: MV({ pose: 'jkick', st: 14, ac: 50, rc: 6, air: true, leap: { vx: 3.0, vy: 4.6 }, hit: Object.assign({ x1: 28, y0: -10, y1: 34, dmg: 8 }, LAUNCH, { lv: 3, lh: 2.4 }) }),
    },
  },
  heavy: {
    hp: 64, spd: 0.9, score: 300, range: 30, size: 1.22, poise: 14,
    moves: {
      atk: MV({ pose: 'hammer', st: 20, ac: 4, rc: 24, hit: Object.assign({ x1: 36, y0: 10, y1: 70, dmg: 12, sfx: 'hitH' }, LAUNCH, { lv: 3.5, lh: 3 }) }),
      charge: MV({ pose: 'dash', st: 30, ac: 46, rc: 22, vx: 3.8, armor: true, warn: true, hit: Object.assign({ x1: 30, y0: 6, y1: 70, dmg: 12, sfx: 'hitH' }, LAUNCH, { lh: 3.6 }) }),
    },
  },
  thrower: {
    hp: 22, spd: 1.1, score: 150, range: 26, size: 0.96,
    moves: {
      atk: MV({ pose: 'slap', st: 12, ac: 3, rc: 16, hit: { x1: 26, dmg: 5, stun: 16 } }),
      toss: MV({ pose: 'swing', st: 18, ac: 3, rc: 20, proj: { kind: 'penlight', at: 18 } }),
    },
  },
  slider: {
    hp: 26, spd: 1.6, score: 150, range: 26, size: 1,
    moves: {
      atk: MV({ pose: 'cross', st: 11, ac: 3, rc: 16, hit: { x1: 28, dmg: 6, stun: 18 } }),
      slide: MV({ pose: 'slide', st: 16, ac: 24, rc: 18, vx: 4.6, decay: 0.97, warn: true, hit: Object.assign({ x1: 30, y0: 0, y1: 22, dmg: 8 }, LAUNCH, { lv: 3.6, lh: 1.6 }) }),
    },
  },
};

// 敵の見た目（タイプごとの土台 + ステージごとの衣装）
const BASE_LOOK = {
  dancer: { hairStyle: 'ponytail', chest: 'bow' },
  cheer: { hairStyle: 'twintail', chest: 'star', prop: 'pompom', prop2: 'pompom' },
  heavy: { hairStyle: 'short', pants: true, chest: 'none', size: 1.22 },
  thrower: { hairStyle: 'sidetail', chest: 'heart', prop: 'penlight', prop2: 'penlight' },
  slider: { hairStyle: 'bob', chest: 'gem' },
};
const STAGE_SKINS = [
  { // ソウル：黒白にネオン
    pal: { skin: '#fbe3d2', top: '#16141f', accent: '#b6ff3b', skirt: '#ffffff', hem: '#b6ff3b', legs: '#fbe3d2', boots: '#16141f', sleeve: '#16141f' },
    hairs: ['#221c2c', '#f2d27a', '#d8d8ea', '#ff7ab8'],
    types: {
      dancer: { acc: ['cap'], hat: '#b6ff3b' },
      cheer: { top: '#ffffff', skirt: '#16141f', accent: '#ff4fa3', prop: 'penlight', prop2: 'penlight', propC: '#b6ff3b' },
      heavy: { jacket: '#2c2a3a', top: '#b6ff3b', legs: '#2c2a3a', acc: ['sunglasses'] },
      thrower: { propC: '#b6ff3b', acc: ['headphones'], hat: '#ff4fa3' },
      slider: { top: '#ff4fa3', skirt: '#16141f', legs: '#16141f', acc: ['band'] },
    },
    names: ['ジウ', 'スア', 'ダヒ', 'イェリン', 'チェヨン', 'ナリ', 'ソユン', 'ミンジ'],
    group: '練習生',
  },
  { // ニューヨーク：赤白青のチア
    pal: { skin: '#f3d0b5', top: '#ffffff', accent: '#1d4ed8', skirt: '#d72638', hem: '#ffffff', legs: '#f3d0b5', boots: '#ffffff', sleeve: '#d72638' },
    hairs: ['#f2cf6e', '#8a5a3c', '#c8463a', '#3a2a24'],
    types: {
      dancer: { top: '#d72638', skirt: '#1d4ed8', acc: ['band'] },
      cheer: { propC: '#ffd43b', acc: ['ribbon'] },
      heavy: { jacket: '#1d4ed8', top: '#ffffff', legs: '#1b1f3a', acc: ['cap'], hat: '#d72638' },
      thrower: { prop: 'mic', prop2: null, acc: ['star'] },
      slider: { top: '#1d4ed8', skirt: '#ffffff', hem: '#d72638', acc: ['band'] },
    },
    names: ['ケイシー', 'マディソン', 'ブルック', 'タイラー', 'サマンサ', 'ジョーダン', 'アビー', 'ペイジ'],
    group: 'チアスクワッド',
  },
  { // ロンドン：パンクなロックガール
    pal: { skin: '#fbe0d4', top: '#ffffff', accent: '#2b59c3', skirt: '#b3263a', hem: '#1b1b1b', legs: '#2a2230', boots: '#1b1b1b', sleeve: '#1b1b1b', jacket: '#1b1b1b' },
    hairs: ['#e23d5b', '#3dbbe2', '#1b1b1b', '#f2e27a'],
    types: {
      dancer: { hairStyle: 'spiky', chest: 'tie' },
      cheer: { acc: ['tophat'], hat: '#1b1b1b', prop: null, prop2: null },
      heavy: { acc: ['sunglasses'], legs: '#1b1b1b', top: '#b3263a' },
      thrower: { prop: 'mic', prop2: null, chest: 'tie' },
      slider: { hairStyle: 'spiky', acc: ['band'] },
    },
    names: ['エミリー', 'シャーロット', 'ポピー', 'ルビー', 'イモジェン', 'ハリエット', 'ジョージア', 'フレイヤ'],
    group: 'ロックガール',
  },
  { // リオ：カーニバルのサンバ隊
    pal: { skin: '#d9a07a', top: '#ffd23b', accent: '#ff4fa3', skirt: '#2ecc71', hem: '#ffd23b', legs: '#d9a07a', boots: '#ffd23b', sleeve: '#ffd23b', feather: '#ff4fa3' },
    hairs: ['#4a2616', '#2a1810', '#8a4a20', '#d9a24a'],
    types: {
      dancer: { hairStyle: 'wavy', acc: ['feathers'] },
      cheer: { hairStyle: 'wavy', prop: 'maracas', prop2: 'maracas', propC: '#3fd36b', acc: ['flower'] },
      heavy: { top: '#2ecc71', legs: '#1b5e3a', acc: ['band'] },
      thrower: { prop: 'maracas', prop2: 'maracas', propC: '#ff4fa3', acc: ['flower'] },
      slider: { top: '#ff4fa3', skirt: '#ffd23b', acc: ['feathers'] },
    },
    names: ['カミラ', 'イザベラ', 'ベアトリス', 'マリアナ', 'ジュリア', 'ラリッサ', 'ガブリエラ', 'レチシア'],
    group: 'サンバ隊',
  },
  { // パリ：ランウェイのモデル
    pal: { skin: '#fbe6dc', top: '#f5e6ff', accent: '#d4af37', skirt: '#1f1f2e', hem: '#d4af37', legs: '#fbe6dc', shin: '#1f1f2e', boots: '#1f1f2e', sleeve: '#f5e6ff' },
    hairs: ['#3a2a24', '#f2e2b8', '#8a3a2a', '#1b1b1b'],
    types: {
      dancer: { acc: ['beret'], hat: '#e0457b' },
      cheer: { hairStyle: 'buns', skirt: '#ffc2dc', top: '#ffffff', prop: null, prop2: null, acc: ['tiara'] },
      heavy: { jacket: '#1f1f2e', top: '#f5e6ff', legs: '#1f1f2e', acc: ['sunglasses'] },
      thrower: { prop: 'parasol', prop2: null, propC: '#ff9ac6', acc: ['ribbon'] },
      slider: { hairStyle: 'long', acc: ['beret'], hat: '#1f1f2e' },
    },
    names: ['クロエ', 'マノン', 'レア', 'カミーユ', 'ジャンヌ', 'エロイーズ', 'ルイーズ', 'アデル'],
    group: 'モデル',
  },
  { // 東京：オーロラ親衛隊（白と金）
    pal: { skin: '#fbe3d2', top: '#ffffff', accent: '#d4af37', skirt: '#2b2b6b', hem: '#d4af37', legs: '#2b2b6b', boots: '#ffffff', sleeve: '#ffffff', cape: null },
    hairs: ['#e8f0ff', '#221c2c', '#c7a2ff', '#f2d27a'],
    types: {
      dancer: { acc: ['tiara'] },
      cheer: { prop: 'penlight', prop2: 'penlight', propC: '#c7a2ff', acc: ['tiara'] },
      heavy: { jacket: '#2b2b6b', acc: ['sunglasses'], legs: '#2b2b6b' },
      thrower: { propC: '#ffd43b', acc: ['tiara'] },
      slider: { hairStyle: 'long', acc: ['tiara'] },
    },
    names: ['親衛隊 アヤ', '親衛隊 マキ', '親衛隊 リオ', '親衛隊 ユメ', '親衛隊 カナ', '親衛隊 ミオ', '親衛隊 サキ', '親衛隊 ノア'],
    group: 'オーロラ親衛隊',
  },
];

// ---------- ボス ----------
// 各技に使える距離 range、奥行きの許容 zTol、選ばれやすさ w、使えるフェーズ ph を持たせる
const BOSSES = {
  sera: {
    name: 'ハン・セラ', title: 'K-POP ダンスクイーン', from: 'SEOUL',
    hp: 360, spd: 2.0, poise: 34, f0: 380, tts: { pitch: 1.25, rate: 1.15 },
    look: {
      skin: '#fbe3d2', hair: '#1d1a2a', hairStyle: 'ponytail', eye: '#9b5cff', evil: true,
      top: '#16141f', jacket: '#ffffff', accent: '#b6ff3b', pants: true, legs: '#2c2a3a',
      boots: '#ffffff', sleeve: '#ffffff', acc: ['cap'], hat: '#ffffff', chest: 'gem', size: 1.12,
    },
    moves: {
      kick1: MV({ pose: 'kick', st: 10, ac: 3, rc: 6, hit: { x1: 36, y0: 22, y1: 56, dmg: 6, stun: 20 }, then: 'kick2', range: [0, 38], w: 3 }),
      kick2: MV({ pose: 'lowkick', st: 5, ac: 3, rc: 6, hit: { x1: 36, y0: 4, y1: 34, dmg: 6, stun: 20 }, then: 'kick3' }),
      kick3: MV({ pose: 'spin', spin: 1, st: 6, ac: 5, rc: 26, hit: Object.assign({ x1: 40, y0: 18, y1: 62, dmg: 9, sfx: 'hitH' }, LAUNCH, { lh: 3 }) }),
      dashKick: MV({ pose: 'jkick', st: 24, ac: 26, rc: 26, vx: 5.6, warn: true, hit: Object.assign({ x1: 34, y0: 16, y1: 64, dmg: 12, sfx: 'hitH' }, LAUNCH, { lh: 3.4 }), range: [70, 260], zTol: 8, w: 2, grunt: 'ha' }),
      flip: MV({ pose: 'ball', roll: -0.35, st: 2, ac: 30, rc: 8, air: true, leap: { vx: -3.8, vy: 4.4 }, invuln: true, evade: true }),
      storm: MV({ pose: 'spin', spin: 3, st: 18, ac: 72, rc: 28, chase: 1.9, multi: 9, armor: true, warn: true,
        hit: { x0: -32, x1: 36, y0: 8, y1: 64, dmg: 5, stun: 22, push: 0.6, sfx: 'hitS' }, range: [0, 140], ph: 2, w: 2, grunt: 'yaa' }),
    },
    lines: {
      intro: 'あなたたちが噂の、日本のアイドル？ わたしのダンスに、ついてこれるかしら！',
      phase: '本気で踊るわよ！', defeat: 'すごい…あなたのステージ、本物ね。',
    },
  },
  roxy: {
    name: 'ロキシー', title: 'ブロードウェイの歌姫', from: 'NEW YORK',
    hp: 430, spd: 1.6, poise: 40, f0: 400, tts: { pitch: 1.35, rate: 1.15 },
    look: {
      skin: '#f3d0b5', hair: '#ffd56a', hairStyle: 'wavy', eye: '#3fa9ff', evil: true,
      top: '#ff2e63', accent: '#ffd700', skirt: '#ff2e63', hem: '#ffd700', legs: '#f3d0b5',
      boots: '#ffd700', sleeve: '#ff2e63', glove: '#ffffff', acc: ['star'], chest: 'star',
      prop: 'micstand', propC: '#ffd700', size: 1.15,
    },
    moves: {
      swing: MV({ pose: 'swing', st: 16, ac: 5, rc: 24, hit: Object.assign({ x1: 58, y0: 10, y1: 70, dmg: 12, sfx: 'hitH' }, LAUNCH, { lh: 3 }), range: [0, 56], w: 3, grunt: 'ha' }),
      charge: MV({ pose: 'dash', st: 28, ac: 42, rc: 26, vx: 5.0, armor: true, warn: true, hit: Object.assign({ x1: 32, y0: 6, y1: 72, dmg: 13, sfx: 'hitH' }, LAUNCH, { lh: 4 }), range: [90, 400], zTol: 8, w: 2 }),
      shout: MV({ pose: 'sing', st: 22, ac: 6, rc: 30, proj: { kind: 'shockwave', at: 22, lanes: [0] }, range: [60, 400], w: 2, grunt: 'yeah' }),
      shout3: MV({ pose: 'sing', st: 20, ac: 6, rc: 28, proj: { kind: 'shockwave', at: 20, lanes: [-26, 0, 26] }, range: [60, 400], ph: 2, w: 2, grunt: 'yeah' }),
      call: MV({ pose: 'cheer', st: 30, ac: 2, rc: 30, summon: { type: 'cheer', n: 2 }, ph: 2, once: true, w: 9 }),
      flip: MV({ pose: 'ball', roll: -0.35, st: 2, ac: 30, rc: 8, air: true, leap: { vx: -3.5, vy: 4.2 }, invuln: true, evade: true }),
    },
    lines: {
      intro: 'ハーイ！ ニューヨークのステージは、甘くないわよ！',
      phase: 'みんな、ロキシーを応援して！', defeat: 'オーマイ…こんなに熱いショーは、ひさしぶり！',
    },
  },
  victoria: {
    name: 'ヴィクトリア', title: 'ロンドン・ロックの女王', from: 'LONDON',
    hp: 500, spd: 1.35, poise: 50, f0: 330, tts: { pitch: 1.0, rate: 1.1 },
    look: {
      skin: '#fbe0d4', hair: '#e23d5b', hairStyle: 'sidetail', eye: '#2bc3a5', evil: true,
      top: '#ffffff', jacket: '#1b1b1b', accent: '#2b59c3', skirt: '#b3263a', hem: '#1b1b1b',
      legs: '#2a2230', boots: '#1b1b1b', sleeve: '#1b1b1b', chest: 'tie', acc: ['tophat'], hat: '#1b1b1b',
      prop: 'guitar', propC: '#2b59c3', size: 1.2,
    },
    moves: {
      smash: MV({ pose: 'hammer', st: 22, ac: 5, rc: 28, warn: true, hit: Object.assign({ x1: 52, y0: 0, y1: 76, dmg: 16, sfx: 'hitH' }, LAUNCH, { lv: 5, lh: 3 }),
        area: { r: 40, dmg: 6, lv: 3, lh: 2, off: 34, at: 0 }, range: [0, 54], w: 3, grunt: 'un' }),
      amp: MV({ pose: 'point', st: 18, ac: 4, rc: 26, proj: { kind: 'ampnote', at: 18, spread: [-0.7, 0, 0.7] }, range: [70, 400], w: 2 }),
      amp5: MV({ pose: 'point', st: 16, ac: 4, rc: 24, proj: { kind: 'ampnote', at: 16, spread: [-1.2, -0.6, 0, 0.6, 1.2] }, range: [50, 400], ph: 2, w: 3 }),
      dive: MV({ pose: 'jump', st: 14, ac: 70, rc: 26, air: true, homing: true, warn: true, invuln: [14, 60],
        land: { r: 54, dmg: 15, lv: 5, lh: 3 }, range: [40, 300], w: 2, grunt: 'yaa' }),
      flip: MV({ pose: 'ball', roll: -0.35, st: 2, ac: 30, rc: 8, air: true, leap: { vx: -3.4, vy: 4.0 }, invuln: true, evade: true }),
    },
    lines: {
      intro: 'ロックを知らない子猫ちゃんは、おうちに帰りな！',
      phase: 'ボリューム、最大だ！', defeat: 'へっ…あんたのビート、悪くないね。',
    },
  },
  lucia: {
    name: 'ルシア', title: 'カーニバルの太陽', from: 'RIO',
    hp: 540, spd: 1.8, poise: 50, f0: 400, tts: { pitch: 1.3, rate: 1.18 },
    look: {
      skin: '#c98a62', hair: '#3a1c10', hairStyle: 'wavy', eye: '#ffb000', evil: true,
      top: '#ffd23b', accent: '#ff4fa3', skirt: '#2ecc71', hem: '#ffd23b', legs: '#c98a62',
      boots: '#ffd23b', sleeve: '#ffd23b', feather: '#ff4fa3', acc: ['feathers'], chest: 'gem',
      prop: 'fan', prop2: 'fan', size: 1.16,
    },
    moves: {
      whirl: MV({ pose: 'spin', spin: 3, st: 16, ac: 64, rc: 26, chase: 2.2, multi: 8, armor: true, warn: true,
        hit: { x0: -32, x1: 36, y0: 8, y1: 64, dmg: 5, stun: 22, push: 0.6, sfx: 'hitS' }, then: 'whirlEnd', range: [0, 150], w: 3, grunt: 'yaa' }),
      whirlEnd: MV({ pose: 'cheer', st: 2, ac: 4, rc: 22, area: { r: 44, dmg: 6, lv: 4, lh: 3 } }),
      fan: MV({ pose: 'swing', st: 16, ac: 4, rc: 26, proj: { kind: 'boomerang', at: 16 }, range: [60, 400], w: 2 }),
      stomp: MV({ pose: 'jump', st: 10, ac: 50, rc: 22, air: true, leap: { vx: 1.5, vy: 5.2 }, land: { r: 64, dmg: 12, lv: 4.5, lh: 3 }, range: [0, 100], w: 2, grunt: 'ha' }),
      call: MV({ pose: 'cheer', st: 30, ac: 2, rc: 30, summon: { type: 'dancer', n: 2 }, ph: 2, once: true, w: 9 }),
      flip: MV({ pose: 'ball', roll: -0.35, st: 2, ac: 30, rc: 8, air: true, leap: { vx: -3.8, vy: 4.4 }, invuln: true, evade: true }),
    },
    lines: {
      intro: 'カーニバルへようこそ！ いっしょに、踊り狂いましょう！',
      phase: 'サンバのリズムは、止まらないわ！', defeat: 'あら…なんだか、心が軽くなったわ。',
    },
  },
  etoile: {
    name: 'エトワール', title: 'パリコレの女神', from: 'PARIS',
    hp: 580, spd: 1.7, poise: 52, f0: 420, tts: { pitch: 1.4, rate: 1.0 },
    look: {
      skin: '#fbe6dc', hair: '#f5e2b8', hairStyle: 'long', eye: '#4fb0ff', evil: true,
      top: '#fff0f6', accent: '#d4af37', skirt: '#ffc2dc', hem: '#ffffff', legs: '#ffffff',
      boots: '#ffffff', sleeve: '#fff0f6', glove: '#ffffff', acc: ['beret'], hat: '#e0457b', chest: 'bow',
      prop: 'parasol', propC: '#ff9ac6', size: 1.16, skirtL: 3, skirtW: 2,
    },
    moves: {
      thrust: MV({ pose: 'poke', st: 12, ac: 4, rc: 20, hit: Object.assign({ x1: 60, y0: 20, y1: 60, dmg: 11, sfx: 'hitH' }, LAUNCH, { lh: 3 }), range: [0, 58], w: 3 }),
      roses: MV({ pose: 'swing', st: 16, ac: 4, rc: 24, proj: { kind: 'rose', at: 16, spread: [-0.7, 0, 0.7] }, range: [60, 400], w: 2 }),
      float: MV({ pose: 'jumpDown', st: 10, ac: 120, rc: 24, air: true, float: true, invuln: [10, 70], warn: true,
        hit: Object.assign({ x0: -16, x1: 24, y0: -14, y1: 30, dmg: 14, sfx: 'hitH' }, LAUNCH), land: { r: 44, dmg: 8, lv: 4, lh: 2 }, range: [40, 400], w: 2 }),
      warp: MV({ pose: 'taunt', st: 26, ac: 2, rc: 6, warp: true, then: 'thrust', range: [80, 400], ph: 2, w: 2 }),
      flip: MV({ pose: 'ball', roll: -0.35, st: 2, ac: 30, rc: 8, air: true, leap: { vx: -3.6, vy: 4.2 }, invuln: true, evade: true }),
    },
    lines: {
      intro: 'ボンジュール。美しくないものに、ランウェイに立つ資格はないの。',
      phase: 'これが、パリのエレガンスよ！', defeat: 'メルシー…あなたこそ、美しいわ。',
    },
  },
  aurora: {
    name: 'オーロラ', title: '伝説のアイドル', from: 'TOKYO',
    hp: 1000, spd: 1.5, poise: 80, f0: 340, tts: { pitch: 1.05, rate: 0.95 },
    look: {
      skin: '#fdeee6', hair: '#e8f4ff', hairStyle: 'big', eye: '#ffd700', evil: true,
      top: '#1a0f3d', accent: '#ffd700', skirt: '#2a1a6e', hem: '#ffd700', legs: '#1a0f3d',
      boots: '#ffd700', sleeve: '#1a0f3d', glove: '#ffffff', cape: '#7a1fd6', acc: ['crown'], chest: 'gem',
      prop: 'mic', propC: '#ffd700', size: 1.5, skirtL: 4, skirtW: 3,
    },
    moves: {
      sweep: MV({ pose: 'swing', st: 18, ac: 6, rc: 24, hit: Object.assign({ x0: -10, x1: 66, y0: 0, y1: 90, dmg: 14, sfx: 'hitH' }, LAUNCH, { lv: 4.5, lh: 3.5 }), range: [0, 64], w: 3, grunt: 'ha' }),
      beam: MV({ pose: 'point', st: 36, ac: 34, rc: 26, beam: true, warn: true, multi: 6,
        hit: { x0: 10, x1: 520, y0: 10, y1: 80, z: 10, dmg: 5, stun: 22, push: 1, stop: 2, sfx: 'hitS' }, range: [60, 500], zTol: 6, w: 2 }),
      spots: MV({ pose: 'sing', st: 20, ac: 4, rc: 28, hazard: { kind: 'spot', n: 4 }, range: [0, 500], w: 2, grunt: 'ufu' }),
      call: MV({ pose: 'cheer', st: 30, ac: 2, rc: 30, summon: { type: 'mix', n: 3 }, once: true, w: 9, minHp: 0.85 }),
      call2: MV({ pose: 'cheer', st: 30, ac: 2, rc: 30, summon: { type: 'mix', n: 3 }, once: true, ph: 2, w: 9 }),
      laser: MV({ pose: 'cheer', st: 24, ac: 4, rc: 30, hazard: { kind: 'laser', n: 1 }, ph: 2, range: [0, 500], w: 3 }),
      warp: MV({ pose: 'taunt', st: 24, ac: 2, rc: 4, warp: true, then: 'sweep', range: [90, 500], ph: 2, w: 2 }),
      flip: MV({ pose: 'jump', st: 2, ac: 30, rc: 8, air: true, leap: { vx: -3.2, vy: 4.0 }, invuln: true, evade: true }),
    },
    lines: {
      intro: 'ようこそ、世界の頂点へ。あなたたちの「好き」も、わたしのものにしてあげる。',
      phase: 'まだ終わらない…これが、伝説のアイドルのステージよ！',
      defeat: '…ありがとう。歌うことが、こんなに楽しいって…忘れてた。',
    },
  },
};

// ---------- ステージ ----------
const STAGES = [
  {
    id: 'seoul', name: 'SEOUL', jp: 'ソウル・ネオンストリート', song: 'seoul', bossSong: 'boss', boss: 'sera',
    len: 2500, waves: [3, 4, 4, 5], pool: { dancer: 5, slider: 2, thrower: 1 }, heavyFrom: 3, seed: 101,
    food: ['トッポッキ', 'キンパ'], tokens: 1, maxOn: 3,
  },
  {
    id: 'ny', name: 'NEW YORK', jp: 'ニューヨーク・ブロードウェイ', song: 'ny', bossSong: 'boss', boss: 'roxy',
    len: 2800, waves: [4, 4, 5, 5, 6], pool: { dancer: 3, cheer: 4, thrower: 2 }, heavyFrom: 2, seed: 202,
    food: ['ホットドッグ', 'ベーグル'], tokens: 2, maxOn: 4,
  },
  {
    id: 'london', name: 'LONDON', jp: 'ロンドン・レイニーナイト', song: 'london', bossSong: 'boss', boss: 'victoria',
    len: 3000, waves: [4, 5, 5, 6, 6], pool: { dancer: 3, heavy: 2, thrower: 2, slider: 2 }, heavyFrom: 0, seed: 303,
    food: ['スコーン', 'フィッシュ&チップス'], tokens: 2, maxOn: 4,
  },
  {
    id: 'rio', name: 'RIO', jp: 'リオ・カーニバル', song: 'rio', bossSong: 'boss', boss: 'lucia',
    len: 3200, waves: [5, 5, 6, 6, 7], pool: { dancer: 3, cheer: 3, slider: 3, heavy: 2, thrower: 1 }, heavyFrom: 0, seed: 404,
    food: ['シュラスコ', 'アサイーボウル'], tokens: 2, maxOn: 5,
  },
  {
    id: 'paris', name: 'PARIS', jp: 'パリ・ランウェイ', song: 'paris', bossSong: 'boss', boss: 'etoile',
    len: 3300, waves: [5, 6, 6, 7, 7], pool: { dancer: 3, cheer: 2, slider: 3, heavy: 2, thrower: 3 }, heavyFrom: 0, seed: 505,
    food: ['クロワッサン', 'マカロン'], tokens: 3, maxOn: 5,
  },
  {
    id: 'tokyo', name: 'TOKYO', jp: '東京ワールドアイドルドーム', song: 'tokyo', bossSong: 'final', boss: 'aurora',
    len: 3200, waves: [6, 6, 7, 7, 8], pool: { dancer: 3, cheer: 3, slider: 3, heavy: 2, thrower: 3 }, heavyFrom: 0, seed: 606,
    food: ['おにぎり', 'いちご大福'], tokens: 3, maxOn: 5, elite: 1.15,
  },
];

const STORY = [
  '世界中のアイドルが集う祭典「ワールド・アイドル・グランプリ」。',
  'しかし開幕の直前、伝説のアイドル〈オーロラ〉の"支配のライブ"によって、',
  '世界中のアイドルたちは心を奪われてしまった――。',
  'みんなの「好き」を取り戻すため、',
  '日本の新人ユニット「ステラ☆ライン」が、いまワールドツアーへ旅立つ！',
];
