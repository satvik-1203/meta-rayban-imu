// Same origin — client is served by the relay server itself
const RELAY_URL = location.origin.replace(/^http/, "ws");

const ANIMALS = [
  "ant",
  "bat",
  "bear",
  "bee",
  "bird",
  "boar",
  "bull",
  "cat",
  "clam",
  "crab",
  "crow",
  "deer",
  "dog",
  "dove",
  "duck",
  "eel",
  "elk",
  "fish",
  "flea",
  "frog",
  "goat",
  "hawk",
  "ibis",
  "kite",
  "lamb",
];

function getGlassesId() {
  let id = localStorage.getItem("glasses_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("glasses_id", id);
  }
  return id;
}

function toDisplayCode(uuid) {
  const hex = uuid.replace(/-/g, "");
  const animal =
    ANIMALS[parseInt(hex.slice(0, 2), 16) % ANIMALS.length].toUpperCase();
  const num = (parseInt(hex.slice(2, 6), 16) % 10000)
    .toString()
    .padStart(4, "0");
  return `${animal}-${num}`;
}

const glassesId = getGlassesId();
const displayCode = toDisplayCode(glassesId);
document.getElementById("code").textContent = displayCode;

// --- WebSocket with auto-reconnect ---
let ws;
let reconnectTimer;

function connect() {
  setStatus("connecting...");
  ws = new WebSocket(`${RELAY_URL}/glasses/${displayCode}`);
  ws.onopen = () => {
    setStatus("streaming");
    startIMU();
  };
  ws.onclose = () => {
    setStatus("disconnected");
    stopIMU();
    reconnectTimer = setTimeout(connect, 3000);
  };
  ws.onerror = () => ws.close();
}

// --- IMU ---
let frameCount = 0;
let hzTimer = setInterval(() => {
  document.getElementById("hz").textContent =
    frameCount > 0 ? `${frameCount} Hz` : "";
  frameCount = 0;
}, 1000);

function fmt(n) { return (n ?? 0).toFixed(2) }

function onMotion(e) {
  if (ws.readyState !== WebSocket.OPEN) return;
  frameCount++;

  const sample = {
    ts: performance.now(),
    interval: e.interval,
    ax: e.accelerationIncludingGravity?.x ?? 0,
    ay: e.accelerationIncludingGravity?.y ?? 0,
    az: e.accelerationIncludingGravity?.z ?? 0,
    gr: e.rotationRate?.alpha ?? 0,
    gp: e.rotationRate?.beta ?? 0,
    gy: e.rotationRate?.gamma ?? 0,
  };

  document.getElementById('v-ax').textContent = fmt(sample.ax);
  document.getElementById('v-ay').textContent = fmt(sample.ay);
  document.getElementById('v-az').textContent = fmt(sample.az);
  document.getElementById('v-gr').textContent = fmt(sample.gr);
  document.getElementById('v-gp').textContent = fmt(sample.gp);
  document.getElementById('v-gy').textContent = fmt(sample.gy);
  document.getElementById('v-interval').textContent = fmt(sample.interval);
  ws.send(JSON.stringify(sample));
}

function startIMU() {
  window.addEventListener("devicemotion", onMotion);
}
function stopIMU() {
  window.removeEventListener("devicemotion", onMotion);
}
function setStatus(s) {
  document.getElementById("status").textContent = s;
}

async function init() {
  if (typeof DeviceMotionEvent?.requestPermission === "function") {
    const state = await DeviceMotionEvent.requestPermission();
    if (state !== "granted") {
      setStatus("permission denied");
      return;
    }
  }
  connect();
}

init();
