import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { computeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";
import { ATOMS, REGIONS, SOURCES } from "./data.js";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const $ = (s) => document.querySelector(s);
const atomById = Object.fromEntries(ATOMS.map((a) => [a.id, a]));
const regionById = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
const STORE = "cortes-de-carne:region";
const CENTER = new THREE.Vector3(0.05, 0.82, 0);

const state = {
  region: "ar",
  selected: null,
  hover: null,
  labels: true,
  skeleton: true,
  half: false,
  hump: false,
  explode: 0,
  cut: 1, // 1 = sin corte transversal
};

// ---------- nombres ----------
function nameIn(regionId, atomId) {
  const r = regionById[regionId];
  return r.names[atomId] || (r.inherits ? regionById[r.inherits].names[atomId] : null) || null;
}
const displayName = (atomId, regionId = state.region) => nameIn(regionId, atomId) || nameIn("ar", atomId);
function sameNameGroup(atomId) {
  const n = nameIn(state.region, atomId);
  if (!n) return [atomId];
  return ATOMS.filter((a) => nameIn(state.region, a.id) === n).map((a) => a.id);
}

// ---------- escena ----------
const canvas = $("#view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 0.8;
controls.maxDistance = 9;

scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a4a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(1.5, 4, 3);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(-2, 1, -3);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(2.4, 64),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.07 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0.15, 0, 0);
scene.add(ground);

// corte transversal: se ve lo que queda detrás del plano (x < cut)
const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 5);
const clipPlanes = [clip];

// ---------- materiales ----------
const mats = {}; // atom -> { front, back }
for (const a of ATOMS) {
  const c = new THREE.Color(a.color);
  const front = new THREE.MeshStandardMaterial({ color: c, roughness: 0.72, metalness: 0, clippingPlanes: clipPlanes });
  // la cara de atrás, más oscura y sin luz: con el corte transversal se ve
  // como la carne cortada
  const back = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.62), side: THREE.BackSide, clippingPlanes: clipPlanes });
  mats[a.id] = { front, back };
}
const boneMat = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.55, clippingPlanes: clipPlanes });
const boneBack = new THREE.MeshBasicMaterial({ color: 0xc9bfa8, side: THREE.BackSide, clippingPlanes: clipPlanes });

// ---------- modelo ----------
const carcass = new THREE.Group();
const skeleton = new THREE.Group();
scene.add(carcass, skeleton);
const labelLayer = $("#labels");
let pieces = []; // { atom, side, mesh, centroid, anchor, normal, el }

function geometryOf(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  g.computeBoundsTree();
  return g;
}

function setModel(data) {
  carcass.clear();
  skeleton.clear();
  labelLayer.innerHTML = "";
  pieces = [];
  for (const m of data.pieces) {
    const g = geometryOf(m);
    const mesh = new THREE.Mesh(g, mats[m.atom].front);
    const back = new THREE.Mesh(g, mats[m.atom].back);
    back.raycast = () => {};
    mesh.add(back);
    mesh.userData.atom = m.atom;
    carcass.add(mesh);
    // centro, y ancla de la etiqueta: sobre la superficie, del lado de afuera
    const P = m.positions, n = P.length / 3;
    const c = new THREE.Vector3();
    for (let v = 0; v < n; v++) { c.x += P[v * 3]; c.y += P[v * 3 + 1]; c.z += P[v * 3 + 2]; }
    c.divideScalar(n);
    const out = new THREE.Vector3((c.x - CENTER.x) * 0.6, (c.y - CENTER.y) * 0.6, m.side).normalize();
    if (m.atom === "nalga" || m.atom === "tapaNalga") out.set(-0.4, -0.5, -m.side).normalize();
    if (m.atom === "lomo" || m.atom === "entrana") out.set(0, -1, 0);
    let best = -Infinity;
    const scores = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const s = (P[v * 3] - c.x) * out.x + (P[v * 3 + 1] - c.y) * out.y + (P[v * 3 + 2] - c.z) * out.z;
      scores[v] = s;
      if (s > best) best = s;
    }
    const anchor = new THREE.Vector3();
    let k = 0;
    for (let v = 0; v < n; v++) if (scores[v] > best - 0.015) { anchor.x += P[v * 3]; anchor.y += P[v * 3 + 1]; anchor.z += P[v * 3 + 2]; k++; }
    anchor.divideScalar(k);
    const el = document.createElement("button");
    el.className = "label";
    el.type = "button";
    el.addEventListener("click", () => select(m.atom));
    labelLayer.appendChild(el);
    pieces.push({ atom: m.atom, side: m.side, mesh, centroid: c, anchor, normal: out, el });
  }
  for (const b of data.bones) {
    const g = geometryOf(b);
    const mesh = new THREE.Mesh(g, boneMat);
    const back = new THREE.Mesh(g, boneBack);
    back.raycast = () => {};
    mesh.add(back);
    mesh.userData.side = b.side;
    mesh.raycast = () => {};
    skeleton.add(mesh);
  }
  refreshLabels();
  applyView();
  applySelection();
}

