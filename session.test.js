import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, classifyGesture, checkCardText, formatOkDate, formatNextDue } from './session.js';
import { buildQueue } from './srs.js';

const DAY = 86400000, now = Date.UTC(2026, 10, 21);
const mk = (id, fb = null, bf = null) => ({ id, groupId: 'g', front: id, back: id.toUpperCase(), createdAt: 0, fb, bf });
const fixed = cards => cards.flatMap(card => [{ card, course: 'fb' }]); // 順番を固定したキュー

test('判定で次へ進み、そのコースだけ更新される', () => {
  const s = createSession(fixed([mk('a')]));
  const saved = s.judge(true, now);
  assert.deepEqual(saved.fb, { step: 1, last: now });
  assert.equal(saved.bf, null);
  assert.equal(s.current(), null);
});

test('両方モード: 同じカードの2コース目は1コース目の結果を消さない', () => {
  const card = mk('a');
  const s = createSession([{ card, course: 'fb' }, { card, course: 'bf' }]);
  s.judge(true, now);
  const saved = s.judge(true, now + 1);
  assert.equal(saved.fb.last, now);
  assert.equal(saved.bf.last, now + 1);
  assert.deepEqual(saved.okAt, { fb: now, bf: now + 1 });
});

test('できた: そのコースの「できた日」を記録する(もう一方は変えない)', () => {
  const saved = createSession(fixed([mk('a')])).judge(true, now);
  assert.equal(saved.okAt.fb, now);
  assert.ok(!saved.okAt.bf);
});

test('できなかった: 学習記録と「できた日」を消す(もう一方のコースは残す)', () => {
  const card = { ...mk('a', { step: 2, last: now - DAY }, { step: 2, last: now - DAY }), okAt: { fb: now - DAY, bf: now - DAY } };
  const saved = createSession(fixed([card])).judge(false, now);
  assert.equal(saved.fb, null);
  assert.equal(saved.okAt.fb, null);
  assert.equal(saved.bf.step, 2);
  assert.equal(saved.okAt.bf, now - DAY);
});

const order = s => { const out = []; for (let e = s.current(); e; e = s.current()) { out.push(e.card.id); s.judge(true, now); } return out; };
const five = () => fixed(['a', 'b', 'c', 'd', 'e'].map(id => mk(id)));

test('できなかったカードは、残りの中のランダムな位置にもう一度入る(すぐ次〜最後)', () => {
  const s0 = createSession(five(), () => 0);
  s0.judge(false, now);
  assert.deepEqual(order(s0), ['a', 'b', 'c', 'd', 'e']); // 乱数0 → すぐ次
  const s1 = createSession(five(), () => 0.999);
  s1.judge(false, now);
  assert.deepEqual(order(s1), ['b', 'c', 'd', 'e', 'a']); // 乱数ほぼ1 → 最後
});

test('できなかったカードが入る位置は、残りの全位置でほぼ同じ確率', () => {
  const count = [0, 0, 0, 0, 0];
  for (let i = 0; i < 5000; i++) {
    const s = createSession(five());
    s.judge(false, now);
    count[order(s).indexOf('a')]++;
  }
  for (const c of count) assert.ok(c > 800 && c < 1200, JSON.stringify(count));
});

test('戻すと、できなかった判定も、もう一度出す予定も取り消される', () => {
  const s = createSession(five(), () => 0.5);
  s.judge(false, now);
  assert.equal(s.total(), 6);
  const restored = s.undo();
  assert.equal(s.total(), 5);
  assert.equal(restored.id, 'a');
  assert.equal(s.current().card.id, 'a');
  assert.equal(s.canUndo(), false);
  assert.equal(s.undo(), null);
});

test('戻すと、できた日と段階も元に戻る', () => {
  const card = { ...mk('a', { step: 2, last: now - DAY }), okAt: { fb: now - DAY } };
  const s = createSession(fixed([card]));
  s.judge(false, now);
  const r = s.undo();
  assert.equal(r.okAt.fb, now - DAY);
  assert.deepEqual(r.fb, { step: 2, last: now - DAY });
});

test('できた直後のカードは、同じ復習の中では二度と出ない', () => {
  const card = mk('a');
  const s = createSession(buildQueue([card], 'both', now));
  s.judge(true, now);
  s.judge(true, now);
  assert.equal(s.current(), null);
});

test('ジェスチャー判定', () => {
  assert.equal(classifyGesture(3, 4), 'tap');
  assert.equal(classifyGesture(85, 10), 'ok');
  assert.equal(classifyGesture(-90, 0), 'ng');
  assert.equal(classifyGesture(40, 0), 'cancel');
  assert.equal(classifyGesture(0, 60), 'cancel');
});

test('空や空白だけのカードは保存できない', () => {
  assert.equal(checkCardText(' ', 'りんご').ok, false);
  assert.equal(checkCardText('사과', '\n').ok, false);
  assert.deepEqual(checkCardText(' 사과 ', 'りんご '), { ok: true, front: '사과', back: 'りんご' });
});

test('できた日の表示', () => {
  const at = (d, h = 12) => new Date(2026, 10, d, h).getTime();
  assert.equal(formatOkDate(at(16, 23), at(17, 8)), '前回できた 11/16(1日前)');
  assert.equal(formatOkDate(at(13), at(17)), '前回できた 11/13(4日前)');
  assert.equal(formatOkDate(at(17, 1), at(17, 23)), '前回できた 今日');
  assert.equal(formatOkDate(null, at(17)), '');
  assert.equal(formatOkDate(undefined, at(17)), '');
  assert.equal(formatOkDate(at(20), at(17)), '前回できた 今日');
});

test('次に出せる時刻の表示', () => {
  const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();
  assert.equal(formatNextDue(at(21, 15, 5), at(21, 14)), '今日 15:05ごろ');
  assert.equal(formatNextDue(at(22, 9), at(21, 23)), '明日 9:00ごろ');
  assert.equal(formatNextDue(at(27, 18, 30), at(21, 12)), '11/27 18:30ごろ');
  assert.equal(formatNextDue(null, at(21, 12)), '');
});
