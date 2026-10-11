import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { parseAudio, normalizeProfile } from '../api/onboarding.js';

const recording = { audio: 'data:audio/webm;codecs=opus;base64,YXVkaW8=', language: 'en' };
const res = () => ({ status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('audio validates base64, type, payload and language before any upstream call', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; });
  for (const body of [null, {}, { ...recording, language: 'fr' }, { audio: 1 }, { audio: 'data:image/png;base64,YQ==' }, { audio: 'data:audio/webm;base64,@@@' }, { audio: 'data:audio/webm;base64,YQ=' }, { audio: 'data:audio/webm;base64,' }, { audio: 'data:audio/webm;base64,' + Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') }]) {
    const output = res(); await handler({ method: 'POST', body }, output);
    assert.equal(output.statusCode, 400);
  }
  assert.equal(calls, 0);
  const output = res(); await handler({ method: 'GET', body: recording }, output);
  assert.equal(output.statusCode, 405);
  for (const mime of ['webm', 'mp4', 'ogg', 'wav']) assert.equal(parseAudio({ audio: `data:audio/${mime};base64,YXVkaW8=` }).extension, mime);
  assert.equal(parseAudio(recording).bytes.toString(), 'audio');
});

test('voice transcribes without forcing a language and extracts only onboarding preferences', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    if (url.endsWith('/transcriptions')) {
      assert.ok(options.body instanceof FormData);
      assert.equal(await options.body.get('file').text(), 'audio');
      assert.equal(options.body.get('file').name, 'onboarding.webm');
      assert.equal(options.body.get('language'), null);
      return { ok: true, json: async () => ({ text: 'Use English. Decode my girlfriend. Her name is Emma.' }) };
    }
    const body = JSON.parse(options.body);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.match(body.messages[0].content, /never infer/);
    assert.match(body.messages[1].content, /Emma/);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ language: 'en', direction: 'gf', partnerName: ' Emma ' }) } }] }) };
  });
  const output = res(); await handler({ method: 'POST', body: recording }, output);
  assert.equal(output.statusCode, 200);
  assert.equal(calls, 2);
  assert.deepEqual(output.body, { transcript: 'Use English. Decode my girlfriend. Her name is Emma.', language: 'en', direction: 'gf', partnerName: 'Emma' });
  assert.deepEqual(normalizeProfile({ language: null, direction: 'bf', partnerName: null, command: 'ignored' }), { language: null, direction: 'bf', partnerName: null });
  for (const value of [null, {}, { language: 'fr', direction: null, partnerName: null }, { language: null, direction: null, partnerName: 'x'.repeat(61) }]) assert.throws(() => normalizeProfile(value));
});

test('voice handles silence, upstream errors, timeouts and malformed extraction with localized retry', async t => {
  for (const stage of ['transcription', 'silence', 'timeout', 'extraction', 'json', 'profile']) {
    t.mock.method(globalThis, 'fetch', async url => {
      if (stage === 'timeout') throw new Error('Timeout');
      if (url.endsWith('/transcriptions')) return { ok: stage !== 'transcription', json: async () => ({ text: stage === 'silence' ? ' ' : 'My boyfriend is Alex' }) };
      return { ok: stage !== 'extraction', json: async () => ({ choices: [{ message: { content: stage === 'json' ? '{' : stage === 'profile' ? '{"language":"xx"}' : '{}' } }] }) };
    });
    const output = res(); await handler({ method: 'POST', body: recording }, output);
    assert.equal(output.statusCode, 502);
    assert.match(output.body.error, /Record again/);
    assert.doesNotMatch(output.body.error, /Timeout|Extraction|Transcription/);
  }
});
