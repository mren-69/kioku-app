# 暗記アプリ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スマホのホーム画面から使える、忘却曲線ベースの自分専用単語帳Webアプリ(スワイプ判定・グループ・表裏2コース)を作る。

**Architecture:** 依存ライブラリなしの静的ファイル群。復習ロジックは副作用のない `srs.js`(Nodeでテスト可能)、保存は `db.js`(IndexedDB)、画面は `index.html` + `app.js`。サーバー・ログインなし。

**Tech Stack:** HTML/CSS/vanilla JS(ES modules)、IndexedDB、Service Worker + manifest(PWA)、テストは `node --test`。

**Spec:** `C:\Users\Emi M\kioku-app\design.md`(見た目は同フォルダ `mockup.html` の案C)

**My call(設計メモからの小さな変更):** 設計メモは「HTMLファイル1つ」だったが、ロジックをテストできるよう `srs.js` を別ファイルに分ける。ホスティング・使い方は変わらない。

## Global Constraints

- 外部ライブラリ・サーバー・ログイン・課金なし。Google Fontsのみ可(オフライン時はシステムフォントにフォールバック)。
- 判定: **右スワイプ=できた、左スワイプ=できなかった**。裏返す前でもスワイプ可。「戻す」ボタンで直前の判定を取り消せる。
- 連続日数(ストリーク)、「あと◯枚」、20枚などの区切り・上限は**作らない**。
- カードは「表」「裏」のテキストのみ。1枚に2コース: `fb`(表→裏)と`bf`(裏→表)。復習日は別々に管理。
- 出題順: 全カードを思い出せる確率 `R` の低い順の1本のリスト。`R<0.9` が尽きた直後に1回だけ「ここから先は急がなくてOK」を表示。
- 見た目: 黄色背景 `#fff6d8`、紫ボタン `#7c5cff`、黒縁取り(3px)と影、丸ゴシック `M PLUS Rounded 1c` + `Noto Sans KR`。向き切り替え(表→裏/裏→表/両方)は大きく押しやすく、復習画面ではグループ名の横の空きに置く。
- 全文言は日本語。

## Review Focus

- 表/裏が空(空白のみ含む)のカードは保存できない(エラー表示)。
- 端末の時計が戻る(経過時間が負)・何年も空く: `R` は `[0,1]` に収まり NaN にならない。
- 壊れたJSONを読み込んでも既存データは消えない(確認してから置き換え)。
- 表裏入れ替えで文字と `fb`/`bf` の履歴が両方入れ替わる。
- グループ削除はカードごと消えるので確認ダイアログを出す。
- 「戻す」を何度押しても最初の判定より前には戻らず、エラーにならない。
- カードが0枚のグループ・対象コースに出題できるカードが無いときは、案内を表示する。
- タップ(めくり)とスワイプを誤判定しない(移動量が小さければタップ)。

## ファイル構成

- `srs.js` — 純粋関数: 思い出せる確率、判定による更新、出題リスト作成、表裏入れ替え。
- `srs.test.js` — Nodeテスト。
- `db.js` — IndexedDB読み書き、書き出し/読み込み。
- `app.js` — 画面描画・イベント(スワイプ、戻す、フォーム)。
- `index.html` / `style.css` — 画面と見た目。
- `manifest.json` / `sw.js` / `icon.svg` — PWA。

---

### Task 1: 復習ロジック `srs.js`

**Files:**
- Create: `srs.js`, `srs.test.js`

