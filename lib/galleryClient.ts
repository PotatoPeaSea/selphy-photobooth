/**
 * Home-server photo gallery on homeserver (see ~/photobooth/README.md there).
 * The booth uploads over the tailnet; the response's `url` is the public
 * Funnel page (https://gallery.example.ts.net:8443/p/<id>) for the QR.
 */

const UPLOAD_TIMEOUT_MS = 15_000;

function galleryConfig(): { base: string; key: string } | null {
  const base = process.env.GALLERY_UPLOAD_URL?.trim().replace(/\/$/, "");
  const key = process.env.GALLERY_API_KEY?.trim();
  return base && key ? { base, key } : null;
}

export function hasGalleryConfig(): boolean {
  return galleryConfig() !== null;
}

/** Upload as an unlisted ("private") photo; returns the guest-facing page URL. */
export async function uploadToGallery(buffer: Buffer, contentType: string, ext: string): Promise<string> {
  const config = galleryConfig();
  if (!config) throw new Error("Gallery not configured");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), `strip.${ext}`);
  form.append("visibility", "private");
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
