export const FINGER_NAMES = ["THUMB", "INDEX", "MIDDLE", "RING", "PINKY"];

const fingerJoints = {
  INDEX: [5, 6, 7, 8],
  MIDDLE: [9, 10, 11, 12],
  RING: [13, 14, 15, 16],
  PINKY: [17, 18, 19, 20],
};

function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function reach(points, joints) {
  const [base, middle, nearTip, tip] = joints.map(index => points[index]);
  const path = distance(base, middle) + distance(middle, nearTip) + distance(nearTip, tip);
  return path > 0 ? distance(base, tip) / path : 0;
}

// World landmarks allow the measurement to follow a hand that rotates in front of the camera.
// "uncertain" deliberately blocks shortcuts until the finger is clearly bent or extended.
export function classifyFingers(points) {
  const states = Object.fromEntries(FINGER_NAMES.map(name => [name, "uncertain"]));
  if (!Array.isArray(points) || points.length < 21) return states;
  const palmWidth = distance(points[5], points[17]);
  if (!(palmWidth > 0)) return states;
  const thumbReach = reach(points, [1, 2, 3, 4]);
  const thumbSpread = distance(points[4], points[17]) / palmWidth;
  states.THUMB = thumbReach >= 0.78 && thumbSpread >= 1.35 ? "extended" :
    thumbReach <= 0.66 || thumbSpread <= 1.12 ? "curled" : "uncertain";
  for (const [name, joints] of Object.entries(fingerJoints)) {
    const value = reach(points, joints);
    states[name] = value >= 0.82 ? "extended" : value <= 0.68 ? "curled" : "uncertain";
  }
  return states;
}

export function oneRaisedFinger(states) {
  if (!states) return null;
  const raised = FINGER_NAMES.filter(name => states[name] === "extended");
  // A partly hidden bent finger can be uncertain; only a second clearly extended finger blocks the command.
  if (raised.length !== 1) return null;
  return raised[0];
}

export class FingerFromFist {
  constructor({ confirmFrames = 2 } = {}) {
    this.confirmFrames = confirmFrames;
    this.reset();
  }

  reset() {
    this.armed = false;
    this.active = null;
    this.candidate = null;
    this.frames = 0;
    this.hasTriggered = false;
  }

  update({ fistConfirmed, states, handSeen, fresh }) {
    if (!fresh || !handSeen) { this.reset(); return null; }
    if (fistConfirmed) {
      this.armed = true;
      this.active = null;
      this.candidate = null;
      this.frames = 0;
      this.hasTriggered = false;
      return null;
    }
    const finger = oneRaisedFinger(states);
    if (this.active) {
      if (finger === this.active) return this.active;
      this.active = null;
      this.armed = false;
      return null;
    }
    if (!this.armed || !finger) { this.candidate = null; this.frames = 0; return null; }
    this.frames = finger === this.candidate ? this.frames + 1 : 1;
    this.candidate = finger;
    if (this.frames < this.confirmFrames) return null;
    this.active = finger;
    this.armed = false;
    this.hasTriggered = true;
    return finger;
  }
}
