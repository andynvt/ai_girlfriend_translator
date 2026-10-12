import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// Inline settings plus the ordered classic scripts, run as one shared global scope like the browser does.
const script = [...html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)]
  .map(([, src, code]) => src ? readFileSync(new URL('../' + src, import.meta.url), 'utf8') : code).join('\n');

// Exercise the page's actual script without a browser or live API calls.
function page(danger, onRequest = () => {}, storage = {}, limit = 10) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', disabled: false, hidden: true, files: [],
      style: { setProperty(key, value) { this[key] = value; } },
      setAttribute(key, value) { this[key] = value; },
      removeAttribute(key) { delete this[key]; },
      append(...children) { this.children = [...(this.children || []), ...children]; }, replaceChildren(...children) { this.children = children; }, scrollIntoView() {}, focus() {}, getAttribute(key) { return this[key]; },
    });
    return elements.get(id);
  };
  const context = {
    document: { documentElement: {}, getElementById: element, querySelectorAll: () => [], createElement: tag => ({ tagName: tag.toUpperCase(), setAttribute(key, value) { this[key] = value; }, append(...children) { this.children = [...(this.children || []), ...children]; } }) },
    window: { addEventListener() {} }, localStorage: { getItem: key => key === 'love-interpreter.preferences.v1' ? storage.value || null : key === 'love-interpreter.onboarding-flow.v1' ? ('flow' in storage ? storage.flow : 'wizard') : storage.history || null, setItem(key, value) { if (storage.denied) throw new Error('Denied'); if (key === 'love-interpreter.preferences.v1') storage.value = value; else storage.history = value; } }, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, matchMedia: () => ({ matches: true }), requestAnimationFrame: (fn) => fn(),
    FileReader: class { readAsDataURL(file) { this.result = file.data; this.onload(); } },
    URL: { createObjectURL: () => 'blob:audio', revokeObjectURL(url) { storage.released = url; } },
    Audio: class { constructor() { storage.audio = this; } pause() { this.paused = true; this.onpause?.(); } async play() { if (storage.playDenied) throw new Error('Playback blocked'); this.onplaying?.(); } },
    fetch: async (url, options) => {
      onRequest(url, JSON.parse(options.body));
      if (url === '/api/translate' && storage.pendingResult) await storage.pendingResult;
      return { ok: true, blob: async () => storage.pendingBlob || ({}), json: async () => ({ danger, meaning: 'Ý nghĩa', reply: 'Trả lời', avoid: 'Đừng nói', sourceText: 'Lời trong ảnh' }) };
    },
  };
  runInNewContext(script.replace('maxConversationTurns: 10', `maxConversationTurns: ${limit}`), context);
  element.setDirection = direction => runInNewContext(`setDir(${JSON.stringify(direction)})`, context);
  element.run = code => runInNewContext(code, context);
  return element;
}

function setup($, direction, language = 'vi', name = 'Mai') {
  $('settings').onclick();
  $('setupLanguage').value = language; $('setupLanguage').onchange();
  $('setupDirection').value = direction; $('setupName').value = name;
  $('setupForm').onsubmit({ preventDefault() {} }); $('confirmSetup').onclick();
}

test('danger meter and label agree at each threshold', async () => {
  for (const [danger, label, color] of [
    [0, 'Êm đẹp', 'safe', '• ‿ •'], [39, 'Êm đẹp', 'safe', '• ‿ •'],
    [40, 'Có mùi dỗi', 'warning', '• _ •'], [69, 'Có mùi dỗi', 'warning', '• _ •'],
    [70, 'Báo động đỏ', 'danger', 'O ﹏ O'], [100, 'Báo động đỏ', 'danger', 'O ﹏ O'],
  ]) {
    const $ = page(danger);
    await $('go').onclick();
    assert.equal($('dangerLabel').textContent, label);
    assert.equal($('out').style['--level-color'], `var(--${color})`);
    assert.equal($('dangerMeter')['aria-valuenow'], danger);
    assert.equal($('bar').style.width, `${danger}%`);
    assert.equal($('empty').hidden, true);
    assert.equal($('out').hidden, false);
    assert.equal($('go').disabled, true);
  }
});

