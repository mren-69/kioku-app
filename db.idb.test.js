import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveGroup, saveCard, loadAll, deleteGroup, exportJson, importJson } from './db.js';

const g = { id: 'g1', name: '韓国語', frontLabel: '韓国語', backLabel: '日本語' };
const c = { id: 'c1', groupId: 'g1', front: '사과', back: 'りんご', createdAt: 1, fb: null, bf: null };

test('保存して読み込める', async () => {
  await saveGroup(g); await saveCard(c);
  const all = await loadAll();
  assert.equal(all.groups.length, 1); assert.equal(all.cards[0].front, '사과');
});

test('壊れたJSONを読み込んでも既存データは残る', async () => {
  const r1 = await importJson('{壊れた');
  const r2 = await importJson(JSON.stringify({ groups: [{ id: 1 }], cards: [] }));
  assert.equal(r1.ok, false); assert.equal(r2.ok, false);
  assert.equal((await loadAll()).cards.length, 1);
});

test('書き出し→読み込みで復元できる', async () => {
  const json = await exportJson();
  await deleteGroup('g1');
  assert.equal((await loadAll()).cards.length, 0); // グループ削除でカードも消える
  assert.deepEqual(await importJson(json), { ok: true });
  const all = await loadAll();
  assert.equal(all.groups[0].name, '韓国語'); assert.equal(all.cards[0].back, 'りんご');
});
