import {SPECIALTIES,POPULATIONS,CLIENT_AGES,THERAPY_APPROACHES} from './providerClinicalTaxonomy.js';
export const FOCUS_GROUPS = [
 {key:'specialties',field:'specialties_general',label:'Specialties',options:SPECIALTIES},
 {key:'ageGroups',field:'age_specialty',label:'Client ages',options:CLIENT_AGES},
 {key:'populations',field:'groups',label:'Populations served',options:POPULATIONS},
 {key:'modalities',field:'modality',label:'Therapy approaches',options:THERAPY_APPROACHES}
];
export function missingFocusGroups(value,groups=FOCUS_GROUPS){
 return groups.filter(g=>new Set((Array.isArray(value?.top?.[g.key])?value.top[g.key]:[]).filter(v=>g.options.includes(v)&&!(value?.excluded?.[g.key]||[]).includes(v))).size!==3);
}
export function validateFocus(value,groups=FOCUS_GROUPS,{requireThree=false}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('Review your focus areas.'),{status:400});
 const top={},excluded={};
 for(const g of groups){
  const t=value.top?.[g.key],e=value.excluded?.[g.key];
  if(!Array.isArray(t)||!Array.isArray(e)||t.length>3||e.length>g.options.length||[...t,...e].some(v=>typeof v!=='string'||!g.options.includes(v))||t.some(v=>e.includes(v)))throw Object.assign(new Error(`Choose up to three ${g.label.toLowerCase()} and keep exclusions separate.`),{status:400});
  top[g.key]=[...new Set(t)];excluded[g.key]=[...new Set(e)];
 }
 if(requireThree){const missing=missingFocusGroups({top,excluded},groups);if(missing.length)throw Object.assign(new Error(`Select exactly three top choices in: ${missing.map(g=>g.label).join(', ')}.`),{status:400,details:{missingFocusGroups:missing.map(g=>g.key)}});}
 return {top,excluded,reviewed:true};
}
export function validateMatchingPreferences(value){
 if(value==null)return null;
 const result={};
 for(const g of FOCUS_GROUPS){const list=value[g.key]||[];if(!Array.isArray(list)||list.length>3||list.some(v=>!g.options.includes(v)))throw Object.assign(new Error(`Select up to three ${g.label.toLowerCase()} preferences.`),{status:400});result[g.key]=[...new Set(list)];}
 return result;
}
export function focusMatch(focus,preferences={}){
 let score=0;
 for(const g of FOCUS_GROUPS){const requested=preferences[g.key]||[];
  if(requested.some(v=>(focus?.excluded?.[g.key]||[]).includes(v)))return {eligible:false,score:0};
  score+=requested.filter(v=>(focus?.top?.[g.key]||[]).includes(v)).length;
 }
 return {eligible:true,score};
}
export function publishedFocus(group,focus,affirmed=[]){
 const definition=FOCUS_GROUPS.find(g=>g.key===group);
 if(!focus?.reviewed||!definition)return {top:affirmed.slice(0,3),more:affirmed.slice(3),reviewed:false};
 const top=(focus.top?.[group]||[]).filter(v=>!(focus.excluded?.[group]||[]).includes(v)).slice(0,3);
 const more=[...new Set([...definition.options,...affirmed])].filter(v=>!top.includes(v)&&!(focus.excluded?.[group]||[]).includes(v));
 return {top,more,reviewed:true};
}
