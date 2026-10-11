import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { parseRequest } from '../api/translate.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const requests = [], errors = [];
let fail = false;
const server = createServer(async (req, res) => {
  if (/^\/(css|js)\/[\w-]+\.(css|js)$/.test(req.url)) { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(new URL('..' + req.url, import.meta.url))); return; }
  if (req.url.startsWith('/assets/')) {
    if (!/^\/assets\/tim-bot\/[\w.-]+\.png$/.test(req.url)) { res.writeHead(404); res.end(); return; }
    try { res.setHeader('Content-Type', 'image/png'); res.end(await readFile(new URL('..' + req.url, import.meta.url))); }
    catch { res.writeHead(404); res.end(); }
  } else if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html'); res.end(req.url.includes('limit=15') ? html.replace('maxConversationTurns: 10', 'maxConversationTurns: 15') : html);
  } else {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    res.setHeader('Content-Type', 'application/json');
    try {
      parseRequest(body);
      if (fail) throw new Error('Mock offline');
      res.end(JSON.stringify({ meaning: 'Có thể đang bận.', danger: 25, reply: 'Mình nghe đây.', avoid: 'Kệ bạn.', sourceText: 'Tin nhắn trong ảnh' }));
    } catch (e) { res.writeHead(e.status || 502); res.end(JSON.stringify({ error: e.message })); }
  }
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 850 } });
  const page = await context.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', e => errors.push(e.message));
  const $ = id => page.locator('#' + id);
  const evidence = new URL('../.manual-test/history/', import.meta.url); await mkdir(evidence, { recursive: true });
  const capture = async name => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: new URL(name + '.png', evidence).pathname, fullPage: true, animations: 'disabled' });
  };
  const decode = async text => {
    await $('text').fill(text); await $('go').click();
    await page.waitForFunction(() => document.getElementById('loading').hidden);
  };
  await page.goto(origin); await $('setupNext').click(); await $('chooseGf').click(); await $('setupNext').click();
  await $('setupName').fill('Mai'); await $('reviewSetup').click(); await $('confirmSetup').click();
  await $('context').fill('Vừa tan ca'); await decode('Em đang bận');
  assert.equal(await $('go').isDisabled(), true); await capture('first-mobile');
  await $('chooseAvoid').click(); assert.equal(await $('followup').textContent(), 'Cô ấy trả lời thế nào?');
  await $('sentReply').fill('Anh chờ em nhé');
  fail = true; await decode('Ừ'); assert.equal(await $('turnCount').textContent(), 'Lượt 1/10');
  assert.equal(await $('text').inputValue(), 'Ừ'); assert.equal(await $('out').isVisible(), true);
  fail = false; await decode('Ừ');
  assert.equal(requests.at(-1).context, 'Vừa tan ca'); assert.equal(requests.at(-1).history[0].selection, 'avoid');
  assert.equal(requests.at(-1).history[0].sentReply, 'Anh chờ em nhé');
  await $('chooseReply').click(); await capture('followup-mobile');
  await page.reload(); await $('historyList button').first().click();
  assert.equal(await $('turnCount').textContent(), 'Lượt 2/10'); assert.equal(await $('context').inputValue(), 'Vừa tan ca');
  for (let i = 3; i <= 10; i++) { await decode('Tin nhắn ' + i); await $('chooseReply').click(); }
  assert.equal(await $('go').isDisabled(), true); assert.equal(await $('turnCount').textContent(), 'Lượt 10/10');
  await $('saveConversation').click(); await capture('limit-mobile');
  await page.setViewportSize({ width: 1100, height: 850 }); await capture('history-desktop');
  await page.goto(origin + '/?limit=15'); await $('historyList button').first().click();
  assert.equal(await $('go').isEnabled(), true); await decode('Lượt 11'); assert.equal(await $('turnCount').textContent(), 'Lượt 11/15');
  await $('saveConversation').click(); await page.reload(); await $('historyList button').first().click();
  assert.equal(await $('chooseReply').isEnabled(), true); assert.equal(await $('go').isDisabled(), true);
  await $('chooseReply').click();
  await $('newConversation').click();
  await $('file').setInputFiles({ name: 'chat.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
  await $('go').click(); await $('out').waitFor({ state: 'visible' });
  await $('sourceText').fill('Đã sửa lời trong ảnh'); await $('chooseReply').click();
  assert.ok(await page.evaluate(() => !localStorage.getItem(HISTORY_KEY).includes('data:image')));
  await $('historyList button').nth(1).click(); assert.equal(await $('turnCount').textContent(), 'Lượt 0/15');
  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-report.json', evidence), JSON.stringify({ ok: true, date: '2026-10-11', api: 'mock with real parseRequest validation', viewports: [375, 1100], checks: ['reply/avoid selection', 'ordered context and actual reply', 'error/retry without counting', 'reload/resume/delete', 'limit 10 and setting 15', 'saved pending choice', 'corrected image text without base64', 'no horizontal overflow'], errors }, null, 2));
  console.log('History browser checks passed (API mocked): choices, context, retries, reload, limits 10/15, image source, deletion, 375/1100px.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
