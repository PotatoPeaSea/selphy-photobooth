"use client";

import { useEffect, useState } from "react";
import { FRAMES, printToDataUrl, renderPrint } from "@/lib/print/frames";
import { PHOTO_ASPECT, SHOT_COUNT, type PrintMode } from "@/lib/print/layouts";

const MODES: PrintMode[] = ["strip", "grid"];
const TONES = ["#7A8BA6", "#A88F7A", "#6F9C8A", "#9B7AA8"];

/** Fake camera frame: tinted backdrop, a head-and-shoulders blob, and an "R" to catch mirroring. */
function fakePhoto(mode: PrintMode, i: number): HTMLCanvasElement {
  const h = 1080;
  const w = Math.round(h * PHOTO_ASPECT[mode]);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, TONES[i]!);
  g.addColorStop(1, "#2A3340");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#E8C4A8";
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.42, h * 0.16, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#33415C";
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 1.02, h * 0.38, h * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 120px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(`R${i + 1}`, 40, 40);
  return c;
}

/** Temporary print-render sheet (removed in cleanup). */
export default function PrintSheet() {
  const [renders, setRenders] = useState<{ id: string; url: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: { id: string; url: string }[] = [];
      for (const mode of MODES) {
        const photos = Array.from({ length: SHOT_COUNT }, (_, i) => fakePhoto(mode, i));
        for (const f of FRAMES) {
          const canvas = await renderPrint({ mode, frame: f.id, photos });
          out.push({ id: `${mode}-${f.id}`, url: printToDataUrl(canvas) });
        }
      }
      if (!cancelled) setRenders(out);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex flex-wrap gap-4 bg-neutral-300 p-4" data-ready={renders.length > 0}>
      {renders.map((r) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={r.id} data-id={r.id} src={r.url} alt={r.id} className="h-[600px]" />
      ))}
    </main>
  );
}
