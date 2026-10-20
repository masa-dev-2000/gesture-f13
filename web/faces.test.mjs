import assert from 'node:assert/strict';
import test from 'node:test';
import { FACES, StableFace, blendshapeMap } from './faces.mjs';

const neutral = { jawOpen: 0, mouthSmileLeft: 0, mouthSmileRight: 0, browInnerUp: 0, mouthPucker: 0, eyeBlinkLeft: 0, eyeBlinkRight: 0 };

test('five face expressions have distinct ids', () => {
  assert.equal(new Set(FACES.map(f => f.id)).size, 5);
});

test('maps blendshape categories by name', () => {
  assert.deepEqual(blendshapeMap([{ categoryName: 'jawOpen', score: .7 }]), { jawOpen: .7 });
});

test('requires a held expression and ignores brief movement', () => {
  const face = new StableFace();
  const open = { ...neutral, jawOpen: .8 };
  assert.equal(face.update(open, 0, true), null);
  assert.equal(face.update(neutral, 200, true), null);
  assert.equal(face.update(open, 300, true), null);
  assert.equal(face.update(open, 650, true), null);
  assert.equal(face.update(open, 700, true), 'MOUTH_OPEN');
});

test('keeps active above exit threshold and releases below it or on stale result', () => {
  const face = new StableFace();
  const smile = { ...neutral, mouthSmileLeft: .9, mouthSmileRight: .9 };
  face.update(smile, 0, true);
  assert.equal(face.update(smile, 400, true), 'SMILE');
  assert.equal(face.update({ ...smile, mouthSmileLeft: .5 }, 450, true), 'SMILE');
  assert.equal(face.update({ ...smile, mouthSmileLeft: .3 }, 500, true), null);
  face.update(smile, 600, true);
  face.update(smile, 1000, true);
  assert.equal(face.update(smile, 1050, false), null);
});

test('a normal blink of both eyes is not a wink', () => {
  const face = new StableFace();
  const blink = { ...neutral, eyeBlinkLeft: .95, eyeBlinkRight: .95 };
  face.update(blink, 0, true);
  assert.equal(face.update(blink, 500, true), null);
  const wink = { ...neutral, eyeBlinkLeft: .9, eyeBlinkRight: .1 };
  face.update(wink, 600, true);
  assert.equal(face.update(wink, 1000, true), 'WINK');
});
