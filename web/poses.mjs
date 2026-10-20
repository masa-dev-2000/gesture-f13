export const POSES = [
  { model: "Open_Palm", id: "OPEN", name: "パー", icon: "🖐️" },
  { model: "Pointing_Up", id: "POINT", name: "指差し", icon: "☝️" },
  { model: "Thumb_Up", id: "THUMB_UP", name: "親指を上", icon: "👍" },
  { model: "Thumb_Down", id: "THUMB_DOWN", name: "親指を下", icon: "👎" },
  { model: "Victory", id: "VICTORY", name: "ピース", icon: "✌️" },
  { model: "ILoveYou", id: "ILOVEYOU", name: "I Love You", icon: "🤟" }
];

export const POSE_BY_MODEL = new Map(POSES.map(pose => [pose.model, pose]));

// A new pose must survive two camera results; a missing result releases immediately.
export class StablePose {
  constructor(confirmFrames = 2) {
    this.confirmFrames = confirmFrames;
    this.reset();
  }

  reset() {
    this.candidate = null;
    this.frames = 0;
    this.active = null;
  }

  update(model, score, handScore, fresh) {
    if (!fresh || handScore < 0.8 || score < 0.6 ||
        (model !== "Closed_Fist" && !POSE_BY_MODEL.has(model))) {
      this.reset();
      return null;
    }
    if (model === this.active) return model;
    if (model !== this.candidate) {
      this.candidate = model;
      this.frames = 1;
    } else {
      this.frames++;
    }
    this.active = this.frames >= this.confirmFrames ? model : null;
    return this.active;
  }
}
