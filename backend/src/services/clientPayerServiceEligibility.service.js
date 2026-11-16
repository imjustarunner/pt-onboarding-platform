import pool from '../config/database.js';
import {readClientInsurance} from './clientInsurance.service.js';
import {readStaffCareEligibility} from './staffCareEligibility.service.js';
import {loadBillingPayerRules,evaluateClientBillingPayerRules} from './billingPayerRules.service.js';
import {coloradoDefaultCodes,filterServiceCodesForCredential,loadCredentialOverrides,grantedServiceCodesForProvider} from './billingRules.service.js';
export function filterCodesForClientPayer({codes,rules,policy,secondaryPolicy=null,credentialTier,dateOfService}){
 if((!policy || !Object.values(policy).some(value=>value && value!==false)) && !secondaryPolicy)return {serviceCodes:codes,program:null,message:'No insurance policy is recorded. Confirm the billing basis before submission.'};
 const allowed=[],failures=[],coordinationCodes=[];
 const insurance={primary:policy || {},secondary:secondaryPolicy};
 for(const item of codes){const code=typeof item==='string'?item:String(item.code || item.service_code || '');const result=evaluateClientBillingPayerRules({rules,insurance,credentialTier,serviceCodes:[code],dateOfService,forSelection:true});if(result.ready){allowed.push(item);if(result.coordinationRequired)coordinationCodes.push(code);}else failures.push(...result.blockers);}
 const result=evaluateClientBillingPayerRules({rules,insurance,credentialTier,serviceCodes:[],dateOfService});
 const message=coordinationCodes.length?'Medicaid secondary: additional service codes are available. Billing must resolve primary requirements and review its ERA/EOB before a secondary claim.':result.blockers[0] || (!allowed.length && failures[0]) || '';
 return {serviceCodes:allowed,program:result.program || null,message,coordinationCodes,revision:rules.revision};
}
export async function clientPayerServiceEligibility({agencyId,clientId,providerUserId,dateOfService,codes=null},deps={}){
 const care=await (deps.care || readStaffCareEligibility)(providerUserId,agencyId);
 if(!care.canProvideCare)return {serviceCodes:[],message:care.reason || 'Provider care access is not enabled.'};
 const [insurance,rules,overrides,grants]=await Promise.all([(deps.insurance || readClientInsurance)(clientId,agencyId),(deps.rules || loadBillingPayerRules)(agencyId),(deps.credentialRules || loadCredentialOverrides)('CO'),(deps.grants || grantedServiceCodesForProvider)(agencyId,providerUserId)]);
 if(!codes){const [catalog]=await (deps.db || pool).execute('SELECT service_code FROM agency_medical_service_codes WHERE agency_id=? AND is_active=1',[agencyId]);codes=catalog.length?catalog.map(row=>row.service_code):coloradoDefaultCodes();}
 const visible=filterServiceCodesForCredential(codes,care.credentialTier,overrides,grants);
 const date=dateOfService || new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
 return filterCodesForClientPayer({codes:visible,rules,policy:insurance?.primary,secondaryPolicy:insurance?.secondary,credentialTier:care.credentialTier,dateOfService:date});
}
