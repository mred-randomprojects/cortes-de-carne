import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { computeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
import { makeField, meshField, PART } from "./cow.js";
import { ATOMS, REGIONS, SOURCES } from "./data.js";
import { MAP, buildMaps, atomIndex, LABEL_AT } from "./map.js";

const $ = (s) => document.querySelector(s);
const atomById = Object.fromEntries(ATOMS.map((a) => [a.id, a]));
const regionById = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
const STORE = "cortes-de-carne:region";

const state = {
  region: "ar",
  selected: null, // id de átomo
  hover: null,
  labels: true,
  xray: false,
  hump: false,
};

// ---------- nombres ----------
function nameIn(regionId, atomId) {
  const r = regionById[regionId];
  return r.names[atomId] || (r.inherits ? regionById[r.inherits].names[atomId] : null) || null;
}
function displayName(atomId, regionId = state.region) {
  return nameIn(regionId, atomId) || nameIn("ar", atomId);
}
// Cortes que en la región actual comparten nombre se resaltan juntos.
function sameNameGroup(atomId) {
  const n = nameIn(state.region, atomId);
  if (!n) return [atomId];
  return ATOMS.filter((a) => nameIn(state.region, a.id) === n).map((a) => a.id);
}

// ---------- escena ----------
const canvas = $("#view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
camera.position.set(0.9, 1.3, 4.4);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0.1, 0.75, 0);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 8;
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2, 4, 3);
scene.add(sun);

// suelo
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(2.2, 64),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0.15, 0, 0);
scene.add(ground);

