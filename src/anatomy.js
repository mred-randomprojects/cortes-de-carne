// Anatomía interna de la res: esqueleto, cavidad del tórax y del abdomen,
// lomo (psoas) y entraña (diafragma), y la regla que asigna cada punto de la
// carne a su corte.
//
// Ejes como en cow.js: x hacia la cabeza, y hacia arriba, z hacia el costado.
// Todo es simétrico: se trabaja con a = |z|.

import { sdEllipsoid, sdRoundCone, sdBox, smin, PART } from "./cow.js";

// ---------- esqueleto ----------
// Vértebras: 7 cervicales, 13 dorsales (x de 0.58 a -0.12), 6 lumbares (a -0.52).
const T_X = (i) => 0.58 - (i - 0.5) * 0.0538; // centro de la dorsal i (1..13)
const L_X = (i) => -0.12 - (i - 0.5) * 0.0667; // centro de la lumbar i (1..6)
const RIB_RZ = [0.15, 0.17, 0.19, 0.21, 0.22, 0.23, 0.24, 0.25, 0.26, 0.27, 0.27, 0.28, 0.28];

// costilla i como polilínea (x, y, a)
const RIBS = [];
for (let i = 1; i <= 13; i++) {
  const x0 = T_X(i), rz = RIB_RZ[i - 1];
  const asternal = i > 8;
  const phiMin = asternal ? -0.95 + (i - 9) * 0.1 : -1.3;
  const pts = [];
  const N = 9;
  for (let k = 0; k <= N; k++) {
    const phi = Math.PI / 2 + (phiMin - Math.PI / 2) * (k / N);
    const s = Math.sin(phi), c = Math.cos(phi);
    pts.push([x0 - 0.12 * (1 - s) / 2, 0.87 + 0.235 * s, 0.045 + (rz - 0.045) * c]);
  }
  RIBS.push(pts);
}

function sdRibs(x, y, a) {
  if (x > 0.68 || x < -0.32 || y < 0.58 || y > 1.16 || a > 0.33) return 1;
  let d = 1;
  // solo las costillas cercanas en x
  for (let i = 0; i < 13; i++) {
    const r = RIBS[i];
    if (x > r[0][0] + 0.06 || x < r[r.length - 1][0] - 0.06) continue;
    for (let k = 0; k + 1 < r.length; k++) {
      const p = r[k], q = r[k + 1];
      d = Math.min(d, sdRoundCone(x, y, a, p[0], p[1], p[2], 0.012, q[0], q[1], q[2], 0.012));
    }
  }
  return d;
}

function rotate2(x, y, cx, cy, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const dx = x - cx, dy = y - cy;
  return [dx * c + dy * s, -dx * s + dy * c];
}
const SCAP_ANG = Math.atan2(-0.31, 0.16); // eje de la escápula (de arriba-atrás a abajo-adelante)