**Interfaces:**
- Produces:
  - `type Course = 'fb' | 'bf'`
  - `type State = { S: number, last: number } | null`(`S`=記憶の強さ[日]、`last`=最終復習のms。`null`=未学習)
  - `type Card = { id: string, groupId: string, front: string, back: string, createdAt: number, fb: State, bf: State }`
  - `retrievability(state: State, now: number): number` — 未学習は `0.8`。それ以外は `exp(-days/S)`、`days<0` は 0 扱い、結果は `[0,1]`。
  - `review(state: State, ok: boolean, now: number): { S: number, last: number }` — 初回(`null`)は `S=1` を土台にする。`ok` かつ `R=retrievability`: `S *= 1 + 1.2 * clamp((1 - R) / 0.1, 0, 1)`。`!ok`: `S = max(0.25, S * 0.4)`。`last = now`。
  - `buildQueue(cards: Card[], mode: 'fb'|'bf'|'both', now: number): { card: Card, course: Course, R: number }[]` — `R` 昇順。同値は `createdAt` 昇順。
  - `splitIndex(queue): number` — `R >= 0.9` が始まる最初の位置(全て未満なら `queue.length`)。
  - `swapCard(card: Card): Card` — `front/back` と `fb/bf` を入れ替えた新オブジェクト。

- [ ] **Step 1: 失敗するテストを書く(`srs.test.js`)**
  - `retrievability(null, now) === 0.8`
  - `retrievability({S:1,last:now}, now) === 1`、`retrievability({S:1,last:now - 86400000}, now)` が `Math.exp(-1)` に近い
  - 時計が戻った場合 `retrievability({S:1,last:now+1e9}, now) === 1`、何年も空いても `0 <= R <= 1` かつ `Number.isFinite`
  - `review(null, true, now).S` は `R=0.8` ゆえ `2.2`、`review({S:2,last:now},true,now).S` は `R=1` ゆえ `2`(伸びない)
  - `review({S:4,last:now},false,now).S === 1.6`、`review({S:0.3,...},false,now).S === 0.25`
  - `buildQueue` が `R` 昇順で `mode:'both'` なら1枚から2エントリ出すこと、`mode:'fb'` なら `course==='fb'` のみ
  - `splitIndex` が `R>=0.9` の最初の位置を返す
  - `swapCard` が文字と `fb/bf` の両方を入れ替え、元オブジェクトを変更しない

- [ ] **Step 2: テスト実行して失敗を確認** — Run: `node --test` (cwd: `C:\Users\Emi M\kioku-app`) / Expected: FAIL(`srs.js` が無い)

- [ ] **Step 3: `srs.js` に上記シグネチャで実装(ES module、`export`)。**

- [ ] **Step 4: テスト実行して通ることを確認** — Run: `node --test` / Expected: 全PASS

---

### Task 2: 保存層 `db.js`

**Files:**
- Create: `db.js`

**Interfaces:**
- Consumes: Task 1 の `Card` 型
- Produces(すべて `Promise`):
  - `type Group = { id: string, name: string, frontLabel: string, backLabel: string }`
  - `loadAll(): Promise<{ groups: Group[], cards: Card[] }>`
  - `saveGroup(g: Group)`, `deleteGroup(id: string)`(そのグループのカードも削除)
  - `saveCard(c: Card)`, `deleteCard(id: string)`
  - `exportJson(): Promise<string>`
  - `importJson(text: string): Promise<{ ok: true } | { ok: false, error: string }>` — 先に全体を検証(`groups`/`cards`が配列、必須項目あり)。不正なら `ok:false` を返し**既存データを一切変更しない**。
  - `newId(): string`(`crypto.randomUUID()`)

- [ ] **Step 1: 実装** — DB名 `kioku`、ストア `groups` と `cards`(keyPath `id`)。`importJson` は検証→1トランザクションで全置換。
- [ ] **Step 2: 手動確認(ブラウザのコンソール)** — `index.html` を開き(Task 3後)、`saveGroup`→再読込→`loadAll` でデータが残ること、`importJson('{壊れた')` が `ok:false` を返し既存データが残ることを確認。

---

### Task 3: 画面の骨組み・グループ・カード追加/編集

**Files:**
- Create: `index.html`, `style.css`, `app.js`

**Interfaces:**
- Consumes: Task 1 `swapCard`、Task 2 の全保存関数
- Produces: 画面: ①グループ一覧(`mockup.html` 案Cの見た目)②カード追加/編集フォーム ③グループ内カード一覧

