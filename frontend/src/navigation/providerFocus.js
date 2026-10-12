import {SPECIALTIES,POPULATIONS,POPULATIONS_LABEL,POPULATIONS_DESCRIPTION,CLIENT_AGES,THERAPY_APPROACHES} from './providerClinicalTaxonomy.js';
export const FOCUS_GROUPS = [
 {key:'specialties',field:'specialties_general',label:'Specialties',options:SPECIALTIES},
 {key:'ageGroups',field:'age_specialty',label:'Client ages',options:CLIENT_AGES},
 {key:'populations',field:'groups',label:POPULATIONS_LABEL,description:POPULATIONS_DESCRIPTION,options:POPULATIONS},
 {key:'modalities',field:'modality',label:'Therapy approaches',options:THERAPY_APPROACHES}
];
export function missingFocusGroups(value,groups=FOCUS_GROUPS){
 return groups.filter(g=>value?.waived?.[g.key]!==true&&new Set((Array.isArray(value?.top?.[g.key])?value.top[g.key]:[]).filter(v=>g.options.includes(v)&&!(value?.excluded?.[g.key]||[]).includes(v))).size!==3);
}
export function validateFocus(value,groups=FOCUS_GROUPS,{requireThree=false}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('Review your focus areas.'),{status:400});
 const top={},excluded={},waived={},automaticTop={};
 for(const g of groups){
  const t=value.top?.[g.key],e=value.excluded?.[g.key];
  if(!Array.isArray(t)||!Array.isArray(e)||t.length>3||e.length>g.options.length||[...t,...e].some(v=>typeof v!=='string'||!g.options.includes(v))||t.some(v=>e.includes(v)))throw Object.assign(new Error(`Choose up to three ${g.label.toLowerCase()} and keep exclusions separate.`),{status:400});
  if(value.waived?.[g.key]!=null&&typeof value.waived[g.key]!=='boolean')throw Object.assign(new Error('Choose whether to waive each top-three section.'),{status:400});
  waived[g.key]=value.waived?.[g.key]===true;
  top[g.key]=waived[g.key]?[]:[...new Set(t)];excluded[g.key]=[...new Set(e)];
  if(waived[g.key])automaticTop[g.key]=randomHighlights(g.options.filter(v=>!excluded[g.key].includes(v)),value.automaticTop?.[g.key]);
 }
 if(requireThree){const missing=missingFocusGroups({top,excluded,waived},groups);if(missing.length)throw Object.assign(new Error(`Select exactly three top choices or waive each section in: ${missing.map(g=>g.label).join(', ')}.`),{status:400,details:{missingFocusGroups:missing.map(g=>g.key)}});}
 return {top,excluded,waived,automaticTop,reviewed:true};
}
export function validateMatchingPreferences(value,{maxSelections=3}={}){
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('Check the provider fit preferences.'),{status:400});
 const result={};
 for(const g of FOCUS_GROUPS){const list=value[g.key]||[];if(!Array.isArray(list)||list.length>(maxSelections||g.options.length)||list.some(v=>!g.options.includes(v)))throw Object.assign(new Error(`Select valid ${g.label.toLowerCase()} preferences${maxSelections?` (up to ${maxSelections})`:""}.`),{status:400});result[g.key]=[...new Set(list)];}
 return result;
}
export function focusMatch(focus,preferences={}){
 let score=0;
 for(const g of FOCUS_GROUPS){const requested=preferences[g.key]||[];
  if(requested.some(v=>(focus?.excluded?.[g.key]||[]).includes(v)))return {eligible:false,score:0};
  if(focus?.waived?.[g.key])continue;
  score+=requested.filter(v=>(focus?.top?.[g.key]||[]).includes(v)).length;
 }
 return {eligible:true,score};
}
function randomHighlights(options,previous=[]){
 const selected=[...new Set(Array.isArray(previous)?previous:[])].filter(v=>options.includes(v)).slice(0,3);
 const rest=options.filter(v=>!selected.includes(v));
 while(selected.length<3&&rest.length)selected.push(rest.splice(Math.floor(Math.random()*rest.length),1)[0]);
 return selected;
}
export function publishedFocus(group,focus,affirmed=[]){
 const definition=FOCUS_GROUPS.find(g=>g.key===group);
 if(!focus?.reviewed||!definition)return {top:affirmed.slice(0,3),more:affirmed.slice(3),reviewed:false};
 const available=[...new Set([...definition.options,...affirmed,...(focus.automaticTop?.[group]||[])])].filter(v=>!(focus.excluded?.[group]||[]).includes(v));
 const top=focus.waived?.[group]?randomHighlights(available,focus.automaticTop?.[group]):(focus.top?.[group]||[]).filter(v=>!(focus.excluded?.[group]||[]).includes(v)).slice(0,3);
 const more=[...new Set([...definition.options,...affirmed])].filter(v=>!top.includes(v)&&!(focus.excluded?.[group]||[]).includes(v));
 return {top,more,reviewed:true};
}

// Legacy editors must not offer a second, conflicting editor for these same answers.
const focusFieldKeys = new Set([
 ...FOCUS_GROUPS.map(g=>g.field), 'provider_marketing_specialties', 'provider_counseling_specialties', 'pt_specialties_max25',
 'provider_specialties', 'provider_age_specialty', 'provider_marketing_age_specialty', 'provider_marketing_groups',
 'provider_marketing_focus', 'provider_client_focus', 'provider_marketing_treatment_modalities', 'provider_modality',
 'treatment_prefs_max15', 'top3_specialties_general', 'top3_specialties_clinical', 'pt_top3_specialties', 'provider_top_three_specialties'
]);
export function isProviderFocusField(field) { return focusFieldKeys.has(typeof field==='string'?field:field?.field_key); }
