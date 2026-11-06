// Vaca procedural: un campo de distancia (SDF) hecho de primitivas suavemente
// unidas, convertido en malla con "surface nets".
// Ejes: x hacia la cabeza, y hacia arriba, z hacia el costado. Unidades ≈ metros
// (novillo de ~1,3 m a la cruz).

export const PART = { BODY: 0, FORE: 1, HIND: 2, HEAD: 3, TAIL: 4, HOOF: 5 };

// ---------- primitivas ----------
function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x1 = x / rx, y1 = y / ry, z1 = z / rz;
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

// cono redondeado entre dos esferas (a, ra) y (b, rb)
function sdRoundCone(px, py, pz, ax, ay, az, ra, bx, by, bz, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  let h = (pax * bax + pay * bay + paz * baz) / l2;
  h = Math.max(0, Math.min(1, h));
  const qx = pax - bax * h, qy = pay - bay * h, qz = paz - baz * h;
  return Math.sqrt(qx * qx + qy * qy + qz * qz) - (ra + (rb - ra) * h);
}

function sdRoundBox(px, py, pz, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy, qz = Math.abs(pz - cz) - hz;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Cada primitiva: [parte, función de distancia, suavizado al unirse]
function buildPrimitives(opts) {
  const P = [];
  const add = (part, k, f) => P.push({ part, k, f });

  // --- tronco ---
  add(PART.BODY, 0.0, (x, y, z) => sdRoundBox(x, y, z, -0.06, 1.0, 0, 0.5, 0.17, 0.13, 0.15));
  add(PART.BODY, 0.14, (x, y, z) => sdEllipsoid(x, y, z, -0.04, 0.87, 0, 0.52, 0.3, 0.34)); // panza
  add(PART.BODY, 0.1, (x, y, z) => sdEllipsoid(x, y, z, -0.6, 1.08, 0, 0.3, 0.22, 0.27)); // grupa
  add(PART.BODY, 0.1, (x, y, z) => sdEllipsoid(x, y, z, 0.4, 0.98, 0, 0.3, 0.32, 0.26)); // tórax delantero
  add(PART.BODY, 0.1, (x, y, z) => sdEllipsoid(x, y, z, 0.6, 0.76, 0, 0.13, 0.15, 0.15)); // pecho (encuentro)
  add(PART.BODY, 0.1, (x, y, z) => sdRoundCone(x, y, z, 0.5, 1.04, 0, 0.21, 0.92, 1.13, 0, 0.13)); // cuello
  add(PART.BODY, 0.08, (x, y, z) => sdEllipsoid(x, y, z, 0.74, 0.86, 0, 0.17, 0.15, 0.07)); // papada
  if (opts.hump) add(PART.BODY, 0.08, (x, y, z) => sdEllipsoid(x, y, z, 0.43, 1.31, 0, 0.13, 0.13, 0.1));

  // --- cabeza ---
  add(PART.HEAD, 0.07, (x, y, z) => sdEllipsoid(x, y, z, 1.0, 1.15, 0, 0.13, 0.13, 0.13));
  add(PART.HEAD, 0.06, (x, y, z) => sdRoundCone(x, y, z, 1.03, 1.12, 0, 0.11, 1.25, 0.93, 0, 0.085));
  add(PART.HEAD, 0.04, (x, y, z) => sdEllipsoid(x, y, z, 1.27, 0.9, 0, 0.08, 0.075, 0.1)); // hocico
  for (const s of [-1, 1]) {
    add(PART.HEAD, 0.03, (x, y, z) => sdEllipsoid(x, y, z, 0.97, 1.21, 0.17 * s, 0.045, 0.022, 0.09)); // orejas
  }

  // --- patas ---
  for (const s of [-1, 1]) {
    const z0 = 0.15 * s;
    // delanteras
    add(PART.FORE, 0.08, (x, y, z) => sdRoundCone(x, y, z, 0.53, 0.9, 0.16 * s, 0.13, 0.42, 0.6, z0, 0.085));
    add(PART.FORE, 0.04, (x, y, z) => sdRoundCone(x, y, z, 0.42, 0.6, z0, 0.075, 0.44, 0.3, z0, 0.048));
    add(PART.FORE, 0.03, (x, y, z) => sdRoundCone(x, y, z, 0.44, 0.3, z0, 0.048, 0.45, 0.06, z0, 0.04));
    add(PART.HOOF, 0.02, (x, y, z) => sdEllipsoid(x, y, z, 0.47, 0.035, z0, 0.06, 0.035, 0.05));
    // traseras
    add(PART.HIND, 0.1, (x, y, z) => sdRoundCone(x, y, z, -0.64, 1.0, 0.16 * s, 0.17, -0.52, 0.58, z0, 0.1));
    add(PART.HIND, 0.08, (x, y, z) => sdEllipsoid(x, y, z, -0.72, 0.86, 0.14 * s, 0.16, 0.27, 0.13)); // nalga/peceto
    add(PART.HIND, 0.05, (x, y, z) => sdRoundCone(x, y, z, -0.54, 0.56, z0, 0.09, -0.67, 0.33, z0, 0.05));
    add(PART.HIND, 0.03, (x, y, z) => sdRoundCone(x, y, z, -0.67, 0.33, z0, 0.05, -0.64, 0.06, z0, 0.04));
    add(PART.HOOF, 0.02, (x, y, z) => sdEllipsoid(x, y, z, -0.62, 0.035, z0, 0.06, 0.035, 0.05));
  }

  // --- cola ---
  add(PART.TAIL, 0.04, (x, y, z) => sdRoundCone(x, y, z, -0.84, 1.24, 0, 0.04, -0.9, 0.55, 0, 0.022));
  add(PART.TAIL, 0.03, (x, y, z) => sdEllipsoid(x, y, z, -0.9, 0.46, 0, 0.045, 0.1, 0.045));
  return P;
}

export const BOUNDS = { x0: -1.0, x1: 1.42, y0: -0.02, y1: 1.5, z0: -0.42, z1: 0.42 };

export function makeField(opts) {
  const prims = buildPrimitives(opts);
  const sdf = (x, y, z) => {
    let d = prims[0].f(x, y, z);
    for (let i = 1; i < prims.length; i++) d = smin(d, prims[i].f(x, y, z), prims[i].k);
    return d;
  };
  // parte dominante (la primitiva más cercana) y cuánto "es pata" el punto:
  // limb ≈ 1 en la pata, 0 en el tronco, suave en la unión.
  const partAt = (x, y, z) => {
    let best = 1e9, part = 0, dBody = 1e9, dLimb = 1e9;
    for (const p of prims) {
      const d = p.f(x, y, z);
      if (d < best) { best = d; part = p.part; }
      if (p.part === PART.BODY) dBody = Math.min(dBody, d);
      else if (p.part === PART.FORE || p.part === PART.HIND) dLimb = Math.min(dLimb, d);
    }
    const limb = Math.max(0, Math.min(1, 0.5 + (dBody - dLimb) / 0.05));
    return { part, limb };
  };
  return { sdf, partAt };
}

// ---------- surface nets ----------
export function meshField(field, h = 0.012) {
  const { sdf, partAt } = field;
  const B = BOUNDS;
  const nx = Math.ceil((B.x1 - B.x0) / h) + 1;
  const ny = Math.ceil((B.y1 - B.y0) / h) + 1;
  const nz = Math.ceil((B.z1 - B.z0) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    const z = B.z0 + k * h;
    for (let j = 0; j < ny; j++) {
      const y = B.y0 + j * h;
      for (let i = 0; i < nx; i++) F[idx(i, j, k)] = sdf(B.x0 + i * h, y, z);
    }
  }

  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const [a, b, d] = corners[c];
      v[c] = F[idx(i + a, j + b, k + d)];
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
    pos.push(B.x0 + (i + sx / n) * h, B.y0 + (j + sy / n) * h, B.z0 + (k + sz / n) * h);
  }

  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const inside = F[idx(i, j, k)] < 0;
    // arista en x
    if (inside !== (F[idx(i + 1, j, k)] < 0))
      quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], !inside);
    // arista en y
    if (inside !== (F[idx(i, j + 1, k)] < 0))
      quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], !inside);
    // arista en z
    if (inside !== (F[idx(i, j, k + 1)] < 0))
      quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], !inside);
  }

  // normales por gradiente y parte por vértice
  const nv = pos.length / 3;
  const normals = new Float32Array(nv * 3);
  const parts = new Float32Array(nv);
  const limbs = new Float32Array(nv);
  const e = h * 0.5;
  for (let q = 0; q < nv; q++) {
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z);
    let gy = sdf(x, y + e, z) - sdf(x, y - e, z);
    let gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    normals[q * 3] = gx / l; normals[q * 3 + 1] = gy / l; normals[q * 3 + 2] = gz / l;
    const c = partAt(x, y, z);
    parts[q] = c.part;
    limbs[q] = c.limb;
  }
  return { positions: new Float32Array(pos), normals, parts, limbs, indices: new Uint32Array(indices) };
}
