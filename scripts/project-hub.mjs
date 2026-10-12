import { createServer } from 'node:http';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { options as demoOptions } from './manual-demo.mjs';

export const models = [
  { id: 'gpt-5-mini', label: 'GPT-5 mini · hiện tại', effort: 'minimal' },
  { id: 'gpt-5', label: 'GPT-5 · bản đầy đủ', effort: 'minimal' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', effort: 'none' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', effort: 'none' },
];
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

// Replace only these settings; preserve API keys, comments and other variables.
export function changeModel(source, id) {
  const model = models.find(m => m.id === id);
  if (!model) throw bad('Model không hợp lệ.');
  let result = source;
  for (const [key, value] of Object.entries({ OPENAI_MODEL: id, OPENAI_REASONING_EFFORT: model.effort })) {
    const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=.*$`, 'gm');
    result = pattern.test(result) ? result.replace(pattern, `${key}=${value}`) : result.replace(/\s*$/, '') + `\n${key}=${value}\n`;
  }
  return result;
}

export function createHub({ root = fileURLToPath(new URL('../', import.meta.url)), launch = spawn, port = 8765 } = {}) {
  const token = randomBytes(32).toString('hex');
  const origin = `http://127.0.0.1:${port}`;
  let job = null, local = null, changing = false, dispatching = false;
  const running = entry => entry?.status === 'running';
  async function env() {
    try { return parseEnv(await readFile(resolve(root, '.env'), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
  }
  function stop(entry) {
    if (!running(entry)) return;
    entry.status = 'stopping';
    try { process.kill(-entry.child.pid, 'SIGTERM'); } catch { entry.child.kill('SIGTERM'); }
  }
  function start(kind, command, args, vars) {
    const entry = { kind, status: 'running', log: `$ ${command === process.execPath ? 'node' : command} ${args.join(' ')}\n`, exitCode: null };
    const append = chunk => {
      let text = String(chunk).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      for (const [key, value] of Object.entries({ ...process.env, ...vars })) if (/KEY|TOKEN|SECRET|PASSWORD/i.test(key) && value) text = text.split(value).join('[redacted]');
      entry.log = (entry.log + text).slice(-60000);
    };
    const child = launch(command, args, { cwd: root, env: { ...process.env, ...vars, NO_COLOR: '1' }, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe', ...(kind === 'demo' ? ['ipc'] : [])] });
    entry.child = child;
    if (kind === 'demo') child.on('message', message => {
      if (entry.status !== 'running' || message?.type !== 'manual-prompt' || !Number.isSafeInteger(message.id) || typeof message.text !== 'string' || message.text.length > 8000 || (message.allowed !== null && (!Array.isArray(message.allowed) || message.allowed.length > 8 || message.allowed.some(v => !['', 'p', 'f', 'b', 's', 'q'].includes(v))))) return;
      entry.prompt = { id: message.id, text: message.text, allowed: message.allowed };
    });
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.on('error', () => { entry.status = 'failed'; entry.prompt = null; append('\nKhông khởi chạy được lệnh. Kiểm tra Node.js / Vercel CLI / Playwright.\n'); });
    child.on('close', (code, signal) => {
      const stopped = entry.status === 'stopping';
      entry.status = stopped ? 'stopped' : code === 0 ? 'success' : 'failed';
      entry.exitCode = code;
      entry.prompt = null;
      append(`\n${stopped ? 'Đã dừng' : 'Kết thúc'} (code: ${code}, signal: ${signal || 'none'}).\n`);
      if (code && command === 'npx') append('Nếu thiếu CLI: chạy npm install -g vercel, vercel login và vercel link trong terminal.\n');
    });
    return entry;
  }
  const snapshot = entry => entry ? { kind: entry.kind, status: entry.status, log: entry.log, exitCode: entry.exitCode, prompt: entry.prompt || null } : null;
  async function state() {
    const vars = await env();
    return { models, model: vars.OPENAI_MODEL || 'gpt-5-mini', effort: vars.OPENAI_REASONING_EFFORT || 'minimal', hasKey: Boolean(vars.OPENAI_API_KEY || process.env.OPENAI_API_KEY), job: snapshot(job), local: snapshot(local), localUrl: 'http://127.0.0.1:3000' };
  }
  async function perform(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Request không hợp lệ.');
    const { task } = body;
    if (!['test', 'local', 'stop', 'model', 'deploy', 'demo', 'demo-answer', 'demo-stop'].includes(task)) throw bad('Task không hợp lệ.');
    if (task === 'stop') { stop(job); stop(local); return state(); }
    if (task === 'demo-stop') { if (job?.kind === 'demo') { stop(job); job.prompt = null; } return state(); }
    if (task === 'demo-answer') {
      if (job?.kind !== 'demo' || !running(job) || !job.prompt || body.id !== job.prompt.id) throw bad('Bước xác nhận đã thay đổi. Đợi Hub cập nhật rồi thử lại.', 409);
      if (typeof body.answer !== 'string' || body.answer.length > 6000 || (job.prompt.allowed && !job.prompt.allowed.includes(body.answer))) throw bad('Câu trả lời không hợp lệ.');
      const prompt = job.prompt;
      job.prompt = null;
      try { await new Promise((resolve, reject) => job.child.send({ type: 'manual-answer', id: body.id, answer: body.answer }, error => error ? reject(bad('Runner đã ngắt kết nối.', 409)) : resolve())); }
      catch (e) { if (running(job) && !job.prompt) job.prompt = prompt; throw e; }
      return state();
    }
    if (changing || running(job) || job?.status === 'stopping') throw bad('Task đang chạy, đợi hoàn tất hoặc bấm Dừng.', 409);
    if (task === 'model') {
      if (running(local) || local?.status === 'stopping') throw bad('Dừng app local trước khi đổi model, rồi khởi chạy lại.', 409);
      changing = true;
      const path = resolve(root, '.env'), temp = path + '.hub-tmp';
      try {
        let source = '';
        try { source = await readFile(path, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        const updated = changeModel(source, body.model);
        await writeFile(temp, updated, { mode: 0o600 });
        await rename(temp, path);
      } finally { await unlink(temp).catch(() => {}); changing = false; }
      return state();
    }
    const vars = await env();
    if (task === 'demo') {
      let config;
      try { config = demoOptions(['--cases', body.cases ?? 'all', '--voice', body.voice ?? 'mac', '--url', body.url ?? 'http://127.0.0.1:3000']); }
      catch (e) { throw bad(e.message); }
      job = start('demo', process.execPath, ['scripts/manual-demo.mjs', '--hub', '--cases', config.cases, '--voice', config.voice, '--url', config.url], vars);
    }
    if (task === 'test') job = start(task, process.execPath, ['--test'], vars);
    if (task === 'local') {
      if (running(local) || local?.status === 'stopping') throw bad('App local đã chạy hoặc đang dừng.', 409);
      local = start(task, 'npx', ['--no-install', 'vercel', 'dev', '--listen', '127.0.0.1:3000', '--yes'], vars);
    }
    if (task === 'deploy') {
      if (!['preview', 'production'].includes(body.target)) throw bad('Chọn Preview hoặc Production.');
      const model = models.find(m => m.id === (vars.OPENAI_MODEL || 'gpt-5-mini'));
      if (!model) throw bad('Chọn và lưu một model trong dropdown trước khi deploy.');
      const effort = vars.OPENAI_REASONING_EFFORT || 'minimal';
      if (effort !== model.effort) throw bad('Lưu lại model để reasoning effort khớp với preset.');
      await readFile(resolve(root, '.vercel/project.json')).catch(() => { throw bad('Chưa link project: chạy vercel login và vercel link trong terminal.'); });
      // The Hub stays local; ignore rules are required before allowing deployment.
      const ignore = await readFile(resolve(root, '.vercelignore'), 'utf8').catch(() => '');
      if (!['docs', 'scripts', 'test', '.manual-test', '.env', '.env.*', 'AGENTS.md'].every(item => ignore.split(/\r?\n/).includes(item))) throw bad('Thiếu quy tắc .vercelignore để giữ Hub và env ở local.');
      const args = ['--no-install', 'vercel', '--yes', '--env', `OPENAI_MODEL=${model.id}`, '--env', `OPENAI_REASONING_EFFORT=${effort}`];
      if (body.target === 'production') args.push('--prod');
      job = start(`deploy-${body.target}`, 'npx', args, vars);
    }
    return state();
  }
  async function action(body) {
    if (dispatching) throw bad('Task đang được xử lý, thử lại sau.', 409);
    dispatching = true;
    try { return await perform(body); } finally { dispatching = false; }
  }
  async function handler(req, res) {
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      if (req.headers.host !== `127.0.0.1:${port}`) throw bad('Host không hợp lệ.', 403);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      const path = req.url.split('?')[0];
      if (req.method === 'GET' && path.startsWith('/demo-app/')) {
        const asset = path.slice('/demo-app/'.length);
        if (asset && !/^(?:(?:css|js)\/[a-z0-9-]+\.(?:css|js)|assets\/tim-bot\/(?:concept-v1\/)?[a-z0-9-]+\.png)$/.test(asset)) throw bad('Không tìm thấy.', 404);
        let content = await readFile(resolve(root, asset || 'index.html'));
        if (!asset) content = Buffer.from(content.toString().replace('<head>', '<head><base href="/demo-app/"><style>:root{--font:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif!important}body{font-size:22px!important}.hint,.field-label,.card h3{font-size:18px!important}</style>'));
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.writeHead(200, { 'Content-Type': !asset ? 'text/html; charset=utf-8' : asset.endsWith('.css') ? 'text/css' : asset.endsWith('.js') ? 'text/javascript' : 'image/png', 'Cache-Control': 'no-store' });
        return res.end(content);
      }
      if (['/api/translate', '/api/speak', '/api/onboarding', '/hub/app-health'].includes(path)) {
        if (req.headers.origin && req.headers.origin !== origin) throw bad('Không được phép.', 403);
        const health = path === '/hub/app-health';
        if (health ? req.method !== 'GET' : req.method !== 'POST' || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) throw bad('Request không hợp lệ.', 403);
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 6000000) throw bad('Request quá lớn.', 413); }
        const upstream = await fetch('http://127.0.0.1:3000' + (health ? '/' : path), {
          method: health ? 'GET' : 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/json' }, ...(health ? {} : { body }), signal: AbortSignal.timeout(health ? 2000 : 60000),
        }).catch(() => { throw bad('App local chưa sẵn sàng. Bấm Khởi động app trên slide demo.', 503); });
        if (health) return json(upstream.ok ? 200 : 503, { ready: upstream.ok });
        res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
        return res.end(Buffer.from(await upstream.arrayBuffer()));
      }
      const files = { '/demo-slides.md': 'docs/demo-slides.md', '/demo-slides.html': 'docs/demo-slides.html', '/manual-onboarding.md': 'docs/manual-onboarding.md', '/': 'docs/project-hub.html', '/hub-tools.js': 'docs/hub-tools.js', '/manual-test.md': 'docs/manual-test.md', '/superpowers/plans/2026-10-11-thong-dich-tinh-yeu.md': 'docs/superpowers/plans/2026-10-11-thong-dich-tinh-yeu.md', '/design/design-system.md': 'docs/design/design-system.md' };
      if (req.method === 'GET' && files[path]) {
        let content = await readFile(resolve(root, files[path]), 'utf8');
        if (path === '/' || path === '/demo-slides.html') content = content.replace('<!--HUB_TOKEN-->', `<meta name="hub-token" content="${token}">`);
        res.writeHead(200, { 'Content-Type': (path === '/' || path.endsWith('.html')) ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(content);
      }
      if (req.method === 'GET' && path === '/manual-demo.md') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(await readFile(resolve(root, 'docs/manual-demo.md'), 'utf8'));
      }
      if (!['/hub/state', '/hub/action', '/hub/manual-results'].includes(path)) throw bad('Không tìm thấy.', 404);
      if (req.headers['x-hub-token'] !== token || (req.headers.origin && req.headers.origin !== origin)) throw bad('Không được phép.', 403);
      if (req.method === 'GET' && path === '/hub/state') return json(200, await state());
      if (req.method === 'GET' && path === '/hub/manual-results') {
        let report;
        try { report = await readFile(resolve(root, '.manual-test/results.json'), 'utf8'); }
        catch (e) { if (e.code === 'ENOENT') return json(200, null); throw e; }
        if (report.length > 200000) throw bad('Kết quả manual quá lớn.', 413);
        return json(200, JSON.parse(report));
      }
      if (req.method !== 'POST' || path !== '/hub/action') throw bad('Method không hợp lệ.', 405);
      if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) throw bad('Request không hợp lệ.', 403);
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 40000) throw bad('Request quá lớn.', 413); }
      let input;
      try { input = JSON.parse(body); } catch { throw bad('JSON không hợp lệ.'); }
      json(200, await action(input));
    } catch (e) { json(e.status || 500, { error: e.status ? e.message : 'Không thực hiện được. Kiểm tra quyền đọc/ghi file hoặc thử lại.' }); }
  }
  return { handler, stop: () => { stop(job); stop(local); }, state, action, token };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hub = createHub();
  const server = createServer(hub.handler);
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'Port 8765 đang được dùng. Đóng Hub cũ trước khi chạy lại.' : e.message); process.exitCode = 1; });
  server.listen(8765, '127.0.0.1', () => console.log('Project Hub: http://127.0.0.1:8765'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { hub.stop(); server.close(); });
}
