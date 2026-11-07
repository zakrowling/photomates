// Photomates in the browser: the camera pipeline (background removal and framing), video calls between
// everyone in the booth, the live scene, the shutter and the finished photo.
const socket = window.PhotomatesNet.createNet();
const Scenes = window.PhotomatesScenes;
const DEBUG = /[?&]debug\b/.test(location.search);

const $ = (id) => document.getElementById(id);
const stage = $('stage-canvas');
const sctx = stage.getContext('2d');

const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2';
const SEGMENTER_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';

const PROC_W = 640; // camera frames are processed at this size
const PROC_H = 360;
const SEND = 256; // each person is sent as a SEND×SEND picture, plus its mask beside it
const FPS = 20;
const STILL_SIZE = 768; // each person's photo for the finished picture
const MAX_STILL_CHARS = 400000; // a photo's data: URL (sent in pieces)
const { PART_CHARS } = window.PhotomatesEngine;

const state = {
  playerId: null,
  hostId: null,
  linkRoom: false,
  roomCode: '',
  players: [], // from the host: { id, number, name, color, seat } (seat is their spot in the scene)
  scene: 'office',
  inBooth: false,
  pending: null, // the photo being taken: { n, scene, players, stills: Map(id -> Image), mine }
  stillsEarly: new Map(), // photos that arrived before our own countdown finished: n -> Map
};

// ---------- Camera and background removal ----------

const cam = {
  stream: null,
  video: document.createElement('video'),
  ready: false,
  segmenter: null,
  faces: null,
  small: Object.assign(document.createElement('canvas'), { width: PROC_W, height: PROC_H }),
  mask: Object.assign(document.createElement('canvas'), { width: PROC_W, height: PROC_H }),
  soft: Object.assign(document.createElement('canvas'), { width: PROC_W, height: PROC_H }), // feathered mask
  maskData: null,
  packed: Object.assign(document.createElement('canvas'), { width: SEND * 2, height: SEND }),
  crop: { x: PROC_W / 2 - PROC_H / 2, y: 0, s: PROC_H }, // the square around you, smoothed
  face: null,
  frame: 0,
  lastTs: 0,
  lastProc: 0,
  error: '',
};
cam.video.muted = true;
cam.video.playsInline = true;
const smallCtx = cam.small.getContext('2d', { willReadFrequently: false });
const maskCtx = cam.mask.getContext('2d');
const softCtx = cam.soft.getContext('2d');
// How strongly to remove the background: only pixels the model is fairly sure are you are kept, then
// the edge is feathered (blurred and pulled in a little) so hair fades out softly instead of a halo.
const KEEP_FROM = 0.5;
const KEEP_FULL = 0.8;
const FEATHER_PX = 2.2;
// Turns a feathered mask value (0-255) into transparency, trimming the faint outer edge.
const edge = (m) => Math.max(0, Math.min(255, (m - 60) * 1.35));
const packedCtx = cam.packed.getContext('2d');
packedCtx.fillStyle = '#000';
packedCtx.fillRect(0, 0, SEND * 2, SEND);
// What everyone else receives: the packed picture (you on the left, your mask on the right).
const outStream = cam.packed.captureStream(FPS);

