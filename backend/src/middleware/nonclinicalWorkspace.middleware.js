import {tutoringWorkspace} from '../services/tutoringWorkspace.service.js';
export const nonclinicalProtectedPath=path=>{
 const value=String(path).split('?')[0];
 if(/^\/api\/(?:clinical-notes|clinical-data|clinical-session-security|clinical-forms|safety-plans|assessment-deliverables|outcome-measures|narriva|medical-billing|note-aid|supervision)(?:\/|$)/.test(value))return true;
 if(/^\/api\/phi-documents\//.test(value)&&!/(?:enrollment-receipts|school-attachments)/.test(value))return true;
 return /^\/api\/clients\/[1-9][0-9]*(?:\/?$|\/(?:intake-note|clinical-responses|notes|daily-notes|insurance-card|agency-intake|paper-packet-documents|paper-packet-processing)(?:\/|$))/.test(value);
};
export async function assertNonclinicalWorkspaceBoundary(req,{context=tutoringWorkspace.context}={}){
 if(!nonclinicalProtectedPath(req.originalUrl||req.path)||!['provider','provider_plus','intern','intern_plus','staff','facilitator','clinical_practice_assistant','supervisor'].includes(req.user?.role))return;
 const agencyId=Number(req.user?.scopedAgencyId||req.query?.agencyId||req.body?.agencyId||req.headers?.['x-agency-id']||req.user?.agencyId||req.user?.agency_id);
 if(!Number.isSafeInteger(agencyId)||agencyId<=0)return; // Source controllers resolve unscoped resource IDs themselves.
 const workspace=await context(req.user,agencyId);
 if(workspace.learningOnly)throw Object.assign(new Error('This account has learning access in this agency. Clinical records and clinical documentation require separate authorization.'),{status:403,code:'NONCLINICAL_WORKSPACE'});
}
