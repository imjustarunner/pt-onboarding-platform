import pool from '../config/database.js';
import {NLU_COMPENSATION_CATEGORIES,NLU_COMPENSATION_POLICY_VERSION,NLU_FOUNDATIONAL_RATES,NLU_BACHELOR_CHILDCARE_RATES,NLU_BACHELOR_TUTORING_VIRTUAL_RATES,NLU_BACHELOR_TUTORING_IN_PERSON_RATES} from '../content/nluCompensationPolicy.js';
export const LEGACY_COMPENSATION_CATEGORIES=Object.freeze({
  1:{label:'Unlicensed',description:'Unlicensed — Bachelors, Interns, QBHA, Peer & Unlicensed Masters'},
  2:{label:'Pre-licensed',description:'Pre-licensed Masters Level'},
  3:{label:'Licensed',description:'Licensed Professionals'}
});
export const categoriesForAgencySlug=slug=>['nlu','nlu-qa-demo','nlu-qa-learning'].includes(String(slug||'').toLowerCase())?NLU_COMPENSATION_CATEGORIES:LEGACY_COMPENSATION_CATEGORIES;
export const isNluChildcareAgency=agency=>agency?.slug==='nlu'
  || (Number(agency?.id)===453&&agency?.slug==='nlu-qa-demo')
  || (Number(agency?.id)===454&&agency?.slug==='nlu-qa-learning');
export const nluServiceCompensationDefaults=()=>({version:NLU_COMPENSATION_POLICY_VERSION,requiresProspectiveIndividualAdoption:true,
  childcare:{category1:NLU_FOUNDATIONAL_RATES,category2AndAbove:NLU_BACHELOR_CHILDCARE_RATES,additionalChildAmounts:[0,4,6,8],sharedCaregiverRatio:'ceil(actualChildren/activeAssignedCaregivers)',maxChildrenPerCaregiver:4,indirectMinutesPerHour:0},
  tutoring:{category1:NLU_FOUNDATIONAL_RATES,category2Virtual:NLU_BACHELOR_TUTORING_VIRTUAL_RATES,category2InPerson:NLU_BACHELOR_TUTORING_IN_PERSON_RATES,indirectMinutesPerHour:10}});
export async function compensationAgencyPolicy(agencyId,db=pool) {
  const [rows]=await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=? LIMIT 1',[Number(agencyId)]);
  const agency={id:Number(agencyId),...(rows?.[0]||{})};
  let flags=agency.feature_flags||{};
  if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{flags={};}}
  const scoped=isNluChildcareAgency(agency),nlu=scoped&&flags.nluCompensationPolicyVersion===NLU_COMPENSATION_POLICY_VERSION;
  return {slug:agency.slug,categories:scoped?NLU_COMPENSATION_CATEGORIES:LEGACY_COMPENSATION_CATEGORIES,nluCompensationPolicyVersion:nlu?NLU_COMPENSATION_POLICY_VERSION:null,nluCompensationEffectiveOn:nlu?flags.nluCompensationEffectiveOn:null,serviceCompensation:scoped?(flags.nluServiceCompensation||nluServiceCompensationDefaults()):null};
}
export async function categoriesForAgency(agencyId,db=pool){return (await compensationAgencyPolicy(agencyId,db)).categories;}
export async function categoryIdsForAgency(agencyId,db=pool){return Object.keys(await categoriesForAgency(agencyId,db)).map(Number);}
