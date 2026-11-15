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

// queue: buildQueue の結果。判定のたびに保存すべき最新のカードを返す。
export function createSession(queue) {
  const split = splitIndex(queue);
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
      history.push({ id: e.card.id, course: e.course, prev: e.card[e.course] });
      const updated = { ...e.card, [e.course]: review(e.card[e.course], ok, now) };
      latest.set(updated.id, updated);
      index++;
      return updated;
    },
    undo() {
      const h = history.pop();
      if (!h) return null;
      const restored = { ...latest.get(h.id), [h.course]: h.prev };
      latest.set(h.id, restored);
      index--;
      return restored;
    },
  };
}
