import pool from '../config/database.js';
import { executedEmploymentAgreements } from './employmentAgreementPolicy.service.js';
import { nluCompensationService } from '../content/nluCompensationPolicy.js';
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
async function signedServiceScope({ agencyId, providerUserId, dateOfService }) {
  const agreements = await executedEmploymentAgreements({ agencyId, userId: providerUserId });
  const agreement = agreements
    .filter(row => row.effectiveOn <= dateOfService && Array.isArray(row.data.CONTRACT_ASSIGNED_SERVICE_TRACKS))
    .sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn) || b.id - a.id)[0];
  return agreement?.data || null;
}

function matchesSignedServiceScope(item, scope) {
  if (!scope) return true;
  const code = String(typeof item === 'string' ? item : item.code || item.service_code || '').trim().toUpperCase();
  const tracks = scope.CONTRACT_ASSIGNED_SERVICE_TRACKS;
  const roles = scope.schedule?.serviceRoles ?? scope.CONTRACT_SERVICE_ROLES ?? [];
  const kind = nluCompensationService(code);
  const clinical = tracks.includes('clinical');
  const tutoring = tracks.includes('learning') && roles.includes('tutoring');
  if (kind === 'tutoring' || kind === 'homework_help') return tutoring;
  if (kind === 'childcare') return tracks.includes('learning') && roles.includes('childcare');
  if (code === 'H2014' && Array.isArray(scope.CONTRACT_SERVICE_TRACKS) && scope.AGENCY_SLUG !== 'itsco') return clinical && tutoring;
  return clinical;
}

export async function assignedServiceScopeBlockers({ agencyId, providerUserId, dateOfService, codes }) {
  if (!Number.isSafeInteger(providerUserId) || providerUserId <= 0) return [];
  const day = dateOfService instanceof Date ? dateOfService.toISOString().slice(0, 10) : String(dateOfService || '').slice(0, 10);
  if (!day) return [];
  const scope = await signedServiceScope({ agencyId, providerUserId, dateOfService: day });
  const excluded = [...new Set(codes.filter(code => !matchesSignedServiceScope(code, scope)))];
  return excluded.length ? [`Service codes outside the provider’s documented service assignment: ${excluded.join(', ')}. Review this assignment before submitting the claim.`] : [];
}

export async function clientPayerServiceEligibility({agencyId,clientId,providerUserId,dateOfService,codes=null},deps={}){
 const care=await (deps.care || readStaffCareEligibility)(providerUserId,agencyId);
 if(!care.canProvideCare)return {serviceCodes:[],message:care.reason || 'Provider care access is not enabled.'};
 const date=dateOfService || new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
 const [insurance,rules,overrides,grants,scope]=await Promise.all([(deps.insurance || readClientInsurance)(clientId,agencyId),(deps.rules || loadBillingPayerRules)(agencyId),(deps.credentialRules || loadCredentialOverrides)('CO'),(deps.grants || grantedServiceCodesForProvider)(agencyId,providerUserId),(deps.serviceScope || signedServiceScope)({agencyId,providerUserId,dateOfService:date})]);
 if(!codes){const [catalog]=await (deps.db || pool).execute('SELECT service_code FROM agency_medical_service_codes WHERE agency_id=? AND is_active=1',[agencyId]);codes=catalog.length?catalog.map(row=>row.service_code):coloradoDefaultCodes();}
 const visible=filterServiceCodesForCredential(codes,care.credentialTier,overrides,grants).filter(item=>matchesSignedServiceScope(item,scope));
 return filterCodesForClientPayer({agencyId,codes:visible,rules,policy:insurance?.primary,secondaryPolicy:insurance?.secondary,credentialTier:care.credentialTier,dateOfService:date});
}
