// Arma la res en segundo plano para no trabar la página.
import { buildModel } from "./build.js";

self.onmessage = (e) => {
  let last = 0;
  const r = buildModel({
    hump: e.data.hump,
    progress: (p) => {
      if (p - last > 0.04 || p === 1) { last = p; self.postMessage({ type: "progress", p }); }
    },
  });
  const transfer = [];
  for (const m of [...r.pieces, ...r.bones]) transfer.push(m.positions.buffer, m.normals.buffer, m.indices.buffer);
  self.postMessage({ type: "done", id: e.data.id, pieces: r.pieces, bones: r.bones, ms: r.ms }, transfer);
};
