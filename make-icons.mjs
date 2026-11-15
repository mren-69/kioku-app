// icon.svg から PNG アイコンを作る: node make-icons.mjs
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('./icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `icon-${size}.png` });
  await page.close();
}
await browser.close();
console.log('icons done');
