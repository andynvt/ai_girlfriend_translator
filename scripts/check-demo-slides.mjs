import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, copyFile, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { chromium } from 'playwright';
import { createHub } from './project-hub.mjs';
import { prepareApp } from './manual-demo.mjs';

const root = await mkdtemp(join(tmpdir(), 'demo-slides-'));
const evidence = new URL('../.manual-test/verification/slides/', import.meta.url);
let browser, server, appAvailable = true;
const analyses = [];
const originalFetch = globalThis.fetch;
const launches = [];
try {
  await mkdir(join(root, 'docs')); await mkdir(evidence, { recursive: true });
  await copyFile(new URL('../docs/demo-slides.html', import.meta.url), join(root, 'docs/demo-slides.html'));
  await copyFile(new URL('../index.html', import.meta.url), join(root, 'index.html'));
  for (const dir of ['css', 'js', 'assets/tim-bot']) await cp(new URL('../' + dir, import.meta.url), join(root, dir), { recursive: true });
  await writeFile(join(root, '.env'), '');
  globalThis.fetch = async (url, options) => {
    if (String(url) === 'http://127.0.0.1:3000/') return new Response('App ready', { status: appAvailable ? 200 : 503 });
    if (String(url) === 'http://127.0.0.1:3000/api/translate') {
      const input = JSON.parse(options.body); analyses.push(input);
      return Response.json({ meaning: 'Có thể người ấy cần được lắng nghe.', danger: 60, reply: 'Mình nghe bạn đây.', avoid: 'Có vậy cũng giận.', ...(input.image ? { sourceText: 'Em không sao đâu' } : {}) });
    }
    throw new Error('Unexpected external call: ' + String(url));
  };
  const launch = (cmd, args) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.kill = () => child.emit('close', null, 'SIGTERM'); launches.push({ cmd, args, child }); return child;
  };
  server = createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const hub = createHub({ root, port: server.address().port, launch }); server.on('request', hub.handler);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Keep verification offline; exercise the actual QR failure fallback, not a fake scannable image.
  await page.route('https://quickchart.io/**', route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/demo-slides.html`);
  for (let i = 0; i < 10; i++) {
    assert.equal(await page.locator('.slide:visible').count(), 1);
    assert.equal(await page.locator('#counter').textContent(), `${i + 1} / 10`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow slide ${i + 1}`);
    await page.screenshot({ path: new URL(`desktop-${i + 1}.png`, evidence).pathname, fullPage: true });
    if (i === 4) {
      const sizes = await page.evaluate(() => ({ body: parseFloat(getComputedStyle(document.body).fontSize), note: parseFloat(getComputedStyle(document.querySelector('.slide:not([hidden]) .note')).fontSize), font: getComputedStyle(document.body).fontFamily }));
      assert.ok(sizes.body >= 28); assert.ok(sizes.note >= 22); assert.match(sizes.font, /apple-system/);
    }
    if (i < 9) { await page.locator('#next').click(); }
  }
  assert.equal(await page.locator('#toggle').count(), 0);
  assert.equal(await page.locator('#qrArea').isVisible(), true);
  assert.equal(await page.locator('#audienceLink').getAttribute('href'), 'https://aigirlfriend-demo.vercel.app/');
  const qrUrl = new URL(await page.locator('#qr').getAttribute('src'));
  assert.equal(qrUrl.searchParams.get('text'), 'https://aigirlfriend-demo.vercel.app/');
  await page.locator('#qrError').waitFor({ state: 'visible' });
  await page.screenshot({ path: new URL('production-qr.png', evidence).pathname, fullPage: true });
  await page.evaluate(() => show(7));
  await page.frameLocator('#autoApp').locator('#onboarding').waitFor({ state: 'visible' });
  appAvailable = false;
  await page.locator('#run').click();
  await page.waitForFunction(() => document.getElementById('runStatus').textContent.includes('chưa sẵn sàng'));
  assert.equal(analyses.length, 0); appAvailable = true;
  await page.locator('#run').click();
  await page.waitForFunction(() => document.getElementById('runStatus').textContent.includes('Đã chạy xong'), null, { timeout: 35000 });
  assert.equal(analyses.length, 4); assert.equal(analyses[0].text, 'Tùy anh');
  assert.notEqual(analyses[1].context, analyses[2].context); assert.ok(analyses[3].image.startsWith('data:image/png;base64,'));
  assert.equal(await page.frameLocator('#autoApp').locator('#out').isVisible(), true);
  await page.screenshot({ path: new URL('embedded-auto.png', evidence).pathname, fullPage: true });
  await page.locator('#run').click(); await page.waitForFunction(() => document.getElementById('runStatus').textContent.startsWith('1/4'));
  await page.locator('#stop').click();
  assert.match(await page.locator('#runStatus').textContent(), /Đã dừng/);
  await page.evaluate(() => show(8));
  await prepareApp(await (await page.locator('#manualApp').elementHandle()).contentFrame());
  const manual = page.frameLocator('#manualApp');
  await manual.locator('#text').waitFor({ state: 'visible' });
  await manual.locator('#text').fill('Ừ'); await manual.locator('#contextMenu > summary').click(); await manual.locator('#context').fill('Khán giả demo'); await manual.locator('#go').click();
  await manual.locator('#out').waitFor({ state: 'visible' });
  assert.equal(analyses.at(-1).context, 'Khán giả demo');
  await page.screenshot({ path: new URL('embedded-manual.png', evidence).pathname, fullPage: true });
  for (let i = 0; i < 10; i++) {
    await page.setViewportSize({ width: 375, height: 812 }); await page.evaluate(i => show(i), i);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `mobile overflow ${i + 1}`);
    await page.screenshot({ path: new URL(`mobile-${i + 1}.png`, evidence).pathname, fullPage: true });
  }
  await page.evaluate(() => show(8));
  await page.locator('h2:visible').click(); await page.keyboard.press('ArrowLeft'); assert.equal(await page.locator('#counter').textContent(), '8 / 10');
  await page.keyboard.press('Home'); assert.equal(await page.locator('#counter').textContent(), '1 / 10');
  await page.evaluate(() => show(0));
  assert.match(await page.locator('.cover .eyebrow').textContent(), /12\/10\/2026/);
  await page.locator('#languageSwitch').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('#languageSwitch').textContent(), 'Tiếng Việt');
  assert.match(await page.locator('h1').textContent(), /LoveInterpreter/);
  for (let i = 0; i < 10; i++) {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(i => show(i), i);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `English overflow ${i + 1}`);
    await page.screenshot({ path: new URL(`english-desktop-${i + 1}.png`, evidence).pathname, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `English mobile overflow ${i + 1}`);
  }
  await page.evaluate(() => show(7)); await page.locator('#run').click();
  await page.waitForFunction(() => document.getElementById('runStatus').textContent.includes('Demo finished'), null, { timeout: 35000 });
  assert.equal(analyses.at(-4).language, 'en'); assert.equal(analyses.at(-4).text, 'Whatever you want');
  assert.equal(analyses.at(-1).language, 'en');
  await page.locator('#languageSwitch').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
  assert.match(await page.locator('.slide:visible h2').textContent(), /Xem app/);
  await page.goto(`file://${join(root, 'docs/demo-slides.html')}`);
  assert.equal(await page.locator('#run').isDisabled(), true);
  await page.evaluate(() => show(9)); assert.equal(await page.locator('#qrArea').isVisible(), true); assert.equal(await page.locator('#toggle').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Slides: 10 desktop/mobile layouts, navigation, embedded app automatic/manual and stop, large SF system typography, VI/EN switching and English automatic demo, fixed production QR URL/fallback without public gate and standalone mode passed. Real QR scan and live AI not tested.');
} finally {
  globalThis.fetch = originalFetch;
  await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); await rm(root, { recursive: true, force: true });
}
