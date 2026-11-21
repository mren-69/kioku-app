import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup } from './db.js';

const g = { id: 'g1', name: '韓国語', frontLabel: '韓国語', backLabel: '日本語' };
const c = { id: 'c1', groupId: 'g1', front: '사과', back: 'りんご', createdAt: 1, fb: null, bf: { S: 1, last: 1 } };

test('正しいバックアップは通る', () => {
  assert.equal(validateBackup({ groups: [g], cards: [c] }), null);
});

test('できた日(okAt)は、あってもなくてもよく、あるなら数値かnull', () => {
  assert.equal(validateBackup({ groups: [g], cards: [{ ...c, okAt: { fb: 1, bf: null } }] }), null);
  assert.equal(validateBackup({ groups: [g], cards: [{ ...c, okAt: {} }] }), null);
  assert.ok(validateBackup({ groups: [g], cards: [{ ...c, okAt: { fb: 'きのう' } }] }));
  assert.ok(validateBackup({ groups: [g], cards: [{ ...c, okAt: 5 }] }));
});

test('学習記録は、新しい形(段階)も以前の形(記憶の強さ)も読み込める', () => {
  assert.equal(validateBackup({ groups: [g], cards: [{ ...c, fb: { step: 3, last: 5 } }] }), null);
  assert.equal(validateBackup({ groups: [g], cards: [{ ...c, fb: { S: 2.2, last: 5 } }] }), null);
  assert.ok(validateBackup({ groups: [g], cards: [{ ...c, fb: { step: 0, last: 5 } }] }));
  assert.ok(validateBackup({ groups: [g], cards: [{ ...c, fb: { step: 2.5, last: 5 } }] }));
  assert.ok(validateBackup({ groups: [g], cards: [{ ...c, fb: { step: 2 } }] }));
});

test('壊れた形は理由つきで拒否', () => {
  assert.ok(validateBackup(null));
  assert.ok(validateBackup({ groups: [] }));
  assert.ok(validateBackup({ groups: [{ id: 'x' }], cards: [] }));
  assert.ok(validateBackup({ groups: [g], cards: [{ ...c, front: 5 }] }));
  assert.ok(validateBackup({ groups: [g], cards: [{ ...c, fb: { S: 'a', last: 1 } }] }));
  assert.ok(validateBackup({ groups: [g], cards: [{ ...c, groupId: 'none' }] }));
});