test('remove image clears its preview and file selection', () => {
  const $ = page(0);
  $('preview').src = 'data:image/png;base64,AAA';
  $('file').value = 'chat.png';
  $('attachment').hidden = false;
  $('removeImage').onclick();
  assert.equal($('attachment').hidden, true);
  assert.equal($('file').value, '');
  assert.equal($('preview').src, undefined);
});

test('examples fill the message without submitting so context can be added', async () => {
  const requests = [];
  const $ = page(0, (url, body) => requests.push({ url, body }));
  for (const direction of ['gf', 'bf']) {
    setup($, direction);
    for (const chip of $('chips').children) {
      chip.onclick();
      assert.equal($('text').value, chip.textContent);
      assert.equal(requests.length, 0);
    }
  }
  $('context').value = 'Người ấy vừa tan ca.';
  await $('go').onclick();
  assert.deepEqual(requests, [{ url: '/api/translate', body: {
    text: 'Để anh suy nghĩ đã', context: 'Người ấy vừa tan ca.', image: null, direction: 'bf', language: 'vi', partnerName: 'Mai',
  } }]);
});

test('decode forwards optional context with text and image inputs', async () => {
  const requests = [];
  const $ = page(0, (url, body) => requests.push({ url, body }));
  $('text').value = 'Em không sao đâu';
  await $('go').onclick();
  assert.equal(requests[0].body.context, '');
  $('newConversation').onclick(); $('text').value = 'Em không sao đâu';
  $('context').value = 'Hai người vừa cãi nhau.';
  await $('go').onclick();
  assert.equal(requests[1].body.context, 'Hai người vừa cãi nhau.');
  $('newConversation').onclick(); $('context').value = 'Hai người vừa cãi nhau.';
  $('file').files = [{ data: 'data:image/png;base64,AAA' }];
  $('file').onchange();
  $('text').value = '';
  await $('go').onclick();
  assert.deepEqual(requests[2].body, {
    text: '', context: 'Hai người vừa cãi nhau.', image: 'data:image/png;base64,AAA', direction: 'gf', language: 'vi', partnerName: '',
  });
});

test('confirmed setup during a decode discards the response from the previous partner', async () => {
  const $ = page(0, url => { if (url === '/api/translate') setup($, 'bf', 'en', 'Alex'); });
  setup($, 'gf'); $('text').value = 'Em ổn';
  await $('go').onclick();
  assert.equal($('out').hidden, true);
  assert.equal($('turnCount').textContent, 'Turn 0/10');
  assert.equal($('go').disabled, false);
});

test('manual onboarding reviews before saving and safely restores English preferences', () => {
  const storage = {};
  const $ = page(0, () => {}, storage);
  assert.equal($('onboarding').hidden, false);
  assert.equal($('app').hidden, true);
  $('setupLanguage').value = 'en'; $('setupLanguage').onchange();
  $('setupDirection').value = 'bf'; $('setupName').value = '  Alex  ';
  $('setupForm').onsubmit({ preventDefault() {} });
  assert.equal(storage.value, undefined);
  assert.equal($('setupReview').hidden, false);
  assert.equal($('setupSummary').textContent, 'English · Boyfriend · Alex');
  $('confirmSetup').onclick();
  assert.equal($('app').hidden, false);
  assert.equal($('inputTitle').textContent, '💌 What did Alex say?');
  assert.equal(JSON.parse(storage.value).partnerName, 'Alex');
  const restored = page(0, () => {}, storage);
  assert.equal(restored('onboarding').hidden, true);
  assert.equal(restored('text').placeholder, "Example: I'm a little busy…");
});

