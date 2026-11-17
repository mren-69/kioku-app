// 復習セッション(画面に依存しない部分)
import { review, splitIndex } from './srs.js';

export const SWIPE_PX = 80;   // これ以上横に動かすと判定確定
export const TAP_PX = 10;     // これ未満の動きはタップ(めくり)

export function classifyGesture(dx, dy) {
  if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) return 'tap';
  if (dx >= SWIPE_PX) return 'ok';
  if (dx <= -SWIPE_PX) return 'ng';
  return 'cancel';
}

export function checkCardText(front, back) {
  const f = String(front ?? '').trim(), b = String(back ?? '').trim();
  if (!f || !b) return { ok: false, error: '表と裏の両方を入力してください' };
  return { ok: true, front: f, back: b };
}

// 「前回できた」の表示文字。日付は月/日、当日は「今日」(時計が戻っても今日扱い)
export function formatOkDate(ms, now) {
  if (!Number.isFinite(ms)) return '';
  const a = new Date(ms), b = new Date(now);
  const day = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((day(b) - day(a)) / 86400000);
  return diff <= 0 ? '前回できた 今日' : `前回できた ${a.getMonth() + 1}/${a.getDate()}(${diff}日前)`;
}

const REPEAT_MIN = 5;  // できなかったカードは、間に5〜10枚はさんでもう一度出す
const REPEAT_SPAN = 6;

// queue: buildQueue の結果。判定のたびに保存すべき最新のカードを返す。
export function createSession(queue, rng = Math.random) {
  queue = [...queue];
  let split = splitIndex(queue);
  const latest = new Map(queue.map(e => [e.card.id, e.card]));
  const history = [];
  let index = 0;

  const entry = () => {
    const e = queue[index];
    return e ? { ...e, card: latest.get(e.card.id) } : null;
  };

  return {
    current: entry,
    total: () => queue.length,
    canUndo: () => history.length > 0,
    // 危ないカードが尽き、余裕のあるカードが始まる位置(両方が存在するときだけ)
    atDivider: () => split > 0 && split < queue.length && index === split,
    judge(ok, now) {
      const e = entry();
      if (!e) return null;
      const { card, course } = e;
      const updated = {
        ...card,
        [course]: review(card[course], ok, now),
        okAt: { ...card.okAt, [course]: ok ? now : null }, // できなかった→できた日も消す
      };
      latest.set(updated.id, updated);
      index++;
      const h = { id: card.id, course, prev: card[course], prevOk: card.okAt?.[course] ?? null, prevSplit: split, insertedAt: null };
      if (!ok) {
        // 同じ復習の中で、もう一度出す(未学習に戻ったので区切りより前に数える)
        h.insertedAt = Math.min(queue.length, index + REPEAT_MIN + Math.floor(rng() * REPEAT_SPAN));
        queue.splice(h.insertedAt, 0, { card, course, R: 0 });
        if (h.insertedAt <= split) split++;
      }
      history.push(h);
      return updated;
    },
    undo() {
      const h = history.pop();
      if (!h) return null;
      if (h.insertedAt !== null) queue.splice(h.insertedAt, 1);
      split = h.prevSplit;
      const cur = latest.get(h.id);
      const restored = { ...cur, [h.course]: h.prev, okAt: { ...cur.okAt, [h.course]: h.prevOk } };
      latest.set(h.id, restored);
      index--;
      return restored;
    },
  };
}
