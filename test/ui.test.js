import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Exercise the page's actual script without a browser or live API calls.
function page(danger) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', disabled: false, hidden: true, files: [],
      style: { setProperty(key, value) { this[key] = value; } },
      setAttribute(key, value) { this[key] = value; },
      removeAttribute(key) { delete this[key]; },
      replaceChildren() {}, scrollIntoView() {},
    });
    return elements.get(id);
  };
  const context = {
    document: { getElementById: element, querySelectorAll: () => [], createElement: () => ({}) },
    window: {}, matchMedia: () => ({ matches: true }), requestAnimationFrame: (fn) => fn(),
    fetch: async () => ({ ok: true, json: async () => ({ danger, meaning: 'Ý nghĩa', reply: 'Trả lời', avoid: 'Đừng nói' }) }),
  };
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return element;
}

test('danger meter, label and mascot agree at each threshold', async () => {
  for (const [danger, label, color, face] of [
    [0, 'Êm đẹp', 'safe', '• ‿ •'], [39, 'Êm đẹp', 'safe', '• ‿ •'],
    [40, 'Có mùi dỗi', 'warning', '• _ •'], [69, 'Có mùi dỗi', 'warning', '• _ •'],
    [70, 'Báo động đỏ', 'danger', 'O ﹏ O'], [100, 'Báo động đỏ', 'danger', 'O ﹏ O'],
  ]) {
    const $ = page(danger);
    await $('go').onclick();
    assert.equal($('dangerLabel').textContent, label);
    assert.equal($('out').style['--level-color'], `var(--${color})`);
    assert.equal($('mascotFace').textContent, face);
    assert.equal($('dangerMeter')['aria-valuenow'], danger);
    assert.equal($('bar').style.width, `${danger}%`);
    assert.equal($('empty').hidden, true);
    assert.equal($('out').hidden, false);
    assert.equal($('go').disabled, false);
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
