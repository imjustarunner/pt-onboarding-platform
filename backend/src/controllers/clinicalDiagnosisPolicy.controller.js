import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import pool from '../config/database.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { loadClientDiagnosesWithReviews, listClientDiagnosisAlerts, saveDiagnosisReview, readSupervisorDiagnosisPermission, saveSupervisorDiagnosisPermission } from '../services/clinicalDiagnosisPolicy.service.js';
const id=value=>Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value):null;
async function scope(req) {
  const agencyId=id(req.body?.agencyId || req.query.agencyId),clientId=id(req.body?.clientId || req.query.clientId || req.params.clientId);
  if(!agencyId)throw Object.assign(new Error('agencyId is required.'),{status:400});
  await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
  if(clientId){const [[client]]=await pool.execute('SELECT id FROM clients WHERE id=? AND agency_id=? LIMIT 1',[clientId,agencyId]);if(!client){const [[assignment]]=await pool.execute('SELECT client_id FROM client_agency_assignments WHERE client_id=? AND agency_id=? AND is_active=1 LIMIT 1',[clientId,agencyId]);if(!assignment)throw Object.assign(new Error('Client not found in this agency.'),{status:404});}}
  if(clientId){const access=await resolveClientRecordAccess({userId:req.user.id,role:req.user.role,clientId});if(!access.ok)throw Object.assign(new Error('Client record access is required.'),{status:403});}
  return {agencyId,clientId,actorUserId:req.user.id};
}
export async function getDiagnosisReview(req,res,next) {
  try {const context=await scope(req);if(!context.clientId)throw Object.assign(new Error('clientId is required.'),{status:400});
    const diagnoses=await loadClientDiagnosesWithReviews(context),alerts=await listClientDiagnosisAlerts(context);
    const [documents]=await pool.execute('SELECT id,original_name,mime_type,uploaded_at FROM client_phi_documents WHERE agency_id=? AND client_id=? ORDER BY id DESC LIMIT 100',[context.agencyId,context.clientId]);
    res.json({diagnoses,alerts,documents});
  } catch(error){next(error);}
}
export async function postDiagnosisReview(req,res,next) {
  try {const context=await scope(req),diagnosisId=id(req.params.diagnosisId);if(!context.clientId||!diagnosisId)throw Object.assign(new Error('Client and diagnosis are required.'),{status:400});
    const review=await saveDiagnosisReview({...context,diagnosisId,input:req.body});res.status(201).json({review,alerts:await listClientDiagnosisAlerts(context)});
  }catch(error){next(error);}
}
export async function getSupervisorDiagnosisPolicy(req,res,next) {
  try {const context=await scope(req),providerUserId=id(req.params.providerUserId);if(!providerUserId)throw Object.assign(new Error('Provider is required.'),{status:400});const history=await readSupervisorDiagnosisPermission({...context,providerUserId});res.json({history,current:history.find(entry=>Number(entry.supervisor_user_id)===Number(req.user.id)) || null});}catch(error){next(error);}
}
export async function putSupervisorDiagnosisPolicy(req,res,next) {
  try {const context=await scope(req),providerUserId=id(req.params.providerUserId);if(!providerUserId)throw Object.assign(new Error('Provider is required.'),{status:400});res.json(await saveSupervisorDiagnosisPermission({...context,providerUserId,input:req.body}));}catch(error){next(error);}
}