// ---------- texturas ----------
function dataTex(arr, w, h) {
  const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
let maps = buildMaps({ hump: false });
const texBody = dataTex(maps.body, MAP.W, MAP.H);
const texLimb = dataTex(maps.limb, MAP.W, MAP.H);
const palette = new Uint8Array(64 * 4);
ATOMS.forEach((a, i) => {
  const c = new THREE.Color(a.color);
  palette.set([c.r * 255, c.g * 255, c.b * 255, 255], (i + 1) * 4);
});
const texPal = dataTex(palette, 64, 1);

const ID = (id) => atomIndex(id);
const uniforms = {
  uBody: { value: texBody }, uLimb: { value: texLimb }, uPal: { value: texPal },
  uMap: { value: new THREE.Vector4(MAP.x0, MAP.y0, MAP.res, 0) },
  uSize: { value: new THREE.Vector2(MAP.W, MAP.H) },
  uSel: { value: new Int32Array(4).fill(-1) }, uHover: { value: -1 },
  uLayerSel: { value: 0 }, uLayerColor: { value: new THREE.Color() },
  uXray: { value: 0 }, uDimAll: { value: 0 },
};

const vert = /* glsl */ `
in float part;
in float limb;
flat out int vPart;
out float vLimb;
out vec3 vPos;
out vec3 vN;
void main() {
  vPart = int(part + 0.5);
  vLimb = limb;
  vPos = position;
  vN = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uBody, uLimb, uPal;
uniform vec4 uMap;
uniform vec2 uSize;
uniform int uSel[4];
uniform int uHover;
uniform int uLayerSel;
uniform vec3 uLayerColor;
uniform float uXray;
uniform float uDimAll;
flat in int vPart;
in float vLimb;
in vec3 vPos;
in vec3 vN;
out vec4 outColor;

const int ID_NALGA = ${ID("nalga")};
const int ID_CUADRADA = ${ID("cuadrada")};
const int ID_PECETO = ${ID("peceto")};
const int ID_CABEZA = ${ID("cabeza")};
const int ID_RABO = ${ID("rabo")};
const int ID_PEZUNA = ${ID("pezuna")};
const int BIT_TNALGA = ${atomById.tapaNalga.bit};

ivec2 look(vec2 p) {
  ivec2 c = clamp(ivec2(floor((p - uMap.xy) / uMap.z)), ivec2(0), ivec2(uSize) - 1);
  if (vPart <= 2 && vLimb > 0.5) {
    vec4 l = texelFetch(uLimb, c, 0);
    int li = int(l.r * 255.0 + 0.5);
    if (li > 0) return ivec2(li, int(l.g * 255.0 + 0.5));
  }
  vec4 b = texelFetch(uBody, c, 0);
  return ivec2(int(b.r * 255.0 + 0.5), int(b.g * 255.0 + 0.5));
}

int resolve(ivec2 r, float medial) {
  if (vPart == 3) return ID_CABEZA;
  if (vPart == 4) return ID_RABO;
  if (vPart == 5) return ID_PEZUNA;
  int id = r.x;
  if (vPart <= 2 && vLimb > 0.5 && vPos.x < 0.0 && (id == ID_CUADRADA || id == ID_PECETO) && medial > 0.35) id = ID_NALGA;
  return id;
}

bool isSel(int id) {
  for (int i = 0; i < 4; i++) if (uSel[i] == id) return true;
  return false;
}

void main() {
  vec3 N = normalize(vN);
  float medial = dot(N, vec3(0.0, 0.0, -sign(vPos.z)));
  ivec2 r = look(vPos.xy);
  int id = resolve(r, medial);
  int layers = r.y;
  if (id != ID_NALGA) layers &= ~BIT_TNALGA;

  // bordes entre cortes
  float d = 0.0045;
  float edge = 0.0;
  if (vPart <= 2) {
    if (resolve(look(vPos.xy + vec2(d, 0.0)), medial) != id) edge = 1.0;
    if (resolve(look(vPos.xy - vec2(d, 0.0)), medial) != id) edge = 1.0;
    if (resolve(look(vPos.xy + vec2(0.0, d)), medial) != id) edge = 1.0;
    if (resolve(look(vPos.xy - vec2(0.0, d)), medial) != id) edge = 1.0;
  }

  vec3 base = texelFetch(uPal, ivec2(id, 0), 0).rgb;
  bool anySel = uSel[0] >= 0 || uLayerSel != 0;
  bool sel = isSel(id);
  bool layerSel = (layers & uLayerSel) != 0;
  if (anySel && !sel && !layerSel) {
    float g = dot(base, vec3(0.3, 0.59, 0.11));
    base = mix(vec3(g), vec3(0.93, 0.9, 0.86), 0.55);
  }
  if (layerSel) {
    float st = step(0.5, fract((vPos.x + vPos.y + vPos.z * 0.5) * 22.0));
    base = mix(base, uLayerColor, 0.35 + 0.5 * st);
  }
  if (id == uHover) base = mix(base, vec3(1.0), 0.25);

  vec3 L = normalize(vec3(0.2, 0.8, 0.55));
  vec3 V = normalize(cameraPosition - vPos);
  float diff = max(dot(N, L), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 40.0) * 0.12;
  vec3 col = base * (0.58 + 0.2 * hemi + 0.38 * diff) + spec + rim * 0.06;
  col = mix(col, col * 0.35, edge * (vPart <= 2 ? 0.75 : 0.0));

  float alpha = 1.0;
  if (uXray > 0.5) alpha = mix(0.1, 0.42, rim) + edge * 0.1;
  outColor = vec4(col, alpha);
}`;

const cowMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms,
  vertexShader: vert,
  fragmentShader: frag,
  side: THREE.DoubleSide,
});

let cow = null;
function buildCow() {
  const field = makeField({ hump: state.hump });
  const m = meshField(field, 0.012);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute("part", new THREE.BufferAttribute(m.parts, 1));
  g.setAttribute("limb", new THREE.BufferAttribute(m.limbs, 1));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.computeBoundsTree();
  if (cow) { scene.remove(cow); cow.geometry.dispose(); }
  cow = new THREE.Mesh(g, cowMat);
  cow.renderOrder = 2;
  scene.add(cow);
  maps = buildMaps({ hump: state.hump });
  texBody.image.data.set(maps.body); texBody.needsUpdate = true;
  texLimb.image.data.set(maps.limb); texLimb.needsUpdate = true;
  computeAnchors();
}

