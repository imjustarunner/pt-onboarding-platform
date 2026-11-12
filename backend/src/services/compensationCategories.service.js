import pool from '../config/database.js';
import {NLU_COMPENSATION_CATEGORIES,NLU_COMPENSATION_POLICY_VERSION} from '../content/nluCompensationPolicy.js';
export const LEGACY_COMPENSATION_CATEGORIES=Object.freeze({
  1:{label:'Unlicensed',description:'Unlicensed — Bachelors, Interns, QBHA, Peer & Unlicensed Masters'},
  2:{label:'Pre-licensed',description:'Pre-licensed Masters Level'},
  3:{label:'Licensed',description:'Licensed Professionals'}
});
export const categoriesForAgencySlug=slug=>String(slug||'').toLowerCase()==='nlu'?NLU_COMPENSATION_CATEGORIES:LEGACY_COMPENSATION_CATEGORIES;
export async function compensationAgencyPolicy(agencyId,db=pool) {
  const [rows]=await db.execute('SELECT slug,feature_flags FROM agencies WHERE id=? LIMIT 1',[Number(agencyId)]);
  const agency=rows?.[0]||{};
  let flags=agency.feature_flags||{};
  if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{flags={};}}
  const nlu=agency.slug==='nlu'&&flags.nluCompensationPolicyVersion===NLU_COMPENSATION_POLICY_VERSION;
  return {slug:agency.slug,categories:categoriesForAgencySlug(agency.slug),nluCompensationPolicyVersion:nlu?NLU_COMPENSATION_POLICY_VERSION:null,nluCompensationEffectiveOn:nlu?flags.nluCompensationEffectiveOn:null,serviceCompensation:nlu?flags.nluServiceCompensation:null};
}
export async function categoriesForAgency(agencyId,db=pool){return (await compensationAgencyPolicy(agencyId,db)).categories;}
export async function categoryIdsForAgency(agencyId,db=pool){return Object.keys(await categoriesForAgency(agencyId,db)).map(Number);}
