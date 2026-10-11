import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { readCases, options, speakMac, automaticResult } from '../scripts/manual-demo.mjs';

test('all 12 manual cases come from the maintained scenarios with expectations', async () => {
  const cases = readCases(await readFile(new URL('../docs/manual-test.md', import.meta.url), 'utf8'));
  assert.deepEqual(cases.map(c => c.id), Array.from({ length: 12 }, (_, i) => 'tc' + String(i + 1).padStart(2, '0')));
  for (const c of cases) { assert.ok(c.title); assert.ok(c.expected); assert.ok(c.body.includes('**Mong đợi:**')); }
  const english = readCases(await readFile(new URL('../docs/manual-demo-en.md', import.meta.url), 'utf8'));
  assert.deepEqual(english.map(c => c.id), cases.map(c => c.id));
  for (const c of english) { assert.ok(c.title); assert.ok(c.expected); assert.match(c.body, /\*\*Expected:\*\*/); assert.match(c.title + c.body, /^[\x00-\x7F]+$/); }
});

test('CLI validates target, voice and case selection before starting browser or paid calls', () => {
  assert.equal(options([]).voice, 'mac'); assert.equal(options([]).ids, null);
  assert.deepEqual(options(['--cases', 'TC03,TC01', '--voice', 'off']).ids, ['tc03', 'tc01']);
  for (const args of [['--cases', 'TC13'], ['--cases', 'TC01,TC01'], ['--voice', 'expensive'], ['--voice', 'openai'], ['--voice', 'browser'], ['--url', 'file:///etc/passwd'], ['--url', 'https://user:pass@example.org'], ['--unknown']]) assert.throws(() => options(args));
});

test('automatic demo results never claim a manual pass', () => {
  assert.equal(automaticResult(null).status, 'blocked');
  assert.match(automaticResult(null).note, /Manual review.*pending/);
  assert.deepEqual(automaticResult(new Error('wrong output')), { status: 'fail', note: 'Automatic checks failed: wrong output' });
});

test('voice uses only local macOS say, passes text on stdin and waits for completion', async () => {
  const child = new EventEmitter();
  let input;
  child.stdin = new EventEmitter();
  child.stdin.end = text => { input = text; };
  const controller = new AbortController();
  const launch = (command, args, opts) => {
    assert.equal(command, '/usr/bin/say');
    assert.deepEqual(args, ['-v', 'Samantha', '-r', '201.25']);
    assert.equal(opts.shell, undefined);
    assert.equal(opts.signal, controller.signal);
    assert.equal(opts.timeout, 120000);
    return child;
  };
  const reading = speakMac('Đọc bước một; $(touch /tmp/not-a-command)', { launch, signal: controller.signal });
  assert.equal(input, 'Đọc bước một; $(touch /tmp/not-a-command)');
  child.emit('close', 0); await reading;
  const failed = speakMac('Lỗi voice', { launch, signal: controller.signal });
  child.emit('close', 1); await assert.rejects(failed, /macOS Samantha/);
  const unavailable = speakMac('Không có say', { launch, signal: controller.signal });
  child.emit('error', new Error('ENOENT')); await assert.rejects(unavailable, /ENOENT/);
});
