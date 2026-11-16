import pool from '../config/database.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import {readProviderServices,saveProviderServices} from './providerServiceOfferings.service.js';
import {descriptiveTutoringProfile,tutoringWorkspace} from './tutoringWorkspace.service.js';
import User from '../models/User.model.js';
const parse=(value,fallback)=>{try{return typeof value==='string'?JSON.parse(value):value??fallback;}catch{return fallback;}};
const fail=message=>Object.assign(new Error(message),{status:400});
export function tutoringReviewValues(data={}){
 const values=descriptiveTutoringProfile({subjectAreas:data.subjectAreas,gradeLevels:data.gradeLevels,bio:data.bio,acceptingNewStudents:data.acceptingNewStudents});
 if(!values.subjectAreas.length||!values.gradeLevels.length)throw fail('Enter your tutoring subjects/topics and grade levels.');
 if(!Array.isArray(data.ageGroups)||!data.ageGroups.length||data.ageGroups.length>30||data.ageGroups.some(v=>typeof v!=='string'||!v.trim()||v.length>80))throw fail('Enter the ages or age ranges you tutor.');
 return {...values,ageGroups:[...new Set(data.ageGroups.map(v=>v.trim()))]};
}
export async function getProviderUpdateServices(userId,agencyId){
 const offered=await readProviderServices(userId,agencyId);
 const [[row]]=await pool.execute('SELECT subject_areas_json,grade_levels_json,bio,accepting_new_students FROM provider_tutoring_profiles WHERE user_id=? AND agency_id=?',[userId,agencyId]);
 const profile=await ProviderPublicProfile.getForProvider({providerUserId:userId,agencyId});
 return {options:offered.services,selected:offered.services.filter(s=>s.offered).map(s=>s.serviceType),credentialTier:offered.careEligibility.credentialTier,
  tutoring:{subjectAreas:parse(row?.subject_areas_json,[]),gradeLevels:parse(row?.grade_levels_json,[]),ageGroups:profile?.details?.tutoringFocusByAgency?.[String(agencyId)]?.ageGroups||[],bio:row?.bio||'',acceptingNewStudents:row?Number(row.accepting_new_students)===1:true}};
}
export async function saveProviderUpdateServices(recipient,data){
 const uid=recipient.provider_user_id,aid=recipient.agency_id;
 const current=await readProviderServices(uid,aid);
 if(!Array.isArray(data.selected)||data.selected.some(s=>typeof s!=='string'||!current.services.some(o=>o.serviceType===s)))throw fail('Select the services available for your agency.');
 const selected=[...new Set(data.selected)];
 const tutoring=selected.includes('tutoring')?tutoringReviewValues(data.tutoring):null;
 // Reuse normal scope/qualification checks. This never enables online booking.
 await saveProviderServices(uid,aid,selected);
 if(tutoring){
  const user=await User.findById(uid);
  const {ageGroups,...descriptive}=tutoring;
  await tutoringWorkspace.save(user,aid,descriptive);
  const profile=await ProviderPublicProfile.getForProvider({providerUserId:uid,agencyId:aid});
  await ProviderPublicProfile.upsertForProvider({providerUserId:uid,...profile,details:{...profile?.details,tutoringFocusByAgency:{...profile?.details?.tutoringFocusByAgency,[String(aid)]:{ageGroups}}}});
 }
 // Store reviewed descriptive values, never client-supplied rates or permissions.
 for(const key of Object.keys(data))delete data[key];
 Object.assign(data,{selected,...(tutoring?{tutoring}:{}),reviewedAt:new Date().toISOString()});
}
