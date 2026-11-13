import ClinicalEligibilityService from './clinicalEligibility.service.js';
import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import {schedulingResponseForUser} from './schedulingBillingAccess.service.js';

/** Calculation/metadata readers never need to repair or mutate the catalog. */
export async function medicalServiceCatalogRead({user,agencyId,includeInactive=false,readOnly=false},overrides={}) {
  const {
    authorize=(actor,id)=>ClinicalEligibilityService.ensureAgencyAccess({reqUser:actor,agencyId:id}),
    initialize=async(id,options)=>(await import('./medicalBillingDefaults.service.js')).ensureAgencyMedicalBillingDefaults(id,options),
    reconcile=async(id,options)=>(await import('./agencyServiceCodeCatalog.service.js')).reconcileAgencyServiceCodeCatalog(id,options),
    syncError=async cause=>(await import('./agencyServiceCodeCatalog.service.js')).catalogSynchronizationError(cause),
    list=(id,options)=>AgencyMedicalServiceCode.listByAgency(id,options),
    present=schedulingResponseForUser
  }=overrides;
  await authorize(user,agencyId);
  if(readOnly!==true) {
    try {await initialize(agencyId,{actorUserId:user.id});await reconcile(agencyId,{actorUserId:user.id});}
    catch(cause){throw await syncError(cause);}
  }
  const items=await list(agencyId,{includeInactive});
  return present(user,agencyId,{items});
}
