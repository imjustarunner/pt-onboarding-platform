import Agency from '../models/Agency.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import { normalizeWorkflowPhone } from './phoneWorkflow.service.js';

// Read existing SMS assignments; never buy, port, reassign, or publish a number.
export async function getPhoneLineRoles(agencyId) {
  const [agency,numbers]=await Promise.all([Agency.findById(agencyId),PhoneNumber.listByAgency(agencyId,{includeInactive:false})]);
  let flags=agency?.feature_flags || {};
  if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{flags={};}}
  const active=numbers.filter(n=>n.is_active && n.status==='active');
  const publicLines=active.filter(n=>n.number_purpose==='tenant_contact');
  const careLine=active.find(n=>n.number_purpose==='clinical_care' && Number(n.id)===Number(flags.smsSharedCareNumberId));
  const display=n=>({id:n.id,phoneNumber:n.phone_number});
  return {publicLines:publicLines.map(display),careLine:careLine?display(careLine):null,voiceConnected:false,transcriptionConnected:false};
}
export async function assertSeparatePublicLine(agencyId,mainNumber) {
  if(!mainNumber)return;
  const numbers=await PhoneNumber.listByAgency(agencyId,{includeInactive:false});
  const conflict=numbers.some(n=>n.is_active && n.status==='active' && ['clinical_care','provider_contact'].includes(n.number_purpose)
    && normalizeWorkflowPhone(n.phone_number,true)===mainNumber);
  if(conflict)throw Object.assign(new Error('Keep the public main number separate from provider and client care numbers. Choose a different public main number.'),{status:400});
}
