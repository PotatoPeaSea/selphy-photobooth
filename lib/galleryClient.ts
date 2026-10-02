/**
 * Home-server photo gallery on homeserver (see ~/photobooth/README.md there).
 * The booth uploads to the public Funnel URL with an upload-only key that
 * expires after 3 days (`scripts/upload-key.sh create <booth>` on the server).
 * The response's `url` is the photo's public page, /p/<id>, for the QR.
 */

export type Visibility = "public" | "private";

const UPLOAD_TIMEOUT_MS = 15_000;

function galleryConfig(): { base: string; key: string } | null {
  const base = process.env.GALLERY_UPLOAD_URL?.trim().replace(/\/$/, "");
  const key = process.env.GALLERY_API_KEY?.trim();
  return base && key ? { base, key } : null;
}

export function hasGalleryConfig(): boolean {
  return galleryConfig() !== null;
}

/**
 * Upload the guest's copy; "public" also lists it on the gallery's front page,
 * "private" is link-only. Returns the guest-facing page URL.
 */
export async function uploadToGallery(
  buffer: Buffer,
  contentType: string,
  ext: string,
  visibility: Visibility
): Promise<string> {
  const config = galleryConfig();
  if (!config) throw new Error("Gallery not configured");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), `strip.${ext}`);
  form.append("visibility", visibility);
  const res = await fetch(`${config.base}/api/photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}` },
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as
    | { url?: string; error?: { code?: string; message?: string } }
    | null;
  if (!res.ok || !body?.url) {
    throw new Error(`Gallery upload failed (${res.status} ${body?.error?.code ?? "no body"})`);
  }
  return body.url;
}