export function sdBone(x, y, z) {
  const a = Math.abs(z);
  let d = 1;
  if (x < 1.0 && x > -0.9 && y > 0.95 && y < 1.32 && a < 0.12) {
    // columna: cuerpos vertebrales
    d = Math.min(d, sdRoundCone(x, y, z, 0.93, 1.12, 0, 0.032, 0.6, 1.05, 0, 0.036));
    d = Math.min(d, sdRoundCone(x, y, z, 0.6, 1.08, 0, 0.036, -0.12, 1.13, 0, 0.038));
    d = Math.min(d, sdRoundCone(x, y, z, -0.12, 1.13, 0, 0.038, -0.52, 1.13, 0, 0.04));
    d = Math.min(d, sdRoundCone(x, y, z, -0.52, 1.14, 0, 0.034, -0.84, 1.18, 0, 0.022)); // sacro
    // apófisis espinosas
    for (let i = 1; i <= 13; i++) {
      const top = i === 1 ? 1.24 : i <= 4 ? 1.28 : 1.28 - (i - 4) * 0.0065;
      d = Math.min(d, sdBox(x, y, z, T_X(i) - 0.01, (1.14 + top) / 2, 0, 0.011, (top - 1.14) / 2, 0.006));
    }
    for (let i = 1; i <= 6; i++) {
      const xi = L_X(i);
      d = Math.min(d, sdBox(x, y, z, xi, 1.18, 0, 0.012, 0.045, 0.006));
      // apófisis transversas lumbares
      d = Math.min(d, sdBox(x, y, a, xi, 1.12, 0.07, 0.014, 0.006, 0.05));
    }
  }
  d = Math.min(d, sdRibs(x, y, a));
  // esternón
  d = Math.min(d, sdRoundCone(x, y, z, 0.62, 0.69, 0, 0.025, 0.08, 0.65, 0, 0.022));
  // pelvis
  if (x < -0.4 && x > -0.95 && y > 0.85 && y < 1.25) {
    d = Math.min(d, sdRoundCone(x, y, a, -0.5, 1.17, 0.21, 0.032, -0.64, 0.98, 0.13, 0.03)); // ilion
    d = Math.min(d, sdRoundCone(x, y, a, -0.64, 0.98, 0.13, 0.028, -0.86, 1.08, 0.08, 0.026)); // isquion
    d = Math.min(d, sdRoundCone(x, y, a, -0.64, 0.95, 0.12, 0.018, -0.72, 0.93, 0.02, 0.018)); // pubis
  }
  // pata trasera: fémur, rótula, tibia
  if (x < -0.35 && y < 1.05) {
    d = Math.min(d, sdRoundCone(x, y, a, -0.64, 0.97, 0.15, 0.036, -0.53, 0.6, 0.15, 0.03));
    d = Math.min(d, sdEllipsoid(x, y, a, -0.49, 0.61, 0.15, 0.018, 0.026, 0.02));
    d = Math.min(d, sdRoundCone(x, y, a, -0.53, 0.57, 0.15, 0.026, -0.67, 0.34, 0.15, 0.02));
    d = Math.min(d, sdRoundCone(x, y, a, -0.67, 0.34, 0.15, 0.02, -0.73, 0.4, 0.15, 0.016)); // calcáneo
  }
  // pata delantera: escápula, húmero, radio
  if (x > 0.3 && x < 0.7 && y > 0.28 && y < 1.3) {
    const [u, v] = rotate2(x, y, 0.48, 1.085, SCAP_ANG);
    d = Math.min(d, sdEllipsoid(u, v, a, 0, 0, 0.24, 0.18, 0.075, 0.011));
    d = Math.min(d, sdRoundCone(x, y, a, 0.42, 1.22, 0.252, 0.01, 0.55, 0.96, 0.258, 0.013)); // espina
    d = Math.min(d, sdRoundCone(x, y, a, 0.56, 0.91, 0.24, 0.036, 0.43, 0.62, 0.17, 0.03));
    d = Math.min(d, sdRoundCone(x, y, a, 0.43, 0.6, 0.15, 0.024, 0.44, 0.31, 0.15, 0.02));
    d = Math.min(d, sdEllipsoid(x, y, a, 0.4, 0.64, 0.16, 0.03, 0.035, 0.025)); // olécranon
  }
  return d;
}

// ---------- cavidad (vacía: la res está eviscerada) ----------
export function sdCavity(x, y, z) {
  if (x > 0.65 || x < -0.9 || y < 0.6 || y > 1.15) return 1;
  let d = sdEllipsoid(x, y, z, 0.27, 0.88, 0, 0.31, 0.21, 0.2); // tórax
  d = smin(d, sdEllipsoid(x, y, z, -0.22, 0.86, 0, 0.4, 0.21, 0.26), 0.08); // abdomen
  d = smin(d, sdEllipsoid(x, y, z, -0.64, 0.98, 0, 0.2, 0.075, 0.09), 0.06); // pelvis
  return d;
}

// lomo: psoas debajo de las lumbares, colgando del techo del abdomen
export function sdLomo(x, y, z) {
  const a = Math.abs(z);
  if (x > 0.0 || x < -0.72 || y < 0.9 || y > 1.12) return 1;
  return sdRoundCone(x, y, a, -0.08, 1.05, 0.05, 0.03, -0.62, 1.0, 0.07, 0.05);
}

// entraña: el diafragma, lámina oblicua de la punta del esternón (0.12, 0.66)
// hasta arriba de la 12ª costilla (-0.08, 1.06)
const DIA_A = [0.12, 0.66];
const DIA_N = (() => { const nx = 1.06 - 0.66, ny = 0.2; const l = Math.hypot(nx, ny); return [nx / l, ny / l]; })();
export function sdEntrana(x, y, z) {
  const d = Math.abs((x - DIA_A[0]) * DIA_N[0] + (y - DIA_A[1]) * DIA_N[1]) - 0.011;
  return Math.max(d, sdCavity(x, y, z) + 0.004);
}

// ---------- clasificación ----------
// geometría de los ejes de la pata trasera
const FEM = { hx: -0.64, hy: 0.97, ha: 0.15, kx: -0.53, ky: 0.59, ka: 0.15 };
FEM.ux = FEM.kx - FEM.hx; FEM.uy = FEM.ky - FEM.hy;
FEM.len2 = FEM.ux * FEM.ux + FEM.uy * FEM.uy;
{ const l = Math.sqrt(FEM.len2); FEM.fx = -FEM.uy / l; FEM.fy = FEM.ux / l; } // perpendicular hacia adelante
if (FEM.fx < 0) { FEM.fx = -FEM.fx; FEM.fy = -FEM.fy; }
const TIB = { ax: -0.53, ay: 0.57, bx: -0.67, by: 0.34 };
{
  const ux = TIB.bx - TIB.ax, uy = TIB.by - TIB.ay, l = Math.hypot(ux, uy);
  TIB.ux = ux / l; TIB.uy = uy / l; TIB.len = l;
  TIB.cx = TIB.uy; TIB.cy = -TIB.ux; // perpendicular
  if (TIB.cx > 0) { TIB.cx = -TIB.cx; TIB.cy = -TIB.cy; } // hacia atrás
}

