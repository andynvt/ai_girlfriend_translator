import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { chromium } from 'playwright';
import { createHub } from './project-hub.mjs';

const root = await mkdtemp(join(tmpdir(), 'demo-slides-'));
const evidence = new URL('../.manual-test/verification/slides/', import.meta.url);
let browser, server, isPublic = false, failAccess = false;
const originalFetch = globalThis.fetch;
const launches = [];
try {
  await mkdir(join(root, 'docs')); await mkdir(evidence, { recursive: true });
  await copyFile(new URL('../docs/demo-slides.html', import.meta.url), join(root, 'docs/demo-slides.html'));
  await writeFile(join(root, '.env'), 'DEMO_APP_URL=https://audience.example\nDEMO_ADMIN_TOKEN=check-secret\n');
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://audience.example/api/demo-access');
    assert.equal(options.headers.Authorization, 'Bearer check-secret');
    if (failAccess) return { ok: false, json: async () => ({ error: 'offline' }) };
    if (options.method === 'POST') isPublic = JSON.parse(options.body).public;
    return { ok: true, json: async () => ({ public: isPublic, expiresIn: isPublic ? 3600 : 0 }) };
  };
  const launch = (cmd, args) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.kill = () => child.emit('close', null, 'SIGTERM'); launches.push({ cmd, args, child }); return child;
  };
  server = createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const hub = createHub({ root, port: server.address().port, launch }); server.on('request', hub.handler);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Keep verification offline; exercise the actual QR failure fallback, not a fake scannable image.
  await page.route('https://quickchart.io/**', route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/demo-slides.html`);
  for (let i = 0; i < 10; i++) {
    assert.equal(await page.locator('.slide:visible').count(), 1);
    assert.equal(await page.locator('#counter').textContent(), `${i + 1} / 10`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow slide ${i + 1}`);
    await page.screenshot({ path: new URL(`desktop-${i + 1}.png`, evidence).pathname, fullPage: true });
    if (i < 9) { await page.locator('#next').click(); }
  }
  await page.waitForFunction(() => !document.getElementById('toggle').disabled);
  assert.equal(await page.locator('#qrArea').isVisible(), false);
  await page.locator('#toggle').click();
  await page.waitForFunction(() => document.getElementById('toggle').textContent === 'Tắt public');
  assert.equal(isPublic, true); assert.equal(await page.locator('#qrArea').isVisible(), true);
  assert.equal(await page.locator('#audienceLink').getAttribute('href'), 'https://audience.example/');
  const qrUrl = new URL(await page.locator('#qr').getAttribute('src'));
  assert.equal(qrUrl.searchParams.get('text'), 'https://audience.example/');
  await page.locator('#qrError').waitFor({ state: 'visible' });
  await page.screenshot({ path: new URL('public-open.png', evidence).pathname, fullPage: true });
  await page.locator('#toggle').click();
  await page.waitForFunction(() => document.getElementById('toggle').textContent.startsWith('Bật public'));
  assert.equal(isPublic, false); assert.equal(await page.locator('#qrArea').isVisible(), false);
  failAccess = true; await page.locator('#refresh').click();
  await page.waitForFunction(() => document.getElementById('toggle').disabled && document.getElementById('accessStatus').textContent.includes('Không điều khiển'));
  assert.equal(await page.locator('#qrArea').isVisible(), false); failAccess = false;
  await page.evaluate(() => show(7));
  await page.waitForFunction(() => !document.getElementById('run').disabled);
  await page.locator('#run').click();
  await page.waitForFunction(() => !document.getElementById('stop').disabled);
  assert.ok(launches[0].args.includes('TC01,TC02,TC05'));
  await page.locator('#stop').click(); await page.waitForFunction(() => document.getElementById('stop').disabled);
  assert.equal((await hub.state()).job.status, 'stopped');
  for (let i = 0; i < 10; i++) {
    await page.setViewportSize({ width: 375, height: 812 }); await page.evaluate(i => show(i), i);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `mobile overflow ${i + 1}`);
    await page.screenshot({ path: new URL(`mobile-${i + 1}.png`, evidence).pathname, fullPage: true });
  }
  await page.evaluate(() => show(7)); await page.locator('#demoUrl').fill('http://127.0.0.1:3000');
  await page.locator('#demoUrl').press('ArrowLeft'); assert.equal(await page.locator('#counter').textContent(), '8 / 10');
  await page.locator('h2:visible').click(); await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#counter').textContent(), '9 / 10');
  await page.keyboard.press('Home'); assert.equal(await page.locator('#counter').textContent(), '1 / 10');
  await page.goto(`file://${join(root, 'docs/demo-slides.html')}`);
  assert.equal(await page.locator('#run').isDisabled(), true);
  await page.evaluate(() => show(9)); assert.equal(await page.locator('#toggle').isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('Slides: 10 desktop/mobile layouts, navigation, mock runner start/stop, server public open/close/error, QR URL/fallback and standalone mode passed. Real QR scan, deployed Redis/API and live AI not tested.');
} finally {
  globalThis.fetch = originalFetch;
  await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); await rm(root, { recursive: true, force: true });
}
