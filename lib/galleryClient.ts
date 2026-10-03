/**
 * Home-server photo gallery on homeserver (see ~/photobooth/README.md there).
 * The booth uploads to the public Funnel URL with an upload-only key that
 * expires after 3 days (`scripts/upload-key.sh create <booth>` on the server).
 * The response's `url` is the photo's public page, /p/<id>, for the QR.
 */

export type Visibility = "public" | "private";

const UPLOAD_TIMEOUT_MS = 15_000;
// The shots are bigger and nobody is waiting on them at the booth.
const FRAMES_TIMEOUT_MS = 60_000;

function galleryConfig(): { base: string; key: string } | null {
  const base = process.env.GALLERY_UPLOAD_URL?.trim().replace(/\/$/, "");
  const key = process.env.GALLERY_API_KEY?.trim();
  return base && key ? { base, key } : null;
}

export function hasGalleryConfig(): boolean {
  return galleryConfig() !== null;
}

/** An image to send to the gallery. */
export interface GalleryFile {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

function galleryError(res: Response, body: { error?: { code?: string } } | null, what: string): Error {
  return new Error(`${what} failed (${res.status} ${body?.error?.code ?? "no body"})`);
}

/**
 * Upload the guest's copy; "public" also lists it on the gallery's front page,
 * "private" is link-only. Returns the guest-facing page URL and the photo id.
 */
export async function uploadToGallery(
  buffer: Buffer,
  contentType: string,
  ext: string,
  visibility: Visibility,
  badge: object | null = null
): Promise<{ url: string; id: string }> {
  const config = galleryConfig();
  if (!config) throw new Error("Gallery not configured");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), `strip.${ext}`);
  form.append("visibility", visibility);
  if (badge) form.append("badge", JSON.stringify(badge));
  const res = await fetch(`${config.base}/api/photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}` },
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as
    | { url?: string; id?: string; error?: { code?: string; message?: string } }
    | null;
  if (!res.ok || !body?.url || !body.id) throw galleryError(res, body, "Gallery upload");
  return { url: body.url, id: body.id };
}

/**
 * Attach the guest's individual shots and the single strip to the photo just
 * uploaded, for its zip download. The gallery only takes them from the key that
 * made the photo, within 10 minutes, once.
 */
export async function uploadFramesToGallery(
  photoId: string,
  strip: GalleryFile,
  frames: GalleryFile[]
): Promise<void> {
  const config = galleryConfig();
  if (!config) throw new Error("Gallery not configured");
  const form = new FormData();
  const part = (f: GalleryFile) => new Blob([new Uint8Array(f.buffer)], { type: f.contentType });
  form.append("strip", part(strip), `strip.${strip.ext}`);
  frames.forEach((f, i) => form.append("frames", part(f), `${i + 1}.${f.ext}`));
  const res = await fetch(`${config.base}/api/photos/${encodeURIComponent(photoId)}/frames`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}` },
    body: form,
    signal: AbortSignal.timeout(FRAMES_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    throw galleryError(res, body, "Gallery frames upload");
  }
}
