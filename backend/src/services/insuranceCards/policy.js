import crypto from 'node:crypto';
import { policyIsMedicaid, hasMedicaidCoverage } from '../../utils/insurancePaymentPolicy.js';
export const CARD_SLOTS = ['primary_front','primary_back','secondary_front','secondary_back'];
export const cardUrlKey = slot => slot.replace('_', '_card_') + '_url';
export const cardCycle = profile => crypto.createHash('sha256').update(JSON.stringify(['primary','secondary'].map(slot => {
  const p=profile[slot] || {};
  return [p.insurerName||'',p.memberId||'',p.groupNumber||'',p.effectiveDate||'',p.terminationDate||'',policyIsMedicaid(p)];
}))).digest('hex');
// Images help reconciliation but never prevent intake or coverage verification.
export function requiredCardSlots() { return []; }
export function encouragedCardSlots(profile, now=new Date()) {
  if (hasMedicaidCoverage(profile)) return [];
  const date=now.toISOString().slice(0,10);
  return ['primary','secondary'].flatMap(slot => {
    const p=profile[slot];
    return !p || !(p.insurerName || p.memberId) || (p.terminationDate && p.terminationDate<date) ? [] : [`${slot}_front`,`${slot}_back`];
  });
}
export function cardProgress(profile, followup={}, now=new Date(), coverageVerified=false, followupEligible=true) {
  const same=followup.cycle_hash===cardCycle(profile);
  const rejected=same?parse(followup.rejected_slots_json,[]):[];
  const encouraged=followupEligible ? encouragedCardSlots(profile,now) : [];
  const missing=encouraged.filter(slot=>!profile[cardUrlKey(slot)] || rejected.includes(slot));
  const state=coverageVerified||!encouraged.length?'not_required':same&&followup.state==='waived'?'waived':missing.length?(same&&followup.state==='help'?'help':'missing'):same&&followup.state==='complete'?'complete':'review';
  return {state,coverageVerified,requiredSlots:[],encouragedSlots:encouraged,missingSlots:coverageVerified?[]:missing,slots:Object.fromEntries(CARD_SLOTS.map(slot=>[slot,{received:!!profile[cardUrlKey(slot)],needsReplacement:encouraged.includes(slot)&&!coverageVerified&&rejected.includes(slot),required:false,encouraged:encouraged.includes(slot)}]))};
}
/** Verification applies only to unchanged coverage, and to every recorded
 * policy. A newer failed/ambiguous check invalidates a previous positive result. */
export function cardCoverageVerified({fingerprint,hasSecondary,review,checks=[]}) {
  const latestId=Math.max(0,...checks.map(c=>Number(c.id)));
  if(review?.insurance_fingerprint===fingerprint && review.status==='verified' && Number(review.through_check_id)>=latestId) return true;
  if(review && review.status!=='verified') return false;
  return (hasSecondary?['primary','secondary']:['primary']).every(slot=>{
    const check=checks.filter(c=>c.policy_slot===slot).sort((a,b)=>b.id-a.id)[0];
    return check?.status==='returned' && check.insurance_fingerprint===fingerprint && check.evidence?.summary?.status==='active_reported' && check.evidence.summary.identityMatches===true;
  });
}
export const parse=(value,fallback=null)=>{try{return typeof value==='string'?JSON.parse(value):value??fallback;}catch{return fallback;}};
export function reminderOrdinal(first,now=new Date()) {
  const days=Math.floor((now-new Date(first))/86400000);
  return days<0?null:days<3?0:days<7?1:2+Math.floor((days-7)/7);
}
export function validCardFile(file) {
  const b=file?.buffer;
  if(!b?.length||b.length>10*1024*1024)return false;
  return file.mimetype==='application/pdf'?b.subarray(0,5).toString()==='%PDF-':file.mimetype==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):file.mimetype==='image/jpeg'&&b[0]===255&&b[1]===216&&b[2]===255;
}
