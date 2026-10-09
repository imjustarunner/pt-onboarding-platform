import pool from '../config/database.js';
const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
export const HANDBOOK_ADDITION_MODE='dated_handbook';
export function additionForDate(history,date) {
 return [...(history||[])].filter(p=>day(p.effective_on)<=day(date)).sort((a,b)=>day(b.effective_on).localeCompare(day(a.effective_on))||Number(b.id)-Number(a.id))[0]||null;
}
export function profileWithDatedAddition(profile,date) {
 if(profile?.conditionalAdditionMode!==HANDBOOK_ADDITION_MODE)return profile;
 const policy=additionForDate(profile.conditionalAdditionHistory,date);
 if(!policy)throw Object.assign(new Error('No dated handbook addition policy covers this service date.'),{code:'AMENDMENT_PAYROLL_REVIEW_REQUIRED'});
 return {...profile,tierBonusFfs:{1:0,2:0,3:Number(policy.clinical_addition)},tierBonusHcode:{1:0,2:0,3:Number(policy.hcode_addition)},conditionalAdditionPolicyId:policy.id};
}
export async function loadAdditionHistory({agencyId,category,level},db=pool) {
 const [rows]=await db.execute('SELECT * FROM payroll_conditional_addition_policies WHERE agency_id=? AND category=? AND level=? ORDER BY effective_on,id',[agencyId,category,level]);return rows;
}
export function additionsFromRate(profile) {
 return {clinical:Number((profile.tierBonusFfs||profile.tierBonus)?.[3]??0),hcode:Number(profile.tierBonusHcode?.[3]??(Number(profile.category)===1?profile.tierBonus?.[3]??0:0))};
}
export async function recordAdditionChange({agencyId,profile,effectiveOn,actorId},db=pool) {
 const history=await loadAdditionHistory({agencyId,category:profile.category,level:profile.level},db);
 if(!history.length)return; // Existing agencies/agreements keep their established policy.
 const current=additionForDate(history,effectiveOn),next=additionsFromRate(profile);
 if(current&&Number(current.clinical_addition)===next.clinical&&Number(current.hcode_addition)===next.hcode)return;
 await db.execute('INSERT INTO payroll_conditional_addition_policies(agency_id,category,level,effective_on,clinical_addition,hcode_addition,created_by_user_id) VALUES (?,?,?,?,?,?,?)',[agencyId,profile.category,profile.level,effectiveOn,next.clinical,next.hcode,actorId]);
}