// ---------- armado (en un worker) ----------
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
let buildId = 0;
const cache = {};
function build(hump) {
  if (cache[hump]) { setModel(cache[hump]); return; }
  const id = ++buildId;
  const loading = $("#loading");
  loading.hidden = false;
  loading.textContent = "Armando la res…";
  worker.onmessage = (e) => {
    if (e.data.type === "progress") {
      loading.textContent = `Armando la res… ${Math.round(e.data.p * 100)} %`;
      return;
    }
    if (e.data.id !== id) return;
    cache[hump] = e.data;
    loading.hidden = true;
    const first = !pieces.length;
    setModel(e.data);
    if (first && state.selected) focusOn(state.selected);
  };
  worker.onerror = (e) => { loading.textContent = "No se pudo armar la res: " + e.message; };
  worker.postMessage({ hump, id });
}

// ---------- vista: despiece, media res, corte, esqueleto ----------
const tmp = new THREE.Vector3();
function offsetOf(p) {
  // desde el centro de la res, sobre todo hacia el costado
  const v = new THREE.Vector3((p.centroid.x - CENTER.x) * 0.8, (p.centroid.y - CENTER.y) * 0.9, p.side * 0.35 + p.centroid.z * 1.6);
  if (p.atom === "lomo" || p.atom === "entrana") v.y -= 0.5;
  return v.normalize().multiplyScalar(state.explode * 0.55);
}
function applyView() {
  for (const p of pieces) {
    p.mesh.position.copy(offsetOf(p));
    p.mesh.visible = !(state.half && p.side < 0);
  }
  skeleton.visible = state.skeleton;
  for (const b of skeleton.children) b.visible = !(state.half && b.userData.side < 0);
  clip.constant = state.cut >= 1 ? 5 : -1.0 + state.cut * 2.45;
  $("#t-skel").setAttribute("aria-pressed", String(state.skeleton));
  $("#t-half").setAttribute("aria-pressed", String(state.half));
  $("#t-hump").setAttribute("aria-pressed", String(state.hump));
}

// ---------- selección ----------
function applySelection() {
  const ids = new Set(state.selected ? sameNameGroup(state.selected) : []);
  for (const a of ATOMS) {
    const { front, back } = mats[a.id];
    const ghost = ids.size > 0 && !ids.has(a.id);
    front.transparent = ghost;
    front.opacity = ghost ? 0.12 : 1;
    front.depthWrite = !ghost;
    back.visible = !ghost;
  }
  applyEmissive();
  for (const p of pieces) p.mesh.renderOrder = ids.has(p.atom) ? 0 : 1;
  renderList();
  renderInfo();
}
function applyEmissive() {
  const ids = new Set(state.selected ? sameNameGroup(state.selected) : []);
  for (const a of ATOMS) mats[a.id].front.emissive.set(ids.has(a.id) ? 0x2a1208 : a.id === state.hover ? 0x2a2018 : 0x000000);
}

function select(atomId, { focus = true } = {}) {
  state.selected = atomId;
  applySelection();
  writeHash();
  if (focus && atomId) focusOn(atomId);
}

