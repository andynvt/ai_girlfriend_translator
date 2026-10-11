import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../docs/project-hub.html', import.meta.url), 'utf8');
function hub(saved = null, unavailable = false) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '' });
    return elements.get(id);
  };
  const fields = [...html.matchAll(/<(select|textarea) data-store="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g)].map(([, tag, key, attrs, body]) => {
    const options = [...body.matchAll(/<option value="([^"]+)"( selected)?>/g)].map(([, value, selected]) => ({ value, selected }));
    return { dataset: { store: key }, tagName: tag.toUpperCase(), options,
      value: options.find(o => o.selected)?.value || options[0]?.value || '', isTest: attrs.includes('data-test'), addEventListener() {} };
  });
  const context = { document: { querySelectorAll: query => query === '[data-test]' ? fields.filter(f => f.isTest) : fields, getElementById: element },
    localStorage: { getItem: () => saved, setItem(_key, value) { if (unavailable) throw new Error('Denied'); saved = value; } } };
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return { context, fields, element, saved: () => saved };
}

test('hub restores progress and saves notes without changing test counts', () => {
  const { context, fields, element, saved } = hub(JSON.stringify({ 'tc01-status': 'pass', 'tc02-status': 'fail', 'tc03-status': 'blocked', 'tc01-note': '<script>literal text</script>' }));
  assert.equal(fields.filter(f => f.isTest).length, 12);
  assert.equal(element('done').textContent, '2/12');
  assert.equal(element('passed').textContent, 1);
  assert.equal(element('failed').textContent, 1);
  assert.equal(element('remaining').textContent, 10);
  assert.equal(fields.find(f => f.dataset.store === 'tc01-note').value, '<script>literal text</script>');
  fields.find(f => f.dataset.store === 'tc02-status').value = 'pass';
  context.save();
  assert.equal(JSON.parse(saved())['tc02-status'], 'pass');
  assert.equal(element('passed').textContent, 2);
});

test('backup validation rejects invalid state before applying it', () => {
  const { context, fields } = hub();
  for (const value of [null, [], { 'tc01-status': 'unknown' }, { 'tc01-note': 123 }, { 'tc01-note': 'x'.repeat(50001) }]) {
    assert.throws(() => context.validateState(value));
  }
  const clean = context.validateState({ 'tc01-status': 'fail', 'unrelated': 'ignored' });
  assert.equal(JSON.stringify(clean), '{"tc01-status":"fail"}');
  assert.equal(fields.find(f => f.dataset.store === 'tc01-status').value, 'pending');
});

test('storage failures keep the page usable and explain the backup option', () => {
  const { context, element } = hub('{broken', true);
  assert.match(element('saveStatus').textContent, /Không đọc được/);
  context.save();
  assert.match(element('saveStatus').textContent, /xuất bản sao JSON/);
  assert.equal(element('done').textContent, '0/12');
});

test('old progress statuses cannot override source while user notes and manual results survive', () => {
  const old = { 'feature-decode-status': 'verified', 'roadmap-quality-status': 'verified',
    'feature-decode-note': 'Keep my app note', 'roadmap-quality-note': 'Keep my roadmap note',
    'tc02-status': 'fail', 'tc02-note': 'Wrong interpretation' };
  const { context, fields, saved } = hub(JSON.stringify(old));
  const restored = JSON.parse(JSON.stringify(context.collectState()));
  assert.equal(fields.some(f => /^(feature|roadmap)-.*-status$/.test(f.dataset.store)), false);
  for (const key of ['feature-decode-note', 'roadmap-quality-note', 'tc02-status', 'tc02-note']) {
    assert.equal(restored[key], old[key]);
  }
  // Import follows the same validation path as localStorage restoration.
  assert.deepEqual(JSON.parse(JSON.stringify(context.validateState(old))), {
    'feature-decode-note': old['feature-decode-note'], 'tc02-status': 'fail', 'tc02-note': old['tc02-note'],
    'roadmap-quality-note': old['roadmap-quality-note'],
  });
  context.save();
  assert.equal('feature-decode-status' in JSON.parse(saved()), false);
  assert.equal('roadmap-quality-status' in JSON.parse(saved()), false);
});

test('confirmed demo results append notes, update only selected cases and never replay an old result', () => {
  const { context, fields, saved } = hub(JSON.stringify({ 'tc01-note': 'Ghi chú cũ', 'tc02-status': 'fail', 'tc02-note': 'Giữ nguyên' }));
  const report = { version: 1, runId: 'run-1', cases: { tc01: { status: 'pass', note: 'Đã kiểm tra output', completedAt: '2026-10-11T10:00:00Z' } } };
  context.mergeManualResults(report);
  const first = saved();
  assert.equal(JSON.parse(first)['tc01-status'], 'pass');
  assert.match(JSON.parse(first)['tc01-note'], /^Ghi chú cũ\n\n\[Manual demo run-1\/tc01\]/);
  assert.equal(JSON.parse(first)['tc02-status'], 'fail'); assert.equal(JSON.parse(first)['tc02-note'], 'Giữ nguyên');
  fields.find(f => f.dataset.store === 'tc01-status').value = 'fail'; context.save();
  context.mergeManualResults(report); assert.equal(JSON.parse(saved())['tc01-status'], 'fail');
  hub(saved()).context.mergeManualResults(report);
});

test('automatic demo evidence preserves all manual verdicts and notes', () => {
  const { context, saved } = hub(JSON.stringify({ 'tc01-status': 'pass', 'tc01-note': 'Manual evidence', 'tc02-status': 'fail' }));
  const report = { version: 1, mode: 'automatic', runId: 'auto-1', cases: {
    tc01: { status: 'blocked', note: 'Automatic checks completed; manual review pending', completedAt: '2026-10-11T10:00:00Z' },
    tc02: { status: 'fail', note: 'Automatic check failed', completedAt: '2026-10-11T10:00:00Z' },
    tc03: { status: 'blocked', note: 'Not manually reviewed', completedAt: '2026-10-11T10:00:00Z' },
  } };
  context.mergeManualResults(report);
  const state = JSON.parse(saved());
  assert.equal(state['tc01-status'], 'pass');
  assert.equal(state['tc02-status'], 'fail');
  assert.equal(state['tc03-status'], 'pending');
  assert.match(state['tc01-note'], /^Manual evidence/);
  assert.match(state['tc01-note'], /manual review pending/);
  context.mergeManualResults(report); assert.deepEqual(JSON.parse(saved()), state);
  assert.throws(() => context.mergeManualResults({ ...report, mode: 'unknown' }));
});

test('invalid demo reports and full notes cannot partially overwrite existing manual results', () => {
  const { context, saved } = hub(JSON.stringify({ 'tc01-status': 'fail', 'tc01-note': 'x'.repeat(49999) }));
  const before = saved();
  const result = { status: 'pass', note: 'New evidence', completedAt: '2026-10-11T10:00:00Z' };
  for (const cases of [{ tc01: result }, { tc02: result, tc13: result }, { tc01: { ...result, status: 'pending' } }]) {
    assert.throws(() => context.mergeManualResults({ version: 1, runId: 'run-2', cases })); assert.equal(saved(), before);
  }
  const denied = hub(null, true);
  assert.throws(() => denied.context.mergeManualResults({ version: 1, runId: 'run-2', cases: { tc01: result } }), /Chưa lưu được/);
  assert.equal(denied.fields.find(f => f.dataset.store === 'tc01-status').value, 'pending');
});