// ---------- cortes internos ----------
const internals = new THREE.Group();
scene.add(internals);
function internalMat(id) {
  return new THREE.MeshStandardMaterial({ color: atomById[id].color, roughness: 0.6, emissive: 0x000000 });
}
const lomoMat = internalMat("lomo");
for (const s of [-1, 1]) {
  // psoas: de las últimas dorsales a la pelvis, debajo de las lumbares
  const a = new THREE.Vector3(-0.06, 1.0, 0.055 * s), b = new THREE.Vector3(-0.64, 0.95, 0.075 * s);
  const len = a.distanceTo(b);
  const geo = new THREE.CapsuleGeometry(0.042, len, 6, 16);
  geo.scale(1, 1, 1);
  const m = new THREE.Mesh(geo, lomoMat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.scale.set(1, 1, 1);
  m.userData.atom = "lomo";
  internals.add(m);
}
const entMat = internalMat("entrana");
{
  // diafragma: anillo oblicuo de la punta del esternón a la 12ª costilla
  const geo = new THREE.TorusGeometry(1, 0.09, 12, 64);
  geo.rotateX(Math.PI / 2);
  geo.scale(0.25, 0.25, 0.27);
  const m = new THREE.Mesh(geo, entMat);
  m.position.set(0.02, 0.84, 0);
  m.rotation.z = Math.atan2(-0.91, 0.414);
  m.userData.atom = "entrana";
  internals.add(m);
  const c = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), entMat);
  c.scale.set(0.05, 0.08, 0.06);
  c.position.set(-0.06, 0.98, 0);
  c.userData.atom = "entrana";
  internals.add(c);
}
internals.visible = false;

// ---------- picking (misma lógica que el shader) ----------
const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
function atomAtHit(hit) {
  const p = hit.point;
  const g = cow.geometry;
  const f = hit.face;
  const parts = g.getAttribute("part").array;
  const part = Math.round(parts[f.a]);
  if (part === PART.HEAD) return "cabeza";
  if (part === PART.TAIL) return "rabo";
  if (part === PART.HOOF) return "pezuna";
  const i = Math.max(0, Math.min(MAP.W - 1, Math.floor((p.x - MAP.x0) / MAP.res)));
  const j = Math.max(0, Math.min(MAP.H - 1, Math.floor((p.y - MAP.y0) / MAP.res)));
  const o = (j * MAP.W + i) * 4;
  const lw = g.getAttribute("limb").array;
  const isLimb = (lw[f.a] + lw[f.b] + lw[f.c]) / 3 > 0.5;
  let idx = 0;
  if (isLimb) idx = maps.limb[o];
  if (!idx) idx = maps.body[o];
  let atom = ATOMS[idx - 1]?.id;
  if (isLimb && p.x < 0 && (atom === "cuadrada" || atom === "peceto")) {
    const n = g.getAttribute("normal");
    const nz = (n.getZ(f.a) + n.getZ(f.b) + n.getZ(f.c)) / 3;
    if (-Math.sign(p.z) * nz > 0.35) atom = "nalga";
  }
  return atom || null;
}
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  const v = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(v, camera);
  if (state.xray) {
    const hi = raycaster.intersectObjects(internals.children, false)[0];
    if (hi) return hi.object.userData.atom;
  }
  const h = raycaster.intersectObject(cow, false)[0];
  return h ? atomAtHit(h) : null;
}

