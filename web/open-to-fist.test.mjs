import test from "node:test";
import assert from "node:assert/strict";
import { OpenToFist } from "./open-to-fist.mjs";

const wrist = { x: 0.4, y: 0.5 };
const frame = (nowMs, changes = {}) => ({
  openConfirmed: false, fistCandidate: false, rightHandSeen: true,
  wrist, nowMs, fresh: true, ...changes,
});

test("right palm to right fist emits once, then requires a new palm", () => {
  const transition = new OpenToFist();
  assert.equal(transition.update(frame(0, { openConfirmed: true })), false);
  assert.equal(transition.update(frame(50, { fistCandidate: true })), false);
  assert.equal(transition.update(frame(90, { fistCandidate: true })), true);
  assert.equal(transition.update(frame(130, { fistCandidate: true })), false);
});

test("losing the hand, stale results, or a distant hand cannot emit Enter", () => {
  for (const interruption of [
    { rightHandSeen: false },
    { fresh: false },
    { wrist: { x: 0.9, y: 0.9 } },
  ]) {
    const transition = new OpenToFist();
    transition.update(frame(0, { openConfirmed: true }));
    transition.update(frame(50, interruption));
    assert.equal(transition.update(frame(100, { fistCandidate: true })), false);
    assert.equal(transition.update(frame(150, { fistCandidate: true })), false);
  }
});

test("a fist without a recent palm cannot emit Enter", () => {
  const transition = new OpenToFist();
  assert.equal(transition.update(frame(0, { fistCandidate: true })), false);
  transition.update(frame(100, { openConfirmed: true }));
  assert.equal(transition.update(frame(1400, { fistCandidate: true })), false);
});
