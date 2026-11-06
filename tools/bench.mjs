import { buildModel } from "../src/build.js";
const r = buildModel({ hump: process.argv[2] === "hump" });
let v = 0, t = 0;
for (const p of [...r.pieces, ...r.bones]) { v += p.positions.length / 3; t += p.indices.length / 3; }
console.log("ms", r.ms, "pieces", r.pieces.length, "verts", v, "tris", t);
console.log(r.pieces.map((p) => p.atom + (p.side > 0 ? "+" : "-") + ":" + p.positions.length / 3).join(" "));
