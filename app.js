import { buildQueue, swapCard } from './srs.js';
import { createSession, classifyGesture, checkCardText, formatOkDate, SWIPE_PX } from './session.js';
import { loadAll, saveGroup, saveCard, deleteGroup, deleteCard, exportJson, importJson, newId } from './db.js';

const app = document.getElementById('app');
let data = { groups: [], cards: [] };
let view = { name: 'home' };
let session = null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const group = id => data.groups.find(g => g.id === id);
const cardsOf = id => data.cards.filter(c => c.groupId === id);
const MODES = { fb: '表→裏', bf: '裏→表', both: '両方' };
const sizeClass = t => (t.length <= 6 ? 'xl' : t.length <= 14 ? 'l' : 'm');

async function refresh() {
  data = await loadAll();
  data.groups.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

function go(v) { view = v; render(); }

/* ---------- 画面 ---------- */
function home() {
  const gs = data.groups.map(g => {
    const n = cardsOf(g.id).length;
    const sub = { fb: `${g.frontLabel}→${g.backLabel}`, bf: `${g.backLabel}→${g.frontLabel}`, both: 'まぜて' };
    return `<section class="g">
      <div class="g-head"><div><div class="n">${esc(g.name)}</div><div class="s">カード ${n}枚</div></div>
        <div class="g-btns"><button class="ghost add-btn" data-act="add-card" data-id="${g.id}">追加</button>
        <button class="ghost" data-act="cards" data-id="${g.id}">カード編集</button></div></div>
      <div class="dirs">${Object.keys(MODES).map(m =>
        `<button class="dir" data-act="study" data-id="${g.id}" data-mode="${m}">${MODES[m]}<small>${esc(sub[m])}</small></button>`).join('')}</div>
    </section>`;
  }).join('');
  return `<header class="top"><h1>グループ</h1><button class="chip-btn" data-act="new-group">＋ グループ</button></header>
  <main class="list">
    ${gs || '<div class="empty">まだグループがありません。<br>「韓国語」などのグループを作って、<br>カードを入れていきましょう。</div>'}
    <button class="add" data-act="new-group">＋ 新しいグループ</button>
  </main>
  <footer class="bottom"><button class="sub" data-act="backup">バックアップ</button></footer>`;
}

function groupForm() {
  const g = view.id ? group(view.id) : null;
  return `<header class="top"><button class="back" data-act="${g ? 'cards' : 'home'}" data-id="${g ? g.id : ''}">‹</button><h1>${g ? 'グループの設定' : '新しいグループ'}</h1></header>
  <main class="list">
    <form class="form" data-form="group">
      <label>グループ名</label><input name="name" value="${esc(g?.name ?? '')}" placeholder="例:韓国語" required>
      <label>表に書くもの</label><input name="frontLabel" value="${esc(g?.frontLabel ?? '')}" placeholder="例:韓国語">
      <label>裏に書くもの</label><input name="backLabel" value="${esc(g?.backLabel ?? '')}" placeholder="例:日本語">
      <p class="err" id="err"></p>
      <button class="big">保存</button>
    </form>
    ${g ? `<button class="big danger" data-act="del-group" data-id="${g.id}">このグループを削除</button>` : ''}
  </main>`;
}

function cardsView() {
  const g = group(view.id);
  const list = cardsOf(g.id).sort((a, b) => b.createdAt - a.createdAt);
  const editing = view.editId ? list.find(c => c.id === view.editId) : null;
  return `<header class="top"><button class="back" data-act="home">‹</button><h1>${esc(g.name)}</h1>
    <button class="ghost" data-act="edit-group" data-id="${g.id}">設定</button></header>
  <main class="list">
    <form class="form" data-form="card">
      <label>表:${esc(g.frontLabel)}</label><input class="kr" name="front" id="f-front" value="${esc(editing?.front ?? '')}" autocomplete="off">
      <label>裏:${esc(g.backLabel)}</label><input class="kr" name="back" value="${esc(editing?.back ?? '')}" autocomplete="off">
      <p class="err" id="err"></p>
      <div class="btns">${editing ? '<button type="button" class="big sub" data-act="cancel-edit">やめる</button><button class="big">変更を保存</button>' : '<button class="big">＋ カードを追加</button>'}</div>
    </form>
    <div class="count">${list.length}枚</div>
    ${list.map(c => `<div class="row"><div class="txt"><b>${esc(c.front)}</b><span>${esc(c.back)}</span></div>
      <div class="ops"><button data-act="swap" data-id="${c.id}" title="表と裏を入れ替える">⇄ 入替</button>
      <button data-act="edit-card" data-id="${c.id}">編集</button><button data-act="del-card" data-id="${c.id}">削除</button></div></div>`).join('')}
  </main>`;
}

// カード追加専用の画面(追加したあとも残って、続けて入力できる)
function addCardView() {
  const g = group(view.id);
  return `<header class="top"><button class="back" data-act="home">‹</button><h1>${esc(g.name)}に追加</h1></header>
  <main class="list">
    <form class="form" data-form="card">
      <label>表:${esc(g.frontLabel)}</label><input class="kr" name="front" id="f-front" autocomplete="off">
      <label>裏:${esc(g.backLabel)}</label><input class="kr" name="back" autocomplete="off">
      <p class="err" id="err"></p>
      <button class="big">＋ カードを追加</button>
    </form>
    <p class="msg ok" id="msg">${view.last ? `追加しました:${esc(view.last)}(全${cardsOf(g.id).length}枚)` : ''}</p>
  </main>`;
}

function studyView() {
  const g = group(view.id);
  const seg = Object.keys(MODES).map(m => `<button class="${m === view.mode ? 'on' : ''}" data-act="mode" data-mode="${m}">${MODES[m]}</button>`).join('');
  const e = session.current();
  let body;
  if (!cardsOf(g.id).length) {
    body = `<div class="done"><div class="em">🗂️</div><b>まだカードがありません</b><p class="note">カードを追加すると、ここで復習できます。</p>
      <p><button class="big" data-act="cards" data-id="${g.id}">カードを追加する</button></p></div>`;
  } else if (!e) {
    body = `<div class="done"><div class="em">🎉</div><b>おつかれさま!</b><p class="note">今出せるカードはぜんぶ回しました。</p></div>`;
  } else {
    const [qText, aText, qLab, aLab] = e.course === 'fb'
      ? [e.card.front, e.card.back, g.frontLabel, g.backLabel]
      : [e.card.back, e.card.front, g.backLabel, g.frontLabel];
    const okLabel = formatOkDate(e.card.okAt?.[e.course], Date.now());
    body = `${session.atDivider() ? '<div class="divider">ここから先は急がなくてOK</div>' : ''}
    <div class="card" id="card">
      <div class="stamp ok">できた</div><div class="stamp ng">まだ</div>
      <div class="inner">
        <div class="face"><span class="lab">${esc(qLab)}</span><div class="word ${sizeClass(qText)}">${esc(qText)}</div><span class="tap">タップでめくる</span>${okLabel ? `<span class="okdate">${esc(okLabel)}</span>` : ''}</div>
        <div class="face b"><span class="lab">${esc(aLab)}</span><div class="word ${sizeClass(aText)}">${esc(aText)}</div><span class="tap">${esc(qText)}</span></div>
      </div>
    </div>
    <div class="hint"><span class="l">← できなかった</span><span class="r">できた →</span></div>`;
  }
  return `<header class="top"><button class="back" data-act="home">‹</button><b class="gname">${esc(g.name)}</b><div class="seg">${seg}</div></header>
  <main class="stage">${body}</main>
  <footer class="bottom"><button class="sub" data-act="undo" ${session.canUndo() ? '' : 'disabled'}>↶ 戻す</button><button data-act="home">おわる</button></footer>`;
}

function backupView() {
  return `<header class="top"><button class="back" data-act="home">‹</button><h1>バックアップ</h1></header>
  <main class="list">
    <p class="note">カードと学習の記録は、このスマホのブラウザの中だけに保存されています。ブラウザのデータを消すと記録も消えるので、ときどき書き出しておくと安心です。</p>
    <button class="big" data-act="export">バックアップを書き出す</button>
    <button class="big sub" data-act="import">バックアップを読み込む</button>
    <input type="file" id="file" accept="application/json,.json" hidden>
    <p class="msg" id="msg"></p>
  </main>`;
}

function render() {
  const screens = { home, groupForm, cards: cardsView, addCard: addCardView, study: studyView, backup: backupView };
  if ((['cards', 'addCard', 'study'].includes(view.name) || view.name === 'groupForm' && view.id) && !group(view.id)) view = { name: 'home' };
  app.innerHTML = screens[view.name]();
  if (view.name === 'study') bindCard();
  if (view.name === 'addCard') document.getElementById('f-front').focus();
  window.scrollTo(0, 0);
}

/* ---------- 復習 ---------- */
function startStudy(id, mode) {
  view = { name: 'study', id, mode };
  session = createSession(buildQueue(cardsOf(id), mode, Date.now()));
  render();
}

function replaceCard(c) { data.cards = data.cards.map(x => (x.id === c.id ? c : x)); }

async function judge(ok) {
  if (!session.current()) return;
  const updated = session.judge(ok, Date.now());
  replaceCard(updated);
  render();                 // 画面はすぐ次へ。保存は裏で行う
  await persist(updated);
}

async function undo() {
  const restored = session.undo();
  if (!restored) return;
  replaceCard(restored);
  render();
  await persist(restored);
}

// 保存は順番どおりに1件ずつ(判定→戻すが逆順で保存されないように)
let saving = Promise.resolve();
function persist(card) {
  saving = saving.then(() => saveCard(card)).catch(() => alert('保存に失敗しました。もう一度お試しください。'));
  return saving;
}

function bindCard() {
  const el = document.getElementById('card');
  if (!el) return;
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false;
  const reset = () => { el.style.transform = ''; el.style.setProperty('--ok-o', 0); el.style.setProperty('--ng-o', 0); };
  el.addEventListener('pointerdown', e => {
    active = true; sx = e.clientX; sy = e.clientY; dx = dy = 0;
    el.setPointerCapture(e.pointerId);
    el.style.transition = 'none';
  });
  el.addEventListener('pointermove', e => {
    if (!active) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    el.style.setProperty('--ok-o', Math.min(1, Math.max(0, dx / SWIPE_PX)));
    el.style.setProperty('--ng-o', Math.min(1, Math.max(0, -dx / SWIPE_PX)));
  });
  el.addEventListener('pointerup', () => {
    if (!active) return;
    active = false;
    el.style.transition = '';
    const g = classifyGesture(dx, dy);
    if (g === 'tap') { reset(); el.classList.toggle('flip'); }
    else if (g === 'ok' || g === 'ng') {
      const dir = g === 'ok' ? 1 : -1;
      el.style.transform = `translateX(${dir * 600}px) rotate(${dir * 30}deg)`;
      setTimeout(() => judge(g === 'ok'), 200);
    } else reset();
  });
  el.addEventListener('pointercancel', () => { active = false; el.style.transition = ''; reset(); });
}

// PCで試すとき用: ←/→ で判定、スペースでめくる
document.addEventListener('keydown', e => {
  if (view.name !== 'study' || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') judge(true);
  else if (e.key === 'ArrowLeft') judge(false);
  else if (e.key === ' ') { e.preventDefault(); document.getElementById('card')?.classList.toggle('flip'); }
});

/* ---------- 操作 ---------- */
const actions = {
  'home': () => go({ name: 'home' }),
  'new-group': () => go({ name: 'groupForm' }),
  'edit-group': t => go({ name: 'groupForm', id: t.dataset.id }),
  'cards': t => go({ name: 'cards', id: t.dataset.id }),
  'add-card': t => go({ name: 'addCard', id: t.dataset.id }),
  'study': t => startStudy(t.dataset.id, t.dataset.mode),
  'mode': t => startStudy(view.id, t.dataset.mode),
  'undo': undo,
  'backup': () => go({ name: 'backup' }),
  async 'del-group'(t) {
    const g = group(t.dataset.id);
    if (!confirm(`「${g.name}」とカード${cardsOf(g.id).length}枚を削除します。元に戻せません。よろしいですか?`)) return;
    await deleteGroup(g.id); await refresh(); go({ name: 'home' });
  },
  async 'swap'(t) {
    const c = data.cards.find(x => x.id === t.dataset.id);
    const s = swapCard(c); await saveCard(s); replaceCard(s); render();
  },
  'edit-card': t => { go({ ...view, editId: t.dataset.id }); document.getElementById('f-front')?.focus(); },
  'cancel-edit': () => go({ name: 'cards', id: view.id }),
  async 'del-card'(t) {
    const c = data.cards.find(x => x.id === t.dataset.id);
    if (!confirm(`「${c.front}」を削除しますか?`)) return;
    await deleteCard(c.id); data.cards = data.cards.filter(x => x.id !== c.id);
    go({ name: 'cards', id: view.id });
  },
  async 'export'() {
    const blob = new Blob([await exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kioku-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setMsg('書き出しました。ファイルを大事に保管してください。', true);
  },
  'import': () => document.getElementById('file').click(),
};

function setMsg(text, ok) {
  const m = document.getElementById('msg');
  if (m) { m.textContent = text; m.className = `msg ${ok ? 'ok' : 'ng'}`; }
}

app.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (t && actions[t.dataset.act]) { e.preventDefault(); actions[t.dataset.act](t); }
});

app.addEventListener('change', async e => {
  if (e.target.id !== 'file' || !e.target.files[0]) return;
  const text = await e.target.files[0].text();
  e.target.value = '';
  if (!confirm('今のカードと学習記録は、バックアップの内容に置き換わります。よろしいですか?')) return;
  const r = await importJson(text);
  if (r.ok) { await refresh(); setMsg(`読み込みました(グループ${data.groups.length}個・カード${data.cards.length}枚)。`, true); }
  else setMsg(`読み込めませんでした:${r.error}。今のデータはそのままです。`, false);
});

app.addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = document.getElementById('err');
  if (e.target.dataset.form === 'group') {
    const name = String(f.get('name')).trim();
    if (!name) { err.textContent = 'グループ名を入力してください'; return; }
    const old = view.id ? group(view.id) : null;
    const g = {
      id: old?.id ?? newId(), createdAt: old?.createdAt ?? Date.now(), name,
      frontLabel: String(f.get('frontLabel')).trim() || '表',
      backLabel: String(f.get('backLabel')).trim() || '裏',
    };
    await saveGroup(g); await refresh(); go({ name: 'cards', id: g.id });
  } else if (e.target.dataset.form === 'card') {
    const r = checkCardText(f.get('front'), f.get('back'));
    if (!r.ok) { err.textContent = r.error; return; }
    const old = view.editId ? data.cards.find(c => c.id === view.editId) : null;
    const c = old ? { ...old, front: r.front, back: r.back }
      : { id: newId(), groupId: view.id, front: r.front, back: r.back, createdAt: Date.now(), fb: null, bf: null };
    await saveCard(c);
    data.cards = old ? data.cards.map(x => (x.id === c.id ? c : x)) : [...data.cards, c];
    go(view.name === 'addCard' ? { name: 'addCard', id: view.id, last: c.front } : { name: 'cards', id: view.id });
    document.getElementById('f-front')?.focus();
  }
});

// ブラウザに「このデータは勝手に消さないで」とお願いする(容量不足時の自動削除対策)
navigator.storage?.persist?.().catch(() => {});

await refresh();
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