// ---------- etiquetas ----------
const labelLayer = $("#labels");
let anchors = []; // {atom, pos, normal, el}
function computeAnchors() {
  labelLayer.innerHTML = "";
  anchors = [];
  const rc = new THREE.Raycaster();
  const add = (atom, origin, dir) => {
    rc.set(origin, dir);
    const h = rc.intersectObject(cow, false)[0];
    if (!h) return;
    const el = document.createElement("button");
    el.className = "label";
    el.type = "button";
    el.dataset.atom = atom;
    el.addEventListener("click", () => select(atom));
    labelLayer.appendChild(el);
    const n = h.face.normal.clone();
    // normal suave: la del campo, aproximada por la cara
    anchors.push({ atom, pos: h.point.clone(), normal: n, el });
  };
  for (const [atom, [x, y]] of Object.entries(LABEL_AT)) {
    if (atom === "giba" && !state.hump) continue;
    for (const s of [1, -1]) add(atom, new THREE.Vector3(x, y, 1.5 * s), new THREE.Vector3(0, 0, -s));
  }
  for (const s of [1, -1]) add("nalga", new THREE.Vector3(-0.74, 0.74, 0), new THREE.Vector3(0, 0, s));
  // la normal de la cara puede apuntar hacia adentro: orientarla hacia el rayo de origen
  for (const a of anchors) {
    const out = a.atom === "nalga" ? -Math.sign(a.pos.z) : Math.sign(a.pos.z);
    if (Math.sign(a.normal.z) !== out) a.normal.negate();
  }
  refreshLabels();
}
function refreshLabels() {
  for (const a of anchors) a.el.textContent = displayName(a.atom);
}
const tmp = new THREE.Vector3();
const occRay = new THREE.Raycaster();
occRay.firstHitOnly = true;
let occFrame = 0;
// ¿la etiqueta está tapada por otra parte de la vaca? (se recalcula cada pocos cuadros)
function updateOcclusion() {
  for (const a of anchors) {
    tmp.copy(a.pos).sub(camera.position);
    const dist = tmp.length();
    occRay.set(camera.position, tmp.normalize());
    occRay.far = dist;
    const h = occRay.intersectObject(cow, false)[0];
    a.hidden = !!h && h.distance < dist - 0.03;
  }
}
function placeLabels() {
  const show = state.labels && !state.xray;
  labelLayer.hidden = !show;
  if (!show) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sel = new Set(state.selected ? sameNameGroup(state.selected) : []);
  if (occFrame++ % 6 === 0) updateOcclusion();
  // las seleccionadas primero, después las más cercanas; las que chocan se ocultan
  const order = anchors.slice().sort((p, q) => (sel.has(q.atom) - sel.has(p.atom)) || (p.pos.distanceToSquared(camera.position) - q.pos.distanceToSquared(camera.position)));
  const placed = [];
  for (const a of order) {
    tmp.copy(camera.position).sub(a.pos);
    const facing = tmp.normalize().dot(a.normal);
    tmp.copy(a.pos).project(camera);
    let vis = facing > 0.1 && tmp.z < 1 && !a.hidden;
    const x = ((tmp.x + 1) / 2) * w, y = ((1 - tmp.y) / 2) * h;
    const bw = a.el.offsetWidth || 60, bh = a.el.offsetHeight || 20;
    if (vis) {
      const box = { l: x - bw / 2 - 2, r: x + bw / 2 + 2, t: y - bh / 2 - 1, b: y + bh / 2 + 1 };
      if (placed.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) vis = false;
      else placed.push(box);
    }
    a.el.style.visibility = vis ? "visible" : "hidden";
    if (!vis) continue;
    a.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    a.el.classList.toggle("is-sel", sel.has(a.atom));
    a.el.classList.toggle("is-dim", sel.size > 0 && !sel.has(a.atom));
  }
}

// ---------- selección ----------
function applySelection() {
  const ids = state.selected ? sameNameGroup(state.selected) : [];
  const surf = ids.filter((id) => atomById[id].kind === "surface" || atomById[id].kind === "other").map(ID);
  const arr = uniforms.uSel.value;
  arr.fill(-1);
  surf.slice(0, 4).forEach((v, i) => (arr[i] = v));
  let bits = 0;
  for (const id of ids) if (atomById[id].kind === "layer") bits |= atomById[id].bit;
  uniforms.uLayerSel.value = bits;
  if (bits) uniforms.uLayerColor.value.set(atomById[ids.find((id) => atomById[id].bit)].color);
  // si hay algo seleccionado que no está en la piel, igual atenuar la piel
  if (!surf.length && !bits && ids.length) arr[0] = 0;
  const internal = ids.some((id) => atomById[id].kind === "internal");
  if (internal && !state.xray) setXray(true);
  lomoMat.emissive.set(ids.includes("lomo") ? 0x551111 : 0x000000);
  entMat.emissive.set(ids.includes("entrana") ? 0x553300 : 0x000000);
  renderList();
  renderInfo();
}

function select(atomId, { focus = true } = {}) {
  state.selected = atomId;
  applySelection();
  writeHash();
  if (focus && atomId) focusOn(atomId);
}

