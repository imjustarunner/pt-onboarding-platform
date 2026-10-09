import pool from '../config/database.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import { getProviderUpdateRecords } from './providerUpdateRecords.service.js';
import { FOCUS_GROUPS, validateFocus } from '../../../frontend/src/navigation/providerFocus.js';
import { needsClinicalProfile } from '../utils/hireClinicalProfile.js';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export const DEMOGRAPHIC_FIELDS = [
  { key: 'provider_marketing_gender', label: 'Gender (optional, for profile display)' },
  { key: 'provider_marketing_ethnicity', label: 'Ethnicity / heritage (optional, for profile display)' }
];
export async function getHireUserSetup(user, agencyId) {
  const records = await getProviderUpdateRecords(user.id, agencyId);
  const profile = await ProviderPublicProfile.getForProvider({ providerUserId: user.id, agencyId });
  const [rows] = await pool.execute(`SELECT d.field_key, v.value FROM user_info_field_definitions d
    JOIN user_info_values v ON v.field_definition_id=d.id WHERE v.user_id=?
    AND (d.agency_id=? OR d.agency_id IS NULL) AND d.field_key IN (?,?) ORDER BY d.agency_id, v.updated_at`,
    [user.id, agencyId, ...DEMOGRAPHIC_FIELDS.map(f => f.key)]);
  return { clinical: needsClinicalProfile(user), demographicFields: DEMOGRAPHIC_FIELDS,
    focusGroups: records.focusGroups, values: { contact: records.contact, credential: records.credential,
      blurb: records.blurb, clinicalFocus: records.clinicalFocus,
      demographics: Object.fromEntries(rows.map(r => [r.field_key, r.value || ''])),
      languages: profile?.details?.languages || [], typicalAvailability: records.typicalAvailability || [] } };
}
export function validateHireUserSetup(input, clinical, groups = FOCUS_GROUPS) {
  if (!input || typeof input !== 'object') fail('Review your setup information.');
  const text = (value, limit) => { if (typeof value !== 'string' || value.length > limit) fail('Check your setup information.'); return value.trim(); };
  const list = value => { if (!Array.isArray(value) || value.length > 30) fail('Choose valid profile options.'); return [...new Set(value.map(v => text(v,160)).filter(Boolean))]; };
  const contact = Object.fromEntries(['phone','street','line2','city','state','postalCode','emergency'].map(key => [key,text(input.contact?.[key] ?? '', key==='emergency'?1000:255)]));
  return { contact, credential: text(input.credential ?? '',100),
    demographics: Object.fromEntries(DEMOGRAPHIC_FIELDS.map(f => [f.key,text(input.demographics?.[f.key] ?? '',160)])),
    languages: list(input.languages || []), ...(clinical ? { blurb:text(input.blurb ?? '',4000),
      clinicalFocus:validateFocus(input.clinicalFocus,groups), typicalAvailability:list(input.typicalAvailability || []) } : {}) };
}
// Called inside the same transaction/phase lock as the retained onboarding answer.
// Only profile preferences are written; no client, school or office assignments are created.
export async function persistHireUserSetup(db, userId, agencyId, value) {
  const putField = async (key,label,answer,type='text',options=null) => {
    const [[existing]] = await db.execute(`SELECT id FROM user_info_field_definitions WHERE field_key=?
      AND parent_field_id IS NULL AND (agency_id=? OR agency_id IS NULL) ORDER BY agency_id DESC,id DESC LIMIT 1`,[key,agencyId]);
    let id=existing?.id;
    if(!id){const [r]=await db.execute(`INSERT INTO user_info_field_definitions (agency_id,field_key,field_label,field_type,is_required,options)
      VALUES (?,?,?,?,0,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,[agencyId,key,label,type,options?JSON.stringify(options):null]);id=r.insertId;}
    await db.execute(`INSERT INTO user_info_values (user_id,field_definition_id,value) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE value=VALUES(value)`,[userId,id,answer]);
  };
  const c=value.contact;
  await db.execute(`UPDATE users SET personal_phone=?,home_street_address=?,home_address_line2=?,home_city=?,home_state=?,home_postal_code=?,credential=?,languages_spoken=? WHERE id=?`,
    [c.phone,c.street,c.line2,c.city,c.state,c.postalCode,value.credential,value.languages.join(', '),userId]);
  await putField('emergency_contact','Emergency contact',c.emergency);
  for(const f of DEMOGRAPHIC_FIELDS)await putField(f.key,f.label,value.demographics[f.key]);
  if(!value.clinicalFocus)return;
  const previous=await ProviderPublicProfile.getForProvider({providerUserId:userId,database:db});
  await ProviderPublicProfile.upsertForProvider({providerUserId:userId,...previous,database:db,publicBlurb:value.blurb,
    details:{...previous?.details,gender:value.demographics.provider_marketing_gender,languages:value.languages,typicalAvailability:value.typicalAvailability}});
  for(const group of FOCUS_GROUPS){
    // Same focus representation as Provider Update: top three and explicit exclusions.
    const [[existing]]=await db.execute(`SELECT v.value FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id
      WHERE v.user_id=? AND d.field_key=? AND (d.agency_id=? OR d.agency_id IS NULL) ORDER BY d.agency_id DESC,v.updated_at DESC LIMIT 1`,[userId,group.field,agencyId]);
    let prior=[];try{prior=JSON.parse(existing?.value||'[]');}catch{}if(!Array.isArray(prior))prior=[];
    const chosen=[...new Set([...prior,...value.clinicalFocus.top[group.key]])].filter(v=>!value.clinicalFocus.excluded[group.key].includes(v));
    await putField(group.field,group.label,JSON.stringify(chosen),'multi_select',group.options);
  }
  await db.execute(`UPDATE provider_public_profiles SET public_details_json=JSON_SET(COALESCE(public_details_json,JSON_OBJECT()),'$.clinicalFocus',CAST(? AS JSON)) WHERE user_id=?`,
    [JSON.stringify({...value.clinicalFocus,reviewedAt:new Date().toISOString()}),userId]);
}
