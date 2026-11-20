import pool from '../config/database.js';
import {readClientInsurance} from './clientInsurance.service.js';
import {readStaffCareEligibility} from './staffCareEligibility.service.js';
import {loadBillingPayerRules,evaluateClientBillingPayerRules} from './billingPayerRules.service.js';
import {coloradoDefaultCodes,filterServiceCodesForCredential,loadCredentialOverrides,grantedServiceCodesForProvider} from './billingRules.service.js';
// These Colorado practices group CHP+ with Medicaid when selecting services.
// Claims and coordination of benefits still use the policy recorded on the chart.
const coloradoGroupAgencies = new Set([2, 6, 377]);
const childHealthPlan = /^(?:colorado access[\s–—:-]+)?(?:chp\s*(?:\+|plus)|child health plan (?:plus|\+))(?:\s*\((?:child health plan plus|chp\s*(?:\+|plus))\))?$/i;
function serviceSelectionPolicy(policy, agencyId) {
 if (!policy || !coloradoGroupAgencies.has(Number(agencyId)) || policy.programType) return policy;
 const plan = String(policy.planType || '').trim();
 const name = String(policy.insurerName || '').trim();
 if (/^(?:medicare|commercial|tricare)$/i.test(plan)) return policy;
 const coloradoAccess = String(policy.payerId || '').trim() === '84129' && /^colorado access$/i.test(name);
 if (childHealthPlan.test(plan) || childHealthPlan.test(name) || coloradoAccess) return {...policy, programType:'medicaid'};
 return policy;
}
export function filterCodesForClientPayer({agencyId,codes,rules,policy,secondaryPolicy=null,credentialTier,dateOfService}){
 if((!policy || !Object.values(policy).some(value=>value && value!==false)) && !secondaryPolicy)return {serviceCodes:codes,program:null,message:'No insurance policy is recorded. Confirm the billing basis before submission.'};
 const allowed=[],failures=[],coordinationCodes=[],pendingClassificationCodes=[];
 const insurance={primary:serviceSelectionPolicy(policy,agencyId) || {},secondary:serviceSelectionPolicy(secondaryPolicy,agencyId)};
 for(const item of codes){const code=typeof item==='string'?item:String(item.code || item.service_code || '');const result=evaluateClientBillingPayerRules({rules,insurance,credentialTier,serviceCodes:[code],dateOfService,forSelection:true});if(result.ready){allowed.push(item);if(result.coordinationRequired)coordinationCodes.push(code);}else {failures.push(...result.blockers);if(result.classificationOnly)pendingClassificationCodes.push(code);}}
 const result=evaluateClientBillingPayerRules({rules,insurance,credentialTier,serviceCodes:[],dateOfService});
 const secondaryLabel=insurance.secondary!==secondaryPolicy?'CHP+ or Colorado Access secondary':'Medicaid secondary';
 const message=coordinationCodes.length?secondaryLabel+': additional service codes are available. Billing must resolve primary requirements and review its ERA/EOB before a secondary claim.':result.blockers[0] || (!allowed.length && failures[0]) || '';
 return {serviceCodes:allowed,pendingClassificationCodes,program:result.program || null,message,coordinationCodes,revision:rules.revision};
}
export async function clientPayerServiceEligibility({agencyId,clientId,providerUserId,dateOfService,codes=null},deps={}){
 const care=await (deps.care || readStaffCareEligibility)(providerUserId,agencyId);
 if(!care.canProvideCare)return {serviceCodes:[],message:care.reason || 'Provider care access is not enabled.'};
 const [insurance,rules,overrides,grants]=await Promise.all([(deps.insurance || readClientInsurance)(clientId,agencyId),(deps.rules || loadBillingPayerRules)(agencyId),(deps.credentialRules || loadCredentialOverrides)('CO'),(deps.grants || grantedServiceCodesForProvider)(agencyId,providerUserId)]);
 if(!codes){const [catalog]=await (deps.db || pool).execute('SELECT service_code FROM agency_medical_service_codes WHERE agency_id=? AND is_active=1',[agencyId]);codes=catalog.length?catalog.map(row=>row.service_code):coloradoDefaultCodes();}
 const visible=filterServiceCodesForCredential(codes,care.credentialTier,overrides,grants);
 const date=dateOfService || new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
 return filterCodesForClientPayer({agencyId,codes:visible,rules,policy:insurance?.primary,secondaryPolicy:insurance?.secondary,credentialTier:care.credentialTier,dateOfService:date});
}
