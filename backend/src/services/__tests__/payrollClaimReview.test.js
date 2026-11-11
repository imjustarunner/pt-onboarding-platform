import { expect, it, vi } from 'vitest';
import { createClaimReviewContext, claimReviewRead, claimReviewDay, mapClaimReviews, compactTimeClaim } from '../payrollClaimReview.service.js';
it('shares in-flight reads only inside a request and retains date and worker boundaries', async () => {
  const context = createClaimReviewContext(), load = vi.fn(async()=>21);
  await Promise.all(Array.from({length:50},()=>claimReviewRead(context,'rate:7:2026-10-23',load)));
  expect(load).toHaveBeenCalledOnce();
  await claimReviewRead(context,'rate:7:2026-10-24',load); await claimReviewRead(context,'rate:8:2026-10-23',load);
  await claimReviewRead(createClaimReviewContext(),'rate:7:2026-10-23',load); expect(load).toHaveBeenCalledTimes(4);
  expect(claimReviewDay(new Date('2026-10-23T00:00:00Z'))).toBe('2026-10-23');
});
it('bounds concurrent enrichment and retains the original claim order', async () => {
  let active=0, peak=0;
  const output=await mapClaimReviews(Array.from({length:30},(_,i)=>i),async n=>{ active++;peak=Math.max(peak,active); await new Promise(r=>setTimeout(r,n%3)); active--;return n*2; });
  expect(peak).toBe(4);expect(output).toEqual(Array.from({length:30},(_,i)=>i*2));
});
it('omits duplicate transcript text from lists without mutating the detail payload', () => {
  const row={id:1,status:'submitted',event_travel_report_id:7,payload:{transcriptText:'sensitive lengthy transcript',transcriptUrl:'https://example.test',totalMinutes:41},payload_json:'duplicate'};
  const compact=compactTimeClaim(row);
  expect(compact.payload.transcriptText).toBeUndefined();expect(compact.payload_json).toBeUndefined(); expect(compact.hasTranscript).toBe(true);
  expect(row.payload.transcriptText).toBe('sensitive lengthy transcript');expect(compact.approvalBlocker.reportId).toBe(7);
  expect(compactTimeClaim({...row,status:'approved'}).approvalBlocker).toBeUndefined();
  expect(compactTimeClaim({...row,event_travel_reviewed_at:'2026-11-11'}).approvalBlocker).toBeUndefined();
});
