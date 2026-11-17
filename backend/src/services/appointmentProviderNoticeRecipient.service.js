import User from '../models/User.model.js';
import {readAgencyAccess} from './agencyAccessProfiles.service.js';
import {resolveMeetingRecipient} from './meetingRecipientIdentity.service.js';
export async function appointmentProviderNoticeRecipient({providerId,agencyId}) {
  const user=await User.findById(Number(providerId));
  if(!user||Number(user.is_active)!==1||Number(user.is_archived)||user.terminated_at||!['ACTIVE','ACTIVE_EMPLOYEE','COMPLETED'].includes(String(user.status).toUpperCase()))return null;
  const access=await readAgencyAccess(user.id,Number(agencyId));
  if(!access?.membership||!['provider','provider_plus','admin','staff','support'].includes(access.role))return null;
  const recipient=await resolveMeetingRecipient({agencyId:Number(agencyId),user});
  return recipient?.email?{key:`provider:${user.id}`,userId:Number(user.id),email:recipient.email,role:'provider',authorized:true}:null;
}
