// 画面の通し確認: node e2e.mjs (serve.js を自動で起動する)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 8091;
const server = spawn(process.execPath, ['serve.js'], { env: { ...process.env, PORT: String(PORT) } });
await new Promise(r => server.stdout.once('data', r));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  if (navigator.storage?.persist) {
    const orig = navigator.storage.persist.bind(navigator.storage);
    navigator.storage.persist = () => { window.__persistAsked = true; return orig(); };
  }
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', d => d.accept());
const url = `http://localhost:${PORT}/`;
const shots = process.argv[2] || '.';

async function swipe(dx) {
  const b = await page.locator('#card').boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y);
  await page.mouse.up();
  await page.waitForTimeout(400);
}
const q = () => page.locator('.face:not(.b) .word').innerText();

try {
  await page.goto(url);
  // データが勝手に消されないよう、永続保存をお願いしている
  await page.waitForFunction(() => window.__persistAsked === true, null, { timeout: 3000 });
  await page.getByText('＋ 新しいグループ').click();
  await page.fill('input[name=name]', '韓国語');
  await page.fill('input[name=frontLabel]', '韓国語');
  await page.fill('input[name=backLabel]', '日本語');
  await page.getByText('保存').click();

  // 空入力はエラー
  await page.fill('input[name=front]', '  ');
  await page.getByText('＋ カードを追加').click();
  assert.equal(await page.locator('#err').innerText(), '表と裏の両方を入力してください');

  let k = 0;
  for (const [f, b] of [['사과', 'りんご'], ['학교', '学校'], ['ねこ', '고양이']]) {
    await page.fill('input[name=front]', f);
    await page.fill('input[name=back]', b);
    await page.getByText('＋ カードを追加').click();
    k++;
    await page.waitForFunction(n => document.querySelectorAll('.row').length === n, k);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'f-front'); // 連続入力できる
  }
  assert.equal(await page.locator('.row').count(), 3);
  // 逆に書いてしまったカードを入れ替え
  await page.locator('.row', { hasText: 'ねこ' }).getByText('⇄ 入替').click();
  await page.locator('.row .txt b', { hasText: '고양이' }).waitFor({ timeout: 3000 });
  assert.equal(await page.locator('.row', { hasText: '고양이' }).locator('span').innerText(), 'ねこ');
  await page.screenshot({ path: `${shots}/cards.png` });

  await page.reload();
  assert.equal(await page.locator('.g .s').innerText(), 'カード 3枚');
  await page.screenshot({ path: `${shots}/home.png` });

  // ホームの「追加」から直接カードを足せる(続けて入力できる)
  await page.locator('.g [data-act=add-card]').click();
  assert.equal(await page.evaluate(() => document.activeElement.name), 'front');
  await page.fill('input[name=front]', '물');
  await page.fill('input[name=back]', '水');
  await page.getByText('＋ カードを追加').click();
  await page.locator('#msg', { hasText: '물' }).waitFor({ timeout: 3000 });
  assert.equal(await page.evaluate(() => document.activeElement.name), 'front');
  await page.screenshot({ path: `${shots}/add.png` });
  await page.locator('.back').click();
  assert.equal(await page.locator('.g .s').innerText(), 'カード 4枚');
  await page.locator('.g [data-act=cards]').click();
  await page.locator('.row', { hasText: '물' }).getByText('削除').click(); // 以降の枚数を元に戻す
  await page.waitForFunction(() => document.querySelectorAll('.row').length === 3);
  await page.locator('.back').click();

  // 復習 表→裏
  await page.locator('.dir[data-mode=fb]').click();
  assert.ok(await page.locator('.bottom [data-act=undo]').isDisabled());
  const first = await q();
  await page.locator('#card').click();
  assert.ok(await page.locator('#card').evaluate(e => e.classList.contains('flip')));
  await page.screenshot({ path: `${shots}/study-flipped.png` });
  await swipe(160);                 // できた
  const second = await q();
  assert.notEqual(first, second);
  await swipe(-160);                // できなかった
  await page.getByText('↶ 戻す').click();
  assert.equal(await q(), second);  // 戻すで同じカードに
  await swipe(40);                  // 短い移動は判定しない
  assert.equal(await q(), second);
  await swipe(-160); await swipe(160);
  await page.getByText('おつかれさま!').waitFor();

  // 両方モードは6枚分
  await page.locator('.seg [data-mode=both]').click();
  assert.ok(await page.locator('.seg [data-mode=both]').evaluate(e => e.classList.contains('on')));
  await page.screenshot({ path: `${shots}/study.png` });
  let n = 0;
  while (await page.locator('#card').count()) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(30); n++; if (n > 20) break; }
  assert.equal(n, 6);

  // 学習記録は再読み込み後も残る
  await page.reload();
  const saved = await page.evaluate(async () => (await import('./db.js')).loadAll());
  assert.ok(saved.cards.every(c => c.fb && c.bf));

  // 壊れたバックアップでもデータが残る
  await page.getByText('バックアップ').click();
  await page.setInputFiles('#file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await page.locator('.msg.ng').waitFor();
  const after = await page.evaluate(async () => (await import('./db.js')).loadAll());
  assert.equal(after.cards.length, 3);

  // PWA: マニフェストとアイコンが読める
  const mf = await (await page.request.get(url + 'manifest.json')).json();
  assert.equal(mf.display, 'standalone');
  for (const i of mf.icons) assert.equal((await page.request.get(url + i.src)).status(), 200);
  assert.equal((await page.request.get(url + 'icon-180.png')).status(), 200);

  // オフラインでも開ける(Service Worker)
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await ctx.setOffline(true);
  await page.reload();
  await page.locator('.g .n', { hasText: '韓国語' }).waitFor({ timeout: 5000 });
  await ctx.setOffline(false);

  const real = errors.filter(e => !/net::ERR_INTERNET_DISCONNECTED|fonts\.g/.test(e));
  assert.deepEqual(real, []);
  console.log('E2E OK');
} catch (e) {
  console.error('E2E FAIL', e.message, errors);
  process.exitCode = 1;
} finally {
  await browser.close(); server.kill();
}
