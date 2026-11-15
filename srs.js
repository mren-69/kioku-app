// 復習ロジック(副作用なし)。エビングハウス型の忘却曲線 R = exp(-経過日数 / S)
const DAY = 86400000;
export const NEW_R = 0.8;      // 未学習カードの並び順用の仮のR
export const DUE_R = 0.9;      // これを下回ると「復習どき」
const GROW = 1.2;              // できた時の最大伸び(×2.2)
const SHRINK = 0.4;            // できなかった時の縮み
const MIN_S = 0.25;            // 記憶の強さの下限(日)

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function retrievability(state, now) {
  if (!state) return NEW_R;
  const days = Math.max(0, (now - state.last) / DAY);
  const r = Math.exp(-days / state.S);
  return Number.isFinite(r) ? clamp(r, 0, 1) : 0;
}

export function review(state, ok, now) {
  const S = state ? state.S : 1;
  const R = retrievability(state, now);
  const next = ok
    ? S * (1 + GROW * clamp((1 - R) / (1 - DUE_R), 0, 1)) // 早めに答えたほど伸びは小さい
    : Math.max(MIN_S, S * SHRINK);
  return { S: next, last: now };
}

export function buildQueue(cards, mode, now) {
  const courses = mode === 'both' ? ['fb', 'bf'] : [mode];
  const q = [];
  for (const card of cards)
    for (const course of courses)
      q.push({ card, course, R: retrievability(card[course], now) });
  // Array.prototype.sort は安定ソートなので、同値なら fb が bf より先に残る
  return q.sort((a, b) => a.R - b.R || a.card.createdAt - b.card.createdAt);
}

export function splitIndex(queue) {
  const i = queue.findIndex(e => e.R >= DUE_R);
  return i === -1 ? queue.length : i;
}

export function swapCard(card) {
  return { ...card, front: card.back, back: card.front, fb: card.bf, bf: card.fb };
}
