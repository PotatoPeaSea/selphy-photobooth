# StormHacks 2026 photobooth redesign — plan

Source of truth for the brand: `design/design.md` + `design/examples/` (extracted from `stormhacks-design.zip`).

## Decisions (from the design grilling, 2026-10-02)

| Area | Decision |
|---|---|
| Scope | On-screen UI (scan, booth, review, done, `/view`) **and** the printed 4×6 |
| Freedom | Flows and features may change |
| Hardware | Raspberry Pi, landscape touch, Chromium fullscreen. Targets **1024×600** (generic 7") and **1280×800** (Waveshare 8") |
| Fonts | **Fraunces** (heavy, SOFT axis up) stands in for Exposure; **Inter** for SF Pro. Self-hosted via `next/font` so the Pi works offline |
| Logos / otters | User will supply SVGs into `public/brand/`. Until then: wordmark set as text, otter slots left as placeholders |
| Theme | Light. Neutral Hurricane White `#ECECEF` while the camera is live; saturated colour fields (Stormy Blue / Orange / Sparky Yellow) on scan and done screens. Shady Black `#101A21` type. Old pink/yellow tokens removed |
| Modes | Upload mode **dropped**. Two capture modes, both 4 shots: **Two Strips** (4 × 4:3 landscape photos stacked, duplicated into two identical 2×6" strips) and **Full Frame** (2×2 grid of 2:3 portrait photos filling the sheet, slim branded footer band) |
| Shooting | One tap → 4 automatic shots. 3 s countdown before the first, 2 s between the rest, "2 / 4" indicator |
| Mirroring | Preview mirrored, print un-mirrored, toggle removed |
| Retakes | Only "retake all", on the review screen before printing |
| Printer | Shooting never blocked by printer state. Status shown on review. On print failure: error + QR so the guest still gets the photo |
| Frames | Old five dropped. New: **Stormy** (blue, `[ ]` loops), **Sparky** (yellow, orange `{i++;}` matrices), **Orange** (orange, `{ };` loops), **Clean** (white, primary logo). Footer: tertiary logo bottom-left, "Oct 3 + 4 ★ SFU Burnaby" bottom-right |
| Changes after first test (2026-10-02) | **Full Frame shoots landscape** (camera is landscape): 2×2 grid of 4:3 photos on a landscape 6×4 sheet with a brand column, rotated to portrait only for the printer; the share copy stays upright. **Three more illustrated frames**: Garden (bushes, daisies, Sparky and Stormy from the landing scene), Crew (all three otters behind `[[[ ]]];`), Hacker (Shady Black, code matrices, VR Sparky). Every frame except Clean carries an otter |
| Session end | Done screen auto-returns to scan after ~45 s or on tap. Review screen times out after 60 s of no touch (nothing printed). No guest reprint button |

## Screen flow

```
Scan (blue field) ──tap badge / [ Skip Scan ]──▶ Mode (white) ──▶ Shoot (white) ──4 shots──▶ Review (white) ──[ Print ]──▶ Done (frame colour) ──45 s / tap──▶ Scan
                                                                        ▲                     │
                                                                        └──── Retake All ─────┘
```

- **Scan**: short-headline lock-up ("Snap With" in Inter / "StormHacks" in Fraunces), otter framed by `[ ];` loops, badge status line, `[ Skip Scan ]` secondary button, tagline strip top-left, `[ SH 26' ];` bottom-left, grain overlay. Badge result messages reuse the existing NFC polling logic.
- **Mode**: two large touch cards ("Two Strips" / "Full Frame") with a mini diagram of the print.
- **Shoot**: large live preview cropped to exactly the chosen mode's photo shape; huge Fraunces countdown over it; flash; 4 thumbnail slots; `[ Start ]` primary button.
- **Review**: rendered print preview on the left; frame swatches, printer status chip, `[ Print ]` and "Retake All" on the right.
- **Done**: colour field matching the chosen frame, "Printing…" progress, QR "Grab your digital copy", auto-return countdown.
- **`/view`** (guest phones): white page, wordmark, the strip, download button.

Pi constraints: no backdrop-blur or big shadows; grain is a single static tiled texture; animations limited to transforms/opacity; touch targets ≥ 48 px; all sizing fluid between 1024×600 and 1280×800.

## Phases

Each phase ends with verification and a commit (per global preference).

0. **Design assets in repo.** Extract the zip to `design/`, delete the zip. *Verify*: files present. *Commit*.
1. **Foundations.** Tailwind tokens for the 5 primary colours, Fraunces + Inter via `next/font`, grain texture, brand primitives (`Wordmark`, `BracketCta` `[ Label ]` button, `Loops` SVG framing shapes, `CodeMatrix` dots + `{i++;}`, `Otter` slot that loads `public/brand/otter-*.svg` if present). *Verify*: `tsc`, `next build`, a temporary `/dev/brand` page screenshotted at both resolutions. *Commit*.
2. **Print layouts + frames (pure `lib/`).** Replace `printDimensions`/`stripSurrounds` with `lib/print/layouts.ts` (strip: 4:3 cells, 2 identical columns with a cut gutter; grid: 2×2 2:3 cells + footer band) and `lib/print/frames.ts` (4 frames drawn on canvas; logo SVGs drawn when present, text fallback; waits for `document.fonts` before drawing). Capture crops per mode, un-mirrored. *Verify*: script renders all 8 mode×frame combos to 1200×1800 PNGs; inspect each. *Commit*.
3. **Flow rewrite.** Split `PhotoboothApp.tsx` into a small state machine plus `ScanScreen`, `ModeScreen`, `ShootScreen`, `ReviewScreen`, `DoneScreen`. Remove upload mode, mirror toggle, printer gating; add auto-sequence, retake-all, timeouts. Keep the existing print/share API calls. *Verify*: Playwright + Edge with a fake camera, driving the whole flow at 1024×600 and 1280×800, screenshotting each screen; print path checked with the print server down (error + QR shown). *Commit*.
4. **`/view` restyle.** *Verify*: screenshot at phone width. *Commit*.
5. **Cleanup.** Delete dead code (`otterLoader`, `loadPhoto`, `stripSurrounds`, old CSS), update page title/metadata. *Verify*: `tsc`, `next build`, re-run the Playwright flow. *Commit*.
6. **Asset swap (when SVGs arrive).** Expected files in `public/brand/`: `logo-primary.svg`, `logo-tertiary.svg`, `medallion.svg`, `otter-sparky.svg`, `otter-stormy.svg`, `otter-pink.svg`. *Verify*: screenshots + re-render print PNGs. *Commit*.

Out of scope: deploying to the Pi (CUPS printing works there, unlike on Windows); NFC/database setup.
