import localFont from "next/font/local";

/**
 * Fraunces stands in for Exposure (the brand display face). The file is an
 * instance with SOFT=100, WONK=0, opsz=36 baked in and only wght (600–900)
 * left variable, so canvas text — which can't set variation axes — matches
 * the UI exactly. Self-hosted so the Pi works offline.
 */
export const fraunces = localFont({
  src: "./fonts/FrauncesSoft.woff2",
  weight: "600 900",
  variable: "--font-display",
  display: "block",
});

/** Inter stands in for SF Pro. */
export const inter = localFont({
  src: "./fonts/Inter.woff2",
  weight: "100 900",
  variable: "--font-body",
  display: "block",
});

/** First family name next/font assigned, for canvas `ctx.font`. */
export function canvasFamily(font: { style: { fontFamily: string } }): string {
  return font.style.fontFamily.split(",")[0]!.trim();
}
