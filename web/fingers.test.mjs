import assert from "node:assert/strict";
import test from "node:test";
import { classifyFingers, FingerFromFist, oneRaisedFinger } from "./fingers.mjs";

function hand(raised = []) {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  points[5] = { x: -.4, y: 0, z: 0 };
  points[17] = { x: .4, y: 0, z: 0 };
  for (const [name, base, x] of [
    ["INDEX", 5, -.4], ["MIDDLE", 9, -.15], ["RING", 13, .15], ["PINKY", 17, .4]
  ]) {
    points[base] = { x, y: 0, z: 0 };
    if (raised.includes(name)) {
      points[base + 1] = { x, y: -.3, z: 0 };
      points[base + 2] = { x, y: -.6, z: 0 };
      points[base + 3] = { x, y: -.9, z: 0 };
    } else {
      points[base + 1] = { x, y: -.3, z: 0 };
      points[base + 2] = { x: x + .18, y: -.3, z: 0 };
      points[base + 3] = { x: x + .18, y: -.05, z: 0 };
    }
  }
  points[1] = { x: -.5, y: .15, z: 0 };
  points[2] = { x: -.6, y: .1, z: 0 };
  points[3] = { x: raised.includes("THUMB") ? -.9 : -.4, y: 0, z: 0 };
  points[4] = { x: raised.includes("THUMB") ? -1.25 : -.15, y: 0, z: 0 };
  return points;
}

test("recognizes each single raised finger and rejects combinations", () => {
  for (const name of ["THUMB", "INDEX", "MIDDLE", "RING", "PINKY"]) {
    const states = classifyFingers(hand([name]));
    assert.equal(oneRaisedFinger(states), name, JSON.stringify(states));
  }
  assert.equal(oneRaisedFinger(classifyFingers(hand())), null);
  assert.equal(oneRaisedFinger(classifyFingers(hand(["INDEX", "MIDDLE"]))), null);
  assert.equal(oneRaisedFinger({ THUMB: "uncertain", INDEX: "extended", MIDDLE: "curled", RING: "curled", PINKY: "curled" }), "INDEX");
});

test("requires fist, confirms two frames, and rearms only after a new fist", () => {
  const detector = new FingerFromFist();
  const index = classifyFingers(hand(["INDEX"]));
  const middle = classifyFingers(hand(["MIDDLE"]));
  const frame = (states, fistConfirmed = false, handSeen = true) => detector.update({ states, fistConfirmed, handSeen, fresh: true });
  assert.equal(frame(index), null);
  assert.equal(frame(classifyFingers(hand()), true), null);
  assert.equal(frame(index), null);
  assert.equal(frame(index), "INDEX");
  assert.equal(frame(index), "INDEX");
  assert.equal(frame(middle), null);
  assert.equal(frame(middle), null);
  assert.equal(frame(classifyFingers(hand()), true), null);
  assert.equal(frame(middle), null);
  assert.equal(frame(middle), "MIDDLE");
  assert.equal(frame(null, false, false), null);
  assert.equal(frame(index), null);
});
