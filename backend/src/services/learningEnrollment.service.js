import pool from '../config/database.js';
import {normalizeLearningInquiry,pricePackage,normalizeLearningProfile,matchesGrade} from './learningCatalog.js';
export async function resolveLearningInquiry(agencyId,raw){
 const value=normalizeLearningInquiry(raw);if(!value?.packageId)return value;
 const [rows]=await pool.execute('SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=?',[agencyId]);
 const rawCatalog=rows[0]?.catalog_json;const catalog=typeof rawCatalog==='string'?JSON.parse(rawCatalog):rawCatalog;
 const pkg=catalog?.packages?.find(p=>p.id===value.packageId&&p.program===value.program&&p.published);
 if(!pkg){const e=new Error('This package is no longer available. Please refresh your options.');e.status=400;throw e;}
 return {...value,packageSnapshot:pricePackage(catalog,pkg)};
}
export async function prepareLearningPacket(intakeData,link){
 if(String(link?.master_channel||'').toLowerCase()!=='tutoring'||!intakeData)return;
 const responses=intakeData.responses || intakeData;
 if (!responses.submission) responses.submission={};
 responses.submission.learning=await resolveLearningInquiry(link.organization_id,responses.submission.learning || {program:'tutoring'});
 for(const client of responses.clients||[]){if(client.learning)client.learning=await resolveLearningInquiry(link.organization_id,client.learning);}
 const preferences=responses.submission.preferred_office_provider_ids || [];
 if (!Array.isArray(preferences) || preferences.length > 10) throw Object.assign(new Error('Choose up to ten provider preferences.'),{status:400});
 const learners=(responses.clients || []).map(client=>client.learning).filter(Boolean);
 for (const id of preferences) for (const learning of learners.length ? learners : [responses.submission.learning]) await validateLearningProviderSelection(link.organization_id,id,learning);
}

const parse = (value, fallback) => typeof value === 'string' ? JSON.parse(value) : value || fallback;
export async function validateLearningProviderSelection(agencyId, providerId, learning) {
 if (!Number.isSafeInteger(Number(providerId)) || Number(providerId) <= 0) throw Object.assign(new Error('Choose a valid provider.'), {status:400});
 const [rows] = await pool.execute(`SELECT t.subject_areas_json,t.grade_levels_json,t.learning_settings_json
 FROM provider_tutoring_profiles t JOIN provider_public_service_enrollments e ON e.user_id=t.user_id AND e.agency_id=t.agency_id AND e.service_type='tutoring' AND e.is_active=1
 JOIN user_agencies ua ON ua.user_id=t.user_id AND ua.agency_id=t.agency_id
 WHERE t.agency_id=? AND t.user_id=?`, [agencyId, Number(providerId)]);
 const row=rows[0], profile=normalizeLearningProfile(parse(row?.learning_settings_json,{}));
 if (!row || !profile.programs.includes(learning.program) || !matchesGrade(parse(row.grade_levels_json,[]),learning.grade) || (learning.subject && !parse(row.subject_areas_json,[]).some(subject=>String(subject).toLowerCase().includes(learning.subject.toLowerCase())))) {
  throw Object.assign(new Error('The selected provider does not match this learning program, grade, or subject. Choose another provider or ask our team to match you.'), {status:400});
 }
}
