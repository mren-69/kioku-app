import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrievability, review, buildQueue, splitIndex, swapCard } from './srs.js';

const DAY = 86400000;
const now = Date.UTC(2026, 10, 15);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

const card = (id, fb, bf, createdAt = 0) => ({ id, groupId: 'g', front: 'F' + id, back: 'B' + id, createdAt, fb, bf });

test('未学習のRは0.8', () => {
  assert.equal(retrievability(null, now), 0.8);
});

test('直後は1、1日後(S=1)はexp(-1)', () => {
  assert.equal(retrievability({ S: 1, last: now }, now), 1);
  close(retrievability({ S: 1, last: now - DAY }, now), Math.exp(-1));
});

test('時計が戻ってもRは1', () => {
  assert.equal(retrievability({ S: 1, last: now + 1e9 }, now), 1);
});

test('何年空いてもRは有限で0..1', () => {
  const r = retrievability({ S: 0.25, last: now - 3650 * DAY }, now);
  assert.ok(Number.isFinite(r) && r >= 0 && r <= 1);
});

test('初回できた: S=2.2', () => {
  close(review(null, true, now).S, 2.2);
  assert.equal(review(null, true, now).last, now);
});

test('R=1でできた: 伸びない', () => {
  close(review({ S: 2, last: now }, true, now).S, 2);
});

test('R=0.95でできた: 伸びは半分(×1.6)', () => {
  const S = 10;
  const t = -Math.log(0.95) * S * DAY; // R=0.95 になる経過時間
  close(review({ S, last: now - t }, true, now).S, S * 1.6);
});

test('できなかった: 学習記録を消して未学習(null)に戻す', () => {
  assert.equal(review({ S: 4, last: now }, false, now), null);
  assert.equal(review(null, false, now), null);
});

test('buildQueue: R昇順、bothは2エントリ、同値(未学習)は乱数順', () => {
  const a = card('a', { S: 1, last: now - 5 * DAY }, { S: 100, last: now }, 1); // fb低, bf高
  const b = card('b', null, null, 0); // 0.8,0.8
  const up = (() => { let i = 0; return () => ++i / 10; })();
  const q = buildQueue([a, b], 'both', now, up);
  assert.equal(q.length, 4);
  assert.deepEqual(q.map(e => e.card.id + e.course), ['afb', 'bfb', 'bbf', 'abf']);
  for (let i = 1; i < q.length; i++) assert.ok(q[i - 1].R <= q[i].R);
  const down = (() => { let i = 10; return () => --i / 10; })();
  const q2 = buildQueue([a, b], 'both', now, down);
  assert.deepEqual(q2.map(e => e.card.id + e.course), ['afb', 'bbf', 'bfb', 'abf']);
});

test('buildQueue: 未学習は追加順ではなくランダムに並ぶ', () => {
  const cs = ['a', 'b', 'c', 'd'].map((id, i) => card(id, null, null, i));
  const orders = new Set();
  for (let k = 0; k < 40; k++) orders.add(buildQueue(cs, 'fb', now).map(e => e.card.id).join(''));
  assert.ok(orders.size > 1);
});

test('buildQueue: mode fbはfbのみ、bfはbfのみ', () => {
  const cs = [card('a', null, null), card('b', null, null)];
  assert.ok(buildQueue(cs, 'fb', now).every(e => e.course === 'fb'));
  assert.ok(buildQueue(cs, 'bf', now).every(e => e.course === 'bf'));
  assert.equal(buildQueue(cs, 'fb', now).length, 2);
});

test('splitIndex: R>=0.9の最初の位置', () => {
  assert.equal(splitIndex([{ R: 0.1 }, { R: 0.89 }, { R: 0.9 }, { R: 1 }]), 2);
  assert.equal(splitIndex([{ R: 0.1 }]), 1);
  assert.equal(splitIndex([]), 0);
});

test('swapCard: 文字と履歴を入れ替え、元は変えない', () => {
  const fb = { S: 1, last: 1 }, bf = { S: 9, last: 2 };
  const c = card('a', fb, bf);
  const s = swapCard(c);
  assert.equal(s.front, 'Ba'); assert.equal(s.back, 'Fa');
  assert.deepEqual(s.fb, bf); assert.deepEqual(s.bf, fb);
  assert.equal(c.front, 'Fa'); assert.deepEqual(c.fb, fb);
});
