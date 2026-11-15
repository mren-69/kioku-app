import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, classifyGesture, checkCardText } from './session.js';
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
  const s = createSession(buildQueue([mk('a')], 'both', now));
  s.judge(true, now);
  const saved = s.judge(false, now + 1);
  assert.equal(saved.fb.last, now);
  assert.equal(saved.bf.last, now + 1);
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