let camAnim = null;
function fit() {
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  return Math.max(1, 1.15 / aspect);
}
// la cámara gira alrededor del objetivo (no lo atraviesa)
function animateTo(pos, target) {
  const s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const s1 = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
  let dt = s1.theta - s0.theta;
  if (dt > Math.PI) dt -= 2 * Math.PI;
  if (dt < -Math.PI) dt += 2 * Math.PI;
  camAnim = { t: 0, s0, s1, dt, t0: controls.target.clone(), t1: target };
}
function focusOn(atomId) {
  const ps = pieces.filter((p) => p.atom === atomId);
  if (!ps.length) return;
  const p = ps.find((q) => q.side > 0) || ps[0];
  const target = new THREE.Vector3(0.1, 0.75, 0).lerp(p.centroid, 0.3);
  const dir = new THREE.Vector3(p.normal.x * 0.6, 0.3 + Math.max(p.normal.y, 0) * 0.4, 1).normalize();
  if (atomId === "nalga" || atomId === "tapaNalga") dir.set(-0.75, -0.05, 0.6).normalize();
  animateTo(target.clone().add(dir.multiplyScalar(4.4 * fit())), target);
}
const HOME = { pos: new THREE.Vector3(1.3, 1.45, 4.3), target: new THREE.Vector3(0.1, 0.75, 0) };
const homePos = () => HOME.pos.clone().sub(HOME.target).multiplyScalar(fit()).add(HOME.target);

// ---------- picking ----------
const raycaster = new THREE.Raycaster();
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  const v = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(v, camera);
  const vis = pieces.filter((p) => p.mesh.visible).map((p) => p.mesh);
  const hits = raycaster.intersectObjects(vis, false).filter((h) => clip.distanceToPoint(h.point) >= 0);
  if (!hits.length) return null;
  // lo sólido (lo seleccionado) antes que lo atenuado
  const solid = hits.find((h) => !mats[h.object.userData.atom].front.transparent);
  return (solid || hits[0]).object.userData.atom;
}

// ---------- etiquetas ----------
function refreshLabels() {
  for (const p of pieces) p.el.textContent = displayName(p.atom);
}
const occRay = new THREE.Raycaster();
let frameNo = 0;
const world = new THREE.Vector3();
function placeLabels() {
  labelLayer.hidden = !state.labels;
  if (!state.labels) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sel = new Set(state.selected ? sameNameGroup(state.selected) : []);
  const recheck = frameNo++ % 5 === 0;
  const solids = recheck ? pieces.filter((p) => p.mesh.visible && !mats[p.atom].front.transparent).map((p) => p.mesh) : null;
  const shown = new Set();
  const order = pieces.slice().sort((a, b) => (sel.has(b.atom) - sel.has(a.atom)) || (a.anchor.distanceToSquared(camera.position) - b.anchor.distanceToSquared(camera.position)));
  const placed = [];
  for (const p of order) {
    world.copy(p.anchor).add(p.mesh.position);
    if (recheck) {
      tmp.copy(world).sub(camera.position);
      const dist = tmp.length();
      occRay.set(camera.position, tmp.normalize());
      occRay.far = dist + 0.05;
      const hit = occRay.intersectObjects(solids, false).find((x) => clip.distanceToPoint(x.point) >= 0);
      p.hidden = !!hit && hit.object !== p.mesh && hit.distance < dist - 0.02;
      p.cut = clip.distanceToPoint(world) < 0;
    }
    tmp.copy(world).project(camera);
    const ghost = mats[p.atom].front.transparent;
    let vis = p.mesh.visible && !ghost && !p.hidden && !p.cut && tmp.z < 1 && !shown.has(p.atom);
    const x = ((tmp.x + 1) / 2) * w, y = ((1 - tmp.y) / 2) * h;
    if (vis) {
      const bw = p.el.offsetWidth || 60, bh = p.el.offsetHeight || 20;
      const box = { l: x - bw / 2 - 2, r: x + bw / 2 + 2, t: y - bh / 2 - 1, b: y + bh / 2 + 1 };
      if (placed.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) vis = false;
      else placed.push(box);
    }
    p.el.style.visibility = vis ? "visible" : "hidden";
    if (!vis) continue;
    shown.add(p.atom);
    p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    p.el.classList.toggle("is-sel", sel.has(p.atom));
  }
}

