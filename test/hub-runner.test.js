import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { parseEnv } from 'node:util';
import { createHub, changeModel } from '../scripts/project-hub.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'project-hub-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, '.env'), '# keep comment\nOPENAI_API_KEY=secret-test-key\nOPENAI_MODEL=gpt-5-mini\nOPENAI_REASONING_EFFORT=minimal\nOPENAI_TTS_MODEL=gpt-4o-mini-tts\n');
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'docs/project-hub.html'), '<head><!--HUB_TOKEN--></head>');
  await mkdir(join(root, '.vercel'));
  await writeFile(join(root, '.vercel/project.json'), '{}');
  await writeFile(join(root, '.vercelignore'), 'docs\nscripts\ntest\n.manual-test\n.env\n.env.*\nAGENTS.md\n');
  const calls = [];
  const launch = (cmd, args, options) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.sent = []; child.send = (message, callback) => { child.sent.push(message); callback(); };
    child.kill = () => { child.emit('close', null, 'SIGTERM'); };
    calls.push({ cmd, args, options, child }); return child;
  };
  return { hub: createHub({ root, launch }), calls, root };
}
async function request(hub, method, path, body = '', headers = {}) {
  const req = Readable.from([body]); req.method = method; req.url = path;
  req.headers = { host: '127.0.0.1:8765', origin: 'http://127.0.0.1:8765', 'x-hub-token': hub.token, 'content-type': 'application/json', ...headers };
  let status, output;
  const res = { setHeader() {}, writeHead(code) { status = code; }, end(value) { output = value; } };
  await hub.handler(req, res);
  return { status, output };
}

