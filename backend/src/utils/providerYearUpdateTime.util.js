/** Gap longer than this starts a new inferred session. */
export const PYU_INFER_SESSION_GAP_SEC = 30 * 60;

/** Max seconds credited between two activity timestamps in the same session. */
export const PYU_INFER_GAP_CAP_SEC = 15 * 60;

/** Seconds credited after the last activity in a session. */
export const PYU_INFER_TAIL_SEC = 90;

/** Floor per reviewed section when section timestamps exist. */
export const PYU_INFER_MIN_PER_SECTION_SEC = 120;

/** Max span-based fallback (created → finalized) when no activity timestamps exist. */
export const PYU_INFER_SPAN_CAP_SEC = 3600;

const DEDUPE_MS = 5000;

/**
 * Estimate active seconds from chronological activity timestamps (ms since epoch).
 * Uses capped inter-event gaps plus a per-session tail; never returns NaN.
 */
export function estimateActiveSecondsFromTimestamps(
  timestampsMs,
  { reviewedSectionCount = 0, cycleSpanSec = 0 } = {}
) {
  const sorted = [...timestampsMs]
    .map((t) => Number(t))
    .filter((t) => Number.isFinite(t) && t > 0)
    .sort((a, b) => a - b);

  let gapTotal = 0;
  if (sorted.length) {
    const deduped = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - deduped[deduped.length - 1] > DEDUPE_MS) {
        deduped.push(sorted[i]);
      }
    }

    for (let i = 1; i < deduped.length; i++) {
      const gapSec = Math.floor((deduped[i] - deduped[i - 1]) / 1000);
      if (gapSec > PYU_INFER_SESSION_GAP_SEC) {
        gapTotal += PYU_INFER_TAIL_SEC;
        continue;
      }
      gapTotal += Math.min(gapSec, PYU_INFER_GAP_CAP_SEC);
    }
    gapTotal += PYU_INFER_TAIL_SEC;
  }

  const sectionFloor = Math.max(0, Number(reviewedSectionCount || 0)) * PYU_INFER_MIN_PER_SECTION_SEC;
  const spanFallback =
    sorted.length === 0 && cycleSpanSec > 0
      ? Math.min(Math.floor(cycleSpanSec), PYU_INFER_SPAN_CAP_SEC)
      : 0;

  return Math.max(gapTotal, sectionFloor, spanFallback);
}
