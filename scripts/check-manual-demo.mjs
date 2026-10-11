import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, rm, mkdtemp, writeFile, copyFile, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { parseRequest } from '../api/translate.js';
import { createHub } from './project-hub.mjs';
import { executeCase } from './manual-cases.mjs';
import { readCases, chatFixture, snapshot, prepareApp } from './manual-demo.mjs';

const html = await readFile(new URL('../index.html', import.meta.url));
const cases = readCases(await readFile(new URL('../docs/manual-test.md', import.meta.url), 'utf8'));
const root = await mkdtemp(join(tmpdir(), 'manual-demo-check-'));
const evidence = new URL('../.manual-test/verification/', import.meta.url);
let browser, requests = 0, server, hubServer, hub;
try {
  await mkdir(evidence, { recursive: true });
  server = createServer(async (req, res) => {
    try {
      if (/^\/(css|js)\/[\w-]+\.(css|js)$/.test(req.url)) { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(new URL('..' + req.url, import.meta.url))); return; }
      if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
      if (['/assets/tim-bot/tim-bot-atlas.png', '/assets/tim-bot/concept-v1/tim-bot.png'].includes(req.url)) { res.setHeader('Content-Type', 'image/png'); res.end(await readFile(new URL('..' + req.url, import.meta.url))); return; }
      if (req.url === '/api/translate') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const input = parseRequest(JSON.parse(Buffer.concat(chunks).toString()));
        requests++;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ meaning: `Mock ${requests}: ${input.context.slice(0, 250) || 'Có thể cần hỏi thêm.'}`, sourceText: input.text || 'Em không sao đâu', reply: 'Mình nghe bạn đây.', avoid: 'Có vậy cũng giận.', danger: [0, 39, 40, 69, 70, 100][requests % 6] })); return;
      }
      res.writeHead(404); res.end();
    } catch (e) { res.writeHead(e.status || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const page = await context.newPage(); page.setDefaultTimeout(5000);
  await page.goto(url); await prepareApp(page); const chatImage = await chatFixture(page);
  let checkpoints = 0, captures = 0;
  for (const item of cases) {
    await context.setOffline(false); await page.setViewportSize({ width: 1100, height: 850 });
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto(url); await prepareApp(page);
    await executeCase(item.id, {
      page, context, chatImage,
      step: async (text, action) => { assert.match(text, /^[\x00-\x7F]+$/); return action(); },
      manual: async text => { assert.match(text, /^[\x00-\x7F]+$/); checkpoints++; },
      capture: async () => {
        const state = await snapshot(page); assert.equal(typeof state.text, 'string'); captures++;
        if (item.id === 'tc01' || item.id === 'tc10') await page.screenshot({ path: new URL(`${item.id}-${page.viewportSize().width}.png`, evidence).pathname, fullPage: true, animations: 'disabled' });
      },
    });
    console.log(`${item.id.toUpperCase()}: thao tác/assertion qua backend MOCK hoàn tất; checkpoint manual chưa thực hiện.`);
  }
  assert.ok(checkpoints >= 9); assert.ok(captures >= 20);

  // Exercise the real polling script and authenticated Hub route without writing a manual verdict to the repo.
  await mkdir(join(root, 'docs')); await mkdir(join(root, '.manual-test'));
  await writeFile(join(root, 'docs/project-hub.html'), await readFile(new URL('../docs/project-hub.html', import.meta.url)));
  await writeFile(join(root, 'docs/hub-tools.js'), await readFile(new URL('../docs/hub-tools.js', import.meta.url)));
  hubServer = createServer();
  await new Promise((resolve, reject) => { hubServer.once('error', reject); hubServer.listen(0, '127.0.0.1', resolve); });
  hub = createHub({ root, port: hubServer.address().port }); hubServer.on('request', hub.handler);
  await page.goto(`http://127.0.0.1:${hubServer.address().port}`);
  await page.locator('#tc01 > summary').click();
  await page.locator('#tc02 > summary').click();
  await page.locator('[data-store="tc01-note"]').fill('Giữ ghi chú cũ');
  await page.locator('[data-store="tc02-status"]').selectOption('fail');
  await writeFile(join(root, '.manual-test/results.json'), JSON.stringify({ version: 1, runId: 'mock-check', cases: { tc01: { status: 'pass', note: 'Mock only', completedAt: new Date().toISOString() } } }));
  await page.waitForFunction(() => document.querySelector('[data-store="tc01-status"]').value === 'pass');
  assert.match(await page.locator('[data-store="tc01-note"]').inputValue(), /^Giữ ghi chú cũ/);
  assert.equal(await page.locator('[data-store="tc02-status"]').inputValue(), 'fail');
  await page.locator('[data-store="tc01-status"]').selectOption('blocked'); await page.reload();
  await page.waitForFunction(() => document.getElementById('runnerStatus').textContent.includes('Đã kết nối'));
  assert.equal(await page.locator('[data-store="tc01-status"]').inputValue(), 'blocked');
  await mkdir(join(root, 'scripts'));
  for (const name of ['manual-demo.mjs', 'manual-cases.mjs']) await copyFile(new URL(name, import.meta.url), join(root, 'scripts', name));
  await copyFile(new URL('../docs/manual-test.md', import.meta.url), join(root, 'docs/manual-test.md'));
  await copyFile(new URL('../docs/manual-demo-en.md', import.meta.url), join(root, 'docs/manual-demo-en.md'));
  await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir');
  await page.locator('#demoAll').uncheck();
  await page.locator('[data-task="demo"]').click();
  assert.match(await page.locator('#runnerStatus').textContent(), /Chọn ít nhất/);
  await page.locator('[data-demo-case][value="tc01"]').check();
  await page.locator('[data-demo-case][value="tc07"]').check();
  await page.locator('#demoVoice').selectOption('off'); await page.locator('#demoUrl').fill(url);
  await page.locator('[data-task="demo"]').click();
  try {
    await page.waitForFunction(() => document.getElementById('taskSummary').textContent.includes('demo: Thành công'), null, { timeout: 60000 });
  } catch (e) { throw new Error(e.message + '\\n' + (await hub.state()).job?.log); }
  const state = await hub.state();
  assert.equal(state.job.prompt, null);
  assert.match(state.job.log, /Check test case TC01/);
  assert.ok(state.job.log.indexOf('Demo case TC01 completed') < state.job.log.indexOf('Check test case TC07'));
  assert.match(state.job.log, /Demo case TC07 completed/);
  assert.match(state.job.log, /The displayed danger score is/);
  assert.equal(await page.locator('#demoPrompt').count(), 0);
  const report = JSON.parse(await readFile(join(root, '.manual-test/results.json'), 'utf8'));
  assert.equal(report.mode, 'automatic');
  assert.deepEqual(Object.keys(report.cases), ['tc01', 'tc07']);
  for (const result of Object.values(report.cases)) assert.equal(result.status, 'blocked');
  await page.waitForFunction(() => document.querySelector('[data-store="tc07-note"]').value.includes('Manual review'));
  assert.equal(await page.locator('[data-store="tc01-status"]').inputValue(), 'blocked');
  assert.equal(await page.locator('[data-store="tc07-status"]').inputValue(), 'pending');
  for (const width of [1100, 375]) {
    await page.setViewportSize({ width, height: 850 });
    await page.locator('#manual-demo').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#manual-demo').screenshot({ path: new URL(`hub-demo-${width}.png`, evidence).pathname, animations: 'disabled', style: 'nav { visibility: hidden !important; }' });
  }
  assert.match(await page.locator('[data-store="tc01-note"]').inputValue(), /^Giữ ghi chú cũ/);
  console.log('Hub demo: two cases run sequentially without answers or prompts; evidence sync preserves manual verdicts and notes; desktop/mobile layout passes.');
  console.log(`Smoke check: 12 luồng, ${requests} request mock, ${captures} snapshot, ${checkpoints} điểm dừng manual được giữ lại. Hub đồng bộ, giữ ghi chú và không phát lại report cũ. Không ghi Pass manual thật, không gọi OpenAI.`);
} finally {
  hub?.stop();
  await browser?.close();
  for (const service of [server, hubServer]) if (service) { service.closeAllConnections(); await new Promise(resolve => service.close(resolve)); }
  await rm(root, { recursive: true, force: true });
}