test('invalid saved preferences and denied storage still allow manual setup', () => {
  for (const value of ['{broken', 'null', '{"language":"xx","onboardingCompleted":true}']) {
    const $ = page(0, () => {}, { value });
    assert.equal($('onboarding').hidden, false);
  }
  const $ = page(0, () => {}, { denied: true });
  $('setupName').value = '   '; $('setupDirection').value = 'gf';
  $('setupNext').onclick(); $('setupNext').onclick();
  $('setupForm').onsubmit({ preventDefault() {} });
  assert.equal($('setupError').hidden, false);
  $('setupName').value = '<b>Mai</b>';
  $('setupForm').onsubmit({ preventDefault() {} }); $('confirmSetup').onclick();
  assert.equal($('app').hidden, false);
  assert.equal($('inputTitle').textContent, '💌 <b>Mai</b> nói gì?');
  assert.match($('status').textContent, /Không lưu được/);
});

test('speech keeps result language when settings change and a later decode fails', async () => {
  const requests = [];
  let fail = false;
  const $ = page(80, (url, body) => { requests.push({ url, body }); if (fail && url === '/api/translate') throw new Error('Offline'); });
  $('setupLanguage').value = 'en'; $('setupLanguage').onchange(); $('setupDirection').value = 'gf'; $('setupName').value = 'Emma';
  $('setupForm').onsubmit({ preventDefault() {} }); $('confirmSetup').onclick();
  await $('go').onclick();
  assert.equal(requests.at(-1).body.language, 'en');
  assert.equal(requests.at(-1).body.partnerName, 'Emma');
  assert.equal($('dangerLabel').textContent, 'Red alert');
  $('settings').onclick(); $('setupLanguage').value = 'vi'; $('setupLanguage').onchange(); $('cancelSetup').onclick();
  assert.equal($('dangerLabel').textContent, 'Red alert');
  $('chooseReply').onclick(); $('text').value = 'Next';
  fail = true; await $('go').onclick(); await $('speak').onclick();
  assert.equal(requests.at(-1).body.language, 'en');
});


test('speech releases its object URL after playback or a rejected play call', async () => {
  for (const playDenied of [false, true]) {
    const storage = { playDenied };
    const $ = page(0, () => {}, storage);
    await $('go').onclick(); await $('speak').onclick();
    if (!playDenied) { assert.equal(storage.released, undefined); storage.audio.onended(); }
    assert.equal(storage.released, 'blob:audio');
    assert.equal($('speak').disabled, false);
  }
});


test('bot guides option/input focus and only speaks during audio playback', async () => {
  const storage = {};
  const $ = page(0, () => {}, storage);
  $('setupDirection').onfocus();
  assert.equal($('setupBot')['data-state'], 'choose');
  $('setupName').onfocus();
  assert.equal($('setupBot')['data-state'], 'input');
  $('text').onfocus();
  assert.equal($('inputBot')['data-state'], 'input');
  await $('go').onclick();
  await $('speak').onclick();
  assert.equal($('resultBot')['data-state'], 'reading');
  assert.equal($('speak').disabled, true);
  storage.audio.onpause();
  assert.equal($('resultBot')['data-state'], 'idle');
  storage.audio.onplaying();
  assert.equal($('resultBot')['data-state'], 'reading');
  storage.audio.onended();
  assert.equal($('resultBot')['data-state'], 'idle');
  assert.equal($('speak').disabled, false);
  await $('speak').onclick();
  const oldAudio = storage.audio;
  $('chooseReply').onclick(); $('text').value = 'Next';
  await $('go').onclick();
  assert.equal(oldAudio.paused, true);
  assert.equal($('resultBot')['data-state'], 'idle');
  oldAudio.onplaying();
  assert.equal($('resultBot')['data-state'], 'idle');
});

test('bot stops and releases audio on playback error or opening settings', async () => {
  const storage = {};
  const $ = page(0, () => {}, storage);
  await $('go').onclick(); await $('speak').onclick();
  storage.audio.onerror();
  assert.equal($('resultBot')['data-state'], 'idle');
  assert.equal($('speak').disabled, false);
  assert.equal($('err').hidden, false);
  await $('speak').onclick();
  const audio = storage.audio;
  $('settings').onclick();
  assert.equal(audio.paused, true);
  assert.equal($('resultBot')['data-state'], 'idle');
  assert.equal($('setupBot')['data-state'], 'greet');
});


