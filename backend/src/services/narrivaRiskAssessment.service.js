import pool from '../config/database.js';
// Same three domains as the clinical editor; explicit clinician completion is required separately.
export const NARRIVA_RISK_DOMAINS=['Suicidal Ideation','Homicidal Ideation','Self-Harm'];
export function completeNarrivaRiskAssessment(risk) {
 if(!risk || typeof risk!=='object' || Array.isArray(risk))return false;
 if(risk.patientDeniesAll===true)return true;
 if(risk.items && typeof risk.items==='object')return NARRIVA_RISK_DOMAINS.every(key=>{
  const item=risk.items[key];
  return item && (typeof item.option==='string' && item.option.trim().length>0 || typeof item.status==='string' && item.status.trim().length>0 && !['selected',''].includes(item.status));
 });
 return Array.isArray(risk.areas) && risk.areas.some(area=>typeof area.name==='string' && area.name.trim().length>0);
}
export async function assertNarrivaRiskBeforeSignature(note) {
 let meta=note.metadata_json || {};if(typeof meta==='string'){try{meta=JSON.parse(meta);}catch{meta={};}}
 const id=value=>Number.isSafeInteger(Number(value)) && Number(value)>0?Number(value):null;
 const [[risk]]=await pool.execute(`SELECT MAX(risk_assessment_required) AS required FROM narriva_reviews WHERE agency_id=? AND ((clinical_note_id IS NOT NULL AND clinical_note_id=?) OR (draft_id IS NOT NULL AND draft_id=?) OR (clinical_session_id IS NOT NULL AND clinical_session_id=?))`,[note.agency_id,note.id,id(meta.draftId),id(note.clinical_session_id)]);
 if(Number(risk?.required)!==1)return;
 if(meta.narrivaContext?.riskAssessmentCompleted!==true || !completeNarrivaRiskAssessment(meta.structuredChart?.riskAssessment))throw Object.assign(new Error('This session requires a completed risk assessment before signing.'),{status:409,code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
}
