import pool from '../config/database.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import { listProviderAcceptedInsurancesForDisplay } from './providerAcceptedInsurance.service.js';
import { listClinicalFacetsForUsers } from './providerClinicalFacets.service.js';
import { evaluateExchangeMatch } from '../utils/clientExchangeMatching.js';

export function exchangeCandidateExclusions(user, listing) {
  const checks=[];
  const reject=(field,reason)=>checks.push({field,status:'fail',reason});
  if([false,0,'0'].includes(user.agency_active))reject('agency','Agency membership is inactive.');
  if([false,0,'0'].includes(user.is_active)||[true,1,'1'].includes(user.is_archived)||['ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING'].includes(String(user.status||'').toUpperCase()))reject('account','Provider account is inactive, archived, prospective, or leaving.');
  if(Number(user.id)===Number(listing.currentProviderUserId))reject('assigned','This provider is already assigned to the client.');
  if(listing.targetProviderUserId&&Number(user.id)!==Number(listing.targetProviderUserId))reject('direct_referral','Referral is addressed to a different provider.');
  return checks;
}
export async function loadExchangeCandidates(agencyId) {
  const [users]=await pool.execute(`SELECT DISTINCT u.*,ua.is_active AS agency_active FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    WHERE (u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant') OR u.has_provider_access=1)`,[agencyId]);
  const facets=await listClinicalFacetsForUsers(users.map(u=>u.id),{agencyId});
  return {users,facets};
}
export async function evaluateExchangeCandidate({user,listing,client,facets}) {
  const exclusions=exchangeCandidateExclusions(user,listing);
  if(exclusions.length)return {matched:false,checks:exclusions};
  const profile=await Profile.getForProvider({providerUserId:user.id,agencyId:listing.agencyId});
  const coverage=await listProviderAcceptedInsurancesForDisplay({userId:user.id,agencyId:listing.agencyId,forMatching:true});
  return evaluateExchangeMatch({user,profile:{...profile,
    insurances:coverage.known?coverage.accepted.map(i=>i.name):profile?.insurances||[],
    insuranceEligibilityKnown:coverage.accepted.length>0,insuranceCredential:coverage.credential,excludedInsurances:coverage.excluded
  },facets,listing,client});
}
