// Mapa lateral de cortes. Cada corte es un polígono en la vista de costado
// (x hacia la cabeza, y hacia arriba, en metros). Se rasteriza a dos mapas:
// "body" (tronco, cuello) y "limb" (patas). Canal R = corte, canal G = capas.
//
// Puntos de referencia del esqueleto en este modelo (vista lateral):
//   5ª/6ª cervical x=0.72 · 7ª cervical/1ª dorsal x=0.60 · 5ª/6ª dorsal x=0.33
//   13ª dorsal/1ª lumbar (última costilla) x=-0.12 · lumbo-sacra x=-0.52
//   punta de la cadera (-0.50, 1.20) · punta del isquion (-0.86, 1.10)
//   articulación de la cadera (-0.62, 0.98) · rótula (-0.50, 0.58)
//   articulación del hombro (0.56, 0.90) · codo (0.42, 0.60)
//   límite inferior de bifes y aguja (apófisis transversas) y=1.04
//   unión de costillas y cartílagos (límite asado/falda) y≈0.80

import { ATOMS } from "./data.js";

export const MAP = { x0: -1.0, y0: -0.02, w: 2.42, h: 1.52, res: 0.002 };
MAP.W = Math.round(MAP.w / MAP.res);
MAP.H = Math.round(MAP.h / MAP.res);

const BIG = 1.6;

// Orden = orden de pintado: lo de abajo pisa lo de arriba.
const BODY = [
  ["vacio", [[-0.12, 1.04], [-0.47, 1.04], [-0.47, 0.62], [-0.4, 0.3], [-0.2, 0.3], [-0.2, 0.8]]],
  ["falda", [[-0.2, 0.8], [0.66, 0.76], [0.7, 0.62], [0.7, 0.3], [-0.2, 0.3]]],
  ["asado", [[-0.12, 1.04], [0.33, 1.04], [0.6, 1.12], [0.66, 0.76], [-0.2, 0.8]]],
  ["bifeAngosto", [[-0.12, 1.04], [-0.12, BIG], [-0.52, BIG], [-0.52, 1.04]]],
  ["bifeAncho", [[0.33, 1.04], [0.33, BIG], [-0.12, BIG], [-0.12, 1.04]]],
  ["aguja", [[0.33, 1.04], [0.6, 1.12], [0.6, BIG], [0.33, BIG]]],
  ["pecho", [[0.6, BIG], [0.72, BIG], [0.72, 0.8], [0.8, 0.5], [0.7, 0.3], [0.7, 0.62], [0.66, 0.76], [0.6, 1.12]]],
  ["cogote", [[0.72, BIG], [1.05, BIG], [1.05, 0.5], [0.8, 0.5], [0.72, 0.8]]],
  // escápula y brazo, que tapan las primeras costillas
  ["marucha", [[0.3, 1.22], [0.42, 1.25], [0.53, 0.96], [0.46, 0.92], [0.38, 1.0]]],
  ["chingolo", [[0.42, 1.25], [0.52, 1.25], [0.62, 1.02], [0.58, 0.94], [0.53, 0.96]]],
  ["paleta", [[0.58, 0.94], [0.64, 0.84], [0.6, 0.64], [0.46, 0.6], [0.36, 0.74], [0.36, 0.92], [0.46, 0.92], [0.53, 0.96]]],
];

// Muslo: va en los dos mapas (el límite entre tronco y pata es difuso).
const THIGH = [
  ["cuadril", [[-0.52, BIG], [-1.0, BIG], [-1.0, 1.1], [-0.86, 1.1], [-0.6, 0.98], [-0.5, 1.06], [-0.52, 1.1]]],
  ["bolaLomo", [[-0.45, 1.0], [-0.6, 0.98], [-0.6, 0.56], [-0.52, 0.5], [-0.4, 0.55]]],
  ["cuadrada", [[-0.6, 0.98], [-0.86, 1.1], [-0.84, 0.85], [-0.72, 0.58], [-0.6, 0.56]]],
  ["peceto", [[-0.86, 1.1], [-1.0, 1.1], [-1.0, 0.6], [-0.75, 0.5], [-0.72, 0.58], [-0.84, 0.85]]],
  ["colita", [[-0.46, 1.14], [-0.58, 1.08], [-0.6, 0.92], [-0.55, 0.84], [-0.47, 0.88], [-0.44, 1.0]]],
  ["tapaCuadril", [[-0.7, BIG], [-1.0, BIG], [-1.0, 1.12], [-0.86, 1.12], [-0.76, 1.12], [-0.7, 1.2]]],
];