test('model switch replaces active definitions and preserves keys, TTS and comments', () => {
  const source = '# OPENAI_MODEL=example\nexport OPENAI_MODEL = "old"\nOPENAI_MODEL=duplicate\nOPENAI_API_KEY=keep\nOPENAI_TTS_MODEL=tts\n';
  const result = changeModel(source, 'gpt-6-luna');
  assert.equal(parseEnv(result).OPENAI_MODEL, 'gpt-6-luna');
  assert.equal(parseEnv(result).OPENAI_REASONING_EFFORT, 'none');
  assert.equal(parseEnv(result).OPENAI_API_KEY, 'keep');
  assert.equal(parseEnv(result).OPENAI_TTS_MODEL, 'tts');
  assert.match(result, /# OPENAI_MODEL=example/);
  assert.throws(() => changeModel(source, 'gpt-5; rm -rf /'));
});

test('manual report route requires Hub authentication and serves only the latest local report', async t => {
  const { hub, root } = await fixture(t);
  assert.equal((await request(hub, 'GET', '/hub/manual-results', '', { 'x-hub-token': '' })).status, 403);
  assert.equal((await request(hub, 'GET', '/hub/manual-results')).output, 'null');
  await mkdir(join(root, '.manual-test'));
  const report = { version: 1, runId: 'test-run', cases: {} };
  await writeFile(join(root, '.manual-test/results.json'), JSON.stringify(report));
  assert.deepEqual(JSON.parse((await request(hub, 'GET', '/hub/manual-results')).output), report);
  assert.equal((await request(hub, 'GET', '/.manual-test/results.json')).status, 404);
});

test('model action writes only env settings and never exposes API key', async t => {
  const { hub, root } = await fixture(t);
  const state = await hub.action({ task: 'model', model: 'gpt-5' });
  assert.equal(state.model, 'gpt-5'); assert.equal(state.effort, 'minimal');
  assert.equal(state.hasKey, true);
  assert.doesNotMatch(JSON.stringify(state), /secret-test-key/);
  assert.match(await readFile(join(root, '.env'), 'utf8'), /OPENAI_API_KEY=secret-test-key/);
});

test('demo validates settings, launches IPC runner and accepts only the current permitted answer', async t => {
  const { hub, calls } = await fixture(t);
  for (const body of [{ cases: 'tc13' }, { voice: 'bad' }, { url: 'file:///etc/passwd' }, { cases: ['tc01'] }]) await assert.rejects(hub.action({ task: 'demo', ...body }));
  assert.equal(calls.length, 0);
  await hub.action({ task: 'demo', cases: 'TC01,TC03', voice: 'mac' });
  assert.deepEqual(calls[0].args, ['scripts/manual-demo.mjs', '--hub', '--cases', 'TC01,TC03', '--voice', 'mac', '--url', 'http://127.0.0.1:3000/']);
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe', 'ipc']);
  await assert.rejects(hub.action({ task: 'demo' }), /đang chạy/);
  const child = calls[0].child;
  child.emit('message', { type: 'manual-prompt', id: 1, text: 'Assertion lỗi', allowed: ['f', 'b', 's', 'q'] });
  await assert.rejects(hub.action({ task: 'demo-answer', id: 0, answer: 'f' }), /đã thay đổi/);
  await assert.rejects(hub.action({ task: 'demo-answer', id: 1, answer: 'p' }), /không hợp lệ/);
  await hub.action({ task: 'demo-answer', id: 1, answer: 'f' });
  assert.deepEqual(child.sent, [{ type: 'manual-answer', id: 1, answer: 'f' }]);
  assert.equal((await hub.state()).job.prompt, null);
  await assert.rejects(hub.action({ task: 'demo-answer', id: 1, answer: 'f' }), /đã thay đổi/);
  child.emit('message', { type: 'manual-prompt', id: 2, text: 'Ghi chú', allowed: null });
  await hub.action({ task: 'demo-answer', id: 2, answer: 'Nội dung thực tế' });
  assert.equal(child.sent[1].answer, 'Nội dung thực tế');
  child.emit('message', { type: 'manual-prompt', id: 3, text: 'Không hợp lệ', allowed: ['arbitrary'] });
  assert.equal((await hub.state()).job.prompt, null);
});

test('stopping demo keeps the local app running and clears pending prompts', async t => {
  const { hub, calls } = await fixture(t);
  await hub.action({ task: 'local' });
  await hub.action({ task: 'demo', voice: 'off' });
  calls[1].child.emit('message', { type: 'manual-prompt', id: 1, text: 'Bắt đầu', allowed: ['', 'q'] });
  await hub.action({ task: 'demo-stop' });
  const state = await hub.state();
  assert.equal(state.job.status, 'stopped'); assert.equal(state.job.prompt, null); assert.equal(state.local.status, 'running');
  await hub.action({ task: 'stop' });
});

test('runner allowlist, concurrent lock, failed exits and log redaction', async t => {
  const { hub, calls } = await fixture(t);
  await assert.rejects(hub.action({ task: 'shell', command: 'arbitrary' }), /Task không hợp lệ/);
  const first = hub.action({ task: 'test' });
  await assert.rejects(hub.action({ task: 'test' }), /đang được xử lý/);
  await first;
  assert.equal(calls[0].cmd, process.execPath); assert.deepEqual(calls[0].args, ['--test']);
  assert.equal(calls[0].options.shell, false);
  await assert.rejects(hub.action({ task: 'deploy', target: 'production' }), /đang chạy/);
  calls[0].child.stderr.emit('data', 'failure secret-test-key');
  calls[0].child.emit('close', 1);
  const state = await hub.state();
  assert.equal(state.job.status, 'failed'); assert.match(state.job.log, /\[redacted\]/);
  assert.doesNotMatch(state.job.log, /secret-test-key/);
});

test('local start blocks duplicate launches and model changes until stopped', async t => {
  const { hub, calls } = await fixture(t);
  await hub.action({ task: 'local' });
  assert.deepEqual(calls[0].args, ['--no-install', 'vercel', 'dev', '--listen', '127.0.0.1:3000', '--yes']);
  await assert.rejects(hub.action({ task: 'model', model: 'gpt-5' }), /Dừng app local/);
  await assert.rejects(hub.action({ task: 'local' }), /đã chạy/);
  await hub.action({ task: 'stop' });
  assert.equal((await hub.state()).local.status, 'stopped');
  await hub.action({ task: 'model', model: 'gpt-5' });
});

test('deploy defaults must be explicit, passes selected model and keeps Hub excluded', async t => {
  const { hub, calls, root } = await fixture(t);
  await assert.rejects(hub.action({ task: 'deploy' }), /Preview hoặc Production/);
  await hub.action({ task: 'model', model: 'gpt-6-luna' });
  await hub.action({ task: 'deploy', target: 'preview' });
  assert.deepEqual(calls[0].args, ['--no-install', 'vercel', '--yes', '--env', 'OPENAI_MODEL=gpt-6-luna', '--env', 'OPENAI_REASONING_EFFORT=none']);
  calls[0].child.emit('close', 0);
  await hub.action({ task: 'deploy', target: 'production' });
  assert.equal(calls[1].args.at(-1), '--prod');
  calls[1].child.emit('close', 0);
  await writeFile(join(root, '.vercelignore'), '');
  await assert.rejects(hub.action({ task: 'deploy', target: 'preview' }), /vercelignore/);
  assert.equal(calls.length, 2);
});

test('HTTP rejects foreign hosts, origins, absent token and oversized or invalid JSON', async t => {
  const { hub, calls } = await fixture(t);
  for (const headers of [{ host: 'evil.example:8765' }, { origin: 'https://evil.example' }, { 'x-hub-token': '' }, { origin: undefined }, { 'content-type': 'text/plain' }]) {
    assert.equal((await request(hub, 'POST', '/hub/action', '{"task":"test"}', headers)).status, 403);
  }
  assert.equal((await request(hub, 'POST', '/hub/action', '{')).status, 400);
  assert.equal((await request(hub, 'POST', '/hub/action', 'x'.repeat(40001))).status, 413);
  assert.equal((await request(hub, 'GET', '/.env')).status, 404);
  assert.equal(calls.length, 0);
  const page = await request(hub, 'GET', '/');
  assert.match(page.output, /meta name="hub-token"/);
  const state = await request(hub, 'GET', '/hub/state');
  assert.equal(state.status, 200); assert.doesNotMatch(state.output, /secret-test-key/);
});

test('slides stay local and public control uses only server configuration without leaking secrets', async t => {
  const { hub, root } = await fixture(t);
  await writeFile(join(root, 'docs/demo-slides.html'), '<head><!--HUB_TOKEN--></head>');
  const page = await request(hub, 'GET', '/demo-slides.html'); assert.equal(page.status, 200); assert.match(page.output, /meta name="hub-token"/);
  await assert.rejects(hub.action({ task: 'demo-access' }), /DEMO_APP_URL/);
  await writeFile(join(root, '.env'), 'DEMO_APP_URL=https://demo.example\nDEMO_ADMIN_TOKEN=admin-secret\n');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url: String(url), options }); return { ok: true, json: async () => ({ public: true, expiresIn: 3600 }) }; });
  const result = await hub.action({ task: 'demo-access', public: true, url: 'https://attacker.example' });
  assert.equal(calls[0].url, 'https://demo.example/api/demo-access');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer admin-secret');
  assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.body, '{"public":true}');
  assert.equal(result.url, 'https://demo.example/'); assert.doesNotMatch(JSON.stringify(result), /admin-secret/);
  await assert.rejects(hub.action({ task: 'demo-access', public: 'true' }), /boolean/);
  for (const url of ['http://demo.example', 'https://user:pass@demo.example', 'https://demo.example/path']) {
    await writeFile(join(root, '.env'), `DEMO_APP_URL=${url}\nDEMO_ADMIN_TOKEN=admin-secret\n`);
    await assert.rejects(hub.action({ task: 'demo-access' }), /HTTPS origin/);
  }
  assert.equal(calls.length, 1);
});
