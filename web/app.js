import { FaceLandmarker, FilesetResolver, GestureRecognizer } from "./vendor/vision_bundle.mjs";
import { FACES, FACE_BY_ID, HeadDirection, StableFace, resistanceFor, thresholdFor, blendshapeMap } from "./faces.mjs";
import { POSES, POSE_BY_MODEL, StablePose } from "./poses.mjs";

const $ = id => document.getElementById(id);
const video = $("camera");
const canvas = $("preview");
const ctx = canvas.getContext("2d");
const poseById = new Map(POSES.map(pose => [pose.id, pose]));
const label = id => id[0] === "F" ? `顔 ${FACE_BY_ID.get(id.slice(2))?.name ?? id}` :
  `${id[0] === "L" ? "左手" : "右手"} ${poseById.get(id.slice(2))?.name ?? id}`;
const keyNames = ["CTRL", "SHIFT", "ALT", "WIN", "ENTER", "TAB", "ESC", "SPACE", "BACKSPACE", "DELETE", "LEFT", "UP", "RIGHT", "DOWN", "HOME", "END", "PAGEUP", "PAGEDOWN", "VOLUMEUP", "VOLUMEDOWN", "MUTE", "PLAYPAUSE", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`)];
const keyLabels = { CTRL: "Ctrl", SHIFT: "Shift", ALT: "Alt", WIN: "Win", ENTER: "Enter", ESC: "Esc", SPACE: "Space", BACKSPACE: "Backspace", DELETE: "Delete", LEFT: "← Left", UP: "↑ Up", RIGHT: "→ Right", DOWN: "↓ Down", PAGEUP: "Page Up", PAGEDOWN: "Page Down", VOLUMEUP: "音量を上げる", VOLUMEDOWN: "音量を下げる", MUTE: "消音", PLAYPAUSE: "再生・一時停止" };
const keySearchTerms = { ENTER: "エンター 決定 改行", CTRL: "コントロール", SHIFT: "シフト", ALT: "オルト", WIN: "ウィンドウズ", SPACE: "スペース 空白", LEFT: "左", RIGHT: "右", UP: "上", DOWN: "下", BACKSPACE: "削除", DELETE: "削除" };
const modifierOrder = ["CTRL", "SHIFT", "ALT", "WIN"];
const detectors = { Left: new StablePose(), Right: new StablePose() };
const faceDetector = new StableFace();
const headDirection = new HeadDirection();

let settings;
let recognizer;
let fileset;
let faceLandmarker;
let stream;
let running = false;
let starting = false;
let paused = false;
let runId = 0;
let lastVideoTime = -1;
let lastFrameAt = 0;
let previousActive = new Set();
let selectedBinding;
let pickerKeys = [];
let dirty = false;
let saveRevision = 0;

function send(type, more = {}) { window.chrome.webview.postMessage({ type, ...more }); }
function announce(value) { $("message").textContent = value; }

function showView(name) {
  $("main-view").hidden = name !== "main";
  $("settings-view").hidden = name !== "settings";
  for (const target of ["main", "settings"]) {
    const button = $(`show-${target}`);
    button.classList.toggle("selected", target === name);
    if (target === name) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}

function updateSettingsHighlights(active) {
  for (const row of document.querySelectorAll("[data-pose-id]"))
    row.classList.toggle("recognized", active.has(row.dataset.poseId));
}

function resetRecognition() {
  if (previousActive.size)
    addEventText(`${[...previousActive].map(label).join(" / ")} 解除`);
  previousActive = new Set();
  detectors.Left.reset();
  detectors.Right.reset();
  faceDetector.reset();
  headDirection.reset();
  $("face-pose").textContent = settings?.faceEnabled ? "検出なし" : "オフ";
  $("left-pose").textContent = "検出なし";
  $("right-pose").textContent = "検出なし";
  $("hands").textContent = "手と顔を検出していません";
  updateSettingsHighlights(previousActive);
}

function stopCamera() {
  running = false;
  starting = false;
  runId++;
  resetRecognition();
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $("camera-placeholder").classList.remove("hidden");
  $("camera-placeholder").textContent = paused ? "認識を一時停止しています" : "カメラが停止しました";
  $("camera-state").textContent = paused ? "一時停止" : "停止";
  $("retry").hidden = paused;
  if (!paused) announce("カメラが停止しました。再試行してください。");
  send("cameraStopped");
}

async function startCamera() {
  if (running || starting || paused || !settings) return;
  starting = true;
  const startId = ++runId;
  $("retry").hidden = true;
  $("camera-placeholder").textContent = "カメラを準備しています…";
  $("camera-state").textContent = "準備中";
  announce("認識モデルとカメラを準備しています…");
  try {
    fileset ??= await FilesetResolver.forVisionTasks("./vendor/wasm");
    if (!recognizer) {
      recognizer = await GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "./gesture_recognizer.task", delegate: "CPU" },
        runningMode: "VIDEO", numHands: 2
      });
    }
    await ensureFaceLandmarker();
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    if (startId !== runId || paused) { stream.getTracks().forEach(track => track.stop()); stream = undefined; return; }
    stream.getVideoTracks()[0].addEventListener("ended", stopCamera, { once: true });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    $("camera-placeholder").classList.add("hidden");
    running = true;
    starting = false;
    lastVideoTime = -1;
    lastFrameAt = performance.now();
    send("cameraStarted");
    $("camera-state").textContent = "認識中";
    announce(settings.faceEnabled ? "カメラで手の形と顔の表情を認識しています。" : "カメラで手の形を認識しています。");
    setTimeout(() => processFrame(startId), 0);
  } catch (error) {
    stopCamera();
    $("retry").hidden = false;
    announce(`カメラを開始できません: ${error?.message ?? error}`);
  } finally {
    starting = false;
  }
}

async function ensureFaceLandmarker() {
  if (!settings?.faceEnabled || faceLandmarker || !fileset) return;
  faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "./face_landmarker.task", delegate: "CPU" },
    runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true
  });
}

function recognizeFace(started, fresh) {
  const readout = $("face-pose");
  if (!settings.faceEnabled || !faceLandmarker) {
    faceDetector.reset();
    readout.textContent = settings.faceEnabled ? "準備中" : "オフ";
    return null;
  }
  const result = faceLandmarker.detectForVideo(canvas, started);
  const shapes = result.faceBlendshapes?.[0] ? {
    ...blendshapeMap(result.faceBlendshapes[0].categories),
    ...headDirection.scores(result.faceLandmarks?.[0], !faceDetector.active && !faceDetector.candidate,
      settings.faceYawCenter ?? 0)
  } : null;
  const faceBinding = face => settings.bindings.find(item => item.gesture === `F_${face.id}`);
  const holdMs = Object.fromEntries(FACES.map(face => [face.id, faceBinding(face)?.holdMs ?? 400]));
  const enter = Object.fromEntries(FACES.map(face => [face.id, faceBinding(face)?.threshold ?? 0.6]));
  const stable = faceDetector.update(shapes, performance.now(), fresh, holdMs, enter);
  for (const meter of document.querySelectorAll("[data-face-meter]")) {
    const face = FACE_BY_ID.get(meter.dataset.faceMeter);
    const level = shapes ? Math.min(1, (face.score(shapes) ?? 0) / enter[face.id]) : 0;
    meter.style.setProperty("--level", level);
    meter.classList.toggle("over", level >= 1);
  }
  readout.textContent = stable ? `${FACE_BY_ID.get(stable).icon} ${FACE_BY_ID.get(stable).name}` :
    shapes ? "判定中" : "検出なし";
  return stable ? `F_${stable}` : null;
}

function userHand(modelHand) {
  if (!settings?.swapHands) return modelHand;
  return modelHand === "Left" ? "Right" : modelHand === "Right" ? "Left" : modelHand;
}

function addEventText(value) {
  const list = $("events");
  if (list.firstElementChild?.textContent === "まだありません") list.replaceChildren();
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString("ja-JP")}  ${value}`;
  list.prepend(item);
  while (list.children.length > 3) list.lastElementChild.remove();
}

