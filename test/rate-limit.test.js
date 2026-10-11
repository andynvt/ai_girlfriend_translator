import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../lib/rate-limit.js';
import translate from '../api/translate.js';
import speak from '../api/speak.js';
import onboarding from '../api/onboarding.js';

const req = { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } };
const mockRes = () => ({
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  send(body) { this.body = body; return this; },
  setHeader() {},
});
const withEnv = t => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
  t.after(() => { delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; });
};
const redisCount = (t, count, seen = []) => t.mock.method(globalThis, 'fetch', async (url, options) => {
  seen.push({ url, options });
  return { ok: true, json: async () => [{ result: count }, { result: 1 }] };
});

test('allows under limit and counts per endpoint + first forwarded IP', async t => {
  withEnv(t);
  const seen = [];
  redisCount(t, 20, seen);
  assert.equal(await rateLimit(req, 'translate'), true);
  assert.equal(seen[0].url, 'https://redis.test/pipeline');
  assert.equal(seen[0].options.headers.Authorization, 'Bearer tok');
  const [[incr, key], [expire, key2, ttl]] = JSON.parse(seen[0].options.body);
  assert.equal(incr, 'INCR');
  assert.match(key, /^rl:translate:1\.2\.3\.4:\d+$/);
  assert.deepEqual([expire, key2, ttl], ['EXPIRE', key, '600']);
});

test('blocks over limit using per-endpoint limits', async t => {
  withEnv(t);
  redisCount(t, 21);
  assert.equal(await rateLimit(req, 'translate'), false);
  assert.equal(await rateLimit(req, 'speak'), true);
  assert.equal(await rateLimit(req, 'onboarding'), false);
});

test('fails open without env', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; });
  assert.equal(await rateLimit(req, 'translate'), true);
  assert.equal(calls, 0);
});

test('fails open on redis error', async t => {
  withEnv(t);
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('down'); });
  assert.equal(await rateLimit(req, 'translate'), true);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, json: async () => ({}) }));
  assert.equal(await rateLimit(req, 'translate'), true);
});

test('handlers return localized 429 before calling OpenAI', async t => {
  withEnv(t);
  let openai = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (!url.startsWith('https://redis.test')) { openai++; return { ok: true }; }
    return { ok: true, json: async () => [{ result: 999 }, { result: 1 }] };
  });
  for (const handler of [translate, speak, onboarding]) {
    for (const [language, error] of [['vi', 'Bạn hỏi nhanh quá, thử lại sau ít phút nhé.'], ['en', 'Too many requests. Please try again in a few minutes.']]) {
      const res = mockRes();
      await handler({ method: 'POST', headers: req.headers, body: { text: 'Ừ', language } }, res);
      assert.equal(res.statusCode, 429);
      assert.deepEqual(res.body, { error });
    }
  }
  assert.equal(openai, 0);
});

test('prefers x-real-ip over a client-supplied x-forwarded-for', async t => {
  withEnv(t);
  const seen = [];
  redisCount(t, 1, seen);
  await rateLimit({ headers: { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': 'spoofed' } }, 'translate');
  assert.match(JSON.parse(seen[0].options.body)[0][1], /^rl:translate:9\.9\.9\.9:\d+$/);
});
