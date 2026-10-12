import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const html = await readFile(new URL('../index.html', import.meta.url));
const requests = [], errors = [];
let voice = { language: 'en', direction: 'gf', partnerName: 'Emma', transcript: 'Use English. Decode my girlfriend. Her name is Emma.' };
let voiceFailure = false;
const server = createServer(async (req, res) => {
  if (/^\/(css|js)\/[\w-]+\.(css|js)$/.test(req.url)) { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(new URL('..' + req.url, import.meta.url))); return; }
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
      if (['/assets/tim-bot/tim-bot-atlas.png', '/assets/tim-bot/concept-v1/tim-bot.png', '/assets/tim-bot/favicon.png'].includes(req.url)) { res.setHeader('Content-Type', 'image/png'); res.end(await readFile(new URL('..' + req.url, import.meta.url))); return; }
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  requests.push({ url: req.url, body });
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/onboarding') {
    assert.match(body.audio, /^data:audio\//);
    if (voiceFailure) { res.writeHead(502); res.end(JSON.stringify({ error: 'Could not understand the setup. Record again or enter it manually.' })); }
    else res.end(JSON.stringify(voice));
  } else if (req.url === '/api/translate') res.end(JSON.stringify({ meaning: 'They may need reassurance.', reply: 'I am here for you.', avoid: 'Calm down.', danger: 85 }));
  else if (req.url === '/api/speak') { res.writeHead(502); res.end(JSON.stringify({ error: 'Mock audio unavailable.' })); }
  else { errors.push('Unexpected request ' + req.url); res.writeHead(404); res.end('{}'); }
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 375, height: 850 } });
  // The wizard checks below start from a fresh page; the app itself now defaults to the letter flow.
  await context.addInitScript(() => { const key = 'love-interpreter.onboarding-flow.v1'; if (!localStorage.getItem(key)) localStorage.setItem(key, 'wizard'); });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message));
  const $ = id => page.locator(`#${id}`);
  const screenshot = async name => {
    await mkdir(new URL('../.manual-test/onboarding/', import.meta.url), { recursive: true });
    await page.screenshot({ path: new URL(`../.manual-test/onboarding/${name}.png`, import.meta.url).pathname, fullPage: true, animations: 'disabled' });
  };
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const record = async () => {
    await $('recordSetup').click();
    await page.waitForFunction(() => document.getElementById('recordSetup').textContent === 'Stop and process');
    await page.waitForTimeout(450);
    await $('recordSetup').click();
    await page.waitForFunction(() => !document.getElementById('reviewSetup').disabled);
    assert.ok(await page.evaluate(() => !recording));
  };

  await page.goto(origin);
  assert.equal(await $('app').isVisible(), false);
  await $('setupLanguage').selectOption('en');
  assert.match(await $('setupBubble').textContent(), /I'm Tim/);
  assert.equal(await $('directionStep').isVisible(), false);
  await screenshot('welcome-en-mobile');
  await $('setupNext').click(); await $('setupNext').click();
  assert.equal(await $('setupError').isVisible(), true);
  await $('chooseGf').click();
  assert.equal(await $('chooseGf').getAttribute('aria-pressed'), 'true');
  await screenshot('partner-en-mobile');
  await $('setupNext').click(); await $('setupName').fill(' Emma ');
  await $('setupBack').click(); assert.equal(await $('setupDirection').inputValue(), 'gf');
  await $('setupNext').click(); assert.equal(await $('setupName').inputValue(), ' Emma ');
  await noOverflow(); await screenshot('manual-en-mobile');
  await $('reviewSetup').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('love-interpreter.preferences.v1')), null);
  assert.match(await $('setupSummary').textContent(), /English · Girlfriend · Emma/);
  await $('editSetup').click(); await $('setupName').fill('Emma');
  await $('reviewSetup').click(); await $('confirmSetup').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await $('go').getAttribute('aria-label'), 'Decode! ✨');
  assert.equal(await $('speak').textContent(), '🔊 Read aloud');
  assert.equal(await $('mic').getAttribute('aria-label'), 'Enter a message by voice');
  assert.equal(await $('inputTitle').textContent(), '💌 What did Emma say?');
  await $('text').fill("I'm fine"); await $('go').click(); await $('out').waitFor({ state: 'visible' });
  assert.equal(requests.at(-1).body.language, 'en'); assert.equal(requests.at(-1).body.partnerName, 'Emma');
  assert.equal(await $('dangerLabel').textContent(), 'Red alert');
  await screenshot('result-en-mobile'); await noOverflow();
  await page.reload(); assert.equal(await $('onboarding').isVisible(), false);
  assert.equal(await $('settings').textContent(), 'Start over');
  await page.evaluate(() => { document.getElementById('chatTools').open = true; }); await $('settings').click();
  assert.equal(await $('setupDirection').inputValue(), '');
  assert.equal(await $('setupName').inputValue(), '');
  await $('setupLanguage').selectOption('vi'); await $('cancelSetup').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  for (const language of ['vi', 'en']) for (const direction of ['gf', 'bf']) {
    await page.evaluate(() => { document.getElementById('chatTools').open = true; }); await $('settings').click(); await $('setupLanguage').selectOption(language); await $('setupNext').click(); await $(direction === 'bf' ? 'chooseBf' : 'chooseGf').click(); await $('setupNext').click();
    assert.equal(await $('setupName').inputValue(), '');
    await $('setupName').fill('Emma');
    await $('reviewSetup').click(); await $('confirmSetup').click();
    assert.equal(await page.locator('[data-dir]').count(), 0);
    await $('text').fill('Hello');
    await $('go').click(); await page.waitForFunction(() => document.getElementById('loading').hidden);
    assert.equal(requests.at(-1).body.language, language); assert.equal(requests.at(-1).body.direction, direction);
  }
  await page.evaluate(() => localStorage.clear()); await page.reload(); await $('setupLanguage').selectOption('en');
  await record();
  assert.equal(await $('setupName').inputValue(), 'Emma');
  assert.equal(await $('setupDirection').inputValue(), 'gf');
  assert.equal(await $('setupTranscript').textContent(), voice.transcript);
  assert.equal(await page.evaluate(() => localStorage.getItem('love-interpreter.preferences.v1')), null);
  await screenshot('voice-review-mobile');
  voice = { language: null, direction: 'bf', partnerName: null, transcript: 'Decode my boyfriend.' };
  await $('setupName').fill(''); await record();
  assert.equal(await $('setupName').inputValue(), '');
  assert.equal(await $('setupDirection').inputValue(), 'bf');
  await $('reviewSetup').click(); assert.equal(await $('setupReview').isVisible(), false);
  voiceFailure = true; await record(); assert.equal(await $('setupError').isVisible(), true);
  voiceFailure = false;
  const count = requests.length;
  await $('recordSetup').click(); await page.waitForFunction(() => document.getElementById('recordSetup').textContent === 'Stop and process');
  await $('cancelRecording').click(); await page.waitForTimeout(200);
  assert.equal(requests.length, count); assert.equal(await $('reviewSetup').isEnabled(), true);
  assert.ok(await page.evaluate(() => !recording));
  await page.setViewportSize({ width: 1100, height: 850 }); await screenshot('onboarding-desktop'); await noOverflow();
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('Permission denied'); }; });
  await $('recordSetup').click(); await $('setupError').waitFor({ state: 'visible' });
  assert.equal(await $('reviewSetup').isEnabled(), true);
  // A canceled pending permission request must release tracks when permission eventually resolves.
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.resolveMic = resolve; });
    window.stoppedTrack = false;
  });
  await $('recordSetup').click(); await $('cancelRecording').click();
  await page.evaluate(() => resolveMic({ getTracks: () => [{ stop() { window.stoppedTrack = true; } }] }));
  await page.waitForFunction(() => window.stoppedTrack);
  assert.equal(requests.length, count);

  // Demo switcher: letter, chat and swipe write the same profile as the wizard.
  const plain = await browser.newPage({ viewport: { width: 375, height: 850 } }); await plain.goto(origin);
  assert.equal(await plain.locator('#letterFlow').isVisible(), true); assert.equal(await plain.locator('#setupForm').isVisible(), false);
  assert.equal(await plain.locator('#flowCurrent').textContent(), 'Lá thư'); await plain.close();
  await page.setViewportSize({ width: 375, height: 850 });
  const fresh = async name => {
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await $('flowToggle').click(); await page.locator(`[data-flow="${name}"]`).click();
    assert.equal(await $('setupForm').isVisible(), false);
  };
  const decodesAs = async (language, direction, partnerName) => {
    await $('app').waitFor({ state: 'visible' });
    await $('text').fill('Hello'); await $('go').click(); await page.waitForFunction(() => document.getElementById('loading').hidden);
    const { body } = requests.at(-1);
    assert.deepEqual({ language: body.language, direction: body.direction, partnerName: body.partnerName }, { language, direction, partnerName });
  };
  await fresh('letter');
  await page.locator('#letterFlow label', { hasText: 'English' }).click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.locator('#letterFlow label', { hasText: 'girlfriend' }).click();
  await $('letterFlow').locator('[type="submit"]').click(); assert.equal(await $('setupError').isVisible(), true);
  await $('letterName').fill('Emma'); await noOverflow(); await screenshot('letter-en-mobile');
  await $('letterFlow').locator('[type="submit"]').click();
  await decodesAs('en', 'gf', 'Emma');
  await page.reload(); assert.equal(await $('flowCurrent').textContent(), 'Letter');
  await page.evaluate(() => { document.getElementById('chatTools').open = true; }); await $('settings').click(); assert.equal(await $('letterFlow').isVisible(), true);

  await fresh('chat');
  await page.locator('#chatReplies button', { hasText: 'Hello' }).click();
  await page.locator('#chatReplies button', { hasText: 'boyfriend' }).click();
  await $('chatName').fill('Alex'); await $('chatName').press('Enter');
  await page.locator('#chatReplies button', { hasText: 'Yep' }).waitFor();
  await noOverflow(); await screenshot('chat-en-mobile');
  await page.locator('#chatReplies button', { hasText: 'Yep' }).click();
  await decodesAs('en', 'bf', 'Alex');

  await fresh('chat'); voice = { language: 'en', direction: 'gf', partnerName: 'Emma', transcript: 'Use English. Decode my girlfriend. Her name is Emma.' };
  await page.locator('#chatReplies button', { hasText: 'Hello' }).click();
  await record();
  assert.match(await $('chatLog').textContent(), /Her name is Emma/);
  await page.locator('#chatReplies button', { hasText: 'Yep' }).click();
  await decodesAs('en', 'gf', 'Emma');

  await fresh('swipe');
  await $('swipeCard').focus(); await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.getElementById('swipeQuestion').textContent === 'Mình đọc vị ai giúp bạn?');
  const box = await $('swipeCard').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
  await $('swipeName').fill('Minh'); await noOverflow(); await screenshot('swipe-vi-mobile');
  await $('swipeName').press('Enter');
  assert.equal(await $('setupSummary').textContent(), 'Tiếng Việt · Bạn trai · Minh');
  await $('editSetup').click(); assert.equal(await $('swipeName').inputValue(), 'Minh');
  await $('swipeName').press('Enter'); await $('confirmSetup').click();
  await decodesAs('vi', 'bf', 'Minh');
  assert.deepEqual(errors, []);
  console.log('Onboarding browser checks passed: manual/review/restore, vi/en × gf/bf, real Chromium recorder with fake microphone, partial voice, retry, cancel, permission denial and pending permission cleanup; letter, chat (manual + voice) and swipe (keyboard + drag) flows with saved switcher choice; 9 screenshots. Backend mocked; no OpenAI calls or real microphone.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