// Sector alrededor del fémur (SENASA: «alrededor del fémur se agrupan: por
// delante la bola de lomo, por fuera la carnaza de cola [cuadrada], por detrás
// el peceto, y por detrás y por dentro la nalga»).
function thighSector(x, y, a) {
  let t = ((x - FEM.hx) * FEM.ux + (y - FEM.hy) * FEM.uy) / FEM.len2;
  t = Math.max(0, Math.min(1, t));
  const px = FEM.hx + FEM.ux * t, py = FEM.hy + FEM.uy * t, pa = FEM.ha;
  const fwd = (x - px) * FEM.fx + (y - py) * FEM.fy;
  const lat = a - pa;
  return (Math.atan2(lat, fwd) * 180) / Math.PI; // 0 adelante, 90 afuera, ±180 atrás, -90 adentro
}

export function makeClassifier({ maps, MAP, ids, bits, hump }) {
  const at = (buf, x, y, ch) => {
    const i = Math.max(0, Math.min(MAP.W - 1, Math.floor((x - MAP.x0) / MAP.res)));
    const j = Math.max(0, Math.min(MAP.H - 1, Math.floor((y - MAP.y0) / MAP.res)));
    return buf[(j * MAP.W + i) * 4 + ch];
  };
  const I = ids;
  const SCAPULAR = new Set([I.chingolo, I.marucha, I.paleta]);
  const THIGH = new Set([I.bolaLomo, I.cuadrada, I.peceto, I.colita]);
  const WALL = new Set([I.asado, I.vacio, I.falda]);

  // p: punto; part: parte dominante; limb: peso de pata; depth: distancia a la piel
  return function classify(x, y, z, part, limb, depth) {
    const a = Math.abs(z);
    if (sdLomo(x, y, z) < 0) return I.lomo;
    if (sdEntrana(x, y, z) < 0) return I.entrana;
    if (part === PART.HEAD) return I.cabeza;
    if (part === PART.TAIL) return I.rabo;
    if (part === PART.HOOF) return I.pezuna;
    const isLimb = limb > 0.5;

    // pata delantera
    if (isLimb && x > 0.2) {
      if (y < 0.3) return I.pata;
      if (y < 0.58) return I.brazuelo;
      return I.paleta;
    }

    const base = at(maps.body, x, y, 0);
    const layer = at(maps.body, x, y, 1);

    // cuadril y tapa de cuadril
    if (base === I.cuadril || base === I.tapaCuadril) {
      return base === I.tapaCuadril && depth < 0.045 ? I.tapaCuadril : I.cuadril;
    }

    // pata trasera: pierna (garrón) y muslo
    if (isLimb && x < -0.35 && y < 0.57) {
      if (y < 0.31) return I.pata;
      let t = (x - TIB.ax) * TIB.ux + (y - TIB.ay) * TIB.uy;
      t = Math.max(0, Math.min(TIB.len, t));
      const back = (x - (TIB.ax + TIB.ux * t)) * TIB.cx + (y - (TIB.ay + TIB.uy * t)) * TIB.cy;
      return back > 0.012 ? I.tortuguita : I.garron;
    }
    if ((isLimb && x < -0.35) || THIGH.has(base)) {
      if (base === I.colita && depth < 0.06) return I.colita;
      // delante de la cadera, lo que no es pata es la pared del flanco
      if (!isLimb && x > -0.6) return a > 0.24 && base === I.colita ? I.colita : I.vacio;
      const th = thighSector(x, y, a);
      if (th > -55 && th <= 55) return I.bolaLomo;
      if (th > 55 && th <= 145) return I.cuadrada;
      if (th > 145 || th <= -165) return I.peceto;
      return depth < 0.025 && th > -150 && th < -60 ? I.tapaNalga : I.nalga;
    }

    // tronco
    let label = base;
    if (SCAPULAR.has(base)) {
      // los músculos de la paleta van por fuera de la escápula y las costillas
      const lim = base === I.paleta ? 0.21 : 0.23;
      if (a < lim) label = at(maps.deep, x, y, 0);
    }
    if (WALL.has(label) && layer & bits.matambre && depth < 0.02) return I.matambre;
    if (label === I.asado && layer & bits.tapaAsado && depth < 0.055) return I.tapaAsado;
    if (label === I.bifeAncho && layer & bits.tapaBife && depth < 0.035 && y > 1.12 && a > 0.08) return I.tapaBife;
    if (label === I.giba && !hump) label = I.aguja;
    return label || 0;
  };
}