- [ ] **Step 1: グループ一覧** — 作成(名前と表・裏ラベル。例: 韓国語/日本語)、削除(確認ダイアログ)。各グループに向きボタン「表→裏」「裏→表」「両方」を**大きく**(押しやすい高さ)並べ、押すと復習画面へ。
- [ ] **Step 2: カード追加フォーム** — ラベル表示つきで表→裏の順に入力。保存後はフォームに残って連続入力可。表/裏が空白のみなら保存せずエラー文言を表示。
- [ ] **Step 3: カード一覧・編集・削除** — 各カードに「表裏を入れ替える」ボタン(`swapCard` 経由で保存)。
- [ ] **Step 4: 手動確認** — グループ作成→カード3枚追加→1枚入れ替え→再読込しても残る。空入力でエラーが出る。

---

### Task 4: 復習画面(めくり・スワイプ・戻す・区切り)

**Files:**
- Modify: `app.js`, `style.css`

**Interfaces:**
- Consumes: Task 1 `buildQueue`/`splitIndex`/`review`、Task 2 `saveCard`

- [ ] **Step 1: 画面** — 上部にグループ名と大きな向き切り替え(表→裏/裏→表/両方、現在選択を強調)。中央にカード(タップで3Dフリップ)。下に「↶ 戻す」。カードの下に「← できなかった / できた →」のヒント。連続日数・残り枚数・進捗バーは表示しない。
- [ ] **Step 2: スワイプ** — Pointer Eventsで横移動を追従して傾ける。移動量が 80px 以上で確定(右=ok、左=ng)。未満は元に戻る。移動量 10px 未満はタップとしてめくり。確定時に `review` で更新→`saveCard`→次のカード。
- [ ] **Step 3: 戻す** — 判定前の `{card, course, 前の State}` をスタックに積み、戻すで復元(保存も戻す)。スタックが空なら何もしない(無効表示)。
- [ ] **Step 4: 区切り** — キューは1枚判定するたびに `buildQueue` を再計算せず、開始時のキューを順に消費(`splitIndex` の位置の直前に1回だけ「ここから先は急がなくてOK」の小さな帯を挟む)。
- [ ] **Step 5: 空の状態** — 対象カードが0なら「まだカードがありません。カードを追加しましょう」を表示。キューを最後まで消化したら「おつかれさま」。どちらも義務感の出ない文面。
- [ ] **Step 6: 手動確認** — 5枚で右/左スワイプ、タップめくり、戻すを3回連続、バックグラウンドから戻ってもデータが保たれる。端末の日時を1週間進めて、古い判定のカードほど先に出ること。

---

### Task 5: バックアップ・PWA・公開

**Files:**
- Create: `manifest.json`, `sw.js`, `icon.svg`
- Modify: `index.html`, `app.js`

- [ ] **Step 1: バックアップUI** — 「バックアップを書き出す」(JSONをダウンロード)と「バックアップを読み込む」(ファイル選択→確認ダイアログ→`importJson`、失敗時はエラー文言で既存データ保持)。
- [ ] **Step 2: PWA** — `manifest.json`(名前、`display:standalone`、テーマ色 `#7c5cff`、背景 `#fff6d8`、`icon.svg`)。`sw.js` は全ファイルをキャッシュしてオフライン動作。
- [ ] **Step 3: 手動確認** — 機内モードで開いて動く。書き出し→全削除→読み込みで復元できる。
- [ ] **Step 4: 公開** — フォルダをGitHub Pagesなど無料ホスティングに置く手順を、ユーザーに日本語で案内して実行(アカウント作成などユーザー操作が必要な部分は都度確認)。iPhone/Androidのホーム画面追加手順も案内する。

---

## Self-Review メモ

- Spec網羅: グループ(T3)、表裏入れ替え+履歴入れ替え(T1,T3)、2コース(T1,T4)、忘却曲線と順番・区切り・早め回答の抑制(T1,T4)、スワイプ・戻す(T4)、バックアップ・保存・公開(T2,T5)、大きい向きボタン(T3,T4)。
- ストリーク・上限・共有は作らない(Global Constraintsに明記)。
