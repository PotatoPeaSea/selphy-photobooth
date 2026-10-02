import { PHOTO_ASPECT, type PrintMode } from "./layouts";

/**
 * Grab the current video frame, centre-cropped to the mode's photo shape, at
 * the camera's native resolution. Never mirrored: the live preview is
 * mirrored like a mirror, the print shows the scene as the camera sees it.
 */
export function captureFrame(video: HTMLVideoElement, mode: PrintMode): HTMLCanvasElement {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const { sx, sy, sw, sh } = coverCrop(vw, vh, PHOTO_ASPECT[mode]);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  canvas.getContext("2d")!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Largest centred source rect of the given aspect (w/h) inside srcW × srcH. */
export function coverCrop(srcW: number, srcH: number, aspect: number) {
  let sw = srcW;
  let sh = srcW / aspect;
  if (sh > srcH) {
    sh = srcH;
    sw = srcH * aspect;
  }
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}
