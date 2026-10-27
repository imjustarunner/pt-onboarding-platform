import Agency from '../models/Agency.model.js';
import { eligibleExchangeProvider, exchangeProviderSql } from '../utils/clientExchangeProvider.js';
import { evaluateCurrentExchangeFit } from './clientExchangeEligibility.service.js';
import pool from '../config/database.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import { listProviderAcceptedInsurancesForDisplay } from './providerAcceptedInsurance.service.js';
import { listClinicalFacetsForUsers } from './providerClinicalFacets.service.js';

export function exchangeCandidateExclusions(user, listing, agency) {
  const checks=[];
  const reject=(field,reason)=>checks.push({field,status:'fail',reason});
  if([false,0,'0'].includes(user.agency_active))reject('agency','Agency membership is inactive.');
  if(!eligibleExchangeProvider(user,agency))reject('account','Provider account is inactive, archived, prospective, or leaving.');
  if(Number(user.id)===Number(listing.currentProviderUserId))reject('assigned','This provider is already assigned to the client.');
  if(listing.targetProviderUserId&&Number(user.id)!==Number(listing.targetProviderUserId))reject('direct_referral','Referral is addressed to a different provider.');
  return checks;
}
export async function loadExchangeCandidates(agencyId) {
  const agency=await Agency.findById(agencyId);
  const [rows]=await pool.execute(`SELECT DISTINCT u.*,ua.is_active AS agency_active FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    WHERE ${exchangeProviderSql}`,[agencyId]);
  const users=rows.filter(user=>eligibleExchangeProvider(user,agency));
  const facets=await listClinicalFacetsForUsers(users.map(u=>u.id),{agencyId});
  return {users,facets};
}
export async function evaluateExchangeCandidate({user,listing,client,facets,agency}) {
  agency ||= await Agency.findById(listing.agencyId);
  const exclusions=exchangeCandidateExclusions(user,listing,agency);
  if(exclusions.length)return {matched:false,checks:exclusions,status:'not_match',canRequest:false,canNotify:false,blockers:exclusions.map(c=>({code:c.field,message:c.reason})),adjustments:[],review:[]};
  const profile=await Profile.getForProvider({providerUserId:user.id,agencyId:listing.agencyId});
  const coverage=await listProviderAcceptedInsurancesForDisplay({userId:user.id,agencyId:listing.agencyId,forMatching:true});
  return evaluateCurrentExchangeFit({context:{user,agency,profile:{...profile,
    insurances:coverage.accepted.flatMap(i=>[i.name,...(i.aliases||[])]),
    insuranceEligibilityKnown:coverage.accepted.length>0,insuranceCredential:coverage.credential,excludedInsurances:coverage.excluded
  },facets},listing,client});
}
