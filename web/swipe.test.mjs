import assert from "node:assert/strict";
import test from "node:test";
import { SwipeDetector } from "./swipe.mjs";

test("detects each direction from the viewer's mirrored image", () => {
  for (const [point, expected] of [
    [{ x: .72, y: .5 }, "RIGHT"], [{ x: .28, y: .5 }, "LEFT"],
    [{ x: .5, y: .28 }, "UP"], [{ x: .5, y: .72 }, "DOWN"]
  ]) {
    const detector = new SwipeDetector();
    assert.equal(detector.update({ x: .5, y: .5 }, 0), null);
    assert.equal(detector.update(point, 200), expected);
  }
});

test("ignores diagonal drift, gaps, and immediate repeats", () => {
  const detector = new SwipeDetector();
  detector.update({ x: .2, y: .2 }, 0);
  assert.equal(detector.update({ x: .4, y: .4 }, 150), null);
  detector.update(null, 200);
  assert.equal(detector.update({ x: .8, y: .2 }, 250), null);
  assert.equal(detector.update({ x: .6, y: .2 }, 300), "LEFT");
  assert.equal(detector.update({ x: .3, y: .2 }, 350), null);
});