const LIMB = [
  ["garron", [[-0.38, 0.58], [-0.68, 0.56], [-0.82, 0.31], [-0.5, 0.31]]],
  ["tortuguita", [[-0.6, 0.54], [-0.74, 0.56], [-0.8, 0.34], [-0.7, 0.34]]],
  ["pata", [[-0.9, 0.31], [-0.4, 0.31], [-0.4, -0.1], [-0.9, -0.1]]],
  ["paleta", [[0.25, 0.58], [0.25, 1.3], [0.75, 1.3], [0.75, 0.58]]],
  ["brazuelo", [[0.25, 0.3], [0.25, 0.58], [0.7, 0.58], [0.7, 0.3]]],
  ["pata", [[0.25, -0.1], [0.25, 0.3], [0.7, 0.3], [0.7, -0.1]]],
];

const HUMP = [["giba", [[0.28, BIG], [0.58, BIG], [0.58, 1.31], [0.28, 1.31]]]];

// Capas (bits en el canal G)
const LAYERS_BODY = [
  ["matambre", [[-0.48, 0.6], [-0.4, 1.06], [0.3, 1.2], [0.38, 0.62], [0.0, 0.54], [-0.3, 0.54]]],
  ["tapaBife", [[0.33, 1.04], [0.33, 1.32], [-0.12, 1.3], [-0.12, 1.04]]],
  ["tapaAsado", [[0.05, 0.84], [0.05, 1.04], [0.33, 1.04], [0.55, 1.1], [0.6, 0.84]]],
];
const LAYERS_LIMB = [
  ["tapaNalga", [[-0.4, 1.1], [-1.0, 1.1], [-1.0, 0.5], [-0.4, 0.5]]],
];

// Etiquetas: punto (x, y) en la vista lateral donde va el nombre.
export const LABEL_AT = {
  cogote: [0.84, 1.0], pecho: [0.66, 0.68], aguja: [0.45, 1.27], giba: [0.43, 1.4], chingolo: [0.55, 1.08],
  marucha: [0.42, 1.08], paleta: [0.5, 0.75], brazuelo: [0.43, 0.45], bifeAncho: [0.1, 1.2],
  asado: [0.12, 0.92], falda: [0.2, 0.66], bifeAngosto: [-0.32, 1.2], cuadril: [-0.6, 1.2],
  tapaCuadril: [-0.8, 1.22], colita: [-0.52, 0.98], vacio: [-0.33, 0.8], bolaLomo: [-0.57, 0.72],
  cuadrada: [-0.73, 0.86], peceto: [-0.88, 0.85], garron: [-0.58, 0.45], tortuguita: [-0.71, 0.42],
  rabo: [-0.9, 0.75],
};

const index = new Map(ATOMS.map((a, i) => [a.id, i + 1]));
export const atomIndex = (id) => index.get(id);

function fillPoly(buf, channel, pts, value, mode) {
  const { x0, y0, res, W, H } = MAP;
  const P = pts.map(([x, y]) => [(x - x0) / res, (y - y0) / res]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of P) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(H - 1, Math.ceil(maxY));
  for (let j = minY; j <= maxY; j++) {
    const yc = j + 0.5;
    const xs = [];
    for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
      const [xa, ya] = P[a], [xb, yb] = P[b];
      if ((ya > yc) !== (yb > yc)) xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] - 0.5)), i1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = i0; i <= i1; i++) {
        const o = (j * W + i) * 4 + channel;
        buf[o] = mode === "or" ? buf[o] | value : value;
      }
    }
  }
}

export function buildMaps({ hump }) {
  const n = MAP.W * MAP.H * 4;
  const body = new Uint8Array(n), limb = new Uint8Array(n), deep = new Uint8Array(n);
  const SCAP = new Set(["marucha", "chingolo", "paleta"]);
  for (const [id, pts] of [...BODY.filter(([id]) => !SCAP.has(id)), ...THIGH]) fillPoly(deep, 0, pts, atomIndex(id));
  const bitOf = (id) => ATOMS.find((a) => a.id === id).bit;
  for (const [id, pts] of [...BODY, ...THIGH, ...(hump ? HUMP : [])]) fillPoly(body, 0, pts, atomIndex(id));
  for (const [id, pts] of [...THIGH, ...LIMB]) fillPoly(limb, 0, pts, atomIndex(id));
  for (const [id, pts] of LAYERS_BODY) fillPoly(body, 1, pts, bitOf(id), "or");
  for (const [id, pts] of LAYERS_LIMB) fillPoly(limb, 1, pts, bitOf(id), "or");
  for (let o = 3; o < n; o += 4) { body[o] = 255; limb[o] = 255; deep[o] = 255; }
  return { body, limb, deep };
}

// Polígonos para dibujar en las herramientas de calibración.
export const ALL_POLYS = { BODY, THIGH, LIMB, HUMP, LAYERS_BODY, LAYERS_LIMB };
