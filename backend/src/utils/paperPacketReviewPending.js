/** Current saved paper sources require human release review even after OCR succeeds. */
export function paperPacketReviewPending(client) {
  if (client?.paper_packet_staff_roi_pending === true || Number(client?.paper_packet_staff_roi_pending) === 1) return true;
  let docs=client?.onboarding_docs_json || {};
  if (typeof docs === 'string') { try { docs=JSON.parse(docs); } catch { docs={}; } }
  const savedSource=Number(client?.paper_packet_has_submitted_source) === 1 || !!docs.paperPacketSource?.documentId;
  return savedSource && !docs.paperProcessing?.consentReview?.reviewedAt && !docs.paperProcessing?.processedAt && !client?.staff_onboarding_completed_at;
}
export const paperPacketReviewPendingSql = `(c.paper_packet_staff_roi_pending=1 OR (
  EXISTS (SELECT 1 FROM referral_packet_upload_drafts ppd JOIN client_phi_documents pp ON pp.id=ppd.phi_document_id AND pp.client_id=ppd.created_client_id AND pp.agency_id=ppd.agency_id AND pp.removed_at IS NULL WHERE ppd.created_client_id=c.id AND ppd.agency_id=c.agency_id AND ppd.status='submitted')
  AND JSON_EXTRACT(COALESCE(c.onboarding_docs_json,JSON_OBJECT()),'$.paperProcessing.consentReview.reviewedAt') IS NULL
  AND JSON_EXTRACT(COALESCE(c.onboarding_docs_json,JSON_OBJECT()),'$.paperProcessing.processedAt') IS NULL
  AND c.staff_onboarding_completed_at IS NULL))`;
