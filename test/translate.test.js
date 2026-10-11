import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { parseRequest, normalize } from '../api/translate.js';

const status400 = (fn) => assert.throws(fn, (e) => e.status === 400);

test('parseRequest validates input', () => {
  status400(() => parseRequest({ text: '  ' }));
  status400(() => parseRequest({ text: 'a'.repeat(501) }));
  status400(() => parseRequest({ image: 'data:image/png;base64,' + 'A'.repeat(4 * 1024 * 1024) }));
  assert.equal(parseRequest({ text: 'em k sao', direction: 'xyz' }).direction, 'gf');
  const img = parseRequest({ image: 'data:image/png;base64,AAA' });
  assert.ok(img.image);
  assert.equal(img.text, '');
});

test('normalize clamps and fills', () => {
  assert.equal(normalize({ meaning: 'x', danger: 150 }).danger, 100);
  assert.equal(normalize({ danger: -3 }).danger, 0);
  assert.equal(normalize({}).reply, '');
});

const mockRes = () => ({
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
});

test('handler returns 502 when OpenAI fails', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429 });
  const res = mockRes();
  await handler({ method: 'POST', body: { text: 'Tùy anh' } }, res);
  assert.equal(res.statusCode, 502);
  assert.ok(res.body.error);
});

test('handler returns decoded JSON', async () => {
  const content = '{"meaning":"m","danger":80,"reply":"r","avoid":"a"}';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
  const res = mockRes();
  await handler({ method: 'POST', body: { text: 'Tùy anh' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { meaning: 'm', danger: 80, reply: 'r', avoid: 'a' });
});

test('handler returns 400 on empty input without calling OpenAI', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; };
  const res = mockRes();
  await handler({ method: 'POST', body: { text: '' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});
