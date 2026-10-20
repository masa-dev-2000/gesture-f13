import assert from 'node:assert/strict';
import test from 'node:test';
import { FACES, HeadDirection, StableFace, blendshapeMap } from './faces.mjs';

const neutral = { jawOpen: 0, mouthSmileLeft: 0, mouthSmileRight: 0, browInnerUp: 0, mouthPucker: 0, eyeBlinkLeft: 0, eyeBlinkRight: 0 };

test('fourteen face expressions have distinct ids', () => {
  assert.equal(new Set(FACES.map(f => f.id)).size, 14);
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

test('uses a per-expression hold time', () => {
  const face = new StableFace();
  const pucker = { ...neutral, mouthPucker: .9 };
  face.update(pucker, 0, true, { PUCKER: 1000 });
  assert.equal(face.update(pucker, 900, true, { PUCKER: 1000 }), null);
  assert.equal(face.update(pucker, 1000, true, { PUCKER: 1000 }), 'PUCKER');
});

test('similar expressions that score close together do not trigger', () => {
  const face = new StableFace();
  const mixed = { ...neutral, jawOpen: .7, mouthPucker: .65 };
  face.update(mixed, 0, true);
  assert.equal(face.update(mixed, 1000, true), null);
});

test('a lower sensitivity value lets a weak expression trigger', () => {
  const face = new StableFace();
  const weak = { ...neutral, jawOpen: .35 };
  face.update(weak, 0, true);
  assert.equal(face.update(weak, 500, true), null);
  face.update(weak, 600, true, {}, { MOUTH_OPEN: .3 });
  assert.equal(face.update(weak, 1000, true, {}, { MOUTH_OPEN: .3 }), 'MOUTH_OPEN');
});

test('head direction scores follow the nose position', () => {
  const head = new HeadDirection();
  const points = nx => Object.assign([], { 1: { x: nx, y: .5 }, 234: { x: .3, y: .5 }, 454: { x: .7, y: .5 },
    152: { x: .5, y: .8 }, 33: { x: .4, y: .4 }, 263: { x: .6, y: .4 } });
  assert.equal(head.scores(points(.5), true).headLeft, 0);
  assert.ok(head.scores(points(.38), false).headLeft > .9);
  assert.ok(head.scores(points(.62), false).headRight > .9);
});
