// Face expressions come from MediaPipe Face Landmarker blendshape scores (0..1).
export const FACES = [
  { id: "MOUTH_OPEN", name: "口を大きく開ける", icon: "😮", score: s => s.jawOpen },
  { id: "SMILE", name: "にっこり笑う", icon: "😁", score: s => Math.min(s.mouthSmileLeft, s.mouthSmileRight) },
  { id: "BROWS_UP", name: "眉を上げる", icon: "🤨", score: s => s.browInnerUp },
  { id: "PUCKER", name: "口をすぼめる", icon: "😗", score: s => s.mouthPucker },
  { id: "WINK", name: "片目をつぶる", icon: "😉",
    score: s => Math.abs((s.eyeBlinkLeft ?? 0) - (s.eyeBlinkRight ?? 0)) }
];

export const FACE_BY_ID = new Map(FACES.map(face => [face.id, face]));

export function blendshapeMap(categories) {
  const map = {};
  for (const category of categories ?? []) map[category.categoryName] = category.score;
  return map;
}

// Talking and blinking move the face briefly, so an expression must be held
// above the enter threshold for its hold time. It releases below the lower exit threshold.
export class StableFace {
  constructor({ enter = 0.6, exit = 0.4, holdMs = 400 } = {}) {
    Object.assign(this, { enter, exit, holdMs });
    this.reset();
  }

  reset() {
    this.candidate = null;
    this.since = 0;
    this.active = null;
  }

  update(shapes, now, fresh, holdMsById = {}) {
    if (!fresh || !shapes) {
      this.reset();
      return null;
    }
    const scored = FACES.map(face => ({ id: face.id, value: face.score(shapes) ?? 0 }));
    if (this.active) {
      const current = scored.find(item => item.id === this.active);
      if (current.value >= this.exit) return this.active;
      this.reset();
    }
    const best = scored.reduce((a, b) => (b.value > a.value ? b : a));
    if (best.value < this.enter) {
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
