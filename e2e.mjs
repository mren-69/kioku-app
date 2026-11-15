// 画面の通し確認: node e2e.mjs (serve.js を自動で起動する)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 8091;
const server = spawn(process.execPath, ['serve.js'], { env: { ...process.env, PORT: String(PORT) } });
await new Promise(r => server.stdout.once('data', r));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
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

  const real = errors.filter(e => !/404|ServiceWorker/.test(e) || process.env.STRICT);
  assert.deepEqual(real, []);
  console.log('E2E OK');
} catch (e) {
  console.error('E2E FAIL', e.message, errors);
  process.exitCode = 1;
} finally {
  await browser.close(); server.kill();
}
