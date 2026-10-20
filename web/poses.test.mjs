import assert from 'node:assert/strict';
import test from 'node:test';
import { POSES, StablePose } from './poses.mjs';

test('six assignable model gestures have distinct ids', () => {
  assert.deepEqual(POSES.map(p => p.model), [
    'Open_Palm', 'Pointing_Up', 'Thumb_Up', 'Thumb_Down', 'Victory', 'ILoveYou'
  ]);
  assert.equal(new Set(POSES.map(p => p.id)).size, 6);
});

test('confirms a pose twice, switches poses, and releases on missing or weak result', () => {
  const pose = new StablePose();
  assert.equal(pose.update('Open_Palm', .9, .9, true), null);
  assert.equal(pose.update('Open_Palm', .9, .9, true), 'Open_Palm');
  assert.equal(pose.update('Victory', .9, .9, true), null);
  assert.equal(pose.update('Victory', .9, .9, true), 'Victory');
  assert.equal(pose.update('Victory', .59, .9, true), null);
  assert.equal(pose.update('Victory', .9, .9, true), null);
  assert.equal(pose.update('Victory', .9, .9, true), 'Victory');
  assert.equal(pose.update(null, 0, 0, true), null);
  assert.equal(pose.update('Closed_Fist', .9, .9, false), null);
  assert.equal(pose.update('Closed_Fist', .9, .9, true), null);
  assert.equal(pose.update('Closed_Fist', .9, .9, true), 'Closed_Fist');
});
