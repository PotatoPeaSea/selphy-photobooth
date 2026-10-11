/**
 * Pure camera-recovery helpers. They live apart from the React hooks so they
 * can be tested with plain node.
 */

/** Reconnect delays in ms. The last one repeats for every later attempt. */
const BACKOFF_MS = [500, 1000, 2000, 4000, 5000];

/** Delay before reconnect attempt `attempt`, counted from 0. */
export function backoffDelay(attempt: number): number {
  if (!(attempt > 0)) return BACKOFF_MS[0];
  return BACKOFF_MS[Math.min(Math.floor(attempt), BACKOFF_MS.length - 1)];
}

/** True once `limitMs` has passed since the last frame (`lastFrameAt`, epoch ms). */
export function isFrameStalled(lastFrameAt: number, now: number, limitMs: number): boolean {
  return now - lastFrameAt >= limitMs;
}