test('a canceled pending speech response cannot restart the reading animation', async () => {
  let resolveBlob;
  const storage = { pendingBlob: new Promise(resolve => { resolveBlob = resolve; }) };
  const $ = page(0, () => {}, storage);
  await $('go').onclick();
  const pending = $('speak').onclick();
  assert.equal($('resultBot')['data-state'], 'idle');
  $('chooseReply').onclick(); $('text').value = 'Next';
  await $('go').onclick();
  resolveBlob({}); await pending;
  assert.equal(storage.audio, undefined);
  assert.equal($('resultBot')['data-state'], 'idle');
  assert.equal($('speak').disabled, false);
});

test('start over opens blank onboarding, allows cancel, and saves only after confirmation', async () => {
  assert.doesNotMatch(html, /data-dir=|class="toggle"/);
  assert.match(html, /data-i18n="Làm lại từ đầu"/);
  const storage = {};
  const $ = page(0, () => {}, storage);
  setup($, 'bf', 'en', 'Alex');
  const saved = storage.value;
  $('text').value = 'A message';
  $('settings').onclick();
  assert.equal($('onboarding').hidden, false);
  assert.equal($('app').hidden, true);
  assert.equal($('settings').hidden, true);
  assert.equal($('setupForm').hidden, false);
  assert.equal($('setupReview').hidden, true);
  assert.equal($('setupDirection').value, '');
  assert.equal($('setupName').value, '');
  assert.equal(storage.value, saved);
  $('setupNext').onclick();
  $('setupForm').onsubmit({ preventDefault() {} });
  assert.equal($('setupError').hidden, false);
  $('cancelSetup').onclick();
  assert.equal($('app').hidden, false);
  assert.equal($('inputTitle').textContent, '💌 What did Alex say?');
  assert.equal($('text').value, 'A message');
  setup($, 'gf', 'vi', 'Mai');
  assert.equal(JSON.parse(storage.value).direction, 'gf');
  assert.equal(page(0, () => {}, storage)('inputTitle').textContent, '💌 Mai nói gì?');
});

test('Tim onboarding guides steps, validates choice and preserves values on back', () => {
  const storage = {};
  const $ = page(0, () => {}, storage);
  assert.match($('setupBubble').textContent, /Mình là Tim/);
  assert.equal($('languageStep').hidden, false);
  $('setupNext').onclick();
  assert.equal($('directionStep').hidden, false);
  $('setupNext').onclick();
  assert.equal($('setupError').hidden, false);
  assert.equal($('nameStep').hidden, true);
  $('chooseBf').onclick(); $('setupNext').onclick();
  $('setupName').value = 'Alex';
  $('setupBack').onclick();
  assert.equal($('setupDirection').value, 'bf');
  $('setupNext').onclick();
  assert.equal($('setupName').value, 'Alex');
  $('setupName').value = ' ';
  $('setupForm').onsubmit({ preventDefault() {} });
  assert.equal($('setupReview').hidden, true);
  $('setupName').value = 'Alex';
  $('setupForm').onsubmit({ preventDefault() {} });
  assert.match($('setupBubble').textContent, /Alex/);
  assert.equal(storage.value, undefined);
  $('confirmSetup').onclick();
  assert.match($('inputBubble').textContent, /ảnh đoạn chat/);
});

