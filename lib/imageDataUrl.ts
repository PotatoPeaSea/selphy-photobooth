export interface DecodedImage {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

/** A `data:image/…;base64,` URL as bytes, or null if it isn't one. */
export function decodeImageDataUrl(dataUrl: unknown): DecodedImage | null {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:(image\/[\w+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;

  const contentType = match[1]!.toLowerCase();
  const buffer = Buffer.from(match[2]!, "base64");
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  return { buffer, contentType, ext };
}
