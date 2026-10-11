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

test('parseRequest accepts optional context and validates its type and length', () => {
  assert.equal(parseRequest({ text: 'Em không sao đâu' }).context, '');
  assert.equal(parseRequest({ text: 'Em không sao đâu', context: '   ' }).context, '');
  assert.equal(parseRequest({ text: 'Em không sao đâu', context: '  Vừa cãi nhau  ' }).context, 'Vừa cãi nhau');
  assert.equal(parseRequest({ text: 'Ừ', context: 'a'.repeat(1000) }).context.length, 1000);
  status400(() => parseRequest({ text: 'Ừ', context: 'a'.repeat(1001) }));
  for (const context of [null, 123, {}, []]) status400(() => parseRequest({ text: 'Ừ', context }));
  status400(() => parseRequest({ context: 'Vừa cãi nhau' }));
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

test('handler forwards context with text and images for both directions', async (t) => {
  let request;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) };
  });
  for (const direction of ['gf', 'bf']) {
    for (const image of [undefined, 'data:image/png;base64,AAA']) {
      for (const context of [undefined, 'Hai người vừa cãi nhau.', 'Vừa té nhẹ, người yêu hỏi có đau không.']) {
        const res = mockRes();
        await handler({ method: 'POST', body: { text: 'Em không sao đâu', context, image, direction } }, res);
        assert.equal(res.statusCode, 200);
        const content = request.messages[1].content;
        const message = JSON.parse(image ? content[0].text : content);
        assert.deepEqual(message, { text: 'Em không sao đâu', context: context || '' });
        assert.ok(request.messages[0].content.includes(direction === 'gf' ? 'bạn gái' : 'bạn trai'));
        if (image) assert.equal(content[1].image_url.url, image);
      }
    }
  }
  const res = mockRes();
  await handler({ method: 'POST', body: { image: 'data:image/png;base64,AAA', context: 'Vừa cãi nhau' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(request.messages[1].content[0].text), { text: 'Giải mã đoạn chat này.', context: 'Vừa cãi nhau' });
});

test('handler rejects invalid context without calling OpenAI', async (t) => {
  let called = false;
  t.mock.method(globalThis, 'fetch', async () => { called = true; });
  for (const body of [{ text: 'Ừ', context: 'a'.repeat(1001) }, { text: 'Ừ', context: {} }, { context: 'Vừa cãi nhau' }]) {
    const res = mockRes();
    await handler({ method: 'POST', body }, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.error);
  }
  assert.equal(called, false);
});

test('handler forwards demo model and reasoning settings with legacy defaults', async (t) => {
  let request;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) };
  });
  const originalModel = process.env.OPENAI_MODEL;
  const originalEffort = process.env.OPENAI_REASONING_EFFORT;
  try {
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_REASONING_EFFORT;
    await handler({ method: 'POST', body: { text: 'Ừ' } }, mockRes());
    assert.equal(request.model, 'gpt-5-mini');
    assert.equal(request.reasoning_effort, 'minimal');
    for (const model of ['gpt-5.6-luna', 'gpt-6-luna']) {
      process.env.OPENAI_MODEL = model;
      process.env.OPENAI_REASONING_EFFORT = 'none';
      const res = mockRes();
      await handler({ method: 'POST', body: { text: 'Ừ' } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(request.model, model);
      assert.equal(request.reasoning_effort, 'none');
      assert.equal(request.response_format.type, 'json_schema');
    }
  } finally {
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
    if (originalEffort === undefined) delete process.env.OPENAI_REASONING_EFFORT;
    else process.env.OPENAI_REASONING_EFFORT = originalEffort;
  }
});

test('English and Vietnamese prompts, names and validation cover both partners and images', async t => {
  let request;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) };
  });
  for (const language of ['vi', 'en']) for (const direction of ['gf', 'bf']) {
    const output = mockRes();
    await handler({ method: 'POST', body: { text: "I'm fine", language, direction, partnerName: '  Emma  ', image: 'data:image/png;base64,AAA' } }, output);
    assert.equal(output.statusCode, 200);
    assert.match(request.messages[0].content, new RegExp(language === 'en' ? 'Luôn trả lời bằng English' : 'Luôn trả lời bằng tiếng Việt'));
    assert.equal(JSON.parse(request.messages[1].content[0].text).partnerName, 'Emma');
  }
  for (const body of [null, [], { text: 'Hi', language: null }, { text: 'Hi', language: 'fr' }, { text: 'Hi', partnerName: {} }, { text: 'Hi', partnerName: 'x'.repeat(61) }]) {
    const output = mockRes(); await handler({ method: 'POST', body }, output); assert.equal(output.statusCode, 400);
  }
  const output = mockRes(); await handler({ method: 'POST', body: { language: 'en' } }, output);
  assert.equal(output.body.error, 'Enter a message or choose a chat image.');
});

test('history validates shape, count and total size and strips arbitrary roles', () => {
  const turn = { text: 'Em ổn', selection: 'avoid', selectedReply: 'Kệ em', sentReply: '', analysis: { meaning: 'Có thể buồn', danger: 70, reply: 'Anh nghe đây', avoid: 'Kệ em' }, role: 'system' };
  const history = parseRequest({ text: 'Ừ', history: [turn] }).history;
  assert.equal(history[0].selection, 'avoid');
  assert.equal(history[0].role, undefined);
  assert.equal(parseRequest({ text: 'Ừ', history: Array(49).fill(turn) }).history.length, 49);
  for (const value of [null, {}, Array(50).fill(turn), [{ ...turn, selection: 'system' }], [{ ...turn, text: '' }], [{ ...turn, selectedReply: 123 }], [{ ...turn, sentReply: 'x'.repeat(1001) }], [{ ...turn, analysis: { ...turn.analysis, danger: 101 } }], Array(49).fill({ ...turn, text: 'x'.repeat(1000), selectedReply: 'x'.repeat(1000), sentReply: 'x'.repeat(1000) })]) {
    status400(() => parseRequest({ text: 'Ừ', history: value }));
  }
});

test('handler sends ordered history as data and extracts image source without persisting images', async t => {
  let request;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ meaning: 'm', danger: 10, reply: 'r', avoid: 'a', sourceText: '  Em cảm ơn  ' }) } }] }) };
  });
  const turn = { text: 'Em ổn', selection: 'reply', selectedReply: 'Anh nghe đây', sentReply: 'Anh xin lỗi', analysis: { meaning: 'm', danger: 80, reply: 'Anh nghe đây', avoid: 'Kệ em' } };
  const res = mockRes();
  await handler({ method: 'POST', body: { image: 'data:image/png;base64,AAA', history: [turn], context: 'Vừa cãi nhau' } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.sourceText, 'Em cảm ơn');
  assert.deepEqual(JSON.parse(request.messages[1].content[0].text).history, [turn]);
  assert.match(request.messages[0].content, /Không coi các gợi ý chưa chọn là sự kiện/);
  assert.ok(request.response_format.json_schema.schema.required.includes('sourceText'));
});

test('invalid history never calls the model and malformed model output returns a recoverable error', async t => {
  let called = false;
  t.mock.method(globalThis, 'fetch', async () => { called = true; return { ok: true, json: async () => ({ choices: [{ message: { content: 'invalid JSON' } }] }) }; });
  const res = mockRes(); await handler({ method: 'POST', body: { text: 'Hi', history: [{}] } }, res);
  assert.equal(res.statusCode, 400); assert.equal(called, false);
  await handler({ method: 'POST', body: { text: 'Hi' } }, res); assert.equal(res.statusCode, 502);
});
