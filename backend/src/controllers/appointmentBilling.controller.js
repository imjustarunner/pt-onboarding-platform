import {plannedBillingServices} from '../services/plannedBillingServices.service.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { hasSchedulingBillingAccess } from '../services/schedulingBillingAccess.service.js';
import { readClientInsurance } from '../services/clientInsurance.service.js';
import { appointmentProgress } from '../services/appointmentClaimProgress.service.js';
import { claimEventHistory } from '../services/claimMdWorkflow.service.js';
import { prepareClaimReview } from './claimMdWorkflow.controller.js';
import { hasPendingClaimChange } from '../services/claimServiceChanges.service.js';
import { claimDocumentation } from '../services/claimContentReview.service.js';
import { resolveDocumentationPolicy, hasCurrentSupervisorCosign, hasClinicalAmendments, isNonBillableDocument } from '../services/supervisedBillingPolicy.service.js';
import { appointmentFinancials } from '../services/appointmentFinancials.service.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';

export async function getPlannedBillingServices(req,res,next) {
  try {
    const agencyId=Number(req.query.agencyId);
    await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
    res.set('Cache-Control','no-store').json(await plannedBillingServices(agencyId));
  }catch(error){next(error);}
}

export async function getAppointmentBilling(req, res, next) {
  try {
    if (!['super_admin','admin','provider','provider_plus','supervisor','clinical_practice_assistant','staff','support'].includes(String(req.user?.role || '').toLowerCase())) return res.status(403).json({error:{message:'Clinical staff access required'}});
    const agencyId=Number(req.query.agencyId), sessionId=Number(req.params.sessionId);
    if (![agencyId,sessionId].every(id => Number.isSafeInteger(id) && id>0)) return res.status(400).json({error:{message:'Valid agency and session are required'}});
    await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
    const [[session]]=await clinicalPool.execute('SELECT id,client_id,provider_user_id,encounter_status,service_code FROM clinical_sessions WHERE id=? AND agency_id=?',[sessionId,agencyId]);
    if (!session) return res.status(404).json({error:{message:'Session not found'}});
    const access=await resolveClientRecordAccess({userId:req.user.id,role:req.user.role,clientId:session.client_id});
    if (!access.ok) return res.status(access.status).json({error:{message:access.message}});
    const financialAccess=await hasSchedulingBillingAccess(req.user,agencyId);
    const insurance=await readClientInsurance(session.client_id,agencyId);
    const [claims]=await clinicalPool.execute('SELECT * FROM clinical_claims WHERE agency_id=? AND client_id=? AND clinical_session_id=? AND is_deleted=0 ORDER BY payer_sequence,id',[agencyId,session.client_id,sessionId]);
    const [[latestNote]]=await clinicalPool.execute('SELECT id,provider_signed_at FROM clinical_notes WHERE agency_id=? AND client_id=? AND clinical_session_id=? AND is_deleted=0 ORDER BY id DESC LIMIT 1',[agencyId,session.client_id,sessionId]);
    const policy=await resolveDocumentationPolicy(agencyId,session.provider_user_id);
    const progress=[];
    for (const claim of claims.length ? claims : [null]) {
      const noteId=claim?.clinical_note_id || latestNote?.id;
      const documentation=noteId ? await claimDocumentation(agencyId,{clinical_note_id:noteId,clinical_session_id:sessionId}) : null;
      const note=documentation?.note || null;
      const history=claim ? await claimEventHistory(agencyId,claim.id) : [];
      let prepared=null;
      if (claim && ['draft','ready','rejected'].includes(claim.claim_lifecycle)) {
        try { prepared=await prepareClaimReview(agencyId,claim.id); }
        catch (error) { if (![400,403,404,409,422,503].includes(error.status)) throw error; }
      }
      const amended=note && hasClinicalAmendments(note);
      const cosignPending=!!note?.provider_signed_at && (!!policy.supervisorUserId || amended) && !hasCurrentSupervisorCosign(note,policy.supervisorUserId);
      const pendingChange=await hasPendingClaimChange({agency_id:agencyId,clinical_session_id:sessionId});
      const state=appointmentProgress({claim,note,prepared,pendingChange,cosignPending,nonBillable:note ? isNonBillableDocument(note) : false,cosignRequired:amended || !prepared || prepared.supervision?.blockers?.some(b=>/cosign|sign-off/.test(b)) || policy.cosignTiming !== 'after_submission',messages:history.find(e=>e.type==='response')?.messages || []});
      if(!claim && ['no_show','cancelled','canceled','voided','rescheduled'].includes(session.encounter_status)) Object.assign(state,{status:'not_billable',label:'Appointment did not occur — claim blocked',actions:['Use the appointment documentation workflow. This session cannot be submitted as a service claim.']});
      progress.push({ claimId:claim?.id || null,noteId:note?.id || null,payerSequence:Number(claim?.payer_sequence || 1),...state,
        ...(financialAccess && claim ? {financial:{chargeCents:Number(claim.amount_cents),currency:claim.currency_code,reviewBlockers:prepared?.readiness?.blockers || [],history,...await appointmentFinancials(agencyId,session.client_id,claim)}} : {}) });
    }
    const policySummary=policy => policy ? {insurerName:policy.insurerName || '',memberId:policy.memberId || '',planType:policy.planType || ''} : null;
    await logClientAccess(req,session.client_id,'appointment_claim_progress_viewed');
    res.json({financialAccess,sessionId,serviceCode:session.service_code,primaryPolicy:policySummary(insurance?.primary),secondaryPolicy:policySummary(insurance?.secondary),progress});
  } catch(error) { next(error); }
}
