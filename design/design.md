# StormHacks 2026 — Design System

Source: Figma file **StormHacks 2026**, page **‼️| Brand Guide** (node `3443:3810`).
Sections on that page: Brand Logos · Graphic Elements · Colour Theory · Typography Overview · Image Treatments · Illustration Guide · Motion Direction (empty in Figma).

> **Brand idea:** code as infinite creative potential. The logo is written like a line of code — `[ StormHacks 26’ ];` — and brackets, loops and `{i++;}` motifs run through every element.

**Event facts used in brand copy:** "StormHacks 26’ is western canada’s biggest hackathon happening on October 3rd + 4th at SFU Burnaby Campus." Tagline strip: *West Canada’s Largest Hackathon ★ Oct 3 + 4 ★ SFU Burnaby*.

---

## 1. Colour

Colours are "vibrant and bold, echoing the idea of infinite creativity and potential."

### Primary palette
Used for **type, backgrounds and graphic elements** across the whole system. These five are Figma variables.

| Token | Name | Hex | Notes |
|---|---|---|---|
| `--color-blue` | Stormy Blue | `#0278FF` | Main brand colour |
| `--color-orange` | Orange Orange | `#FF5D0B` | Accent |
| `--color-yellow` | Sparky Yellow | `#F9B200` | Accent (see note below) |
| `--color-white` | Hurricane White | `#ECECEF` | Light background / text on dark |
| `--color-black` | Shady Black | `#101A21` | Dark background / text on light |

Supporting text tone seen in the type specimen: `#DBDBE2` (paragraph text on Shady Black).

> ⚠️ **Naming mismatch in Figma:** the third swatch is *labelled* "Charger Orange" on the canvas, but its fill is `#F9B200`, which is the variable **Sparky Yellow**. This doc uses the variable name. Worth confirming with the designer.

```css
:root {
  --color-blue:   #0278FF; /* Stormy Blue */
  --color-orange: #FF5D0B; /* Orange Orange */
  --color-yellow: #F9B200; /* Sparky Yellow ("Charger Orange" on canvas) */
  --color-white:  #ECECEF; /* Hurricane White */
  --color-black:  #101A21; /* Shady Black */
  --color-text-muted-on-dark: #DBDBE2;
}
```

### Illustration palette
Looser than the primary palette — the designer notes these are flexible "as long as they live in the same world and feel connected." Use for illustrations only, not UI.

| Group | Swatches |
|---|---|
| **Sparky** | `#F9B200` `#F6D269` `#FC7900` `#4A2D30` `#B64F41` `#EFF5D5` |
| **Stormy** | `#45C0F9` `#79E1F8` `#0278FF` `#4A2D30` `#B64F41` `#EFF5D5` |
| **Greys** | `#3A3A61` `#4B577F` `#6F7E98` `#B1C1CE` `#ECECEF` |
| **Blues** | `#0274F7` `#0283F7` |
| **Naturals** | `#0E7E7C` `#29A288` `#605554` `#987B73` `#D4B398` |
| **Pink Otter** | `#FB6DB8` `#FFAEE8` `#C9168D` `#4A2D30` `#B64F41` `#EFF5D5` |

`#4A2D30`, `#B64F41` and `#EFF5D5` are shared across the character sets (outline / detail / highlight tones). Light swatches get a 1px `#6F7E98` border when shown on light backgrounds.

---

## 2. Typography

Two families: **Exposure** (display, shown as *Exposure Trial*) and **SF Pro** (UI/body). Exposure is a variable font; the numbers below are its *exposure* axis setting.

| Role | Case | Font | Specimen |
|---|---|---|---|
| **Short headlines** | Title Case | Two-level lock-up: **L1** SF Pro Regular + **L2** Exposure (‑50) | "Welcome To / **StormHacks**" |
| **Big blocks** | Sentence case | Exposure (‑40), line-height 1.04 | Event description paragraph |
| **Titles** | Title Case | Exposure (‑40), line-height 1.0 | "Sparky Is Hungry" |
| **Small paragraphs** | Sentence case | SF Pro Medium | Body copy |
| **CTA** | Title Case, wrapped in brackets | Exposure (‑40), line-height 1.0 | `[ Apply Now ]` |
| Labels / spec text | — | SF Pro Display Regular / Bold | Section labels, caps tags (e.g. `JUDGES`, `PRE_HACKS`) |

### Sizes (from the 1920px-wide spec board)
These are relative to a 1920px artboard; scale proportionally for other formats.

