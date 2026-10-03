import { hasBlobCredentials, uploadPublicBlob } from "@/lib/blobClient";
import { hasGalleryConfig, uploadToGallery, type Visibility } from "@/lib/galleryClient";
import { decodeImageDataUrl } from "@/lib/imageDataUrl";
import { saveLocalStrip } from "@/lib/localShareStore";
import { NextResponse } from "next/server";

/**
 * Store the guest's copy and return where the QR should point.
 * `page` is a ready-made guest page (home gallery); otherwise `url` is a bare
 * image for the booth's own /view page. Order: home gallery, then Vercel
 * Blob, then this machine's disk, so the guest always gets a QR.
 * `visibility` ("public" lists it on the gallery) and `badge` (the guest's NFC
 * tap, stored with the photo for the admin panel) only apply to the gallery.
 * `photoId` comes back only for gallery uploads; the shots then follow it via
 * /api/share/frames. Blob and disk copies stay strip-only.
 */
export async function POST(request: Request) {
  let body: { image?: string; visibility?: string; badge?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = decodeImageDataUrl(body.image);
  if (!parsed) {
    return NextResponse.json({ error: "Expected data:image URL" }, { status: 400 });
  }
  const { ext } = parsed;

  const origin = new URL(request.url).origin;

  if (hasGalleryConfig()) {
    try {
      const visibility: Visibility = body.visibility === "public" ? "public" : "private";
      // The gallery validates the badge fields; send it on only if it's an object.
      const badge =
        body.badge && typeof body.badge === "object" && !Array.isArray(body.badge) ? body.badge : null;
      const { url: page, id } = await uploadToGallery(parsed.buffer, parsed.contentType, ext, visibility, badge);
      return NextResponse.json({ url: page, page, photoId: id });
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
