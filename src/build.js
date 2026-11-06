// Arma la res en volumen: cada corte es una pieza sólida, una por media res.
//
// 1. Grilla de vóxeles con la distancia a la piel, la cavidad y los huesos.
// 2. Cada vóxel de carne se asigna a un corte (anatomy.js).
// 3. Cada corte, de cada lado, se convierte en malla con surface nets. La piel,
//    la cavidad y los huesos usan su distancia real (bordes suaves); el límite
//    entre dos cortes sale del indicador del corte suavizado.

import { makeField, BOUNDS, PART } from "./cow.js";
import { sdBone, sdCavity, sdLomo, sdEntrana, makeClassifier } from "./anatomy.js";
import { buildMaps, MAP, atomIndex } from "./map.js";
import { ATOMS } from "./data.js";

export function buildModel({ hump = false, h = 0.01, progress = () => {} } = {}) {
  const t0 = Date.now();
  const field = makeField({ hump });
  const maps = buildMaps({ hump });
  const ids = Object.fromEntries(ATOMS.map((a) => [a.id, atomIndex(a.id)]));
  const bits = Object.fromEntries(ATOMS.filter((a) => a.bit).map((a) => [a.id, a.bit]));
  const classify = makeClassifier({ maps, MAP, ids, bits, hump });

  const B = BOUNDS;
  const nx = Math.ceil((B.x1 - B.x0) / h) + 1;
  const ny = Math.ceil((B.y1 - B.y0) / h) + 1;
  const nz = Math.ceil((B.z1 - B.z0) / h) + 1;
  const N = nx * ny * nz;
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const meat = new Float32Array(N).fill(1); // distancia (con signo) a la superficie de la carne
  const bone = new Float32Array(N).fill(1); // distancia al hueso (dentro de la res)
  const label = new Uint8Array(N);
  const far = 3 * h;

  // ---- 1 y 2: distancias y clasificación ----
  // primero una pasada gruesa para saltear el aire
  for (let k = 0; k < nz; k++) {
    const z = snap(B.z0 + k * h);
    for (let j = 0; j < ny; j++) {
      const y = snap(B.y0 + j * h);
      for (let i = 0; i < nx; i++) {
        const x = snap(B.x0 + i * h);
        const o = idx(i, j, k);
        const skin = field.sdf(x, y, z);
        if (skin > far) { meat[o] = skin; continue; }
        let cav = sdCavity(x, y, z);
        if (cav < far) {
          // el lomo y la entraña son carne aunque estén dentro de la cavidad
          cav = Math.max(cav, -sdLomo(x, y, z), -sdEntrana(x, y, z));
        }
        const bn = sdBone(x, y, z);
        bone[o] = Math.max(bn, skin);
        meat[o] = Math.max(skin, -cav, -bn);
        if (meat[o] < far) {
          const p = field.partAt(x, y, z);
          label[o] = classify(x, y, z, p.part, p.limb, -skin);
        }
      }
    }
    if (k % 8 === 0) progress(0.6 * (k / nz));
  }

  // ---- 3: mallas ----
  const pieces = [];
  const present = new Map(); // id -> bbox
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const o = idx(i, j, k);
    const l = label[o];
    if (!l || meat[o] > far) continue;
    let bb = present.get(l);
    if (!bb) present.set(l, (bb = [i, j, k, i, j, k]));
    if (i < bb[0]) bb[0] = i; if (j < bb[1]) bb[1] = j; if (k < bb[2]) bb[2] = k;
    if (i > bb[3]) bb[3] = i; if (j > bb[4]) bb[4] = j; if (k > bb[5]) bb[5] = k;
  }

  const ctx = { nx, ny, nz, h, B, idx };
  let done = 0;
  const total = present.size * 2 + 2;
  for (const [l, bb] of present) {
    for (const side of [1, -1]) {
      const m = meshPiece(ctx, bb, side, (o) => meat[o], (o) => (label[o] === l ? 1 : 0), true);
      if (m) pieces.push({ atom: ATOMS[l - 1].id, side, ...m });
      progress(0.6 + 0.4 * (++done / total));
    }
  }
  // huesos
  const bones = [];
  const bbAll = [0, 0, 0, nx - 1, ny - 1, nz - 1];
  for (const side of [1, -1]) {
    const m = meshPiece(ctx, bbAll, side, (o) => bone[o], null, false);
    if (m) bones.push({ side, ...m });
    progress(0.6 + 0.4 * (++done / total));
  }
  return { pieces, bones, ms: Date.now() - t0 };
}

// redondeo para que los dos lados de la res den exactamente lo mismo
const snap = (v) => Math.round(v * 1e6) / 1e6;

