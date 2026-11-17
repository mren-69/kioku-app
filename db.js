// 保存層(スマホのブラウザ内 IndexedDB)。サーバーは使わない。
const DB_NAME = 'kioku';
const VERSION = 1;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('groups')) db.createObjectStore('groups', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function getAll(store) {
  return open().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function put(store, value) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return done(tx);
}

export const newId = () => crypto.randomUUID();

export async function loadAll() {
  const [groups, cards] = await Promise.all([getAll('groups'), getAll('cards')]);
  return { groups, cards };
}

export const saveGroup = g => put('groups', g);
export const saveCard = c => put('cards', c);

export async function deleteCard(id) {
  const db = await open();
  const tx = db.transaction('cards', 'readwrite');
  tx.objectStore('cards').delete(id);
  return done(tx);
}

// グループを消すと、中のカードもまとめて消える
export async function deleteGroup(id) {
  const cards = await getAll('cards');
  const db = await open();
  const tx = db.transaction(['groups', 'cards'], 'readwrite');
  tx.objectStore('groups').delete(id);
  for (const c of cards) if (c.groupId === id) tx.objectStore('cards').delete(c.id);
  return done(tx);
}

export async function exportJson() {
  const { groups, cards } = await loadAll();
  return JSON.stringify({ app: 'kioku', version: 1, exportedAt: Date.now(), groups, cards });
}

const isStr = x => typeof x === 'string';
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const okState = s => s === null || (s && isNum(s.S) && s.S > 0 && isNum(s.last));

// 最後にできた日: { fb?: number|null, bf?: number|null }(古いバックアップには無い)
const okDates = o => !!o && typeof o === 'object' && ['fb', 'bf'].every(k => o[k] == null || isNum(o[k]));

// 問題なければ null、問題があれば理由(日本語)を返す
export function validateBackup(data) {
  if (!data || !Array.isArray(data.groups) || !Array.isArray(data.cards)) return 'バックアップの形式ではありません';
  const ids = new Set();
  for (const g of data.groups) {
    if (!g || !isStr(g.id) || !isStr(g.name) || !isStr(g.frontLabel) || !isStr(g.backLabel)) return 'グループの情報が壊れています';
    ids.add(g.id);
  }
  for (const c of data.cards) {
    if (!c || !isStr(c.id) || !isStr(c.front) || !isStr(c.back) || !isNum(c.createdAt)) return 'カードの情報が壊れています';
    if (!ids.has(c.groupId)) return 'どのグループにも属さないカードがあります';
    if (!okState(c.fb) || !okState(c.bf)) return 'カードの学習記録が壊れています';
    if (c.okAt !== undefined && !okDates(c.okAt)) return 'カードの「できた日」の記録が壊れています';
  }
  return null;
}

// 検証に通ったときだけ、1回の処理で全体を置き換える(失敗時は今のデータに一切触れない)
export async function importJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'ファイルを読み取れませんでした' }; }
  const error = validateBackup(data);
  if (error) return { ok: false, error };
  const db = await open();
  const tx = db.transaction(['groups', 'cards'], 'readwrite');
  tx.objectStore('groups').clear();
  tx.objectStore('cards').clear();
  for (const g of data.groups) tx.objectStore('groups').put(g);
  for (const c of data.cards) tx.objectStore('cards').put(c);
  await done(tx);
  return { ok: true };
}
