import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { executeCase } from './manual-cases.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export function readCases(markdown) {
  return [...markdown.matchAll(/^## (TC\d{2}) — (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].map(([, id, title, body]) => ({
    id: id.toLowerCase(), title, body: body.trim(),
    expected: (body.match(/\*\*(?:Mong đợi|Expected):\*\*\s*([^\n]+)/)?.[1] || '').trim(),
  }));
}

export function options(args) {
  const { values } = parseArgs({ args, options: {
    url: { type: 'string', default: 'http://127.0.0.1:3000' },
    cases: { type: 'string', default: 'all' },
    voice: { type: 'string', default: 'mac' },
    help: { type: 'boolean', default: false },
    hub: { type: 'boolean', default: false },
  } });
  const url = new URL(values.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('URL phải là http/https và không chứa thông tin đăng nhập.');
  if (!['mac', 'off'].includes(values.voice)) throw new Error('--voice: mac hoặc off.');
  const ids = values.cases === 'all' ? null : values.cases.toLowerCase().split(',');
  if (ids && (!ids.length || ids.some(id => !/^tc(0[1-9]|1[0-2])$/.test(id)) || new Set(ids).size !== ids.length)) throw new Error('--cases: all hoặc TC01,TC02,...,TC12; không lặp case.');
  return { ...values, ids, url: url.href };
}

export function automaticResult(problem) {
  return {
    status: problem ? 'fail' : 'blocked',
    note: problem ? 'Automatic checks failed: ' + problem.message : 'Automatic checks completed. Manual review of content, microphone, audio and real-device behavior is still pending.',
  };
}

export function speakMac(text, { launch = spawn, signal } = {}) {
  return new Promise((resolve, reject) => {
    // say takes words per minute: 175 baseline at 1.15x is 201.25.
    const child = launch('/usr/bin/say', ['-v', 'Samantha', '-r', '201.25'], { stdio: ['pipe', 'ignore', 'ignore'], signal, timeout: 120000 });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('macOS Samantha could not speak. Check installed voices in System Settings.')));
    child.stdin.on('error', reject);
    child.stdin.end(text);
  });
}

export async function chatFixture(page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 850; canvas.height = 230;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 850, 230);
    ctx.fillStyle = '#111111'; ctx.font = '28px sans-serif';
    ctx.fillText('CHAT GIẢ DÙNG ĐỂ TEST', 28, 50);
    ctx.fillText('Anh: Anh xin lỗi vì quên hẹn.', 28, 115);
    ctx.fillText('Em: Em không sao đâu.', 28, 175);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name: 'chat-demo.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

export async function snapshot(page) {
  return page.evaluate(() => ({
    text: document.getElementById('text').value, context: document.getElementById('context').value,
    direction: dir,
    resultVisible: !document.getElementById('out').hidden,
    ...Object.fromEntries(['meaning', 'reply', 'avoid', 'dangerNum', 'err'].map(id => [id, document.getElementById(id).textContent])),
  }));
}

export async function prepareApp(page) {
  const setup = page.locator('#onboarding');
  if (await setup.count()) {
    if (!(await setup.isVisible())) await page.locator('#settings').click();
    if (await setup.isVisible()) {
      await page.locator('#setupLanguage').selectOption('vi');
      await page.locator('#setupNext').click();
      await page.locator('#chooseGf').click();
      await page.locator('#setupNext').click();
      await page.locator('#setupName').fill('Mai Demo');
      await page.locator('#reviewSetup').click();
      await page.locator('#confirmSetup').click();
    }
  }
}

