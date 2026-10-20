// Face expressions come from MediaPipe Face Landmarker blendshape scores (0..1).
// Head direction is derived from landmarks and added to the same score map as head* entries.
const both = (s, a, b) => Math.min(s[a] ?? 0, s[b] ?? 0);

export const FACES = [
  { id: "MOUTH_OPEN", name: "口を大きく開ける", icon: "😮", score: s => s.jawOpen },
  { id: "SMILE", name: "にっこり笑う", icon: "😁", score: s => both(s, "mouthSmileLeft", "mouthSmileRight") },
  { id: "PUCKER", name: "口をすぼめる", icon: "😗", score: s => s.mouthPucker },
  { id: "CHEEK_PUFF", name: "頬をふくらませる", icon: "🐡", score: s => s.cheekPuff },
  { id: "TONGUE_OUT", name: "舌を出す", icon: "😛", score: s => s.tongueOut },
  // The preview is mirrored, so the model's mouthRight is the user's left.
  { id: "MOUTH_LEFT", name: "口を左に寄せる", icon: "🫤", score: s => s.mouthRight },
  { id: "MOUTH_RIGHT", name: "口を右に寄せる", icon: "🫤", score: s => s.mouthLeft },
  { id: "BROWS_UP", name: "眉を上げる", icon: "🤨", score: s => s.browInnerUp },
  { id: "BROWS_DOWN", name: "眉をしかめる", icon: "😠", score: s => both(s, "browDownLeft", "browDownRight") },
  { id: "WINK", name: "片目をつぶる", icon: "😉",
    score: s => Math.abs((s.eyeBlinkLeft ?? 0) - (s.eyeBlinkRight ?? 0)) },
  { id: "HEAD_LEFT", name: "顔を左に向ける", icon: "⬅️", score: s => s.headLeft },
  { id: "HEAD_RIGHT", name: "顔を右に向ける", icon: "➡️", score: s => s.headRight },
  { id: "HEAD_UP", name: "顔を上げる", icon: "⬆️", score: s => s.headUp },
  { id: "HEAD_DOWN", name: "うなずく", icon: "⬇️", score: s => s.headDown }
];

export const FACE_BY_ID = new Map(FACES.map(face => [face.id, face]));

// Sensitivity is the score an expression must reach. Lower means it reacts more easily.
export const SENSITIVITIES = [
  { value: 0.3, name: "とても反応しやすい" },
  { value: 0.45, name: "反応しやすい" },
  { value: 0.6, name: "ふつう" },
  { value: 0.75, name: "反応しにくい" }
];

export function blendshapeMap(categories) {
  const map = {};
  for (const category of categories ?? []) map[category.categoryName] = category.score;
  return map;
}

const clamp01 = value => Math.max(0, Math.min(1, value));

// Nose position between the cheeks (yaw) and between eye line and chin (pitch).
// Pitch has no fixed neutral value per person, so it is compared to a slow baseline.
export class HeadDirection {
  constructor() { this.pitchBaseline = null; }

  reset() { this.pitchBaseline = null; }

  scores(landmarks, settle) {
    if (!landmarks?.length) return {};
    const nose = landmarks[1], left = landmarks[234], right = landmarks[454], chin = landmarks[152];
    const eyeY = (landmarks[33].y + landmarks[263].y) / 2;
    const yaw = (nose.x - left.x) / (right.x - left.x) - 0.5;
    const pitch = (nose.y - eyeY) / (chin.y - eyeY);
    this.pitchBaseline ??= pitch;
    if (settle) this.pitchBaseline += (pitch - this.pitchBaseline) * 0.02;
    const tilt = pitch - this.pitchBaseline;
    return {
      headLeft: clamp01(-yaw / 0.2), headRight: clamp01(yaw / 0.2),
      headUp: clamp01(-tilt / 0.12), headDown: clamp01(tilt / 0.12)
    };
  }
}

// Talking and blinking move the face briefly, so an expression must be held above its
// sensitivity for its hold time, and clearly beat the runner-up so similar mouth shapes
// do not trigger each other. It releases below two thirds of its sensitivity.
export class StableFace {
  constructor({ enter = 0.6, holdMs = 400, margin = 0.25 } = {}) {
    Object.assign(this, { enter, holdMs, margin });
    this.reset();
  }

  reset() {
    this.candidate = null;
    this.since = 0;
    this.active = null;
  }

  update(shapes, now, fresh, holdMsById = {}, enterById = {}) {
    if (!fresh || !shapes) {
      this.reset();
      return null;
    }
    const scored = FACES.map(face => {
      const enter = enterById[face.id] ?? this.enter;
      return { id: face.id, enter, level: (face.score(shapes) ?? 0) / enter };
    }).sort((a, b) => b.level - a.level);
    if (this.active) {
      if (scored.find(item => item.id === this.active).level >= 2 / 3) return this.active;
      this.reset();
    }
    const [best, second] = scored;
    if (best.level < 1 || best.level - second.level < this.margin) {
      this.candidate = null;
      return null;
    }
    if (best.id !== this.candidate) {
      this.candidate = best.id;
      this.since = now;
    }
    if (now - this.since >= (holdMsById[best.id] ?? this.holdMs)) this.active = best.id;
    return this.active;
  }
}
