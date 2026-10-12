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
      res.end(JSON.stringify({ meaning: 'Có thể đang bận.', danger: 25, reply: 'Anh mừng em ổn. Em đau chỗ nào không, anh chở/đưa em đi khám nhé?', avoid: 'Kệ bạn.', sourceText: 'Tin nhắn trong ảnh' }));
    } catch (e) { res.writeHead(e.status || 502); res.end(JSON.stringify({ error: e.message })); }
  }
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 850 } });
  // The wizard checks below start from a fresh page; the app itself now defaults to the letter flow.
  await context.addInitScript(() => { const key = 'love-interpreter.onboarding-flow.v1'; if (!localStorage.getItem(key)) localStorage.setItem(key, 'wizard'); });
  const page = await context.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', e => errors.push(e.message));
  const $ = id => page.locator('#' + id);
  const evidence = new URL('../.manual-test/history/', import.meta.url); await mkdir(evidence, { recursive: true });
  const capture = async name => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.evaluate(() => { const box = document.querySelector('.chat-composer').getBoundingClientRect(); return box.bottom <= innerHeight + 1 && box.top >= 0; }));
    assert.equal(await page.locator('#out').count(), 1);
    if (await page.locator('.chat-turn').count()) {
      assert.equal(await page.locator('#activeTurn #out').count(), 1);
      assert.equal(await page.locator('#resultDock #out').count(), 0);
    }
    await page.screenshot({ path: new URL(name + '.png', evidence).pathname, fullPage: true, animations: 'disabled' });
  };
  const decode = async text => {
    await $('text').fill(text); await $('go').click();
    await page.waitForFunction(() => document.getElementById('loading').hidden);
  };
  await page.goto(origin); await $('setupNext').click(); await $('chooseGf').click(); await $('setupNext').click();
  await $('setupName').fill('Mai'); await $('reviewSetup').click(); await $('confirmSetup').click();
  await page.locator('#contextMenu > summary').click(); await $('context').fill('Vừa tan ca'); await decode('Em đang bận');
  assert.equal(await $('go').isDisabled(), true); await capture('first-mobile');
  await $('chooseAvoid').click(); assert.equal(await $('followup').textContent(), 'Cô ấy trả lời thế nào?');
  await page.locator('#chosenResponse > summary').click(); await $('sentReply').fill('Anh chờ em nhé');
  fail = true; await decode('Ừ'); assert.equal(await $('turnCount').textContent(), 'Lượt 1/10');
  assert.equal(await $('text').inputValue(), 'Ừ'); assert.equal(await page.locator('#conversationLog .incoming').count(), 1);
  fail = false; await decode('Ừ');
  assert.equal(requests.at(-1).context, 'Vừa tan ca'); assert.equal(requests.at(-1).history[0].selection, 'avoid');
  assert.equal(requests.at(-1).history[0].sentReply, 'Anh chờ em nhé');
  await $('chooseReply').click();
  assert.equal(await $('chooseReply').textContent(), '✓ Đã chọn');
  assert.equal(await $('chooseReply').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#conversationLog .incoming').count(), 2);
  assert.equal(await page.locator('#conversationLog .outgoing').count(), 2);
  assert.equal(await page.locator('#conversationLog .outgoing p').first().textContent(), 'Anh chờ em nhé');
  await capture('followup-collapsed-mobile');
  await page.locator('#conversationLog details summary').first().focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#conversationLog details').first().getAttribute('open'), '');
  await capture('followup-mobile');
  await page.reload(); await page.locator('#historyPanel > summary').click(); await $('historyList button').first().click();
  assert.equal(await $('turnCount').textContent(), 'Lượt 2/10'); assert.equal(await $('context').inputValue(), 'Vừa tan ca');
  for (let i = 3; i <= 10; i++) { await decode('Tin nhắn ' + i); await $('chooseReply').click(); }
  assert.equal(await $('go').isDisabled(), true); assert.equal(await $('turnCount').textContent(), 'Lượt 10/10');
  assert.equal(await page.locator('#activeAnalysis').getAttribute('open'), null); await capture('limit-mobile');
  await page.setViewportSize({ width: 1100, height: 850 }); await capture('history-desktop');
  await page.goto(origin + '/?limit=15'); await page.locator('#historyPanel > summary').click(); await $('historyList button').first().click();
  assert.equal(await $('go').isEnabled(), true); await decode('Lượt 11'); assert.equal(await $('turnCount').textContent(), 'Lượt 11/15');
  await page.locator('#chatTools > summary').click(); await $('saveConversation').click(); await page.reload(); await page.locator('#historyPanel > summary').click(); await $('historyList button').first().click();
  assert.equal(await $('chooseReply').isEnabled(), true); assert.equal(await $('go').isDisabled(), true);
  await $('chooseReply').click();
  await page.locator('#chatTools > summary').click(); await $('newConversation').click();
  await $('file').setInputFiles({ name: 'chat.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
  await $('go').click(); await $('out').waitFor({ state: 'visible' });
  await $('sourceText').fill('Đã sửa lời trong ảnh'); await $('chooseReply').click();
  assert.ok(await page.evaluate(() => !localStorage.getItem(HISTORY_KEY).includes('data:image')));
  await page.locator('#historyPanel > summary').click(); await $('historyList button').nth(1).click(); assert.equal(await $('turnCount').textContent(), 'Lượt 0/15');
  await page.evaluate(() => { profile.language = 'en'; enterApp(); newConversation(); });
  await decode('A long message ' + 'with context '.repeat(25));
  assert.equal(await $('chooseReply').textContent(), 'Choose & continue');
  await capture('result-en-desktop');
  await $('chooseAvoid').click();
  assert.equal(await $('chooseAvoid').textContent(), '✓ Selected');
  await page.setViewportSize({ width: 375, height: 850 }); await capture('chat-en-mobile');
  await page.setViewportSize({ width: 375, height: 450 }); await capture('chat-short-viewport');
  const mobileViewports = [[320, 568], [360, 640], [390, 844], [430, 932], [667, 375], [375, 320], [768, 1024]];
  await page.evaluate(() => {
    profile.partnerName = conversation.profile.partnerName = 'Alexandria '.repeat(5).trim();
    enterApp(); $('context').value = 'Long context '.repeat(50); $('context').oninput();
  });
  for (const [width, height] of mobileViewports) {
    await page.setViewportSize({ width, height });
    await $('text').fill('A long draft '.repeat(30));
    const geometry = await page.evaluate(() => {
      const rect = selector => { const b = document.querySelector(selector).getBoundingClientRect(); return { width: b.width, height: b.height, top: b.top, bottom: b.bottom }; };
      return { tools: rect('#chatTools > summary'), plus: rect('#contextMenu > summary'), composer: rect('.chat-composer'), draft: rect('#text'), scroll: rect('#chatScroll'), textareaFont: parseFloat(getComputedStyle($('sentReply')).fontSize) };
    });
    assert.ok(geometry.tools.width >= 44 && geometry.plus.width >= 44, `Touch targets ${width}x${height}`);
    assert.ok(geometry.composer.bottom <= height + 1 && geometry.scroll.height >= 40, `Chat space ${width}x${height}`);
    assert.ok(geometry.draft.height <= (height <= 500 ? 48 : 96) + 1, 'Long draft stays scrollable within the composer');
    assert.ok(geometry.textareaFont >= 16, 'Editable replies should not trigger iOS input zoom');
    for (const id of ['historyPanel', 'chatTools', 'contextMenu']) {
      await page.evaluate(id => { for (const key of ['historyPanel', 'chatTools', 'contextMenu']) $(key).open = key === id; }, id);
      const bounds = await page.locator(`#${id} > .menu-content`).boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, `Menu ${id} ${width}x${height}`);
    }
    await $('closeContext').click();
    assert.equal(await $('contextMenu').getAttribute('open'), null);
    await page.evaluate(() => { for (const id of ['historyPanel', 'chatTools', 'contextMenu']) $(id).open = false; });
    await capture(`responsive-${width}-${height}`);
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-report.json', evidence), JSON.stringify({ ok: true, date: '2026-10-12', api: 'mock with real parseRequest validation', viewports: [[375, 850], [1100, 850], ...mobileViewports], checks: ['reply/avoid selection', 'ordered context and actual reply', 'error/retry without counting', 'reload/resume/delete', 'limit 10 and setting 15', 'saved pending choice', 'corrected image text without base64', 'no horizontal overflow', 'incoming/outgoing bubbles', 'expandable analysis', 'selected aria-pressed state', 'one timeline with inline active result', 'collapse after selection', 'composer remains visible', 'history/context menus', '44px mobile touch targets', 'long names and drafts', 'mobile menu bounds and Done action'], errors }, null, 2));
  console.log('History and responsive browser checks passed (API mocked): choices/context/retries/reload, limits, images; desktop 1100px and mobile 320–768px, landscape 667x375, short viewport 375x320, long names/drafts, touch targets and menu bounds.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