function processFrame(thisRun) {
  if (!running || thisRun !== runId) return;
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    lastFrameAt = performance.now();
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    const capturedAt = Date.now();
    const started = performance.now();
    try {
      const result = recognizer.recognizeForVideo(canvas, started);
      const inferenceMs = performance.now() - started;
      const fresh = Date.now() - capturedAt <= 250;
      $("inference").textContent = `${Math.round(inferenceMs)} ms`;
      const observations = {};
      for (let i = 0; i < result.handedness.length; i++) {
        const hand = userHand(result.handedness[i]?.[0]?.categoryName ?? "Unknown");
        const handScore = result.handedness[i]?.[0]?.score ?? 0;
        if ((hand === "Left" || hand === "Right") &&
            (!observations[hand] || handScore > observations[hand].handScore)) {
          observations[hand] = {
            handScore,
            model: result.gestures[i]?.[0]?.categoryName ?? "None",
            score: result.gestures[i]?.[0]?.score ?? 0
          };
        }
        ctx.fillStyle = handScore >= 0.8 ? "#6be0b9" : "#ffc477";
        for (const point of result.landmarks[i] ?? []) {
          ctx.beginPath();
          ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const active = [];
      const face = recognizeFace(started, fresh);
      if (face) active.push(face);
      for (const hand of ["Left", "Right"]) {
        const observation = observations[hand];
        const stable = detectors[hand].update(observation?.model, observation?.score ?? 0,
          observation?.handScore ?? 0, fresh);
        const readout = $(hand === "Left" ? "left-pose" : "right-pose");
        readout.textContent = stable === "Closed_Fist" ? "✊ グー · 待機" :
          stable && POSE_BY_MODEL.has(stable) ? `${POSE_BY_MODEL.get(stable).icon} ${POSE_BY_MODEL.get(stable).name}` :
          observation?.handScore >= 0.8 ? "判定中" : "検出なし";
        if (stable && POSE_BY_MODEL.has(stable))
          active.push(`${hand === "Left" ? "L" : "R"}_${POSE_BY_MODEL.get(stable).id}`);
      }
      $("hands").textContent = !Object.keys(observations).length ? "手を検出していません" :
        `${Object.keys(observations).length}手を検出 · 信頼度が低い形は入力しません`;
      const activeNow = new Set(active);
      for (const id of previousActive) if (!activeNow.has(id)) addEventText(`${label(id)} 解除`);
      for (const id of activeNow) if (!previousActive.has(id)) addEventText(`${label(id)} 認識開始`);
      previousActive = activeNow;
      updateSettingsHighlights(activeNow);
      send("frame", { active, events: [], capturedAt });
    } catch (error) {
      stopCamera();
      $("retry").hidden = false;
      announce(`認識を停止しました: ${error?.message ?? error}`);
      return;
    }
  }
  setTimeout(() => processFrame(thisRun), 16);
}

setInterval(() => {
  if (running && performance.now() - lastFrameAt > 300) {
    resetRecognition();
    $("camera-state").textContent = "映像待ち";
    announce("新しい映像が届いていません。長押しは自動で解除されます。");
  } else if (running && $("camera-state").textContent === "映像待ち") {
    $("camera-state").textContent = "認識中";
    announce("カメラ映像が戻りました。");
  }
}, 100);

function renderBindings() {
  const parent = $("shape-groups");
  parent.replaceChildren();
  for (const [hand, prefix] of [["左手", "L"], ["右手", "R"]]) {
    const group = document.createElement("div");
    group.className = "panel shape-group";
    const heading = document.createElement("h2");
    heading.textContent = hand;
    group.append(heading);
    const idle = document.createElement("div");
    idle.className = "shape-row idle-row";
    idle.innerHTML = '<span class="shape-icon">✊</span><strong>グー</strong><span class="idle-description">待機 · キー入力なし</span>';
    group.append(idle);
    for (const pose of POSES) group.append(bindingRow(`${prefix}_${pose.id}`, pose, hand));
    parent.append(group);
  }
  const group = document.createElement("div");
  group.className = "panel shape-group";
  const heading = document.createElement("h2");
  heading.textContent = "顔の表情";
  group.className = "panel shape-group face-group";
  const note = document.createElement("p");
  note.className = "face-note";
  note.textContent = "ふつうの顔は待機です。バーが右端に届いた表情を、選んだ秒数だけ保つと入力します。反応しにくさは0〜100（標準60）。届かない表情は小さく、誤作動する表情は大きくしてください。";
  group.append(heading, note);
  for (const face of FACES) group.append(faceRow(`F_${face.id}`, face));
  parent.append(group);
}

function bindingRow(id, pose, owner) {
  const binding = settings.bindings.find(item => item.gesture === id);
  const row = document.createElement("div");
  row.className = "shape-row";
  row.dataset.poseId = id;
  const icon = document.createElement("span");
  icon.className = "shape-icon";
  icon.textContent = pose.icon;
  const name = document.createElement("strong");
  name.textContent = pose.name;
  const key = document.createElement("button");
  key.type = "button";
  key.className = "secondary key-choice";
  key.textContent = binding.keys || "キーを割り当てる";
  key.setAttribute("aria-label", `${owner} ${pose.name} のキー`);
  key.onclick = () => openPicker(id);
  const mode = document.createElement("select");
  mode.setAttribute("aria-label", `${owner} ${pose.name} の入力方式`);
  mode.innerHTML = '<option value="tap">認識した時に1回押し</option><option value="hold">認識中は長押し</option>';
  mode.value = binding.mode;
  mode.onchange = () => { binding.mode = mode.value; saveSettings(); };
  row.append(icon, name, key, mode);
  return row;
}

// Out-of-range input snaps to the nearest allowed value; saving happens when the field is committed.
function numberField(labelText, unit, min, max, step, value, apply) {
  const wrap = document.createElement("label");
  wrap.className = "number-field";
  const input = document.createElement("input");
  Object.assign(input, { type: "number", min, max, step, value });
  input.setAttribute("aria-label", labelText);
  input.onchange = () => {
    const parsed = Number(input.value);
    const clamped = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    input.value = clamped;
    value = clamped;
    apply(clamped);
    saveSettings();
  };
  const text = document.createElement("span");
  text.textContent = unit;
  if (unit === "反応しにくさ") wrap.append(text, input);
  else wrap.append(input, text);
  return wrap;
}

function faceRow(id, face) {
  const row = bindingRow(id, face, "顔");
  const binding = settings.bindings.find(item => item.gesture === id);
  row.classList.add("face-row");
  const meter = document.createElement("span");
  meter.className = "face-meter";
  meter.dataset.faceMeter = face.id;
  meter.title = "今の表情の強さ";
  const hold = numberField(`${face.name} を入力するまでの秒数`, "秒保つ", 0.1, 5, 0.1,
    (binding.holdMs ?? 400) / 1000, value => { binding.holdMs = Math.round(value * 1000); });
  const sensitivity = numberField(`${face.name} の反応しにくさ（0〜100）`, "反応しにくさ", 0, 100, 1,
    resistanceFor(binding.threshold ?? 0.6), value => { binding.threshold = thresholdFor(value); });
  row.append(meter, hold, sensitivity);
  return row;
}

function saveSettings() {
  dirty = true;
  saveRevision++;
  $("save").textContent = "保存中…";
  $("save-status").textContent = "設定を保存しています…";
  $("save-status").classList.remove("error");
  send("saveSettings", { settings: JSON.parse(JSON.stringify(settings)), revision: saveRevision });
}

function renderPicker() {
  $("selected-keys").textContent = pickerKeys.length ? pickerKeys.map(key => keyLabels[key] || key).join(" + ") : "未選択";
  const terms = $("key-search").value.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = keyNames.filter(key => terms.every(term =>
    `${key} ${keyLabels[key] || ""} ${keySearchTerms[key] || ""}`.normalize("NFKC").toLowerCase().includes(term)));
  const list = $("key-options");
  list.replaceChildren();
  for (const key of matches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `key-option ${pickerKeys.includes(key) ? "selected" : ""}`;
    button.textContent = `${pickerKeys.includes(key) ? "✓ " : ""}${keyLabels[key] || key}`;
    button.onclick = () => {
      if (pickerKeys.includes(key)) pickerKeys = pickerKeys.filter(value => value !== key);
      else if (pickerKeys.length < 8) pickerKeys.push(key);
      else { $("selected-keys").textContent = "最大8キーです"; return; }
      renderPicker();
    };
    list.append(button);
  }
}

function openPicker(id) {
  selectedBinding = settings.bindings.find(binding => binding.gesture === id);
  pickerKeys = selectedBinding.keys ? selectedBinding.keys.split("+") : [];
  $("key-search").value = "";
  renderPicker();
  $("key-picker").showModal();
  $("key-search").focus();
}

function commitPicker() {
  selectedBinding.keys = [...modifierOrder.filter(key => pickerKeys.includes(key)),
    ...pickerKeys.filter(key => !modifierOrder.includes(key))].join("+");
  $("key-picker").close();
  renderBindings();
  saveSettings();
}

$("show-main").onclick = () => showView("main");
$("show-settings").onclick = () => showView("settings");
$("key-search").oninput = renderPicker;
$("picker-close").onclick = () => $("key-picker").close();
$("key-clear").onclick = () => { pickerKeys = []; commitPicker(); };
$("key-done").onclick = commitPicker;
$("save").onclick = saveSettings;
$("swap-hands").onchange = () => {
  settings.swapHands = $("swap-hands").checked;
  resetRecognition();
  saveSettings();
};
$("face-center").onclick = () => {
  if (!faceLandmarker || $("face-pose").textContent === "検出なし") {
    announce("顔が映っていないため、正面を設定できません。");
    return;
  }
  settings.faceYawCenter = Math.round(headDirection.lastYaw * 1000) / 1000;
  headDirection.reset();
  $("face-yaw-center").value = Math.round(settings.faceYawCenter * 100);
  saveSettings();
  announce("今の顔の向きを正面にしました。");
};
$("face-yaw-center").onchange = () => {
  const value = Math.max(-40, Math.min(40, Math.round(Number($("face-yaw-center").value) || 0)));
  $("face-yaw-center").value = value;
  settings.faceYawCenter = value / 100;
  saveSettings();
};
$("face-enabled").onchange = async () => {
  settings.faceEnabled = $("face-enabled").checked;
  resetRecognition();
  saveSettings();
  try { await ensureFaceLandmarker(); }
  catch (error) { announce(`顔の認識を開始できません: ${error?.message ?? error}`); }
};
$("pause").onclick = () => send("setPaused", { paused: !paused });
$("retry").onclick = startCamera;

window.chrome.webview.addEventListener("message", event => {
  const data = event.data;
  if (data?.type !== "hostState") return;
  if (data.saveRevision === saveRevision && data.saveSucceeded === true) {
    dirty = false;
    $("save").textContent = "保存済み";
    $("save-status").textContent = "設定を保存しました。";
    $("save-status").classList.remove("error");
  } else if (data.saveRevision === saveRevision && data.saveSucceeded === false) {
    $("save").textContent = "保存を再試行";
    $("save-status").textContent = data.message || "設定を保存できませんでした。";
    $("save-status").classList.add("error");
  }
  if (!settings || (!dirty && JSON.stringify(settings) !== JSON.stringify(data.settings))) {
    settings = data.settings;
    $("swap-hands").checked = settings.swapHands;
    $("face-enabled").checked = settings.faceEnabled;
    $("face-yaw-center").value = Math.round((settings.faceYawCenter ?? 0) * 100);
    renderBindings();
  }
  const wasPaused = paused;
  paused = data.paused;
  $("pause").textContent = paused ? "認識を再開" : "認識を一時停止";
  $("held-keys").textContent = data.held.length ?
    data.held.map(id => settings.bindings.find(binding => binding.gesture === id)?.keys).join(" / ") : "なし";
  $("last-output").textContent = data.lastOutput ?? "なし";
  $("key-state").textContent = data.held.length ? "長押し中" : paused ? "一時停止" : "入力待ち";
  $("key-state").classList.toggle("down", data.held.length > 0);
  if (data.message) announce(data.message);
  if (paused && !wasPaused) stopCamera();
  if (!paused && !running && !starting) startCamera();
});

window.addEventListener("beforeunload", stopCamera);
send("ready");
