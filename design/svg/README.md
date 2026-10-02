# StormHacks 2026 — Example SVGs

SVG exports of the same 13 example frames as the PNGs in the `stormhacks-design` bundle, taken from the StormHacks 2026 Brand Guide in Figma on 2026-10-02.

| File | What it shows | Fully vector? |
|---|---|---|
| `logo-primary.svg` | Primary logo `[ StormHacks 26’ ];` | ✅ |
| `logo-dont.svg` | Logo misuse examples | ✅ |
| `dynamic-loops-core.svg` | Core loops `{` `};` `[ ];` | ✅ |
| `dynamic-loops-expanded.svg` | Expanded loops `((( )));` `[[[ ]]];` `{{{ }}};` | ✅ |
| `code-matrices-core.svg` | Core code matrices with `{i++;}` | ✅ |
| `illustration-landing-scene.svg` | Full illustrated otter scene | ✅ (58 MB — every brush stroke is a path) |
| `illustration-otter-brush-steps.svg` | Otter stroke → fill → detail | Mostly; 1 embedded raster |
| `dynamic-loops-post-1.svg` | Post: otter framed by `{ };` | Mostly; grain texture embedded as raster |
| `dynamic-loops-post-2.svg` | Post: otter framed by `[ ];` | Mostly; grain texture embedded as raster |
| `applications-open-post.svg` | "Applications Open Now" post | Mostly; grain texture embedded as raster |
| `code-matrices-post.svg` | Code matrix post | Mostly; grain texture embedded as raster |
| `portraits-speaker-cards.svg` | Portrait treatments (workshop, judge cards) | No — photos embedded as rasters |
| `portraits-full-body-closeup.svg` | Full-body vs close-up portraits | No — photos embedded as rasters |

The logo and graphic-element files are the most useful as SVG. For the portrait posts, the PNGs are lighter and look the same.

## In this repo

Only the small, fully vector files are committed. The large exports are listed in `.gitignore` and live on disk only (re-extract from `stormhacks-design-svg-part{1,2,3}.zip` if missing).

`public/brand/` holds the pieces the photobooth uses, cut from these files with `scripts/brand/`:

| File | Source |
|---|---|
| `logo-primary.svg`, `medallion.svg` | `logo-primary.svg` (fills → `currentColor`, glass filter dropped) |
| `logo-tertiary.svg` | `[ SH 26’ ];` group in `applications-open-post.svg` |
| `loop-*.svg`, `loops-*-x3.svg` | `dynamic-loops-core.svg`, `dynamic-loops-expanded.svg` |
| `otter-sparky.png` | "Otter" in `illustration-otter-brush-steps.svg` (full body, boba) |
| `otter-stormy.png` | "Otter" in `dynamic-loops-post-2.svg` (cut off at the post edge) |
| `otter-pink.png` | Body/Head/Arm groups in `applications-open-post.svg` (cut off at the post edge) |
| `otter-sparky-vr.png` | "MaskOff" + "Mask" groups in `dynamic-loops-post-1.svg` (Sparky in the VR visor) |
| `otter-stormy-walk.png`, `daisy-1…4.png`, `bush-1…3.png` | "Stormy", "FlowerMoving-*" and "Bush-Moving-*" layers of `illustration-landing-scene.svg` |
| `grain.png` | 384 px crop of the embedded GrainFut texture (used at 40 % overlay in the posts) |

Otters are rasterised because their brush strokes use Figma texture filters that are slow on the Pi and unreliable when drawn to canvas.
