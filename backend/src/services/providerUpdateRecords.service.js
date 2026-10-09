import {normalizeFocusAgeValues} from '../utils/providerFacetNormalization.js';
import {getProviderDisplayRole,DISPLAY_ROLE_OPTIONS} from './providerDisplayRole.service.js';
import {FOCUS_GROUPS,validateFocus} from '../../../frontend/src/navigation/providerFocus.js';
import {withClinicalFieldOptions} from '../utils/providerClinicalFieldOptions.js';
import ProviderSearchIndex from '../models/ProviderSearchIndex.model.js';
import pool from '../config/database.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import { listClinicalFacetsForUser } from './providerClinicalFacets.service.js';
import { CLINICAL_PROFILE_FIELDS } from '../utils/hireClinicalProfile.js';

export function decodeField(value) { if(typeof value!=='string')return value;try{return JSON.parse(value);}catch{return value;} }
const strings=value=>{const v=decodeField(value);return Array.isArray(v)?v.map(String):v?String(v).split(/[,;\n]/).map(s=>s.trim()).filter(Boolean):[];};
const round=n=>Math.round(Number(n||0)*100)/100;
export function supervisionBreakdown(baseline,period,credits,account){
 const pair=r=>({individual:round(r?.individual),group:round(r?.group),total:round(Number(r?.individual||0)+Number(r?.group||0))});
 const reported=pair({individual:Number(baseline.individual||0)+Number(period.individual||0),group:Number(baseline.group||0)+Number(period.group||0)});
 const app=pair(credits), calculated=pair({individual:reported.individual+app.individual,group:reported.group+app.group});
 return {baseline:pair(baseline),period:pair(period),reported,app,calculated,current:account?pair(account):calculated,difference:account?round(pair(account).total-calculated.total):0};
}
export async function getProviderUpdateRecords(userId,agencyId){
 const [[u]]=await pool.execute(`SELECT id,first_name,last_name,phone_number,personal_phone,personal_email,home_street_address,home_address_line2,home_city,home_state,home_postal_code,credential,title,profile_photo_path,provider_school_info_blurb FROM users WHERE id=?`,[userId]);
 const [fields]=await pool.execute(`SELECT d.id,d.field_key,d.field_label,d.options,v.value FROM user_info_field_definitions d LEFT JOIN user_info_values v ON v.field_definition_id=d.id AND v.user_id=? WHERE (d.agency_id IS NULL OR d.agency_id=?) AND d.parent_field_id IS NULL ORDER BY (d.agency_id IS NOT NULL),d.id`,[userId,agencyId]);
 const values={},defs={};for(const raw of fields){const f=withClinicalFieldOptions(raw);if(f.value!=null)values[f.field_key]=decodeField(f.value);if(f.options||!defs[f.field_key])defs[f.field_key]=f;}
 const profile=await ProviderPublicProfile.getForProvider({providerUserId:userId,agencyId});
 const [schools]=await pool.execute(`SELECT psa.id,psa.day_of_week,psa.start_time,psa.end_time,a.name FROM provider_school_assignments psa JOIN agencies a ON a.id=psa.school_organization_id WHERE psa.provider_user_id=? AND psa.is_active=1 AND (a.id=? OR EXISTS(SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=a.id AND oa.agency_id=?)) ORDER BY a.name,psa.day_of_week,psa.start_time`,[userId,agencyId,agencyId]);
 const [[ua]]=await pool.execute('SELECT supervision_is_prelicensed,supervision_start_individual_hours,supervision_start_group_hours FROM user_agencies WHERE user_id=? AND agency_id=?',[userId,agencyId]);
 const [[period]]=await pool.execute('SELECT SUM(individual_hours) AS individual,SUM(group_hours) AS `group` FROM supervision_period_entries WHERE user_id=? AND agency_id=?',[userId,agencyId]);
 const [[credits]]=await pool.execute('SELECT SUM(individual_hours) AS individual,SUM(group_hours) AS `group` FROM supervision_session_hour_credits WHERE user_id=? AND agency_id=?',[userId,agencyId]);
 const [[account]]=await pool.execute('SELECT individual_hours AS individual,group_hours AS `group` FROM supervision_accounts WHERE user_id=? AND agency_id=?',[userId,agencyId]);
 const facets=await listClinicalFacetsForUser(userId,{agencyId});
 const groups=['specialties_general','age_specialty','groups','modality','provider_interventions_techniques'].filter(k=>defs[k]).map(k=>{
  const field=CLINICAL_PROFILE_FIELDS.find(f=>f.key===k);
  const selected=field?facets[field.group]||[]:facets.interventions||strings(values[k]);
  return {key:k,label:defs[k].field_label,options:[...new Set([...strings(defs[k].options),...selected])],selected};
 });
 const focusGroups=FOCUS_GROUPS.map(g=>({...g,previous:groups.find(v=>v.key===g.field)?.selected||[],options:g.key==='ageGroups'?g.options:[...new Set([...g.options,...(groups.find(v=>v.key===g.field)?.options||[])])]}));
 const clinicalFocus=normalizeFocusAgeValues(profile?.details?.clinicalFocus)||{top:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,[]])),excluded:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,[]]))};
 const [docs]=await pool.execute("SELECT id,file_path FROM user_compliance_documents WHERE user_id=? AND (agency_id=? OR agency_id IS NULL) AND document_type='license' AND file_path IS NOT NULL ORDER BY uploaded_at DESC LIMIT 1",[userId,agencyId]);
 return {displayRole:await getProviderDisplayRole(userId,agencyId),contact:{personalEmail:u.personal_email||'',phone:u.personal_phone||u.phone_number||'',street:u.home_street_address||String(values.mailing_address||values.provider_address||''),line2:u.home_address_line2||'',city:u.home_city||'',state:u.home_state||'',postalCode:u.home_postal_code||'',emergency:String(values.emergency_contact||values.emergency_contact_name||'')},publicGender:profile?.details?.gender||'',blurb:profile?.publicBlurb||u.provider_school_info_blurb||'',credential:u.credential||String(values.provider_credential_license_type_number||'').match(/^[A-Za-z]+/)?.[0]||u.title||'',photoPath:u.profile_photo_path||null,typicalAvailability:profile?.details?.typicalAvailability||[],specialtyGroups:groups,focusGroups,clinicalFocus,schools,
 license:{number:String(values.provider_credential_license_type_number||''),issued:String(values.provider_credential_license_issued_date||'').slice(0,10),expires:String(values.provider_credential_license_expiration_date||'').slice(0,10),hasUpload:!!(docs[0]?.file_path||values.license_upload)},licensePath:docs[0]?.file_path||values.license_upload||null,
 supervision:supervisionBreakdown({individual:ua?.supervision_is_prelicensed?ua.supervision_start_individual_hours:0,group:ua?.supervision_is_prelicensed?ua.supervision_start_group_hours:0},period,credits,account)};
}
export async function saveProviderReviewProfile(recipient,key,data){
 const uid=recipient.provider_user_id,aid=recipient.agency_id;
 if(key==='profile_blurb'||key==='work_hours'){
  const current=await ProviderPublicProfile.getForProvider({providerUserId:uid});
  if(key==='work_hours'&&(!Array.isArray(data.typicalAvailability)||data.typicalAvailability.some(v=>typeof v!=='string'||v.length>160)||data.typicalAvailability.length>30))throw Object.assign(new Error('Choose valid typical availability.'),{status:400});
  await ProviderPublicProfile.upsertForProvider({providerUserId:uid,...current,publicBlurb:key==='profile_blurb'?String(data.blurb||'').slice(0,4000):current?.publicBlurb,details:{...current?.details,...(key==='work_hours'?{typicalAvailability:data.typicalAvailability}:{})}});
 }
 if(key==='contact_info'){
  const c=data.contact||{};const fields=['phone','street','line2','city','state','postalCode','personalEmail'];
  if(fields.some(k=>typeof c[k]!=='string'||c[k].length>255))throw Object.assign(new Error('Check your contact details.'),{status:400});
  if(c.personalEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.personalEmail))throw Object.assign(new Error('Enter a valid personal email.'),{status:400});
  let [[emergencyDef]]=await pool.execute("SELECT id FROM user_info_field_definitions WHERE field_key='emergency_contact' AND agency_id=? LIMIT 1",[aid]);
  if(!emergencyDef){const [created]=await pool.execute("INSERT INTO user_info_field_definitions(agency_id,field_key,field_label,field_type,is_required) VALUES(?,'emergency_contact','Emergency contact','text',0)",[aid]);emergencyDef={id:created.insertId};}
  await UserInfoValue.createOrUpdate(uid,emergencyDef.id,String(c.emergency||'').trim().slice(0,1000));
  await pool.execute('UPDATE users SET personal_phone=?,home_street_address=?,home_address_line2=?,home_city=?,home_state=?,home_postal_code=?,personal_email=? WHERE id=?',[...fields.map(k=>c[k].trim()),uid]);
 }
 if(key==='credential_display'){
  const role=await getProviderDisplayRole(uid,aid);
  const choice=String(data.displayLabel || role.label || '').trim();
  if(role.fixed ? choice!==role.label : !DISPLAY_ROLE_OPTIONS.includes(choice)&&choice!==role.currentLabel)throw Object.assign(new Error('Choose an available display label.'),{status:400});
  // A label is not a system access role or an official job title.
  const current=await ProviderPublicProfile.getForProvider({providerUserId:uid});
  const publicGender=Object.hasOwn(data,'publicGender')?String(data.publicGender||'').trim():current?.details?.gender||'';
  if(!['','male','female','nonbinary'].includes(publicGender)&&publicGender!==current?.details?.gender)throw Object.assign(new Error('Choose Male, Female, Nonbinary, or Not shown.'),{status:400});
  await ProviderPublicProfile.upsertForProvider({providerUserId:uid,...current,details:{...current?.details,gender:publicGender,agencyDisplayLabels:{...current?.details?.agencyDisplayLabels,[aid]:choice}}});
  await pool.execute('UPDATE users SET credential=? WHERE id=?',[String(data.credential||'').trim().slice(0,100),uid]);
 }
 if(key==='specialties'){
  const records=await getProviderUpdateRecords(uid,aid);
  const focus=validateFocus(data.clinicalFocus,records.focusGroups,{requireThree:true});
  const pending=[];
  for(const group of records.focusGroups){
   const existing=records.specialtyGroups.find(g=>g.key===group.field)?.selected||[];
   const chosen=[...new Set([...existing,...focus.top[group.key]])].filter(v=>!focus.excluded[group.key].includes(v));
   const [[def]]=await pool.execute('SELECT id FROM user_info_field_definitions WHERE field_key=? AND parent_field_id IS NULL AND (agency_id IS NULL OR agency_id=?) ORDER BY (agency_id IS NOT NULL) DESC,id DESC LIMIT 1',[group.field,aid]);
   if(!def)throw Object.assign(new Error('Clinical profile fields are not configured.'),{status:409});
   pending.push([def.id,JSON.stringify(chosen)]);
  }
  const current=await ProviderPublicProfile.getForProvider({providerUserId:uid});
  await ProviderPublicProfile.upsertForProvider({providerUserId:uid,...current});
  for(const [id,value]of pending)await UserInfoValue.createOrUpdate(uid,id,value);
  await pool.execute("UPDATE provider_public_profiles SET public_details_json=JSON_SET(COALESCE(public_details_json,JSON_OBJECT()),'$.clinicalFocus',CAST(? AS JSON)),updated_at=CURRENT_TIMESTAMP WHERE user_id=?",[JSON.stringify({...focus,reviewedAt:new Date().toISOString()}),uid]);
  await ProviderSearchIndex.upsertForUserInAgency({userId:uid,agencyId:aid,fieldKeys:records.focusGroups.map(g=>g.field)});
 }
}
