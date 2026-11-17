import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, classifyGesture, checkCardText, formatOkDate } from './session.js';
import { buildQueue, splitIndex } from './srs.js';

const DAY = 86400000, now = Date.UTC(2026, 10, 15);
const mk = (id, fb = null, bf = null) => ({ id, groupId: 'g', front: id, back: id.toUpperCase(), createdAt: 0, fb, bf });

test('判定で次へ進み、そのコースだけ更新される', () => {
  const s = createSession(buildQueue([mk('a')], 'fb', now));
  const saved = s.judge(true, now);
  assert.equal(saved.fb.last, now);
  assert.equal(saved.bf, null);
  assert.equal(s.current(), null);
});

test('両方モード: 同じカードの2コース目は1コース目の結果を消さない', () => {
  let i = 0;
  const s = createSession(buildQueue([mk('a')], 'both', now, () => ++i / 10)); // 表→裏が先
  s.judge(true, now);
  const saved = s.judge(true, now + 1);
  assert.equal(saved.fb.last, now);
  assert.equal(saved.bf.last, now + 1);
  assert.equal(saved.okAt.fb, now);
  assert.equal(saved.okAt.bf, now + 1);
});

test('できた: そのコースの「できた日」を記録する(もう一方は変えない)', () => {
  const s = createSession(buildQueue([mk('a')], 'fb', now));
  const saved = s.judge(true, now);
  assert.equal(saved.okAt.fb, now);
  assert.ok(!saved.okAt.bf);
});

test('できなかった: 学習記録と「できた日」を消す(もう一方のコースは残す)', () => {
  const card = { ...mk('a', { S: 3, last: now - DAY }, { S: 3, last: now - DAY }), okAt: { fb: now - DAY, bf: now - DAY } };
  const s = createSession(buildQueue([card], 'fb', now));
  const saved = s.judge(false, now);
  assert.equal(saved.fb, null);
  assert.equal(saved.okAt.fb, null);
  assert.equal(saved.bf.last, now - DAY);
  assert.equal(saved.okAt.bf, now - DAY);
});

const ids = s => { const out = []; for (let e = s.current(); e; e = s.current()) { out.push(e.card.id); s.judge(true, now); } return out; };
const many = n => Array.from({ length: n }, (_, i) => mk('c' + String(i).padStart(2, '0'), { S: 1, last: now - 5 * DAY }));

test('できなかったカードは、同じ復習の5〜10枚あとにもう一度出る', () => {
  for (const [r, offset] of [[0, 5], [0.99, 10]]) {
    const s = createSession(buildQueue(many(12), 'fb', now, () => 0.5), () => r);
    const first = s.current().card.id;
    s.judge(false, now);
    const rest = ids(s);
    assert.equal(rest.length, 12); // 残り11枚 + もう一度出る1枚
    assert.equal(rest[offset], first); // 間に offset 枚はさむ
  }
});

test('残りが少ないときは、できなかったカードが最後に出る', () => {
  const s = createSession(buildQueue(many(2), 'fb', now, () => 0.5), () => 0.5);
  const first = s.current().card.id;
  s.judge(false, now);
  const rest = ids(s);
  assert.deepEqual([rest.length, rest[rest.length - 1]], [2, first]);
});

test('戻すと、できなかった判定も、もう一度出す予定も取り消される', () => {
  const s = createSession(buildQueue(many(3), 'fb', now, () => 0.5), () => 0);
  const before = s.total();
  const first = s.current().card.id;
  s.judge(false, now);
  assert.equal(s.total(), before + 1);
  const restored = s.undo();
  assert.equal(s.total(), before);
  assert.equal(restored.id, first);
  assert.deepEqual(restored.fb, { S: 1, last: now - 5 * DAY });
});

test('戻すと、できた日も元に戻る', () => {
  const card = { ...mk('a', { S: 3, last: now - DAY }), okAt: { fb: now - DAY } };
  const s = createSession(buildQueue([card], 'fb', now));
  s.judge(false, now);
  assert.equal(s.undo().okAt.fb, now - DAY);
});

test('できなかったカードが増えても、区切りは「急がなくてOK」の直前に出る', () => {
  const cs = [...many(8), mk('fresh', { S: 100, last: now })];
  const q = buildQueue(cs, 'fb', now, () => 0.5);
  const s = createSession(q, () => 0); // 6番目に再登場(区切りより前)
  s.judge(false, now);
  let seen = 0;
  while (!s.atDivider() && s.current()) { s.judge(true, now); seen++; }
  assert.equal(s.current().card.id, 'fresh');
  assert.equal(seen, 8); // 元の7枚 + もう一度出た1枚
});

test('できた日の表示', () => {
  const at = (d, h = 12) => new Date(2026, 10, d, h).getTime();
  assert.equal(formatOkDate(at(16, 23), at(17, 8)), '前回できた 11/16(1日前)');
  assert.equal(formatOkDate(at(13), at(17)), '前回できた 11/13(4日前)');
  assert.equal(formatOkDate(at(17, 1), at(17, 23)), '前回できた 今日');
  assert.equal(formatOkDate(null, at(17)), '');
  assert.equal(formatOkDate(undefined, at(17)), '');
  assert.equal(formatOkDate(at(20), at(17)), '前回できた 今日'); // 時計が戻っても壊れない
});

test('戻すで前の状態とカード位置に戻る。空なら null', () => {
  const s = createSession(buildQueue([mk('a'), mk('b')], 'fb', now));
  assert.equal(s.undo(), null);
  const first = s.current().card.id;
  s.judge(true, now);
  const restored = s.undo();
  assert.equal(restored.id, first);
  assert.equal(restored.fb, null);
  assert.equal(s.current().card.id, first);
  assert.equal(s.canUndo(), false);
});

test('区切り: R<0.9が尽きた位置でだけ true', () => {
  const old = mk('old', { S: 1, last: now - 5 * DAY });
  const fresh = mk('fresh', { S: 100, last: now });
  const q = buildQueue([old, fresh], 'fb', now);
  const s = createSession(q);
  assert.equal(splitIndex(q), 1);
  assert.equal(s.atDivider(), false);
  s.judge(true, now);
  assert.equal(s.atDivider(), true);
});

test('区切り: 全部が余裕/全部が危ないときは出さない', () => {
  const s1 = createSession(buildQueue([mk('x', { S: 100, last: now })], 'fb', now));
  assert.equal(s1.atDivider(), false);
  const s2 = createSession(buildQueue([mk('y')], 'fb', now));
  s2.judge(true, now);
  assert.equal(s2.atDivider(), false);
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
