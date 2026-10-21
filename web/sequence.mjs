// A binding is a list of steps: { kind: "shortcut", keys }, { kind: "text", text } or { kind: "wait", ms }.
export const MAX_STEPS = 50;
export const MAX_TEXT = 1000;
export const MAX_WAIT_MS = 10000;

// Holding only makes sense when the whole sequence is one shortcut.
export const canHold = steps => steps.length === 1 && steps[0].kind === "shortcut";

export function describeStep(step, keyLabel = key => key) {
  if (step.kind === "shortcut") return step.keys.split("+").map(keyLabel).join(" + ");
  if (step.kind === "wait") return `${step.ms / 1000}秒待つ`;
  const oneLine = step.text.replace(/\r?\n/g, "↵");
  return `「${oneLine.length > 12 ? `${oneLine.slice(0, 12)}…` : oneLine}」`;
}

export function summarize(steps, keyLabel) {
  if (!steps.length) return "未割り当て";
  const parts = steps.slice(0, 3).map(step => describeStep(step, keyLabel));
  return parts.join(" → ") + (steps.length > 3 ? ` …（全${steps.length}手順）` : "");
}

export function moveStep(steps, from, to) {
  if (to < 0 || to >= steps.length) return steps;
  const copy = [...steps];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
