import { hasBlobCredentials, uploadPublicBlob } from "@/lib/blobClient";
import { hasGalleryConfig, uploadToGallery, type Visibility } from "@/lib/galleryClient";
import { saveLocalStrip } from "@/lib/localShareStore";
import { NextResponse } from "next/server";

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:(image\/[\w+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;

  const contentType = match[1]!.toLowerCase();
  const buffer = Buffer.from(match[2]!, "base64");
  return { buffer, contentType };
}

/**
 * Store the guest's copy and return where the QR should point.
 * `page` is a ready-made guest page (home gallery); otherwise `url` is a bare
 * image for the booth's own /view page. Order: home gallery, then Vercel
 * Blob, then this machine's disk, so the guest always gets a QR.
 * `visibility` ("public" lists it on the gallery) and `badge` (the guest's NFC
 * tap, stored with the photo for the admin panel) only apply to the gallery.
 */
export async function POST(request: Request) {
  let body: { image?: string; visibility?: string; badge?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = typeof body.image === "string" ? dataUrlToBuffer(body.image) : null;
  if (!parsed) {
    return NextResponse.json({ error: "Expected data:image URL" }, { status: 400 });
  }

  const ext =
    parsed.contentType.includes("png")
      ? "png"
      : parsed.contentType.includes("webp")
        ? "webp"
        : "jpg";

  const origin = new URL(request.url).origin;

  if (hasGalleryConfig()) {
    try {
      const visibility: Visibility = body.visibility === "public" ? "public" : "private";
      // The gallery validates the badge fields; send it on only if it's an object.
      const badge =
        body.badge && typeof body.badge === "object" && !Array.isArray(body.badge) ? body.badge : null;
      const page = await uploadToGallery(parsed.buffer, parsed.contentType, ext, visibility, badge);
      return NextResponse.json({ url: page, page });
    } catch (err) {
      console.error("Gallery upload failed, falling back:", err);
    }
  }

  if (hasBlobCredentials()) {
    const pathname = `strips/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    try {
      const blob = await uploadPublicBlob(pathname, parsed.buffer, {
        contentType: parsed.contentType,
      });
      return NextResponse.json({ url: blob.url });
    } catch (err) {
      console.error("Blob upload failed:", err);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  }

  try {
    const name = await saveLocalStrip(parsed.buffer, ext);
    const url = `${origin}/api/share/file/${name}`;
    return NextResponse.json({ url, local: true });
  } catch (err) {
    console.error("Local share save failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