async function main() {
  const config = options(process.argv.slice(2));
  if (config.help) {
    console.log('npm run demo:manual -- [--url http://127.0.0.1:3000] [--cases TC01,TC02] [--voice mac|off]\nMặc định: đủ 12 case, voice macOS Samantha local, English, 1.15x, không gọi API TTS. off: tắt voice.\nChuẩn bị: npm install; npx playwright install chromium; chạy app có backend và npm run hub.\nRuns sequentially without confirmation. Stop from Hub or press Ctrl+C. Automatic checks do not mark manual tests as passed.');
    return;
  }
  const cases = readCases(await readFile(join(root, 'docs/manual-demo-en.md'), 'utf8'));
  const selected = config.ids ? config.ids.map(id => cases.find(c => c.id === id)) : cases;
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false, slowMo: 150, args: ['--autoplay-policy=no-user-gesture-required'] });
  const output = join(root, '.manual-test'), runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const directory = join(output, runId), report = { version: 1, runId, url: config.url, voice: config.voice, mode: 'automatic', cases: {} };
  let current, voiceDisabled = false, stopped = false;
  const speech = new AbortController();
  const interrupt = () => { speech.abort(); stopped = true; void browser.close(); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    await mkdir(directory, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
    const page = await context.newPage();
    async function say(text) {
      console.log('\n' + text);
      await page.bringToFront();
      if (process.platform === 'darwin') {
        await promisify(execFile)('/usr/bin/open', ['-a', chromium.executablePath().split('/Contents/MacOS/')[0]])
          .catch(() => console.warn('Could not activate the browser window; select the test window manually.'));
      }
      if (config.voice === 'off' || voiceDisabled) return;
      try {
        await speakMac(text, { signal: speech.signal });
      } catch (e) { voiceDisabled = true; console.warn(e.message + ' Voice disabled for the remaining steps; written instructions remain available.'); }
    }
    async function persist() {
      // shortcut: latest-report sync supports one runner at a time; add locking if concurrent demos are needed.
      const json = JSON.stringify(report, null, 2);
      await writeFile(join(directory, 'results.json'), json, { mode: 0o600 });
      const temp = join(output, 'results.tmp');
      await writeFile(temp, json, { mode: 0o600 }); await rename(temp, join(output, 'results.json'));
    }
    let evidence;
    page.on('request', request => {
      if (!evidence || !['/api/translate', '/api/speak'].includes(new URL(request.url()).pathname)) return;
      let data; try { data = request.postDataJSON(); } catch { return; }
      if (data?.image) data.image = `[data URL: ${data.image.length} ký tự]`;
      evidence.requests.push({ path: new URL(request.url()).pathname, data });
    });
    await page.goto(config.url); page.setDefaultTimeout(35000); await prepareApp(page);
    const chatImage = await chatFixture(page);
    console.log(`Bằng chứng local: ${directory}\nMở http://127.0.0.1:8765/#tests để đồng bộ bằng chứng tự động. API thật có thể phát sinh phí. Dùng dữ liệu giả.`);
    for (const item of selected) {
      current = item.id; evidence = { case: current, steps: [], requests: [], snapshots: [], browser: browser.version() };
      await context.setOffline(false); await page.setViewportSize({ width: 1100, height: 850 });
      await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto(config.url); await prepareApp(page); await page.bringToFront();
      await say(`Check test case ${current.toUpperCase()}. ${item.title}.`);
      console.log(item.body);
      const capture = async () => {
        evidence.snapshots.push(await snapshot(page));
        await page.screenshot({ path: join(directory, `${current}-${evidence.snapshots.length}.png`), fullPage: true, animations: 'disabled' });
      };
      const manual = async text => {
        await say("Manual review pending; continuing automatically. " + text);
        evidence.steps.push({ manual: text, confirmed: false });
        await page.waitForTimeout(1500);
      };
      let problem = null;
      try {
        await executeCase(current, { page, context, chatImage, capture, manual, step: async (text, action) => {
          await say(text); await action(); evidence.steps.push({ action: text, checked: true });
        } });
        await say('Check the output values. ' + item.expected);
        const actual = await snapshot(page);
        if (actual.resultVisible) await say(`The displayed danger score is ${actual.dangerNum}. Review the actual meaning, suggested reply, and what to avoid in the app. The Vietnamese output is kept unchanged for comparison.`);
      } catch (e) {
        if (stopped) break;
        problem = e; console.error('Not completed: ' + e.message);
        await capture().catch(() => {});
      } finally { await context.setOffline(false).catch(() => {}); }
      const result = automaticResult(problem);
      await writeFile(join(directory, current + '.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 });
      report.cases[current] = { ...result, note: result.note + '\nEvidence: .manual-test/' + runId + '/' + current + '.json', completedAt: new Date().toISOString() };
      await persist();
      await say(`Demo case ${current.toUpperCase()} completed. ${problem ? 'Automatic checks failed. See the evidence.' : 'Automatic checks passed. Manual review is still pending.'}`);
    }
    console.log(`\nĐã lưu ${Object.keys(report.cases).length} case demo. Bằng chứng: ${directory}`);
  } finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    speech.abort(); await browser.close();
    await unlink(join(output, 'results.tmp')).catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
