import pool from '../config/database.js';
const slugs=new Set(['nlu','nextlevelup','nextleveluplcc','next-level-up']);
export function validExternalMeetingUrl(value){
 const text=String(value||'').trim();if(!text)return null;
 try{const url=new URL(text);if(url.protocol!=='https:'||url.username||url.password||text.length>2048)throw Error();return url.href;}
 catch{throw Object.assign(Error('Enter a valid HTTPS meeting link, or leave the external link blank for now.'),{status:400});}
}
export async function externalMeetingPolicy({agencyId,providerUserId,provider},db=pool){
 const [[agency]]=await db.execute('SELECT slug,portal_url FROM agencies WHERE id=?',[agencyId]);
 const nlu=[agency?.slug,agency?.portal_url].some(value=>slugs.has(String(value||'').toLowerCase()));
 provider ||= providerUserId ? await (await import('../models/User.model.js')).default.findById(providerUserId) : null;
 if(!provider?.id) return {providerId:Number(providerUserId)||null,usesGoogleSso:null,externalLinksAllowed:false};
 const {usesGoogleSchedule}=await import('./scheduleCalendarPolicy.service.js');
 let usesGoogleSso;
 try{usesGoogleSso=await usesGoogleSchedule(provider);}catch{return {providerId:Number(provider.id),usesGoogleSso:null,externalLinksAllowed:false};}
 return {providerId:Number(provider.id),usesGoogleSso,externalLinksAllowed:nlu&&!usesGoogleSso};
}
export async function validateExternalMeeting({agencyId,providerUserId,videoRoomMode,externalMeetingUrl,modality},db=pool){
 if(videoRoomMode!=='external'){if(externalMeetingUrl)throw Object.assign(Error('Choose Use external link before adding a meeting URL.'),{status:400});return null;}
 const policy=await externalMeetingPolicy({agencyId,providerUserId},db);
 if(!policy.externalLinksAllowed)throw Object.assign(Error('External meeting links are available only for NLU providers who do not use Google SSO.'),{status:403});
 if(!['TELEHEALTH','VIRTUAL'].includes(String(modality).toUpperCase()))throw Object.assign(Error('External meeting links apply to virtual sessions.'),{status:400});
 return validExternalMeetingUrl(externalMeetingUrl);
}
