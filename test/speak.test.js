import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/speak.js';

const mockRes = () => ({
  headers: {},
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  send(body) { this.body = body; return this; },
  setHeader(key, value) { this.headers[key] = value; },
});

test('speech selects female or male voice and requests expressive Vietnamese audio', async t => {
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/audio/speech');
    request = JSON.parse(options.body);
    return { ok: true, arrayBuffer: async () => Buffer.from('mp3') };
  });
  for (const [direction, voice, gender] of [['gf', 'shimmer', 'nữ'], ['bf', 'onyx', 'nam'], [undefined, 'shimmer', 'nữ']]) {
    const res = mockRes();
    await handler({ method: 'POST', body: { text: '  Có thể người ấy đang buồn.  ', direction } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'audio/mpeg');
    assert.equal(res.body.toString(), 'mp3');
    assert.equal(request.voice, voice);
    assert.equal(request.input, 'Có thể người ấy đang buồn.');
    assert.ok(request.instructions.includes(`giọng ${gender}`));
    assert.match(request.instructions, /cảm xúc phù hợp với nội dung/);
    assert.match(request.instructions, /ngắt nhịp tự nhiên/);
    assert.match(request.instructions, /Chỉ đọc nguyên văn/);
  }
});

test('speech rejects invalid inputs and unsupported methods before calling upstream', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; });
  for (const body of [undefined, { text: ' ' }, { text: 123 }, { text: 'a'.repeat(501) }, { text: 'Ừ', direction: 'xyz' }, { text: 'Ừ', direction: {} }]) {
    const res = mockRes();
    await handler({ method: 'POST', body }, res);
    assert.equal(res.statusCode, 400);
  }
  const res = mockRes();
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(calls, 0);
});

test('speech returns a recoverable error when upstream fails or times out', async t => {
  t.mock.method(console, 'error', () => {});
  for (const fetch of [async () => ({ ok: false, status: 429, text: async () => 'unavailable' }), async () => { throw new Error('Timeout'); }]) {
    t.mock.method(globalThis, 'fetch', fetch);
    const res = mockRes();
    await handler({ method: 'POST', body: { text: 'Ừ', direction: 'bf' } }, res);
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /thử lại/);
  }
});

test('English speech preserves text and gender with localized validation', async t => {
  let request;
  t.mock.method(globalThis, 'fetch', async (_url, options) => { request = JSON.parse(options.body); return { ok: true, arrayBuffer: async () => Buffer.from('mp3') }; });
  for (const direction of ['gf', 'bf']) {
    const res = mockRes(); await handler({ method: 'POST', body: { text: 'They may be upset.', direction, language: 'en' } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(request.instructions, /English/);
    assert.equal(request.input, 'They may be upset.');
    assert.equal(request.voice, direction === 'gf' ? 'shimmer' : 'onyx');
  }
  for (const language of [null, 'fr', 123]) {
    const res = mockRes(); await handler({ method: 'POST', body: { text: 'Hi', language } }, res); assert.equal(res.statusCode, 400);
  }
  const res = mockRes(); await handler({ method: 'POST', body: { language: 'en' } }, res); assert.match(res.body.error, /^Enter/);
});