// ---------- UI ----------
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function renderRegions() {
  const box = $("#regions");
  box.innerHTML = "";
  for (const r of REGIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = r.label;
    b.setAttribute("aria-pressed", String(r.id === state.region));
    b.addEventListener("click", () => setRegion(r.id));
    box.appendChild(b);
  }
  $("#region-blurb").textContent = regionById[state.region].blurb;
}

const GROUPS = [
  ["delantero", "Cuarto delantero"],
  ["trasero", "Cuarto trasero"],
  ["capas", "Capas y cortes internos"],
];
function renderList() {
  const box = $("#cuts");
  box.innerHTML = "";
  const sel = new Set(state.selected ? sameNameGroup(state.selected) : []);
  for (const [g, title] of GROUPS) {
    const h = document.createElement("h3");
    h.textContent = title;
    box.appendChild(h);
    const ul = document.createElement("ul");
    for (const a of ATOMS.filter((x) => x.group === g)) {
      if (a.zebuOnly && !state.hump) continue;
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cut" + (sel.has(a.id) ? " is-sel" : "");
      const own = nameIn(state.region, a.id);
      const ar = nameIn("ar", a.id);
      const note = regionById[state.region].notes[a.id];
      b.innerHTML = `<span class="sw" style="background:${a.color}"></span>
        <span class="nm">${own ? esc(own) : `<em>${esc(ar)}</em>`}${note && note.startsWith("≈") ? ' <span class="approx" title="Equivalencia aproximada">≈</span>' : ""}</span>
        ${state.region !== "ar" && own && own !== ar ? `<span class="ar">${esc(ar)}</span>` : ""}
        ${a.kind === "layer" ? '<span class="tag">capa</span>' : a.kind === "internal" ? '<span class="tag">interno</span>' : ""}`;
      b.addEventListener("click", () => select(state.selected === a.id ? null : a.id));
      li.appendChild(b);
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
}

function renderInfo() {
  const box = $("#info");
  const id = state.selected;
  if (!id) {
    box.innerHTML = `<p class="hint">Tocá un corte. Arrastrá para girar; rueda o pellizco para acercar. Con «Despiece», «Corte» y «Media res» ves lo de adentro.</p>`;
    box.classList.remove("open");
    return;
  }
  box.classList.add("open");
  const a = atomById[id];
  const own = nameIn(state.region, id);
  const ar = nameIn("ar", id);
  const note = regionById[state.region].notes[id];
  const rows = REGIONS.map((r) => {
    const n = nameIn(r.id, id);
    const nt = r.notes[id];
    return `<tr class="${r.id === state.region ? "cur" : ""}"><th>${esc(r.label)}</th><td>${n ? esc(n) : '<span class="none">sin nombre propio</span>'}${nt ? `<div class="note">${esc(nt)}</div>` : ""}</td></tr>`;
  }).join("");
  const kind = a.kind === "layer" ? "Capa que cubre otros cortes" : a.kind === "internal" ? "Corte interno" : "";
  box.innerHTML = `
    <div class="info-head">
      <span class="sw big" style="background:${a.color}"></span>
      <div>
        <h2>${esc(own || ar)}</h2>
        ${state.region !== "ar" && own && own !== ar ? `<p class="sub">En Buenos Aires: <b>${esc(ar)}</b></p>` : ""}
        ${!own && state.region !== "ar" ? `<p class="sub">No tiene nombre propio en ${esc(regionById[state.region].label)}.</p>` : ""}
      </div>
      <button class="close" type="button" aria-label="Cerrar">×</button>
    </div>
    ${kind ? `<p class="kind">${kind}</p>` : ""}
    <p>${esc(a.desc)}</p>
    ${a.syn.length ? `<p class="syn">También: ${a.syn.map(esc).join(", ")}</p>` : ""}
    ${note ? `<p class="note">${esc(note)}</p>` : ""}
    <table class="names">${rows}</table>`;
  box.querySelector(".close").addEventListener("click", () => select(null));
}

function renderSources() {
  $("#sources").innerHTML = Object.values(SOURCES)
    .map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`)
    .join("");
}

function setRegion(id) {
  state.region = id;
  try { localStorage.setItem(STORE, id); } catch {}
  const wantHump = !!regionById[id].zebu;
  if (wantHump !== state.hump) setHump(wantHump);
  renderRegions();
  refreshLabels();
  applySelection();
  writeHash();
}
function setHump(on) {
  state.hump = on;
  applyView();
  renderList();
  build(on);
}

$("#t-labels").addEventListener("click", (e) => {
  state.labels = !state.labels;
  e.currentTarget.setAttribute("aria-pressed", String(state.labels));
});
$("#t-skel").addEventListener("click", () => { state.skeleton = !state.skeleton; applyView(); });
$("#t-half").addEventListener("click", () => {
  state.half = !state.half;
  applyView();
  // la media res se mira desde el lado del corte (el plano del medio)
  const pos = state.half ? new THREE.Vector3(0.6, 1.3, -4.4) : HOME.pos.clone();
  animateTo(pos.sub(HOME.target).multiplyScalar(fit()).add(HOME.target), HOME.target.clone());
});
$("#t-hump").addEventListener("click", () => setHump(!state.hump));
$("#t-reset").addEventListener("click", () => animateTo(homePos(), HOME.target.clone()));
$("#s-explode").addEventListener("input", (e) => { state.explode = +e.target.value; applyView(); });
$("#s-cut").addEventListener("input", (e) => { state.cut = +e.target.value; applyView(); });

function writeHash() {
  const h = `#${state.region}${state.selected ? "/" + state.selected : ""}`;
  if (location.hash !== h) history.replaceState(null, "", h);
}
function readHash() {
  const [r, c] = location.hash.slice(1).split("/");
  return { r: regionById[r] ? r : null, c: atomById[c] ? c : null };
}

// ---------- puntero ----------
let down = null;
canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const a = pick(e);
  select(a && a !== state.selected ? a : null, { focus: false });
});
let lastMove = null;
canvas.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") lastMove = e; });
canvas.addEventListener("pointerleave", () => { lastMove = null; setHover(null); });
function setHover(a) {
  if (state.hover === a) return;
  state.hover = a;
  applyEmissive();
  const tip = $("#tip");
  tip.hidden = !a;
  if (a) tip.textContent = displayName(a);
  canvas.style.cursor = a ? "pointer" : "";
}

