import { hasGalleryConfig, uploadFramesToGallery } from "@/lib/galleryClient";
import { decodeImageDataUrl, type DecodedImage } from "@/lib/imageDataUrl";
import { NextResponse } from "next/server";

/** The booth takes four shots; the gallery takes at most this many too. */
const MAX_FRAMES = 4;
/** The gallery's photo ids: 12 URL-safe characters. */
const PHOTO_ID = /^[A-Za-z0-9_-]{12}$/;

function jpeg(dataUrl: unknown): DecodedImage | null {
  const image = decodeImageDataUrl(dataUrl);
  return image?.contentType === "image/jpeg" ? image : null;
}

/**
 * Second step after POST /api/share: attach the guest's individual shots
 * (`frames`, 1–4 JPEG data URLs) and the single strip (`strip`) to the gallery
 * photo `photoId`, so its page offers them as a zip. Gallery only.
 */
export async function POST(request: Request) {
  let body: { photoId?: unknown; strip?: unknown; frames?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.photoId !== "string" || !PHOTO_ID.test(body.photoId)) {
    return NextResponse.json({ error: "Expected a gallery photoId" }, { status: 400 });
  }
  const strip = jpeg(body.strip);
  if (!strip) {
    return NextResponse.json({ error: "Expected strip as a data:image/jpeg URL" }, { status: 400 });
  }
  if (!Array.isArray(body.frames) || body.frames.length < 1 || body.frames.length > MAX_FRAMES) {
    return NextResponse.json({ error: `Expected 1 to ${MAX_FRAMES} frames` }, { status: 400 });
  }
  const frames = body.frames.map(jpeg);
  if (frames.some((f) => !f)) {
    return NextResponse.json({ error: "Expected frames as data:image/jpeg URLs" }, { status: 400 });
  }

  if (!hasGalleryConfig()) {
    return NextResponse.json({ error: "Gallery not configured" }, { status: 409 });
  }
  try {
    await uploadFramesToGallery(body.photoId, strip, frames as DecodedImage[]);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("Gallery frames upload failed:", err);
    return NextResponse.json({ error: "Frames upload failed" }, { status: 502 });
  }
}
