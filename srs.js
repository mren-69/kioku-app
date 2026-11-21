// 復習ロジック(副作用なし)
// 「できた」の回数で次に出せるまでの間隔が決まる: 1時間 → 1日 → 6日 → 30日(以後ずっと30日)
// 「できなかった」は学習記録を消して「できるかわからない」に戻す
const HOUR = 3600000, DAY = 24 * HOUR;
export const INTERVALS = [0, HOUR, DAY, 6 * DAY, 30 * DAY]; // 添字 = 段階(できた回数)
const MAX_STEP = INTERVALS.length - 1;

// 学習記録 State: { step: 1..4, last: ms } | null(できるかわからない)
// 以前の版の記録 { S, last } は、記憶の強さSから段階に読み替える
export function stepOf(state) {
  if (!state) return 0;
  if (Number.isInteger(state.step)) return Math.min(MAX_STEP, Math.max(1, state.step));
  const S = state.S;
  return S < 3 ? 1 : S < 7 ? 2 : S < 15 ? 3 : 4;
}

export const dueAt = state => (state ? state.last + INTERVALS[stepOf(state)] : -Infinity);
export const isDue = (state, now) => now >= dueAt(state);

export function review(state, ok, now) {
  if (!ok) return null;
  return { step: Math.min(MAX_STEP, stepOf(state) + 1), last: now };
}

const coursesOf = mode => (mode === 'both' ? ['fb', 'bf'] : [mode]);

// 今出せるカードだけを、完全にランダムな順番で(フィッシャー–イェーツのシャッフル)
export function buildQueue(cards, mode, now, rng = Math.random) {
  const q = [];
  for (const card of cards)
    for (const course of coursesOf(mode))
      if (isDue(card[course], now)) q.push({ card, course });
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  return q;
}

// まだ時間がたっていないカードの中で、一番早く出せるようになる時刻(なければ null)
export function nextDueAt(cards, mode, now) {
  let best = null;
  for (const card of cards)
    for (const course of coursesOf(mode)) {
      const t = dueAt(card[course]);
      if (t > now && (best === null || t < best)) best = t;
    }
  return best;
}

export function swapCard(card) {
  return { ...card, front: card.back, back: card.front, fb: card.bf, bf: card.fb };
}
