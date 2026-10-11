import test from 'node:test';
import assert from 'node:assert/strict';
import translate from '../api/translate.js';
import speak from '../api/speak.js';
import onboarding from '../api/onboarding.js';

const response = () => ({ status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });
function setup(t) {
  for (const [key, value] of Object.entries({ DEMO_ADMIN_TOKEN: 'presenter-secret', UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'redis-secret' })) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}
test('closed demo blocks all paid endpoints before OpenAI or rate limits', async t => {
  setup(t); let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => { calls++; return { ok: true, json: async () => url.endsWith('/pipeline') ? [{ result: 1 }, { result: 1 }] : url.includes('openai.com') ? { choices: [{ message: { content: JSON.stringify({ meaning: 'Có thể ổn', danger: 10, reply: 'Em ổn chứ?', avoid: 'Ừ' }) } }] } : { result: null } }; });
  for (const handler of [translate, speak, onboarding]) {
    const res = response(); await handler({ method: 'POST', body: { text: 'Em không sao đâu', language: 'vi' } }, res);
    assert.equal(res.statusCode, 403); assert.match(res.body.error, /Demo đang đóng/);
  }
  assert.equal(calls, 3);
});

test('gate fails closed when Redis is missing or unavailable', async t => {
  setup(t);
  const old = process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_URL;
  let res = response(); await translate({ method: 'POST', body: {} }, res); assert.equal(res.statusCode, 503);
  process.env.UPSTASH_REDIS_REST_URL = old;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  res = response(); await translate({ method: 'POST', body: {} }, res); assert.equal(res.statusCode, 503);
});

test('open gate allows translation and closed gate localizes its error', async t => {
  setup(t);
  t.mock.method(globalThis, 'fetch', async url => ({ ok: true, json: async () => url.endsWith('/pipeline') ? [{ result: 1 }, { result: 1 }] : url.includes('openai.com') ? { choices: [{ message: { content: '{"meaning":"Có thể ổn","danger":10,"reply":"Em ổn chứ?","avoid":"Ừ"}' } }] } : { result: 'open' } }));
  const res = response(); await translate({ method: 'POST', body: { text: 'Ừ' } }, res); assert.equal(res.statusCode, 200); assert.equal(res.body.danger, 10);
});

test('admin endpoint authenticates reads and writes, expires opening and removes closed state', async t => {
  setup(t);
  const { default: control } = await import('../api/demo-access.js');
  let current = null; const commands = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const cmd = JSON.parse(options.body); commands.push(cmd);
    if (cmd[0] === 'SET') current = 'open';
    if (cmd[0] === 'DEL') current = null;
    return { ok: true, json: async () => ({ result: cmd[0] === 'SET' ? 'OK' : cmd[0] === 'DEL' ? 1 : cmd[0] === 'TTL' ? 3600 : current }) };
  });
  for (const authorization of [undefined, 'Bearer wrong', 'Bearer presenter-secret-extra']) {
    const res = response(); await control({ method: 'POST', headers: { authorization }, body: { public: true } }, res); assert.equal(res.statusCode, 401);
  }
  assert.equal(commands.length, 0);
  const headers = { authorization: 'Bearer presenter-secret' };
  for (const value of ['true', null, 1]) { const res = response(); await control({ method: 'POST', headers, body: { public: value } }, res); assert.equal(res.statusCode, 400); }
  let res = response(); await control({ method: 'GET', headers }, res); assert.equal(res.body.public, false);
  res = response(); await control({ method: 'POST', headers, body: { public: true } }, res); assert.deepEqual(res.body, { public: true, expiresIn: 3600 });
  assert.deepEqual(commands.find(c => c[0] === 'SET'), ['SET', 'thong-dich-tinh-yeu:demo:public', 'open', 'EX', '3600']);
  res = response(); await control({ method: 'POST', headers, body: { public: false } }, res); assert.deepEqual(res.body, { public: false, expiresIn: 0 });
  const closed = response(); await speak({ method: 'POST', body: { language: 'en' } }, closed); assert.equal(closed.statusCode, 403); assert.match(closed.body.error, /demo is closed/);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ error: 'read-only' }) }));
  res = response(); await control({ method: 'POST', headers, body: { public: true } }, res); assert.equal(res.statusCode, 503);
});
