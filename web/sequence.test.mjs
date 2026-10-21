import assert from 'node:assert/strict';
import test from 'node:test';
import { canHold, moveStep, summarize } from './sequence.mjs';

const shortcut = keys => ({ kind: 'shortcut', keys });

test('hold is only allowed for a single shortcut', () => {
  assert.equal(canHold([shortcut('F13')]), true);
  assert.equal(canHold([]), false);
  assert.equal(canHold([{ kind: 'text', text: 'a' }]), false);
  assert.equal(canHold([shortcut('F13'), shortcut('ENTER')]), false);
});

test('summarizes steps and truncates long text', () => {
  assert.equal(summarize([]), '未割り当て');
  assert.equal(summarize([shortcut('CTRL+L'), { kind: 'wait', ms: 300 }, { kind: 'text', text: 'こんにちは\n世界' }]),
    'CTRL + L → 0.3秒待つ → 「こんにちは↵世界」');
  assert.equal(summarize([{ kind: 'text', text: 'abcdefghijklmnop' }]), '「abcdefghijkl…」');
  assert.match(summarize([shortcut('A'), shortcut('B'), shortcut('C'), shortcut('D')]), /全4手順/);
});

test('moves steps within bounds', () => {
  const steps = [shortcut('A'), shortcut('B'), shortcut('C')];
  assert.deepEqual(moveStep(steps, 0, 1).map(s => s.keys), ['B', 'A', 'C']);
  assert.equal(moveStep(steps, 0, -1), steps);
});
