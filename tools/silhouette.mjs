// Vista lateral de la vaca (para calibrar los polígonos de cortes).
// Escribe un PGM: gris según parte, a 4 mm por píxel. Uso: node tools/silhouette.mjs out.pgm [hump]
import { makeField, BOUNDS } from "../src/cow.js";
import { writeFileSync } from "node:fs";
const hump = process.argv[3] === "hump";
const f = makeField({ hump });
const s = 0.004, B = BOUNDS;
const W = Math.round((B.x1 - B.x0) / s), H = Math.round((B.y1 - B.y0) / s);
const img = new Uint8Array(W * H).fill(255);
const shade = [150, 110, 190, 90, 60, 30];
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = B.x0 + i * s, y = B.y1 - j * s;
  // superficie más cercana a la cámara del lado +z
  for (let z = 0.42; z > 0; z -= 0.006) {
    if (f.sdf(x, y, z) < 0) { img[j * W + i] = shade[f.partAt(x, y, z).part]; break; }
  }
}
writeFileSync(process.argv[2], Buffer.concat([Buffer.from(`P5 ${W} ${H} 255\n`), Buffer.from(img)]));
console.log(W, H);
