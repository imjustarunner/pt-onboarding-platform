import {SPECIALTIES,POPULATIONS,CLIENT_AGES,THERAPY_APPROACHES} from '../constants/providerClinicalTaxonomy.js';
import {normalizeFacetFieldKey} from '../constants/clinicalFacetFields.js';
const definitions={
 specialties_general:{options:SPECIALTIES,label:'Specialties — What I help with'},
 provider_counseling_specialties:{options:SPECIALTIES,label:'Specialties — What I help with'},
 pt_specialties_max25:{options:SPECIALTIES,label:'Specialties — What I help with'},
 age_specialty:{options:CLIENT_AGES,label:'Client Ages — Who I see by age'},
 groups:{options:POPULATIONS,label:'Populations Served — Communities and client types'},
 modality:{options:THERAPY_APPROACHES,label:'Therapy Approaches — How I provide treatment'},
 treatment_prefs_max15:{options:THERAPY_APPROACHES,label:'Therapy Approaches — How I provide treatment'}
};
export function clinicalFieldOptions(fieldKey){return definitions[normalizeFacetFieldKey(fieldKey)]||null;}
export function withClinicalFieldOptions(field){
 const definition=clinicalFieldOptions(field?.field_key);if(!definition)return field;
 // Original selections remain visible to their author for review, even if legacy labels changed.
 let values=field.value;try{values=JSON.parse(values);}catch{}
 const legacy=Array.isArray(values)?values:[];
 return {...field,field_type:'multi_select',field_label:definition.label,options:[...new Set([...definition.options,...legacy.filter(v=>typeof v==='string')])]};
}
