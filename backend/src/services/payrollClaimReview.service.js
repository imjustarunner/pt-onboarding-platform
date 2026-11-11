/** Request-local sharing: never cache payroll rates or decisions across requests. */
export function createClaimReviewContext() {
  const pending = new Map();
  return { read(key, load) {
    if (!pending.has(key)) pending.set(key, Promise.resolve().then(load));
    return pending.get(key);
  } };
}
export const claimReviewRead = (context, key, load) => context ? context.read(key, load) : load();
export const claimReviewDay = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
export async function mapClaimReviews(items, run, concurrency = 4) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next++; output[index] = await run(items[index], index); }
  }));
  return output;
}
export function compactTimeClaim(row) {
  if (!row) return row;
  const payload = { ...(row.payload || {}) };
  const hasTranscript = !!(payload.transcriptText || payload.transcriptUrl);
  delete payload.transcriptText;
  const result = { ...row, payload, hasTranscript };
  // Raw JSON duplicates the payload and may retain large transcript text.
  delete result.payload_json;
  if (row.status === 'submitted' && row.event_travel_report_id && !row.event_travel_reviewed_at) result.approvalBlocker = {
    code: 'EVENT_TRAVEL_REVIEW_REQUIRED', type: 'event_travel', reportId: Number(row.event_travel_report_id),
    message: 'Review the event travel report before approving this claim.'
  };
  return result;
}
