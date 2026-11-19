import Agency from '../models/Agency.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
async function smsLineFlags(agencyId) {
  if (!agencyId) return null;
  const agency=await Agency.findById(agencyId);
  let flags=agency?.feature_flags || {};
  if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{flags={};}}
  return flags;
}
export async function sharedCareNumberId(agencyId) {
  const flags = await smsLineFlags(agencyId);
  const id=Number(flags?.smsSharedCareNumberId);
  return Number.isSafeInteger(id) && id>0 ? id : null;
}
export async function getSharedCareNumber(agencyId) {
  const id=await sharedCareNumberId(agencyId);
  if(!id)return null;
  const number=await PhoneNumber.findById(id);
  return number && Number(number.agency_id)===Number(agencyId) && number.is_active && number.status==='active'
    && number.number_purpose==='clinical_care' ? number : null;
}

export async function configuredReminderNumberId(agencyId) {
  const flags = await smsLineFlags(agencyId);
  const id = Number(flags?.smsReminderNumberId);
  return Number.isSafeInteger(id) && id > 0 && id !== Number(flags?.smsSharedCareNumberId) ? id : null;
}
