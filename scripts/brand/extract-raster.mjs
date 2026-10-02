// Rasterise named groups out of the Figma SVG exports into transparent PNGs.
// usage: node extract.mjs <svg> <out.png> <targetHeightPx> <id> [id...]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [svgPath, outPath, targetH, ...ids] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 2000, height: 2000 } });
const url = "file:///" + path.resolve(svgPath).replace(/\\/g, "/");
await page.setContent("<html><body style=\"margin:0;background:transparent\"></body></html>");
const svgText = fs.readFileSync(svgPath, "utf8");
// Inline the SVG so we can poke at its DOM.
await page.evaluate((txt) => {
  document.body.innerHTML = txt;
  const svg = document.querySelector("svg");
  svg.style.visibility = "hidden";
  svg.style.display = "block";
  for (const d of svg.querySelectorAll("clipPath, mask, pattern, defs")) d.style.visibility = "visible";
}, svgText);

const box = await page.evaluate((ids) => {
  const els = ids.map((id) => {
    const [name, nth] = id.split("#");
    const all = [...document.querySelectorAll(`[id="${name}"]`)];
    const el = all[Number(nth ?? 0)];
    if (!el) throw new Error("missing " + id);
    return el;
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of els) {
    el.style.visibility = "visible";
    const r = el.getBoundingClientRect();
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
  }
  return { x0, y0, x1, y1 };
}, ids);

const h = box.y1 - box.y0;
const scale = Number(targetH) / h;
// Re-render at the scale we want so the PNG is crisp.
await page.evaluate((s) => {
  const svg = document.querySelector("svg");
  const w = svg.viewBox.baseVal.width, hh = svg.viewBox.baseVal.height;
  svg.setAttribute("width", String(w * s));
  svg.setAttribute("height", String(hh * s));
}, scale);
await page.setViewportSize({
  width: Math.ceil(box.x1 * scale) + 20,
  height: Math.ceil(box.y1 * scale) + 20,
});
const pad = 2;
const shot = await page.screenshot({
  omitBackground: true,
  clip: {
    x: Math.max(0, box.x0 * scale - pad),
    y: Math.max(0, box.y0 * scale - pad),
    width: (box.x1 - box.x0) * scale + pad * 2,
    height: (box.y1 - box.y0) * scale + pad * 2,
  },
});
// Trim fully transparent margins (content clipped by the post frame).
const trimmed = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, -x0, -y0);
  return { url: o.toDataURL('image/png'), w: o.width, h: o.height };
}, shot.toString('base64'));
fs.writeFileSync(outPath, Buffer.from(trimmed.url.split(',')[1], 'base64'));
console.log(trimmed.w + 'x' + trimmed.h, outPath, JSON.stringify(box), "scale", scale.toFixed(2));
await browser.close();
