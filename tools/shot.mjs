// QA: abre la página en Chromium headless y saca capturas.
// Uso: node tools/shot.mjs <salida-dir> [hash...]
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright-core");
const root = new URL("..", import.meta.url).pathname;
const out = process.argv[2];
const hashes = process.argv.slice(3);
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 800) } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.type(), m.text()); });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.route("http://app.local/**", (route) => {
  let p = new URL(route.request().url()).pathname;
  if (p === "/") p = "/index.html";
  const f = join(root, p);
  if (!existsSync(f)) return route.fulfill({ status: 404, body: "nf" });
  route.fulfill({ status: 200, contentType: types[extname(f)] || "application/octet-stream", body: readFileSync(f) });
});
for (const [i, h] of (hashes.length ? hashes : [""]).entries()) {
  const t0 = Date.now();
  await page.goto("http://app.local/" + (h ? "#" + h : ""));
  if (i > 0) await page.reload();
  await page.waitForFunction(() => document.querySelector("#loading")?.hidden, null, { timeout: 60000 });
  console.log("loaded", h, Date.now() - t0, "ms");
  if (process.env.JS) console.log(await page.evaluate(process.env.JS));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/shot-${i}.png` });
}
await browser.close();
