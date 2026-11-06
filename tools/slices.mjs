// Cortes de la res para revisar la clasificación: un plano sagital (z fijo) y
// varios transversales (x fijo), pintados con el color de cada corte.
// Uso: node tools/slices.mjs <dir> [hump]
import { makeField } from "../src/cow.js";
import { sdBone, sdCavity, sdLomo, sdEntrana, makeClassifier } from "../src/anatomy.js";
import { buildMaps, MAP, atomIndex } from "../src/map.js";
import { ATOMS } from "../src/data.js";
import { writeFileSync } from "node:fs";
const out = process.argv[2], hump = process.argv[3] === "hump";
const field = makeField({ hump });
const maps = buildMaps({ hump });
const ids = Object.fromEntries(ATOMS.map((a) => [a.id, atomIndex(a.id)]));
const bits = Object.fromEntries(ATOMS.filter((a) => a.bit).map((a) => [a.id, a.bit]));
const classify = makeClassifier({ maps, MAP, ids, bits, hump });
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function px(x, y, z) {
  const skin = field.sdf(x, y, z);
  if (skin > 0) return [255, 255, 255];
  if (sdBone(x, y, z) < 0) return [250, 245, 225];
  let cav = sdCavity(x, y, z);
  cav = Math.max(cav, -sdLomo(x, y, z), -sdEntrana(x, y, z));
  if (cav < 0) return [40, 40, 40];
  const p = field.partAt(x, y, z);
  const l = classify(x, y, z, p.part, p.limb, -skin);
  return l ? hex(ATOMS[l - 1].color) : [255, 0, 255];
}
function img(name, W, H, f) {
  const b = Buffer.alloc(W * H * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) b.set(f(i, j), (j * W + i) * 3);
  writeFileSync(`${out}/${name}.ppm`, Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), b]));
}
const s = 0.004;
for (const z of [0.02, 0.12, 0.2, 0.26]) img(`sag-${z}`, 605, 380, (i, j) => px(-1 + i * s, 1.5 - j * s, z));
for (const x of [0.75, 0.47, 0.3, 0.1, -0.2, -0.45, -0.6, -0.75]) img(`tr-${x}`, 210, 380, (i, j) => px(x, 1.5 - j * s, -0.42 + i * s));
console.log("ok");
