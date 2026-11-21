import { test } from 'node:test';
import assert from 'node:assert/strict';
import { review, isDue, stepOf, buildQueue, nextDueAt, swapCard, INTERVALS } from './srs.js';

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const now = Date.UTC(2026, 10, 21);
const card = (id, fb, bf, createdAt = 0) => ({ id, groupId: 'g', front: 'F' + id, back: 'B' + id, createdAt, fb, bf });
const st = (step, ago) => ({ step, last: now - ago });

test('間隔は 1時間 / 1日 / 6日 / 30日', () => {
  assert.deepEqual(INTERVALS.slice(1), [HOUR, DAY, 6 * DAY, 30 * DAY]);
});

test('できた: 段階が1つ進む(4回目以降は4のまま)', () => {
  assert.deepEqual(review(null, true, now), { step: 1, last: now });
  assert.equal(review(st(1, 0), true, now).step, 2);
  assert.equal(review(st(2, 0), true, now).step, 3);
  assert.equal(review(st(3, 0), true, now).step, 4);
  assert.equal(review(st(4, 0), true, now).step, 4);
});

test('できなかった: 学習記録を消して「できるかわからない」(null)に戻す', () => {
  assert.equal(review(st(3, DAY), false, now), null);
  assert.equal(review(null, false, now), null);
});

test('出せるのは、決まった時間がたってから', () => {
  assert.equal(isDue(null, now), true);
  for (const [step, gap] of [[1, HOUR], [2, DAY], [3, 6 * DAY], [4, 30 * DAY]]) {
    assert.equal(isDue(st(step, gap - MIN), now), false, `step${step} 1分前`);
    assert.equal(isDue(st(step, gap), now), true, `step${step} ちょうど`);
  }
});

test('以前の記録(記憶の強さS)は段階に引き継ぐ', () => {
  assert.equal(stepOf(null), 0);
  assert.equal(stepOf({ S: 2.2, last: 0 }), 1);
  assert.equal(stepOf({ S: 4.84, last: 0 }), 2);
  assert.equal(stepOf({ S: 10.6, last: 0 }), 3);
  assert.equal(stepOf({ S: 23, last: 0 }), 4);
  assert.equal(isDue({ S: 2.2, last: now - 30 * MIN }, now), false);
  assert.equal(isDue({ S: 2.2, last: now - HOUR }, now), true);
  assert.equal(review({ S: 4.84, last: 0 }, true, now).step, 3);
});

test('buildQueue: 時間がたっていないカードは出さない', () => {
  const ready = card('ready', st(1, 2 * HOUR), null);
  const wait = card('wait', st(2, HOUR), st(1, 2 * HOUR));
  assert.deepEqual(buildQueue([ready, wait], 'fb', now).map(e => e.card.id), ['ready']);
  const both = buildQueue([ready, wait], 'both', now).map(e => e.card.id + e.course).sort();
  assert.deepEqual(both, ['readybf', 'readyfb', 'waitbf']);
});

const perms = (run, n) => { const c = {}; for (let i = 0; i < n; i++) { const k = run(); c[k] = (c[k] || 0) + 1; } return c; };

test('buildQueue: 並び順は完全にランダム(全ての並びがほぼ同じ確率)', () => {
  const cs = ['a', 'b', 'c'].map((id, i) => card(id, null, null, i));
  const c = perms(() => buildQueue(cs, 'fb', now).map(e => e.card.id).join(''), 6000);
  assert.equal(Object.keys(c).length, 6);
  for (const k in c) assert.ok(c[k] > 800 && c[k] < 1200, `${k}: ${c[k]}`);
});

test('buildQueue: 未学習と復習カード、追加順や段階で順番に偏りが出ない', () => {
  const cs = [card('new', null, null, 9), card('old', st(4, 40 * DAY), null, 0)];
  const c = perms(() => buildQueue(cs, 'fb', now)[0].card.id, 4000);
  assert.ok(c.new > 1700 && c.new < 2300, JSON.stringify(c));
});

test('buildQueue: 両方モードでも、同じカードの2コースが偏らない', () => {
  const cs = ['a', 'b'].map(id => card(id, null, null));
  const c = perms(() => buildQueue(cs, 'both', now).map(e => e.card.id + e.course).join(','), 24000);
  assert.equal(Object.keys(c).length, 24);
});

test('nextDueAt: 次に出せるようになる一番早い時刻(なければ null)', () => {
  const a = card('a', st(1, 10 * MIN), st(2, 0));
  const b = card('b', st(3, 0), null);
  assert.equal(nextDueAt([a, b], 'fb', now), now - 10 * MIN + HOUR);
  assert.equal(nextDueAt([a, b], 'bf', now), now + DAY); // 待っているのは a の 裏→表 だけ
  assert.equal(nextDueAt([card('c', st(4, 0), null)], 'bf', now), null); // 待っているカードなし
});

test('swapCard: 文字と履歴を入れ替え、元は変えない', () => {
  const fb = { step: 1, last: 1 }, bf = { step: 3, last: 2 };
  const c = card('a', fb, bf);
  const s = swapCard(c);
  assert.equal(s.front, 'Ba'); assert.equal(s.back, 'Fa');
  assert.deepEqual(s.fb, bf); assert.deepEqual(s.bf, fb);
  assert.equal(c.front, 'Fa'); assert.deepEqual(c.fb, fb);
});
