import QRCode from "qrcode";
import type { GalleryBadge } from "@/lib/nfcChallenge";

const BLOB_HOST = ".public.blob.vercel-storage.com";

function isPrivateLanHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

export function isAllowedShareUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname.endsWith(BLOB_HOST)) {
      return true;
    }
    if (
      parsed.pathname.startsWith("/api/share/file/") &&
      isPrivateLanHost(parsed.hostname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** `page` is set when the upload already has its own guest page (home gallery). */
export async function uploadStripShare(
  imageDataUrl: string,
  visibility: "public" | "private",
  badge: GalleryBadge | null = null
): Promise<{ url: string; page?: string }> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl, visibility, badge }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Share upload failed");
  }
  return (await res.json()) as { url: string; page?: string };
}

/** Booth save page — nicer on mobile than opening the raw image URL. */
export function buildShareViewUrl(origin: string, imageUrl: string): string {
  return `${origin}/view?u=${encodeURIComponent(imageUrl)}`;
}

/** Upload the strip; returns the link the QR code points at. */
export async function shareStrip(
  imageDataUrl: string,
  origin: string,
  visibility: "public" | "private" = "private",
  badge: GalleryBadge | null = null
): Promise<string> {
  const { url, page } = await uploadStripShare(imageDataUrl, visibility, badge);
  return page ?? buildShareViewUrl(origin, url);
}

export function shareQrDataUrl(viewUrl: string): Promise<string> {
  return QRCode.toDataURL(viewUrl, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
    color: { dark: "#101A21", light: "#FFFFFF" },
  });
}

export async function createStripShareQr(
  imageDataUrl: string,
  origin: string,
  visibility: "public" | "private" = "private",
  badge: GalleryBadge | null = null
): Promise<string> {
  return shareQrDataUrl(await shareStrip(imageDataUrl, origin, visibility, badge));
}