test('reply and avoid choices persist the selected branch and carry context and actual replies forward', async () => {
  const requests = [], storage = {};
  const $ = page(80, (url, body) => requests.push({ url, body }), storage);
  setup($, 'bf', 'en', 'Alex');
  $('text').value = 'I am busy'; $('context').value = 'After work';
  await $('go').onclick();
  assert.equal(storage.history, undefined); assert.equal($('go').disabled, true);
  $('chooseAvoid').onclick(); $('chooseAvoid').onclick();
  assert.equal($('followup').textContent, 'What did he say next?');
  assert.equal($('go').disabled, false); assert.equal($('text').value, ''); assert.equal($('context').value, 'After work');
  let saved = JSON.parse(storage.history)[0];
  assert.equal(saved.turns.length, 1); assert.equal(saved.turns[0].selection, 'avoid'); assert.equal(saved.turns[0].selectedReply, 'Đừng nói');
  $('sentReply').value = 'I sent something else'; $('sentReply').onchange();
  $('text').value = 'Okay'; await $('go').onclick();
  assert.equal(requests.at(-1).body.history[0].sentReply, 'I sent something else');
  assert.equal(requests.at(-1).body.history[0].selection, 'avoid');
  $('chooseReply').onclick();
  saved = JSON.parse(storage.history)[0]; assert.equal(saved.turns.length, 2); assert.equal(saved.turns[1].selection, 'reply');
  const restored = page(0, () => {}, storage);
  restored('historyList').children[0].children[1].onclick();
  assert.equal(restored('turnCount').textContent, 'Turn 2/10'); assert.equal(restored('context').value, 'After work');
  assert.equal(restored('inputTitle').textContent, '💌 What did Alex say?');
  assert.equal(restored('go').disabled, false);
  restored('historyList').children[0].children[2].onclick();
  assert.deepEqual(JSON.parse(storage.history), []); assert.equal(restored('turnCount').textContent, 'Turn 0/10');
});

test('demo limits count only successful analysis, allow saving the final turn, and follow HTML settings', async () => {
  for (const limit of [10, 15]) {
    let calls = 0, fail = true;
    const storage = {};
    const $ = page(10, url => { if (url === '/api/translate') { calls++; if (fail) throw new Error('Offline'); } }, storage, limit);
    setup($, 'gf'); $('text').value = 'First'; $('context').value = 'Original';
    await $('go').onclick(); assert.equal($('turnCount').textContent, `Lượt 0/${limit}`);
    assert.equal($('text').value, 'First'); assert.equal($('go').disabled, false);
    fail = false;
    for (let i = 1; i <= limit; i++) {
      $('text').value = `Message ${i}`; await $('go').onclick();
      assert.equal($('turnCount').textContent, `Lượt ${i}/${limit}`);
      $('chooseReply').onclick();
    }
    assert.equal($('go').disabled, true); assert.equal($('mic').disabled, true);
    $('saveConversation').onclick(); await $('go').onclick();
    assert.equal(calls, limit + 1); assert.equal(JSON.parse(storage.history)[0].turns.length, limit);
    const raised = page(10, () => {}, storage, limit + 1); raised('historyList').children[0].children[1].onclick();
    assert.equal(raised('go').disabled, false);
    const lowered = page(10, () => {}, storage, limit - 1); lowered('historyList').children[0].children[1].onclick();
    assert.equal(lowered('go').disabled, true);
  }
});

test('image source is reviewed and stored as text, never base64, and storage failures remain retryable', async () => {
  const storage = {};
  const $ = page(10, () => {}, storage); setup($, 'gf');
  $('file').files = [{ data: 'data:image/png;base64,AAA' }]; $('file').onchange();
  await $('go').onclick(); assert.equal($('sourceReview').hidden, false);
  $('sourceText').value = ' '; $('chooseReply').onclick(); assert.equal(storage.history, undefined);
  $('sourceText').value = 'Corrected image text'; storage.denied = true; $('chooseAvoid').onclick();
  assert.match($('historyStatus').textContent, /Không lưu được/); assert.equal($('go').disabled, false);
  storage.denied = false; $('saveConversation').onclick();
  assert.equal(JSON.parse(storage.history)[0].turns[0].text, 'Corrected image text'); assert.doesNotMatch(storage.history, /data:image/);
});