// ---------- ficha: en el celular va debajo de la vaca ----------
const narrow = matchMedia("(max-width: 820px)");
function placeInfo() {
  const info = $("#info");
  if (narrow.matches) $("aside").prepend(info);
  else $("main").appendChild(info);
}
narrow.addEventListener("change", placeInfo);

// ---------- bucle ----------
let viewShift = 0;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const info = $("#info");
  const shift = w > 820 && info.classList.contains("open") ? Math.round(info.offsetWidth / 2) : 0;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()) || shift !== viewShift) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    viewShift = shift;
    if (shift) camera.setViewOffset(w, h, shift, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
}
function frame() {
  resize();
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + 0.04);
    const k = 1 - Math.pow(1 - camAnim.t, 3);
    controls.target.lerpVectors(camAnim.t0, camAnim.t1, k);
    const { s0, s1, dt } = camAnim;
    const sp = new THREE.Spherical(s0.radius + (s1.radius - s0.radius) * k, s0.phi + (s1.phi - s0.phi) * k, s0.theta + dt * k);
    camera.position.setFromSpherical(sp).add(controls.target);
    if (camAnim.t >= 1) camAnim = null;
  }
  controls.update();
  if (lastMove && pieces.length) {
    setHover(pick(lastMove));
    const r = canvas.getBoundingClientRect();
    $("#tip").style.transform = `translate(${lastMove.clientX - r.left + 14}px, ${lastMove.clientY - r.top + 14}px)`;
    lastMove = null;
  }
  renderer.render(scene, camera);
  placeLabels();
  requestAnimationFrame(frame);
}

// ---------- inicio ----------
function start() {
  const { r, c } = readHash();
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch {}
  state.region = r || (regionById[saved] ? saved : "ar");
  state.hump = !!regionById[state.region].zebu;
  placeInfo();
  resize();
  camera.position.copy(homePos());
  controls.target.copy(HOME.target);
  controls.update();
  renderRegions();
  renderSources();
  renderList();
  applyView();
  if (c) select(c, { focus: false });
  else renderInfo();
  build(state.hump);
  requestAnimationFrame(frame);
}
start();
