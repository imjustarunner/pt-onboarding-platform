export const CARE_TYPES=['INDIVIDUAL','COUPLES','FAMILY'];
export function normalizeCareType(value) {
 const s=String(value||'').toLowerCase();
 return /^(individuals?|individual_therapy)$/.test(s)?'INDIVIDUAL':/^(couples?|couples_therapy)$/.test(s)?'COUPLES':/^(family|families|family_therapy)$/.test(s)?'FAMILY':null;
}
export function careTypes(value) {
 if(typeof value==='string'){try{value=JSON.parse(value);}catch{return null;}}
 return Array.isArray(value)?[...new Set(value.map(normalizeCareType).filter(Boolean))]:null;
}
export function slotAllowsCare(slot,care) {
 const wanted=normalizeCareType(care),allowed=careTypes(slot.careTypes ?? slot.care_types_json);
 return !wanted || allowed===null || allowed.includes(wanted);
}
