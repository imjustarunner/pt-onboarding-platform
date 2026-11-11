import {expect,it} from 'vitest';
import {paperPacketReviewPending,paperPacketReviewPendingSql} from '../paperPacketReviewPending.js';
it('keeps a submitted paper source in human review after a clean OCR clears its legacy flag',()=>{
 expect(paperPacketReviewPending({paper_packet_staff_roi_pending:0,paper_packet_has_submitted_source:1})).toBe(true);
});
it('retains legacy pending cases, excludes digital/no-source clients and completed paper review',()=>{
 expect(paperPacketReviewPending({paper_packet_staff_roi_pending:1})).toBe(true);
 expect(paperPacketReviewPending({})).toBe(false);
 expect(paperPacketReviewPending({paper_packet_has_submitted_source:1,onboarding_docs_json:{paperProcessing:{processedAt:'2026-11-10'}}})).toBe(false);
 expect(paperPacketReviewPending({paper_packet_has_submitted_source:1,onboarding_docs_json:{paperProcessing:{consentReview:{reviewedAt:'2026-11-10'}}}})).toBe(false);
 expect(paperPacketReviewPendingSql).toContain("ppd.status='submitted'");expect(paperPacketReviewPendingSql).toContain('ppd.agency_id=c.agency_id');
});
