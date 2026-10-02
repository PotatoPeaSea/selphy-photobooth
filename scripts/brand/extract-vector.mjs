// Cut vector pieces out of the Figma exports into tight, single-colour SVGs.
// usage: node vector.mjs <svg> <out.svg> <cssSelector> [cssSelector...]
// Fills are replaced with currentColor and filters dropped, so the result can be
// recoloured from CSS and drawn on canvas.
import { chromium } from "playwright";
import fs from "node:fs";

const [svgPath, outPath, ...selectors] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 4000, height: 4000 } });
await page.setContent('<html><body style="margin:0"></body></html>');
await page.evaluate((txt) => {
  document.body.innerHTML = txt;
  document.querySelector("svg").style.display = "block";
}, fs.readFileSync(svgPath, "utf8"));

const result = await page.evaluate((selectors) => {
  const svg = document.querySelector("svg");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const parts = [];
  for (const sel of selectors) {
    const el = svg.querySelector(sel);
    if (!el) throw new Error("missing " + sel);
    for (let a = el.parentElement; a && a !== svg; a = a.parentElement) {
      if (a.getAttribute("transform")) throw new Error("ancestor transform on " + sel);
    }
    const r = el.getBoundingClientRect();
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    const clone = el.cloneNode(true);
    for (const n of [clone, ...clone.querySelectorAll("*")]) {
      n.removeAttribute("filter");
      n.removeAttribute("id");
      if (n.getAttribute("fill") && n.getAttribute("fill") !== "none") n.setAttribute("fill", "currentColor");
    }
    parts.push(clone.outerHTML);
  }
  const f = (n) => Math.round(n * 100) / 100;
  const vb = [f(x0), f(y0), f(x1 - x0), f(y1 - y0)];
  return {
    vb,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="${vb[2]}" height="${vb[3]}" fill="none">\n${parts.join("\n").replace(/ xmlns="[^"]*"/g, "")}\n</svg>\n`,
  };
}, selectors);

fs.writeFileSync(outPath, result.svg);
console.log(outPath, result.vb.join(" "), result.svg.length + "B");
await browser.close();