// Malla de una pieza: max(distancia real, indicador suavizado, medio lado).
function meshPiece(ctx, bb, side, dist, ind, smooth) {
  const { nx, ny, nz, h, B, idx } = ctx;
  const pad = 2;
  const i0 = Math.max(0, bb[0] - pad), j0 = Math.max(0, bb[1] - pad), k0 = Math.max(0, bb[2] - pad);
  const i1 = Math.min(nx - 1, bb[3] + pad), j1 = Math.min(ny - 1, bb[4] + pad), k1 = Math.min(nz - 1, bb[5] + pad);
  // medio lado: z >= 0 (side 1) o z <= 0 (side -1)
  const kMid = Math.round((0 - B.z0) / h);
  let ka = k0, kb = k1;
  if (side > 0) ka = Math.max(k0, kMid - 2); else kb = Math.min(k1, kMid + 2);
  if (kb - ka < 2) return null;
  const sx = i1 - i0 + 1, sy = j1 - j0 + 1, sz = kb - ka + 1;
  const L = (i, j, k) => i + sx * (j + sy * k);

  let F = new Float32Array(sx * sy * sz);
  let any = false;
  if (ind) {
    // indicador suavizado con una caja de 3×3×3
    const raw = new Float32Array(sx * sy * sz);
    for (let k = 0; k < sz; k++) for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++)
      raw[L(i, j, k)] = ind(idx(i + i0, j + j0, k + ka));
    const tmp = new Float32Array(raw.length);
    const blur = (src, dst, di, dj, dk) => {
      for (let k = 0; k < sz; k++) for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
        let s = src[L(i, j, k)], n = 1;
        const a = [i - di, j - dj, k - dk], b = [i + di, j + dj, k + dk];
        if (a[0] >= 0 && a[1] >= 0 && a[2] >= 0) { s += src[L(a[0], a[1], a[2])]; n++; }
        if (b[0] < sx && b[1] < sy && b[2] < sz) { s += src[L(b[0], b[1], b[2])]; n++; }
        dst[L(i, j, k)] = s / n;
      }
    };
    blur(raw, tmp, 1, 0, 0); blur(tmp, raw, 0, 1, 0); blur(raw, tmp, 0, 0, 1);
    for (let k = 0; k < sz; k++) for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
      const o = L(i, j, k);
      const z = B.z0 + (k + ka) * h;
      const f = Math.max(dist(idx(i + i0, j + j0, k + ka)), (0.5 - tmp[o]) * 2 * h, -side * z);
      F[o] = f;
      if (f < 0) any = true;
    }
  } else {
    for (let k = 0; k < sz; k++) for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
      const z = B.z0 + (k + ka) * h;
      const f = Math.max(dist(idx(i + i0, j + j0, k + ka)), -side * z);
      F[L(i, j, k)] = f;
      if (f < 0) any = true;
    }
  }
  if (!any) return null;
  const origin = [B.x0 + i0 * h, B.y0 + j0 * h, B.z0 + ka * h];
  const mesh = surfaceNets(F, sx, sy, sz, origin, h);
  if (!mesh.indices.length) return null;
  if (smooth) {
    // fijos: los vértices de la piel/cavidad/hueso y los del plano del medio
    const fixed = (x, y, z) => {
      const i = Math.round((x - B.x0) / h), j = Math.round((y - B.y0) / h), k = Math.round((z - B.z0) / h);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return true;
      return Math.abs(dist(idx(i, j, k))) < 0.9 * h || Math.abs(z) < 0.6 * h;
    };
    relax(mesh, fixed);
  }
  mesh.normals = vertexNormals(mesh.positions, mesh.indices);
  return mesh;
}

function surfaceNets(F, nx, ny, nz, origin, h) {
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos = [];
  const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const q = corners[c];
      v[c] = F[idx(i + q[0], j + q[1], k + q[2])];
      if (v[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of edges) {
      const a = v[e0], b = v[e1];
      if ((a < 0) === (b < 0)) continue;
      const t = a / (a - b);
      const c0 = corners[e0], c1 = corners[e1];
      sx += c0[0] + (c1[0] - c0[0]) * t;
      sy += c0[1] + (c1[1] - c0[1]) * t;
      sz += c0[2] + (c1[2] - c0[2]) * t;
      n++;
    }
    cellVert[cidx(i, j, k)] = pos.length / 3;
    pos.push(origin[0] + (i + sx / n) * h, origin[1] + (j + sy / n) * h, origin[2] + (k + sz / n) * h);
  }
  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const inside = F[idx(i, j, k)] < 0;
    if (inside !== (F[idx(i + 1, j, k)] < 0))
      quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], !inside);
    if (inside !== (F[idx(i, j + 1, k)] < 0))
      quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], !inside);
    if (inside !== (F[idx(i, j, k + 1)] < 0))
      quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], !inside);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(indices) };
}

// Suaviza (Laplaciano) solo los vértices de los límites entre cortes, no los de
// la piel ni los del plano del medio: esos ya están bien ubicados.
function relax(mesh, fixed) {
  const P = mesh.positions, I = mesh.indices, n = P.length / 3;
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
  }
  const free = new Uint8Array(n);
  for (let v = 0; v < n; v++) free[v] = fixed(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]) ? 0 : 1;
  const Q = new Float32Array(P.length);
  for (let it = 0; it < 3; it++) {
    for (let v = 0; v < n; v++) {
      if (!free[v] || !nb[v].size) { Q[v * 3] = P[v * 3]; Q[v * 3 + 1] = P[v * 3 + 1]; Q[v * 3 + 2] = P[v * 3 + 2]; continue; }
      let x = 0, y = 0, z = 0;
      for (const u of nb[v]) { x += P[u * 3]; y += P[u * 3 + 1]; z += P[u * 3 + 2]; }
      const k = nb[v].size;
      Q[v * 3] = P[v * 3] * 0.5 + (x / k) * 0.5;
      Q[v * 3 + 1] = P[v * 3 + 1] * 0.5 + (y / k) * 0.5;
      Q[v * 3 + 2] = P[v * 3 + 2] * 0.5 + (z / k) * 0.5;
    }
    P.set(Q);
  }
}

function vertexNormals(P, I) {
  const Nn = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { Nn[o] += nx; Nn[o + 1] += ny; Nn[o + 2] += nz; }
  }
  for (let o = 0; o < Nn.length; o += 3) {
    const l = Math.hypot(Nn[o], Nn[o + 1], Nn[o + 2]) || 1;
    Nn[o] /= l; Nn[o + 1] /= l; Nn[o + 2] /= l;
  }
  return Nn;
}
