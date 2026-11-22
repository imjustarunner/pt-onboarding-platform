import {requireOverviewAccess} from './clientQuickView.controller.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import {loadEncounterTreatmentPlanEligibility} from '../services/treatmentPlanEncounterEligibility.service.js';
import {listClientDiagnosisAlerts} from '../services/clinicalDiagnosisPolicy.service.js';
import {loadClientFiscalSessions,recordFiscalBaseline} from '../services/clientFiscalSessions.service.js';
async function scope(req){
  const agencyId=Number(req.query.agencyId||req.body?.agencyId),clientId=Number(req.params.id);
  await requireOverviewAccess(req.user,clientId,agencyId);
  await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId,requireClinicalService:true});
  return {agencyId,clientId};
}
export async function clientCareOverview(req,res,next){
  try{const context=await scope(req);
    const results=await Promise.allSettled([loadEncounterTreatmentPlanEligibility({...context,dateOfService:new Date().toISOString().slice(0,10)}),listClientDiagnosisAlerts(context),loadClientFiscalSessions(context)]);
    res.set('Cache-Control','private, no-store').json({
      treatmentPlan:results[0].status==='fulfilled'?results[0].value:null,
      diagnosisAlerts:results[1].status==='fulfilled'?results[1].value:null,
      fiscalSessions:results[2].status==='fulfilled'?results[2].value:null,
      unavailable:results.some(r=>r.status==='rejected')});
  }catch(error){next(error);}
}
export async function saveClientFiscalBaseline(req,res,next){
  try{const context=await scope(req);await recordFiscalBaseline({...context,actorUserId:req.user.id,input:req.body||{}});
    res.set('Cache-Control','private, no-store').json(await loadClientFiscalSessions(context));
  }catch(error){next(error);}
}