| Role | Size |
|---|---|
| Short headline (both lines) | ~134px |
| Big blocks / Titles / CTA | ~58px |
| Small paragraph | 40px |
| Spec labels | 48px |

```css
:root {
  --font-display: "Exposure", "Exposure Trial", sans-serif;
  --font-body: "SF Pro Display", "SF Pro", -apple-system, system-ui, sans-serif;
}
.headline-l1 { font-family: var(--font-body); font-weight: 400; }
.headline-l2,
.title, .cta { font-family: var(--font-display); line-height: 1; }  /* exposure -50 for headline L2, -40 otherwise */
.big-block   { font-family: var(--font-display); line-height: 1.04; }
.paragraph   { font-family: var(--font-body); font-weight: 500; }
```

---

## 3. Logos

### Primary logo — `[ StormHacks 26’ ];`
- Always paired with the **SFU Surge medallion** to the left, tying the club and the event together.
- Brackets + trailing `;` make the wordmark read like a block of code.
- Comes in **default** and **inverted** colour variants; pick based on background contrast.

### Secondary logo — Surge medallion + StormHacks symbol
- For **sponsor / partnership activations** and subtle physical event pieces.
- Keeps the event recognizable at small scale.

### Tertiary logo — `[ SH 26’ ];`
- Only where the primary doesn't fit, e.g. in the corner of social posts.

### Exclusion zone (all logos)
Keep clear space of **0.5× the Surge medallion size** on every side.

### Partnership lock-ups
- Sponsor logo goes **beside or below** the secondary logo.
- Visual weight stays on StormHacks; partner is secondary.
- Separate with a **thin divider line with rounded caps**.

### Do not
- Rotate the logo
- Reverse the order (medallion must stay on the left)
- Use off-brand colours
- Add effects or drop shadows
- Stretch or compress
- Change the relative scale of components

---

## 4. Graphic elements

### Dynamic Loops
Code brackets morphed into 3D ribbon shapes.
- **Core:** `{`, `};`, `[ ];`
- **Expanded:** `((( )));`, `[[[ ]]];`, `{{{ }}};` — free to experiment with structure and form.
- **Rule:** use only as **framing devices around a subject** (an illustration or text), never as standalone decoration.

### Code Matrices
Interlocking dot clusters combined with the `{i++;}` "creation" motif.
- **Core:** larger scale, built from **two contrasting colour segments**.
- **Accent:** smaller variants used as detail, e.g. in the gap between a portrait subject and its background.

### Recurring layout details (from post examples)
- Small `[ SH 26’ ];` tertiary logo anchored bottom-left of posts.
- Event description set as a Big Block, top-left.
- Small icon row top-right.
- A full-bleed **grain texture** overlay ("GrainFut") on post compositions.
- Rounded corners on cards/swatches: 16px at spec scale (~13px on smaller tiles).

---

## 5. Image treatments

Images keep the brand flexible across post types.

**Portraits are built in two layers: subject + background.** The separation between them is filled with:
- **Dynamic Loops** framing the subject, or
- **Accent code matrices**.

| Shot type | Treatment |
|---|---|
| Full-body | Lean on the matrices system, ideally at a smaller scale to add interest |
| Close-up | Dynamic Loops accenting the subject; core matrices only occasionally, in small amounts |

Supporting text on portrait posts uses small caps labels (e.g. `JUDGES` / `SH 26`, `PRE_HACKS`), stacked metadata (room, date, time), and a large first/last name lock-up for speaker cards.

---

## 6. Illustration

The Surge **otters** appear in a new illustrated style (characters include *Sparky*, *Stormy* and *Pink Otter*, matching the illustration palette groups).

- **Line art + solid fills only. No shading.**
- **Curves are rare** — build them from long stretches of straight lines.
- **Brush:** Figma's default **"Epic"** brush.
- Build each object as a stroke first, fill with a solid colour, then add detail with chunks of lighter/darker tones from the same palette group.
- Scenes are layered (background shape → midground → foreground), with motion-ready layers named for animation (e.g. moving bushes and flowers).

---

## 7. Motion

The **Motion Direction** section exists in Figma but has no content yet. Illustration layers are already split for animation, so motion guidance can build on that once it's written.

---

## Open questions for the design team
1. Is the third primary swatch "Charger Orange" or "Sparky Yellow"? Same hex (`#F9B200`), different names.
2. Is the production font Exposure (licensed) or still Exposure Trial?
3. Motion Direction — still to come?

---

## Examples
Visual references for every section above are in [`examples/`](examples/README.md): illustration scene and brush steps, dynamic loop and code matrix posts, portrait treatments, and logo usage.