test('a new conversation discards stale API responses and preserves request snapshots during editing', async () => {
  let release;
  const storage = { pendingResult: new Promise(resolve => { release = resolve; }) };
  const $ = page(10, () => {}, storage); setup($, 'gf');
  $('text').value = 'Original'; $('context').value = 'Old context';
  const pending = $('go').onclick(); $('text').value = 'Edited while waiting'; release(); await pending;
  assert.equal($('conversationLog').children[0].children[1].children[1].textContent.includes('Original'), true);
  $('chooseReply').onclick();
  storage.pendingResult = new Promise(resolve => { release = resolve; }); $('text').value = 'Next';
  const old = $('go').onclick(); $('newConversation').onclick(); release(); await old;
  assert.equal($('out').hidden, true); assert.equal($('turnCount').textContent, 'Lượt 0/10'); assert.equal($('go').disabled, false);
});

test('corrupt history does not erase preferences or overwrite stored history on load', () => {
  const storage = { value: JSON.stringify({ language: 'en', direction: 'bf', partnerName: 'Alex', onboardingCompleted: true }), history: '[{"turns":[]}]' };
  const $ = page(0, () => {}, storage);
  assert.equal($('app').hidden, false); assert.equal(storage.history, '[{"turns":[]}]');
  assert.match($('historyStatus').textContent, /Không thể đọc/);
});

test('onboarding opens on the letter flow by default', () => {
  assert.equal(page(10, undefined, { flow: null }).run('flow'), 'letter');
});

test('result choices expose selected state and chat separates their words, chosen reply and analysis', async () => {
  const storage = {};
  const $ = page(25, () => {}, storage); setup($, 'gf');
  $('text').value = '<b>Lời người ấy</b>'; await $('go').onclick();
  assert.equal($('chooseReply').textContent, 'Chọn & hỏi tiếp');
  assert.equal($('chooseReply')['aria-pressed'], 'false');
  $('chooseAvoid').onclick();
  assert.equal($('chooseAvoid').textContent, '✓ Đã chọn');
  assert.equal($('chooseAvoid')['aria-pressed'], 'true');
  const turn = $('conversationLog').children[0];
  assert.equal(turn.children[1].className, 'message incoming');
  assert.equal(turn.children[1].children[1].textContent, '<b>Lời người ấy</b>');
  assert.equal(turn.children[2].className, 'message outgoing');
  assert.equal(turn.children[2].children[1].textContent, 'Đừng nói');
  assert.equal(turn.children[3].tagName, 'DETAILS');
  assert.equal(turn.children[3].children[0].textContent, 'Xem phân tích & gợi ý');
  assert.equal($('historyList').children[0]['aria-current'], 'true');
});

test('save button distinguishes saved and failed saves in both locales', async () => {
  const storage = {};
  const $ = page(25, () => {}, storage); setup($, 'bf', 'en', 'Alex');
  $('text').value = 'Hello'; await $('go').onclick();
  assert.equal($('saveConversation').textContent, 'Save result');
  storage.denied = true; $('chooseReply').onclick();
  assert.equal($('saveConversation').textContent, 'Retry saving');
  storage.denied = false; $('saveConversation').onclick();
  assert.equal($('saveConversation').textContent, '✓ Saved');
});

test('one timeline owns the active result and collapses it after choosing, without losing old turns', async () => {
  const $ = page(25); setup($, 'gf');
  $('text').value = 'First'; await $('go').onclick();
  let row = $('conversationLog').children[0];
  assert.equal(row.children[2].open, true);
  assert.equal(row.children[2].children[1], $('out'));
  $('chooseReply').onclick();
  row = $('conversationLog').children[0];
  assert.equal(row.children[3].open, false);
  assert.equal(row.children[3].children[1], $('out'));
  assert.equal(row.children[2].children.at(-1), $('chosenResponse'));
  $('text').value = 'Next'; await $('go').onclick();
  assert.equal($('conversationLog').children.length, 2);
  assert.notEqual($('conversationLog').children[0].children[3].children[1], $('out'));
  assert.equal($('conversationLog').children[1].children[2].children[1], $('out'));
  $('newConversation').onclick();
  assert.equal($('conversationLog').children.length, 0);
  assert.equal($('resultDock').children.includes($('out')), true);
});