let visionLoading = null;
function loadVision() {
  if (!visionLoading) {
    visionLoading = (async () => {
      const vision = await import(`${VISION_URL}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
      const make = async (Task, model, extra) => {
        try {
          return await Task.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate: 'GPU' }, runningMode: 'VIDEO', ...extra });
        } catch {
          return Task.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate: 'CPU' }, runningMode: 'VIDEO', ...extra });
        }
      };
      cam.segmenter = await make(vision.ImageSegmenter, SEGMENTER_MODEL, { outputCategoryMask: false, outputConfidenceMasks: true });
      cam.faces = await make(vision.FaceDetector, FACE_MODEL, { minDetectionConfidence: 0.5 });
    })();
  }
  return visionLoading;
}

async function startCamera() {
  showCameraMsg('Starting your camera...', false);
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
  } catch (err) {
    cam.error = err && err.name === 'NotAllowedError'
      ? 'Camera access was blocked. Allow it in your browser\'s address bar, then try again.'
      : 'Couldn\'t find a camera to use.';
    showCameraMsg(cam.error, true);
    return;
  }
  cam.video.srcObject = cam.stream;
  await cam.video.play().catch(() => {});
  showCameraMsg('Getting the background remover ready...', false);
  try {
    await loadVision();
  } catch (err) {
    console.error(err);
    showCameraMsg('Couldn\'t load the background remover. Check your connection and try again.', true);
    return;
  }
  cam.ready = true;
  $('camera-msg').hidden = true;
}

function showCameraMsg(text, withButton) {
  $('camera-text').textContent = text;
  $('camera-btn').hidden = !withButton;
  $('camera-msg').hidden = false;
}
$('camera-btn').addEventListener('click', startCamera);

// One camera frame: find you (mask) and your face, then pack the square around you for sending.
function processCamera(now) {
  if (!cam.ready || cam.video.readyState < 2) return;
  smallCtx.drawImage(cam.video, 0, 0, PROC_W, PROC_H);
  const ts = Math.max(cam.lastTs + 1, Math.round(now));
  cam.lastTs = ts;
  cam.segmenter.segmentForVideo(cam.small, ts, (result) => {
    const m = result.confidenceMasks && result.confidenceMasks[0];
    if (!m) return;
    const conf = m.getAsFloat32Array();
    if (!cam.maskData || cam.maskData.width !== m.width) {
      cam.mask.width = m.width;
      cam.mask.height = m.height;
      cam.maskData = maskCtx.createImageData(m.width, m.height);
    }
    const d = cam.maskData.data;
    for (let i = 0, j = 0; i < conf.length; i++, j += 4) {
      const v = Math.max(0, Math.min(1, (conf[i] - KEEP_FROM) / (KEEP_FULL - KEEP_FROM))) * 255;
      d[j] = v;
      d[j + 1] = v;
      d[j + 2] = v;
      d[j + 3] = 255;
    }
    maskCtx.putImageData(cam.maskData, 0, 0);
    // Fade out towards the bottom of the camera picture, so if you're close to the camera your body
    // fades away instead of ending in a hard line.
    const h = cam.mask.height;
    const g = maskCtx.createLinearGradient(0, h * 0.8, 0, h);
    g.addColorStop(0, '#fff');
    g.addColorStop(1, '#000');
    maskCtx.globalCompositeOperation = 'multiply';
    maskCtx.fillStyle = g;
    maskCtx.fillRect(0, h * 0.8, cam.mask.width, h * 0.2);
    maskCtx.globalCompositeOperation = 'source-over';
    if (cam.soft.width !== cam.mask.width || cam.soft.height !== h) {
      cam.soft.width = cam.mask.width;
      cam.soft.height = h;
    }
    softCtx.fillStyle = '#000';
    softCtx.fillRect(0, 0, cam.soft.width, h);
    softCtx.filter = `blur(${FEATHER_PX}px)`;
    softCtx.drawImage(cam.mask, 0, 0);
    softCtx.filter = 'none';
  });
  if (cam.frame++ % 3 === 0) {
    const det = cam.faces.detectForVideo(cam.small, ts);
    const best = det.detections && det.detections.sort((a, b) => b.boundingBox.width - a.boundingBox.width)[0];
    cam.face = best ? best.boundingBox : null;
  }
  updateCrop();
  // Left: you. Right: your mask (white = you, black = background). Outside the frame stays black.
  const { x, y, s } = cam.crop;
  packedCtx.fillStyle = '#000';
  packedCtx.fillRect(0, 0, SEND * 2, SEND);
  packedCtx.drawImage(cam.small, x, y, s, s, 0, 0, SEND, SEND);
  const k = cam.mask.width / PROC_W;
  packedCtx.drawImage(cam.soft, x * k, y * k, s * k, s * k, SEND, 0, SEND, SEND);
}

// Frame everyone the same way: head near the top, shoulders at the bottom, faces the same size.
function updateCrop() {
  const f = cam.face;
  let target;
  if (f) {
    const s = Math.min(PROC_H * 1.1, Math.max(150, f.width * 3.3));
    target = { s, x: f.originX + f.width / 2 - s / 2, y: f.originY + f.height * 0.45 - s * 0.36 };
  } else {
    target = { s: PROC_H, x: PROC_W / 2 - PROC_H / 2, y: 0 };
  }
  const c = cam.crop;
  const k = 0.12;
  c.s += (target.s - c.s) * k;
  c.x += (target.x - c.x) * k;
  c.y += (target.y - c.y) * k;
}

// Packed picture (colour | mask) -> a SEND×SEND cut-out with a transparent background.
const unpackWork = Object.assign(document.createElement('canvas'), { width: SEND * 2, height: SEND });
const unpackCtx = unpackWork.getContext('2d', { willReadFrequently: true });
function unpack(src, out) {
  unpackCtx.drawImage(src, 0, 0, SEND * 2, SEND);
  const d = unpackCtx.getImageData(0, 0, SEND * 2, SEND).data;
  const octx = out.getContext('2d');
  const img = octx.createImageData(SEND, SEND);
  const o = img.data;
  let cover = 0;
  let bottom = 0;
  const fadeFrom = SEND * 0.9;
  for (let y = 0; y < SEND; y++) {
    let row = 0;
    // The bottom few rows fade out, so a cut-off body never ends in a hard edge.
    const fade = y < fadeFrom ? 1 : 1 - (y - fadeFrom) / (SEND - fadeFrom);
    for (let x = 0; x < SEND; x++) {
      const i = (y * SEND * 2 + x) * 4;
      const p = (y * SEND + x) * 4;
      // Video compression blurs the mask a little: firm up its edges and drop faint noise.
      const a = edge(d[i + SEND * 4]) * fade;
      o[p] = d[i];
      o[p + 1] = d[i + 1];
      o[p + 2] = d[i + 2];
      o[p + 3] = a;
      row += a;
    }
    cover += row;
    // Where their body ends: the lowest row that's still at least a fifth them.
    if (row > SEND * 255 * 0.2) bottom = (y + 1) / SEND;
  }
  octx.putImageData(img, 0, 0);
  return { cover: cover / (SEND * SEND * 255), bottom };
}

// Where a photo's body ends (0-1 down the picture), like unpack works out for live video.
function measureBottom(img) {
  const n = 64;
  const m = Object.assign(document.createElement('canvas'), { width: n, height: n });
  const mctx = m.getContext('2d', { willReadFrequently: true });
  mctx.drawImage(img, 0, 0, n, n);
  const d = mctx.getImageData(0, 0, n, n).data;
  let bottom = 0;
  for (let y = 0; y < n; y++) {
    let row = 0;
    for (let x = 0; x < n; x++) row += d[(y * n + x) * 4 + 3];
    if (row > n * 255 * 0.2) bottom = (y + 1) / n;
  }
  return bottom;
}

// A full-quality photo of you (transparent background) for the finished picture.
async function captureStill() {
  if (!cam.ready || !cam.video.videoWidth) return null;
  const vw = cam.video.videoWidth;
  const scale = vw / PROC_W;
  const { x, y, s } = cam.crop;
  const size = Math.min(STILL_SIZE, Math.round(s * scale));
  const out = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const octx = out.getContext('2d', { willReadFrequently: true });
  octx.drawImage(cam.video, x * scale, y * scale, s * scale, s * scale, 0, 0, size, size);
  const m = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const mctx = m.getContext('2d', { willReadFrequently: true });
  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, size, size);
  const k = cam.mask.width / PROC_W;
  mctx.drawImage(cam.soft, x * k, y * k, s * k, s * k, 0, 0, size, size);
  const px = octx.getImageData(0, 0, size, size);
  const mk = mctx.getImageData(0, 0, size, size).data;
  const fadeFrom = size * 0.9;
  for (let i = 0; i < mk.length; i += 4) {
    const row = Math.floor(i / 4 / size);
    const fade = row < fadeFrom ? 1 : 1 - (row - fadeFrom) / (size - fadeFrom);
    px.data[i + 3] = edge(mk[i]) * fade;
  }
  octx.putImageData(px, 0, 0);
  // Small enough to send in one message: WebP keeps the transparency (PNG on browsers without WebP).
  for (const [q, sz] of [[0.9, size], [0.8, size], [0.8, Math.round(size * 0.75)], [0.7, Math.round(size * 0.6)]]) {
    let src = out;
    if (sz !== size) {
      src = Object.assign(document.createElement('canvas'), { width: sz, height: sz });
      src.getContext('2d').drawImage(out, 0, 0, sz, sz);
    }
    const data = src.toDataURL('image/webp', q);
    if (data.length <= MAX_STILL_CHARS) return data;
  }
  return null;
}

// ---------- Video calls: everyone sends their packed picture to everyone else ----------

const calls = new Map(); // player id -> { call, video, started }
let peer = null;

socket.on('peer', ({ peer: p }) => {
  // A new connection (joined, or re-joined after the host left): start the calls afresh.
  calls.forEach((c) => closeCall(c));
  calls.clear();
  peer = p;
  p.on('call', (call) => {
    const old = calls.get(call.peer);
    if (old) closeCall(old);
    call.answer(outStream);
    track(call);
  });
  syncCalls();
});

function track(call) {
  const entry = { call, video: null, started: performance.now() };
  calls.set(call.peer, entry);
  call.on('stream', (stream) => {
    if (calls.get(call.peer) !== entry) return;
    if (!entry.video) {
      entry.video = document.createElement('video');
      entry.video.muted = true;
      entry.video.playsInline = true;
      entry.video.autoplay = true;
      $('videos').append(entry.video);
    }
    entry.video.srcObject = stream;
    entry.video.play().catch(() => {});
  });
  const done = () => { if (calls.get(call.peer) === entry) { calls.delete(call.peer); closeCall(entry); } };
  call.on('close', done);
  call.on('error', done);
}

function closeCall(entry) {
  try { entry.call.close(); } catch { /* already closed */ }
  if (entry.video) entry.video.remove();
}

// Each pair of players has one call; the one with the smaller id makes it.
function syncCalls() {
  const me = socket.id;
  if (!peer || !me) return;
  const ids = new Set(state.players.map((p) => p.id));
  calls.forEach((entry, id) => {
    // Gone, or connected for a while with no picture: hang up (and retry below).
    const stale = !entry.video && performance.now() - entry.started > 15000;
    if (!ids.has(id) || stale) {
      calls.delete(id);
      closeCall(entry);
    }
  });
  state.players.forEach((p) => {
    if (p.id === me || calls.has(p.id) || me > p.id) return;
    track(peer.call(p.id, outStream));
  });
}
setInterval(syncCalls, 5000);

// ---------- Everyone's cut-out ----------

const cutouts = new Map(); // player id -> { canvas, cover, seenAt }
function cutoutFor(id) {
  if (!cutouts.has(id)) cutouts.set(id, { canvas: Object.assign(document.createElement('canvas'), { width: SEND, height: SEND }), cover: 0, bottom: 1, seenAt: 0, version: 0 });
  return cutouts.get(id);
}

function updateCutouts(now) {
  state.players.forEach((p) => {
    let src = null;
    if (p.id === socket.id) src = cam.ready ? cam.packed : null;
    else {
      const v = calls.get(p.id) && calls.get(p.id).video;
      if (v && v.readyState >= 2 && v.videoWidth) src = v;
    }
    const c = cutoutFor(p.id);
    if (!src) return;
    const { cover, bottom } = unpack(src, c.canvas);
    c.version++;
    c.cover = cover;
    // Smoothed, so people don't bob up and down as they move.
    c.bottom += (bottom - c.bottom) * 0.15;
    if (cover > 0.01) c.seenAt = now;
  });
}

// People in seat order, with their live cut-out (or null for a placeholder).
function livePeople(now) {
  return state.players.map((p) => {
    const c = cutouts.get(p.id);
    const visible = c && now - c.seenAt < 2000;
    return { seat: p.seat, color: p.color, image: visible ? c.canvas : null, bottom: c ? c.bottom : 1, version: c ? c.version : 0 };
  });
}

// ---------- Main loop ----------

// Camera work runs on a timer rather than the screen refresh, so it keeps going (slowly) when the tab
// is in the background and mates still see you.
setInterval(() => {
  if (!state.inBooth) return;
  const now = performance.now();
  processCamera(now);
  updateCutouts(now);
}, 1000 / FPS);

function frame(now) {
  requestAnimationFrame(frame);
  if (!state.inBooth) return;
  // The booth is cropped to the scene's own shape.
  const fw = Scenes.frameWidth(state.scene, state.players.length);
  if (stage.width !== fw) {
    stage.width = fw;
    const box = document.querySelector('.stage');
    box.style.aspectRatio = `${fw} / ${Scenes.H}`;
    box.style.width = `${(fw / Scenes.W) * 100}%`;
  }
  sctx.setTransform(1, 0, 0, 1, -(Scenes.W - fw) / 2, 0);
  Scenes.render(sctx, state.scene, livePeople(now));
}
requestAnimationFrame(frame);

// ---------- Sounds ----------

let audio = null;
function beep(freq, dur, vol = 0.15, type = 'sine') {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch { /* no audio */ }
}
function shutterSound() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    [0, 0.07].forEach((at) => {
      const len = Math.floor(audio.sampleRate * 0.05);
      const buf = audio.createBuffer(1, len, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      const src = audio.createBufferSource();
      src.buffer = buf;
      const f = audio.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1800;
      const g = audio.createGain();
      g.gain.value = 0.5;
      src.connect(f).connect(g).connect(audio.destination);
      src.start(t + at);
    });
  } catch { /* no audio */ }
}

// ---------- Booth UI ----------

function showError(msg) {
  $('error-msg').textContent = msg || '';
}

function basePath() {
  return location.pathname.replace(/[^/]*$/, '');
}

function shareLink(code) {
  return `${location.origin}${basePath()}${code.toLowerCase()}`;
}

function buildScenePicker() {
  const select = $('scene-select');
  select.replaceChildren(...Scenes.SCENES.map((s) => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    return o;
  }));
  select.addEventListener('change', () => {
    socket.emit('input', { type: 'scene', id: select.value });
    // Show the room's scene until the host confirms the change.
    select.value = state.scene;
  });
}

function applyLobby(payload) {
  state.hostId = payload.hostId;
  state.players = [...payload.players].sort((a, b) => a.seat - b.seat);
  state.scene = payload.scene;
  state.roomCode = payload.roomCode;
  $('room-code-txt').textContent = payload.roomCode;
  $('share-link').value = shareLink(payload.roomCode);
  [...$('scene-select').options].forEach((o) => {
    // Scenes with only so many spots take turns when there are more mates than that.
    const cap = Scenes.byId(o.value).capacity;
    const tooMany = !!cap && payload.players.length > cap;
    o.disabled = false;
    o.textContent = `${Scenes.byId(o.value).name}${tooMany ? ` (${cap} at a time)` : ''}`;
  });
  const cap = Scenes.byId(state.scene).capacity;
  $('shuffle-btn').textContent = cap && payload.players.length > cap ? 'Shuffle who\'s in' : 'Shuffle seats';
  $('scene-select').value = state.scene;
  const n = state.players.length;
  $('people').textContent = `${n} in the booth`;
  $('shuffle-btn').disabled = Scenes.slots(state.scene, n).length < 2;
  history.replaceState(null, '', `${basePath()}?room=${encodeURIComponent(payload.roomCode.toLowerCase())}${DEBUG ? '&debug' : ''}`);
  syncCalls();
}

function enterBooth() {
  if (state.inBooth) return;
  state.inBooth = true;
  $('lobby-card').hidden = true;
  document.querySelector('header').hidden = false;
  $('booth').hidden = false;
  document.body.classList.add('in-booth');
  if (!cam.stream) startCamera();
}

function leaveBooth() {
  state.inBooth = false;
  state.players = [];
  calls.forEach((c) => closeCall(c));
  calls.clear();
  $('booth').hidden = true;
  $('result').hidden = true;
  $('lobby-card').hidden = false;
  document.body.classList.remove('in-booth');
  history.replaceState(null, '', basePath() + (DEBUG ? '?debug' : ''));
}

function setConnecting(on) {
  $('create-btn').disabled = on;
  $('join-btn').disabled = on;
  if (on) showError('');
  $('connecting-hint').textContent = 'Connecting...';
  $('connecting-hint').hidden = !on;
}

function handleJoinResponse(res) {
  setConnecting(false);
  if (!res.ok) {
    leaveBooth();
    return showError(res.error);
  }
  showError('');
  state.playerId = res.playerId;
  applyLobby(res);
  enterBooth();
}

$('create-btn').addEventListener('click', () => {
  setConnecting(true);
  socket.emit('createRoom', handleJoinResponse);
});
$('join-btn').addEventListener('click', () => {
  const code = $('room-input').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return showError('Enter a 4-letter room code.');
  setConnecting(true);
  socket.emit('joinRoom', code, handleJoinResponse);
});
$('room-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join-btn').click(); });
$('leave-btn').addEventListener('click', () => {
  socket.emit('leaveRoom');
  leaveBooth();
});
// Move everyone to random spots in this scene (on your own, that moves you somewhere new).
$('shuffle-btn').addEventListener('click', () => {
  socket.emit('input', { type: 'shuffle', spots: Scenes.slots(state.scene, state.players.length).length });
});
$('shutter').addEventListener('click', () => socket.emit('input', { type: 'shutter' }));
$('copy-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('share-link').value);
  } catch {
    $('share-link').select();
    document.execCommand('copy');
  }
  $('copy-btn').textContent = 'Copied!';
  setTimeout(() => { $('copy-btn').textContent = 'Copy invite'; }, 1500);
});

socket.on('lobbyUpdate', applyLobby);
socket.on('disconnect', (reason) => {
  leaveBooth();
  showError(reason || 'Disconnected.');
});
socket.on('status', (text) => {
  if (!$('connecting-hint').hidden) $('connecting-hint').textContent = text;
  if (!$('reconnect-hint').hidden) $('reconnect-hint').textContent = text;
});
socket.on('reconnecting', (message) => {
  $('reconnect-hint').textContent = message;
  $('reconnect-hint').hidden = false;
});
socket.on('rejoined', (res) => {
  $('reconnect-hint').hidden = true;
  handleJoinResponse(res);
});

// Links like /photomates/mate (or ?room=mate) open that booth: join it if someone's there, otherwise host it.
function enterRoomFromUrl() {
  const requested = new URLSearchParams(location.search).get('room');
  if (!requested) return;
  if (!window.PhotomatesNet.normaliseRoomName(requested)) {
    history.replaceState(null, '', basePath());
    return showError('Room names are 2-16 letters, numbers or dashes.');
  }
  state.linkRoom = true;
  setConnecting(true);
  socket.emit('enterRoom', requested, handleJoinResponse);
}

// ---------- Taking the photo ----------

socket.on('shutter', ({ n, ms }) => {
  if (!state.inBooth) return;
  // Everyone in the picture, as they're sitting right now.
  state.pending = {
    n,
    scene: state.scene,
    players: state.players.map((p) => ({ ...p })),
    stills: state.stillsEarly.get(n) || new Map(),
    mine: null,
  };
  state.stillsEarly.delete(n);
  $('shutter').disabled = true;
  const start = performance.now();
  const el = $('countdown');
  el.hidden = false;
  const tick = () => {
    const left = Math.ceil((ms - (performance.now() - start)) / 1000);
    if (left > 0) {
      if (el.dataset.n !== String(left)) {
        el.dataset.n = String(left);
        el.innerHTML = `${left}<small>Smile!</small>`;
        beep(left === 1 ? 880 : 660, 0.12);
      }
      // A timer, not the screen refresh, so the photo still happens in a background tab.
      setTimeout(tick, 50);
    } else {
      el.hidden = true;
      el.dataset.n = '';
      fire(n);
    }
  };
  tick();
});

async function fire(n) {
  const flash = $('flash');
  flash.classList.add('on');
  shutterSound();
  requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove('on')));
  const shot = state.pending;
  if (!shot || shot.n !== n) return;
  const data = await captureStill();
  if (data) {
    shot.mine = await loadImage(data);
    shot.stills.set(socket.id, shot.mine);
    const total = Math.ceil(data.length / PART_CHARS);
    for (let i = 0; i < total; i++) socket.emit('input', { type: 'stillPart', n, i, total, data: data.slice(i * PART_CHARS, (i + 1) * PART_CHARS) });
  }
  showResult(null);
  // Wait for everyone's photo (or a few seconds), then put the picture together.
  const deadline = performance.now() + 6000;
  const waitAll = () => {
    if (state.pending !== shot) return;
    const missing = shot.players.filter((p) => !shot.stills.has(p.id) && hasCamera(p.id));
    if (missing.length && performance.now() < deadline) return setTimeout(waitAll, 200);
    compose(shot);
  };
  waitAll();
}

function hasCamera(id) {
  if (id === socket.id) return cam.ready;
  const c = cutouts.get(id);
  return !!c && performance.now() - c.seenAt < 4000;
}

// Photos arrive in pieces: put each one back together.
const stillParts = new Map(); // "id:n" -> { total, parts, got }
socket.on('stillPart', ({ id, n, i, total, data }) => {
  const key = `${id}:${n}`;
  let entry = stillParts.get(key);
  if (!entry) {
    entry = { total, parts: new Array(total), got: 0 };
    stillParts.set(key, entry);
  }
  if (entry.parts[i] === undefined) {
    entry.parts[i] = data;
    entry.got++;
  }
  if (entry.got < entry.total) return;
  stillParts.delete(key);
  const full = entry.parts.join('');
  if (full.startsWith('data:image/')) receiveStill(id, n, full);
});

async function receiveStill(id, n, data) {
  const img = await loadImage(data).catch(() => null);
  if (!img) return;
  if (state.pending && state.pending.n === n) state.pending.stills.set(id, img);
  else {
    if (!state.stillsEarly.has(n)) state.stillsEarly.set(n, new Map());
    state.stillsEarly.get(n).set(id, img);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// The finished photo, at twice the stage size, from everyone's full-quality photos.
async function compose(shot) {
  const scale = 2;
  const fw = Scenes.frameWidth(shot.scene, shot.players.length);
  const out = Object.assign(document.createElement('canvas'), { width: fw * scale, height: Scenes.H * scale });
  const c = out.getContext('2d');
  c.scale(scale, scale);
  c.translate(-(Scenes.W - fw) / 2, 0);
  const people = shot.players.map((p) => {
    const live = cutouts.get(p.id);
    const still = shot.stills.get(p.id);
    const image = still || (live && performance.now() - live.seenAt < 4000 ? live.canvas : null);
    const bottom = still ? measureBottom(still) : (live ? live.bottom : 1);
    return { seat: p.seat, color: p.color, image, bottom, version: still ? 'still' : (live ? live.version : 0) };
  });
  Scenes.render(c, shot.scene, people);
  state.lastShot = { n: shot.n, people: shot.players.length, stills: shot.stills.size };
  c.font = '600 18px Fredoka, system-ui, sans-serif';
  c.textAlign = 'right';
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = 4;
  c.fillText('photomates', (Scenes.W + fw) / 2 - 16, Scenes.H - 14);
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  if (state.pending !== shot) return;
  state.pending = null;
  $('shutter').disabled = false;
  const url = URL.createObjectURL(blob);
  addToGallery(url);
  showResult(url);
}

// Every photo taken in this booth, so anyone can go back and download any of them.
const MAX_GALLERY = 12;
function addToGallery(url) {
  state.photos = state.photos || [];
  state.photos.unshift(url);
  while (state.photos.length > MAX_GALLERY) URL.revokeObjectURL(state.photos.pop());
  renderGallery();
}

function renderGallery() {
  const photos = state.photos || [];
  $('gallery').hidden = !photos.length;
  $('gallery-strip').replaceChildren(...photos.map((url, i) => {
    const b = document.createElement('button');
    b.className = 'thumb';
    b.setAttribute('aria-label', `Open photo ${photos.length - i}`);
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    b.append(img);
    b.addEventListener('click', () => showResult(url));
    return b;
  }));
}

function showResult(url) {
  $('result').hidden = false;
  $('result-wait').hidden = !!url;
  $('result-img').hidden = !url;
  $('download-btn').hidden = !url;
  if (!url) return;
  $('result-img').src = url;
  $('download-btn').href = url;
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  $('download-btn').download = `photomates-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}
$('close-result').addEventListener('click', () => {
  $('result').hidden = true;
  if (!state.pending) $('shutter').disabled = false;
});

buildScenePicker();
enterRoomFromUrl();

if (DEBUG) window.__photoDebug = { state, cam, calls, cutouts, socket };