// enfocar la cámara del lado donde se ve el corte
let camAnim = null;
function focusOn(atomId) {
  const a = anchors.find((x) => x.atom === atomId && x.pos.z * (atomId === "nalga" ? -1 : 1) > 0)
    || anchors.find((x) => x.atom === atomId);
  let target, from;
  // vista de costado (algo de arriba), del lado del corte, sin acercarse tanto
  const side = a ? Math.sign(a.normal.z || a.pos.z) || 1 : 1;
  if (atomId === "nalga" || atomId === "tapaNalga") {
    target = new THREE.Vector3(-0.4, 0.72, 0);
    from = new THREE.Vector3(-3.9, 0.1, 2.3);
  } else if (a) {
    target = new THREE.Vector3(0.1, 0.72, 0);
    const dir = new THREE.Vector3(a.normal.x * 0.5, 0.25 + Math.max(a.normal.y, 0) * 0.35, side).normalize();
    from = target.clone().add(dir.multiplyScalar(5.2));
  } else {
    target = new THREE.Vector3(0.1, 0.8, 0);
    from = new THREE.Vector3(0.8, 1.6, 5.2);
  }
  from.sub(target).multiplyScalar(fit()).add(target);
  camAnim = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: from, t1: target };
}
// en pantallas angostas, alejar la cámara para que entre la vaca entera
function fit() {
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  return Math.max(1, 1.15 / aspect);
}

// ---------- UI ----------
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
      if (a.zebuOnly && !state.hump && state.region !== "br") continue;
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
    box.innerHTML = `<p class="hint">Tocá un corte en la vaca o en la lista. Arrastrá para girar, rueda o pellizco para acercar.</p>`;
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
  const kind = a.kind === "layer" ? "Capa que cubre otros cortes (rayada en la vaca)" : a.kind === "internal" ? "Corte interno (se ve con «Ver por dentro»)" : "";
  box.innerHTML = `
    <div class="info-head">
      <span class="sw big" style="background:${a.color}"></span>
      <div>
        <h2>${esc(own || ar)}</h2>
        ${state.region !== "ar" && own !== ar ? `<p class="sub">En Buenos Aires: <b>${esc(ar)}</b></p>` : ""}
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

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
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

function setXray(on) {
  state.xray = on;
  internals.visible = on;
  uniforms.uXray.value = on ? 1 : 0;
  cowMat.transparent = on;
  cowMat.depthWrite = !on;
  cowMat.needsUpdate = true;
  $("#t-xray").setAttribute("aria-pressed", String(on));
}

function setHump(on) {
  state.hump = on;
  $("#t-hump").setAttribute("aria-pressed", String(on));
  buildCow();
  renderList();
}

$("#t-labels").addEventListener("click", (e) => {
  state.labels = !state.labels;
  e.currentTarget.setAttribute("aria-pressed", String(state.labels));
});
$("#t-xray").addEventListener("click", () => setXray(!state.xray));
$("#t-hump").addEventListener("click", () => setHump(!state.hump));
const HOME = { pos: new THREE.Vector3(0.9, 1.3, 4.4), target: new THREE.Vector3(0.1, 0.75, 0) };
function homePos() {
  return HOME.pos.clone().sub(HOME.target).multiplyScalar(fit()).add(HOME.target);
}
$("#t-reset").addEventListener("click", () => {
  camAnim = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: homePos(), t1: HOME.target.clone() };
});
// en el celular, la ficha va debajo de la vaca (en el panel), no encima
const narrow = matchMedia("(max-width: 820px)");
function placeInfo() {
  const info = $("#info");
  if (narrow.matches) $("aside").prepend(info);
  else $("main").appendChild(info);
}
narrow.addEventListener("change", placeInfo);

// hash: #region/corte
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
  uniforms.uHover.value = a ? ID(a) : -1;
  const tip = $("#tip");
  tip.hidden = !a;
  if (a) tip.textContent = displayName(a);
  canvas.style.cursor = a ? "pointer" : "";
}

// ---------- bucle ----------
let viewShift = 0;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  // con la ficha abierta a la derecha, correr la vaca hacia la izquierda
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
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, k);
    controls.target.lerpVectors(camAnim.t0, camAnim.t1, k);
    if (camAnim.t >= 1) camAnim = null;
  }
  controls.update();
  if (lastMove && cow) {
    const a = pick(lastMove);
    setHover(a);
    const tip = $("#tip");
    const r = canvas.getBoundingClientRect();
    tip.style.transform = `translate(${lastMove.clientX - r.left + 14}px, ${lastMove.clientY - r.top + 14}px)`;
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
  $("#t-hump").setAttribute("aria-pressed", String(state.hump));
  placeInfo();
  resize();
  camera.position.copy(homePos());
  controls.update();
  buildCow();
  renderRegions();
  renderSources();
  renderList();
  renderInfo();
  if (c) select(c);
  $("#loading").hidden = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(() => setTimeout(start, 30));
