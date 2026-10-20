// A swipe is one deliberate movement of a continuously tracked hand.
export class SwipeDetector {
  constructor({ distance = 0.17, maxMs = 700, cooldownMs = 600 } = {}) {
    this.distance = distance;
    this.maxMs = maxMs;
    this.cooldownMs = cooldownMs;
    this.reset();
  }

  reset() {
    this.anchor = null;
    this.previous = null;
    this.lastEventAt = -Infinity;
  }

  update(point, nowMs) {
    if (!point) { this.anchor = null; this.previous = null; return null; }
    if (this.previous && Math.hypot(point.x - this.previous.x, point.y - this.previous.y) > 0.45) {
      this.anchor = null;
    }
    this.previous = { x: point.x, y: point.y };
    if (!this.anchor || nowMs - this.anchor.at > this.maxMs) {
      this.anchor = { x: point.x, y: point.y, at: nowMs };
      return null;
    }
    const dx = point.x - this.anchor.x;
    const dy = point.y - this.anchor.y;
    const horizontal = Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) >= this.distance;
    const vertical = Math.abs(dy) > Math.abs(dx) * 1.5 && Math.abs(dy) >= this.distance;
    if (!horizontal && !vertical) return null;
    this.anchor = { x: point.x, y: point.y, at: nowMs };
    if (nowMs - this.lastEventAt < this.cooldownMs) return null;
    this.lastEventAt = nowMs;
    return horizontal ? (dx > 0 ? "RIGHT" : "LEFT") : (dy > 0 ? "DOWN" : "UP");
  }
}
