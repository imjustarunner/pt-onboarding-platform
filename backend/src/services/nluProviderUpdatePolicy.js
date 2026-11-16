import {isValidPersonalEmail} from '../../../frontend/src/navigation/providerUpdateContact.js';
import pool from '../config/database.js';

export const NLU_COMBINED_UPDATE_MARKER='nlu-oct-nov-2026-v1';
export const requiresNluCredentialPreparation=agencyId=>Number(agencyId)===6;
export const tracksPrelicensureHours=record=>[true,1,'1'].includes(record?.supervisionIsPrelicensed);

// Return readiness only; never return a password hash, code or recovery token.
export async function nluCredentialReadiness(userId,db=pool){
 const [[row]]=await db.execute(`SELECT (NULLIF(password_hash,'') IS NOT NULL AND temporary_password_hash IS NULL) AS password_ready,personal_email FROM users WHERE id=?`,[userId]);
 return {passwordReady:Number(row?.password_ready)===1,recoveryEmailReady:isValidPersonalEmail(row?.personal_email)};
}
export function assertNluCredentialConfirmation(readiness,data){
 if(!readiness.passwordReady)throw Object.assign(new Error('Set a permanent app password through your own verified account before continuing.'),{status:400});
 if(!readiness.recoveryEmailReady)throw Object.assign(new Error('Save a valid personal recovery email in Contact & Address before continuing.'),{status:400});
 if(data?.passwordStoredSafely!==true||data?.recoveryEmailConfirmed!==true)throw Object.assign(new Error('Confirm that your app password is saved safely and your personal recovery email is accessible.'),{status:400});
}

export function combinedNluHandbookReview(result,source){
 if(result?.digest?.notes!==NLU_COMBINED_UPDATE_MARKER)return result;
 const excluded=e=>['spanish-language-intake','spanish-language-intake-and-handoff'].includes(e.handbook_section_slug)||/spanish.*intake|school assignments|client (?:updates|follow.up)/i.test(e.subject||'');
 const updates=(source?.reviewUpdates||[]).filter(e=>String(e.changed_content||'').trim()&&!excluded(e));
 const key=e=>e.subject||e.handbook_section_slug||e.id;
 const latest=new Map(updates.map(e=>[key(e),e]));
 const bySection=new Map();
 for(const update of updates){if(update.handbook_section_slug){const values=bySection.get(update.handbook_section_slug)||[];values.push(update);bySection.set(update.handbook_section_slug,values);}}
 const entries=[];const seen=new Set();
 for(const saved of result.entries||[]){
  if(excluded(saved))continue;
  const sectionMatches=bySection.get(saved.handbook_section_slug)||[];
  const current=latest.get(key(saved))||(sectionMatches.length===1?sectionMatches[0]:null);
  const identity=key(current||saved);if(seen.has(identity))continue;
  entries.push(current?{...saved,...current,id:saved.id,status:result.digest.status}:saved);seen.add(identity);
 }
 for(const entry of updates){const identity=key(entry);if(!seen.has(identity)){entries.push({...entry,status:result.digest.status});seen.add(identity);}}
 return {...result,digest:{...result.digest,title:'October and November 2026 NLU Handbook Updates',period_label:'October and November 2026'},entries};
}
