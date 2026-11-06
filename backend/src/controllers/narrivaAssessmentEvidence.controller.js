import {receiveClientDocument} from '../middleware/clientDocumentUpload.middleware.js';
import {authorizeNarrivaAssessmentContext,loadNarrivaAssessmentEvidence,uploadNarrivaAssessment,rescanNarrivaAssessment,viewNarrivaAssessment} from '../services/narrivaAssessmentEvidence.service.js';
import {narrivaError} from '../services/narrivaAccess.service.js';
export function narrivaAssessmentInput(req){
 const query=req.query||{},body=req.body||{};
 for(const field of ['agencyId','clientId','clinicalSessionId','noteId','draftId'])if(query[field]!==undefined&&query[field]!==''&&body[field]!==undefined&&body[field]!==''&&String(query[field])!==String(body[field]))throw narrivaError(409,'The assessment request context changed. Reopen the current note/session.');
 return {...query,...body};
}
const handle=fn=>async(req,res,next)=>{res.set('Cache-Control','no-store');try{res.json(await fn(req));}catch(error){next(error);}};
export const receiveNarrivaAssessmentFile=receiveClientDocument;
export async function preflightNarrivaAssessmentEvidence(req,res,next){try{res.set('Cache-Control','no-store');await authorizeNarrivaAssessmentContext(req.user,narrivaAssessmentInput(req));next();}catch(error){next(error);}}
export const listNarrivaAssessmentEvidence=handle(async req=>{const result=await loadNarrivaAssessmentEvidence(req.user,narrivaAssessmentInput(req));const {verifiedManifest,...publicResult}=result;return publicResult;});
export const uploadNarrivaAssessmentEvidence=handle(async req=>{const result=await uploadNarrivaAssessment(req,narrivaAssessmentInput(req),req.file);const {verifiedManifest,...publicResult}=result;return publicResult;});
export const rescanNarrivaAssessmentEvidence=handle(async req=>{const result=await rescanNarrivaAssessment(req,narrivaAssessmentInput(req),req.params.materialId);const {verifiedManifest,...publicResult}=result;return publicResult;});
export async function viewNarrivaAssessmentEvidence(req,res,next){try{const file=await viewNarrivaAssessment(req,narrivaAssessmentInput(req),{kind:req.params.kind,id:req.params.evidenceId});res.set({'Cache-Control':'no-store','Content-Type':file.type,'Content-Disposition':`inline; filename="${String(file.name||'assessment').replace(/["\r\n]/g,'_')}"`,'X-Content-Type-Options':'nosniff'}).send(file.body);}catch(error){next(error);}}
