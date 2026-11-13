import pool from '../config/database.js';
import {logAuditEvent} from './auditEvent.service.js';
const object=value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value||'{}');}catch{return {};}};
const invalid=()=>Object.assign(new Error('Review and save the current paper consents and release in Process paper packet step by step before completing school ROI.'),{status:409});
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;

/** The old checklist cannot acknowledge or extend a managed replacement source. */
export async function acknowledgeReviewedPaperRoi({client,actorUserId=null,roiExpiresAt},db=pool,audit=logAuditEvent){
  const docs=object(client.onboarding_docs_json),state=object(docs.paperProcessing),documentId=Number(docs.paperPacketSource?.documentId||state.documentId||0);
  if(!documentId)return false; // Keep the separate legacy/manual workflow.
  const review=object(state.consentReview),expiry=String(review.roiExpiresAt||'');
  if(review.kind!=='human_source_review'||Number(state.documentId)!==documentId||Number(review.documentId)!==documentId
    ||![review.evaluationId,review.versionId,review.reviewedByUserId].every(positive)||!review.reviewedAt
    ||review.sourceViewed!==true||review.denyReviewed!==true||!state.completedSteps?.includes('consents')
    ||!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!['roi','disclosure'].every(key=>review[key]?.status==='present'&&review[key]?.signerName&&review[key]?.signedDate)
    ||(roiExpiresAt!==undefined&&String(roiExpiresAt||'').slice(0,10)!==expiry))throw invalid();
  const [saved]=await db.execute(`UPDATE clients c
    JOIN client_phi_documents d ON d.id=? AND d.client_id=c.id AND d.agency_id=c.agency_id AND d.school_organization_id=c.organization_id
    JOIN client_paper_packet_vision_evals e ON e.id=? AND e.client_id=c.id AND e.school_organization_id=c.organization_id AND e.phi_document_id=d.id
    SET c.paper_packet_staff_roi_pending=0,c.roi_expires_at=?,c.updated_by_user_id=?,c.updated_at=CURRENT_TIMESTAMP
    WHERE c.id=? AND c.agency_id=? AND c.organization_id=? AND d.removed_at IS NULL AND d.scan_status='clean'
      AND e.id=(SELECT MAX(latest.id) FROM client_paper_packet_vision_evals latest WHERE latest.client_id=c.id)
      AND COALESCE(NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperPacketSource.documentId')) AS UNSIGNED),0),CAST(JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.documentId')) AS UNSIGNED))=?
      AND JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.consentReview.kind'))='human_source_review'
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.consentReview.documentId')) AS UNSIGNED)=?
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.consentReview.evaluationId')) AS UNSIGNED)=?
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.consentReview.versionId')) AS UNSIGNED)=?
      AND JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.consentReview.reviewedAt'))=?
      AND JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.consentReview.roiExpiresAt'))=?
      AND JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.consentReview.sourceViewed')=TRUE
      AND JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.consentReview.denyReviewed')=TRUE
      AND JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.consentReview.roi.status'))='present'
      AND JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.consentReview.disclosure.status'))='present'`,
  [documentId,Number(review.evaluationId),expiry,Number(actorUserId)||null,client.id,client.agency_id,client.organization_id,documentId,documentId,Number(review.evaluationId),Number(review.versionId),review.reviewedAt,expiry]);
  if(Number(saved.affectedRows)!==1)throw invalid();
  await audit(null,{actionType:'paper_roi_review_acknowledged',agencyId:client.agency_id,userId:actorUserId,targetType:'client',targetId:client.id,metadata:{documentId,evaluationId:Number(review.evaluationId),reviewedByUserId:Number(review.reviewedByUserId),roiExpiresAt:expiry}});
  return true;
}
