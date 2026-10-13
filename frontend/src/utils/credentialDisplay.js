// Controlled display credentials. Selection does not verify a license or expand scope.
export const CREDENTIAL_GROUPS = [
 {label:'Degrees',values:['AA','AS','BA','BS','BSW','BEd','BSN','MA','MS','MSW','MEd','MPH','MBA','MDiv','EdS','PhD','PsyD','EdD','DSW','DNP','MD','DO']},
 {label:'Licenses and candidate registrations',values:['LPCC','LPC','LPSC','SWC','LSW','LCSW','CSW','MFTC','LMFT','MFT','LAC','CAS','CAT','LPA','PSY','RN','APRN','PMHNP-BC','PA-C']},
 {label:'Professional certifications',values:['NCC','CCMHC','ACS','RPT','RPT-S','BCBA','BCaBA','RBT']}
];
export const CREDENTIAL_OPTIONS=CREDENTIAL_GROUPS.flatMap(g=>g.values);
export function credentialItems(value) {
 return [...new Set(String(value||'').split(',').map(v=>v.trim()).filter(Boolean).map(v=>CREDENTIAL_OPTIONS.find(c=>c.toLowerCase()===v.replaceAll('.','').toLowerCase())||v))];
}
export function validateCredentials(value) {
 const items=credentialItems(value);
 if(items.length>12 || items.some(v=>!CREDENTIAL_OPTIONS.includes(v)))throw Object.assign(new Error('Choose each credential from the available list. Contact People Operations if a credential is missing.'),{status:400});
 return items.join(', ');
}
