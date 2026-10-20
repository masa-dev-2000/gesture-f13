// One Enter event for a continuous physical right-hand Open_Palm -> Closed_Fist.
export class OpenToFist {
  constructor({ maxGapMs = 1200, maxWristDistance = 0.3, fistFrames = 2 } = {}) {
    this.maxGapMs = maxGapMs;
    this.maxWristDistance = maxWristDistance;
    this.fistFrames = fistFrames;
    this.reset();
  }

  reset() {
    this.armed = false;
    this.lastOpenAt = 0;
    this.lastOpenWrist = null;
    this.consecutiveFist = 0;
  }

  update({ openConfirmed, fistCandidate, rightHandSeen, wrist, nowMs, fresh }) {
    if (!fresh || !rightHandSeen || !wrist) {
      this.reset();
      return false;
    }
    if (openConfirmed) {
      this.armed = true;
      this.lastOpenAt = nowMs;
      this.lastOpenWrist = wrist;
      this.consecutiveFist = 0;
      return false;
    }
    if (!this.armed || nowMs - this.lastOpenAt > this.maxGapMs) {
      this.reset();
      return false;
    }
    const distance = Math.hypot(wrist.x - this.lastOpenWrist.x, wrist.y - this.lastOpenWrist.y);
    if (distance > this.maxWristDistance) {
      this.reset();
      return false;
    }
    this.consecutiveFist = fistCandidate ? this.consecutiveFist + 1 : 0;
    if (this.consecutiveFist < this.fistFrames) return false;
    this.reset();
    return true;
  }
}
