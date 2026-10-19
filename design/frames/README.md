# Frame renders

PNG renders of every print frame, drawn by the app's own print renderer (`lib/print/frames.ts` and `lib/print/layouts.ts`). The photos are synthetic stand-ins, not guests.

- `strip-<frame>.png`: **Two Strips**. Four photos stacked and repeated into two identical 2×6″ strips on a 4×6″ sheet. Shown at 600×900 px; the printed sheet is 1200×1800.
- `grid-<frame>.png`: **Full Frame**. A 2×2 grid of photos on a landscape 6×4″ sheet, rotated to portrait for the printer. Shown at 900×600 px; the printed sheet is 1800×1200.

Frames: `stormy`, `sparky`, `orange`, `clean`, `garden`, `crew`, `hacker` and `onepassword` (the sponsor frame).

To re-render, run `pnpm dev` and open `/dev/print`, which draws every mode and frame with fake photos.
