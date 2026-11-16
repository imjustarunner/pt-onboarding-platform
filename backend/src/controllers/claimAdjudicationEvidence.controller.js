import multer from 'multer';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import clinicalPool from '../config/clinicalDatabase.js';
import {decryptFamilyBilling} from '../services/familyBillingEncryption.service.js';
import {MAX_ADJUDICATION_FILE_BYTES,uploadClaimAdjudicationEvidence,listClaimAdjudicationEvidence,downloadClaimAdjudicationEvidence} from '../services/claimAdjudicationEvidence.service.js';
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_ADJUDICATION_FILE_BYTES,files:1,fields:4}}).single('file');
async function scope(req){
 const agencyId=Number(req.query.agencyId),claimId=Number(req.params.claimId);
 if(!Number.isSafeInteger(agencyId)||agencyId<1||!Number.isSafeInteger(claimId)||claimId<1)throw Object.assign(new Error('Valid agency and primary claim identifiers are required.'),{status:400});
 await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
 return {agencyId,claimId,actorUserId:req.user.id};
}
export async function listPrimaryProof(req,res,next){try{res.set('Cache-Control','no-store').json({items:await listClaimAdjudicationEvidence(await scope(req))});}catch(error){next(error);}}
export async function getSecondaryManualReview(req,res,next){
 try{
  const {agencyId,claimId}=await scope(req);
  const [[parent]]=await clinicalPool.execute('SELECT id,billing_revision FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0 AND COALESCE(payer_sequence,1)=1',[claimId,agencyId]);
  if(!parent)return res.status(404).json({error:{message:'Primary claim not found.'}});
  const [[child]]=await clinicalPool.execute('SELECT id,cob_payload_encrypted FROM clinical_claims WHERE agency_id=? AND parent_claim_id=? AND is_deleted=0',[agencyId,claimId]);
  const cob=child?.cob_payload_encrypted?decryptFamilyBilling(child.cob_payload_encrypted,`claim-cob:${agencyId}:${child.id}`):null;
  res.set('Cache-Control','no-store').json({secondaryClaimId:child?.id || null,stale:!!cob && cob.parentBillingRevision!==Number(parent.billing_revision || 0),adjudication:cob?{source:cob.source || 'app_primary',externalSystem:cob.externalSystem || '',primaryClaimControlNumber:cob.primaryClaimControlNumber,reference:cob.reference,paymentDate:cob.paymentDate,lines:cob.lines,evidenceIds:(cob.evidence || []).map(file=>file.id),reviewedBy:cob.reviewedBy,reviewedAt:cob.reviewedAt}:null});
 }catch(error){next(error);}
}
export async function uploadPrimaryProof(req,res,next){
 try{const scoped=await scope(req);upload(req,res,async error=>{try{if(error)throw Object.assign(new Error('Upload one proof file no larger than 10 MB.'),{status:400});res.status(201).json({item:await uploadClaimAdjudicationEvidence({...scoped,file:req.file,kind:req.body.kind,source:req.body.source})});}catch(error){next(error);}});}catch(error){next(error);}
}
export async function downloadPrimaryProof(req,res,next){
 try{const file=await downloadClaimAdjudicationEvidence({...await scope(req),evidenceId:req.params.evidenceId});res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Type':file.mimeType,'Content-Disposition':`attachment; filename="primary-proof"; filename*=UTF-8''${encodeURIComponent(file.filename)}`}).send(file.buffer);}catch(error){next(error);}
}
