import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const evidence = new URL('.manual-test/tim-bot/', root);
const files = new Map(await Promise.all(['index.html', 'css/app.css', 'css/onboarding.css', 'js/i18n.js', 'js/app.js', 'js/flows.js', 'js/onboarding.js', 'assets/tim-bot/tim-bot-atlas.png', 'assets/tim-bot/concept-v1/tim-bot.png'].map(async path => [path === 'index.html' ? '/' : '/' + path, await readFile(new URL(path, root))])));
const server = createServer((req, res) => {
  const file = files.get(req.url);
  res.writeHead(file ? 200 : 404, { 'Content-Type': req.url === '/' ? 'text/html; charset=utf-8' : req.url.endsWith('.css') ? 'text/css' : req.url.endsWith('.js') ? 'text/javascript' : 'image/png' });
  res.end(file);
});
let browser;
const errors = [];
try {
  await mkdir(evidence, { recursive: true });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 850 }, reducedMotion: 'no-preference' });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { const key = 'love-interpreter.onboarding-flow.v1'; if (!localStorage.getItem(key)) localStorage.setItem(key, 'wizard'); });
  await page.addInitScript(() => {
    window.Audio = class {
      constructor() { window.testAudio = this; }
      play() { this.onplaying?.(); return Promise.resolve(); }
      pause() { this.paused = true; this.onpause?.(); }
    };
  });
  let reply;
  await page.route('**/api/translate', route => new Promise(resolve => {
    reply = async () => { await route.fulfill({ json: { danger: 40, meaning: 'Có thể người ấy cần được lắng nghe.', reply: 'Mình nghe bạn đây.', avoid: 'Có vậy cũng giận.' } }); resolve(); };
  }));
  await page.route('**/api/speak', route => route.fulfill({ body: 'mock audio', contentType: 'audio/mpeg' }));
  await page.clock.install();
  await page.goto(origin);
  const state = id => page.locator('#' + id).getAttribute('data-state');
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.clock.fastForward(12001);
  assert.equal(await state('setupBot'), 'greet');
  await page.locator('#setupNext').click();
  await page.locator('#chooseGf').click();
  await page.locator('#setupNext').click();
  await page.locator('#setupName').fill('M');
  await page.evaluate(() => animateBot(document.getElementById('setupBot'), 'greet'));
  await page.clock.fastForward(11000);
  assert.equal(await state('setupBot'), 'greet');
  await page.clock.fastForward(13000);
  assert.equal(await state('setupBot'), 'input');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => animateBot(document.getElementById('setupBot'), 'idle'));
  await page.locator('#setupBot').hover({ force: true });
  await page.clock.fastForward(24000);
  assert.equal(await state('setupBot'), 'idle');
  assert.equal(await page.locator('#setupBot').evaluate(bot => getComputedStyle(bot).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: true }));
  await page.clock.fastForward(24000);
  assert.equal(await state('setupBot'), 'idle');
  await page.evaluate(() => { delete document.hidden; });
  await page.mouse.move(0, 0); await page.locator('#setupBot').hover({ force: true });
  assert.equal(await state('setupBot'), 'greet');
  await page.evaluate(() => {
    window.oldGesture = document.getElementById('setupBot').getAnimations().find(animation => animation.animationName === 'bot-frames');
    window.oldGesture.finish();
  });
  await page.mouse.move(0, 0); await page.locator('#setupBot').hover({ force: true });
  assert.ok(await page.evaluate(() => document.getElementById('setupBot').getAnimations().some(animation => animation.animationName === 'bot-frames' && animation !== window.oldGesture && animation.playState === 'running')));

  await page.locator('#setupBack').click();
  assert.equal(await state('setupBot'), 'choose');
  await page.locator('#chooseGf').click();
  await page.locator('#setupNext').click();
  await page.locator('#setupName').fill('Mai');
  assert.equal(await state('setupBot'), 'input');
  await noOverflow();
  await page.screenshot({ path: new URL('onboarding-mobile.png', evidence).pathname, fullPage: true });
  await page.locator('#reviewSetup').click(); await page.locator('#confirmSetup').click();
  await page.locator('#text').fill('Anh bận chút');
  assert.equal(await state('inputBot'), 'input');
  await page.locator('#go').click();
  await page.locator('#loading').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#loading .tim-bot').getAttribute('data-state'), 'waiting');
  await page.evaluate(() => { window.waitingAnimation = document.querySelector('#loading .tim-bot').getAnimations()[0]; });
  await page.locator('#loading .tim-bot').hover({ force: true });
  await page.clock.fastForward(24000);
  assert.ok(await page.evaluate(() => document.querySelector('#loading .tim-bot').getAnimations()[0] === window.waitingAnimation));

  await page.screenshot({ path: new URL('waiting-mobile.png', evidence).pathname, fullPage: true });
  await reply();
  await page.locator('#out').waitFor({ state: 'visible' });
  await page.locator('#speak').click();
  await page.waitForFunction(() => document.getElementById('resultBot').dataset.state === 'reading');
  assert.equal(await page.locator('#speak').isDisabled(), true);
  await page.evaluate(() => { window.readingAnimation = document.getElementById('resultBot').getAnimations()[0]; });
  await page.locator('#resultBot').hover({ force: true });
  await page.clock.fastForward(24000);
  assert.equal(await state('resultBot'), 'reading');
  assert.ok(await page.evaluate(() => document.getElementById('resultBot').getAnimations()[0] === window.readingAnimation));

  await noOverflow();
  await page.screenshot({ path: new URL('reading-mobile.png', evidence).pathname, fullPage: true });
  await page.evaluate(() => window.testAudio.onended());
  assert.equal(await state('resultBot'), 'idle');
  assert.equal(await page.locator('#speak').isEnabled(), true);
  assert.ok(await page.locator('#resultBot').evaluate(bot => bot.getAnimations().some(animation => animation.animationName === 'bot-breathe' && animation.effect.getTiming().iterations === Infinity)));
  await page.mouse.move(0, 0);
  await page.locator('#resultBot').hover({ force: true });
  assert.equal(await state('resultBot'), 'greet');
  await page.clock.fastForward(24000);
  assert.equal(await state('resultBot'), 'greet');

  await page.setViewportSize({ width: 1100, height: 850 });
  await noOverflow();
  await page.screenshot({ path: new URL('result-desktop.png', evidence).pathname, fullPage: true });

  // Inspect the actual CSS animation over one cycle, including the last-to-first seam.
  await page.goto(origin);
  const states = ['greet', 'choose', 'input', 'waiting', 'reading'];
  await page.setContent(`<base href="${origin}/"><link rel="stylesheet" href="css/app.css"><main><h1>Tim Bot · 112px</h1><div style="display:flex;gap:32px">${states.map(name => `<div><span class="tim-bot" data-state="${name}" style="animation-play-state:paused" aria-hidden="true"></span><p>${name}</p></div>`).join('')}</div></main>`);
  await page.locator('.tim-bot').first().waitFor();
  await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())); const atlas = new Image(); atlas.src = 'assets/tim-bot/tim-bot-atlas.png'; await atlas.decode(); if (atlas.naturalWidth !== 1024 || atlas.naturalHeight !== 1280) throw new Error('Unexpected runtime atlas layout'); });
  const manifest = JSON.parse(await readFile(new URL('assets/tim-bot/manifest.json', root)));
  const sampledPositions = [];
  for (const phase of [0, 1, 2, 3, 4]) {
    sampledPositions.push(await page.evaluate(phase => [...document.querySelectorAll('.tim-bot')].map(bot => {
      const animation = bot.getAnimations().find(animation => animation.animationName === 'bot-frames');
      animation.pause(); animation.currentTime = (phase % 4 + .1) * animation.effect.getTiming().duration / 4;
      return { state: bot.dataset.state, x: getComputedStyle(bot).backgroundPositionX, y: getComputedStyle(bot).backgroundPositionY };
    }), phase));
    for (const position of sampledPositions.at(-1)) {
      const rect = manifest.frame_layout.rows[position.state][phase % 4];
      assert.equal(position.x, `${-rect.x / rect.w * 112}px`);
      assert.equal(position.y, `${-rect.y / rect.h * 112}px`);
    }
    await page.screenshot({ path: new URL(`cycle-${phase}.png`, evidence).pathname });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.deepEqual(await page.locator('.tim-bot').evaluateAll(bots => bots.map(bot => getComputedStyle(bot).animationName)), states.map(() => 'none'));
  await page.screenshot({ path: new URL('reduced-motion.png', evidence).pathname });
  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-report.json', evidence), JSON.stringify({ ok: true, date: '2026-10-11', mock: 'API responses and audio playback events', viewports: [375, 1100], states, sampledPositions, reducedMotion: true, hoverReplay: true, automaticGestures: true, hiddenPageSuppressed: true, activeLoopsPreserved: true, errors }, null, 2));
  console.log('Tim Bot browser checks passed: five states, hover replay, 12s idle gestures, hidden-page/reduced-motion suppression, active loops preserved, playback lifecycle, sprite positions, 375/1100px. API/audio mocked.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
