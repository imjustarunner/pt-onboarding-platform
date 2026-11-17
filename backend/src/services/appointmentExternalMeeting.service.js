import pool from '../config/database.js';
const slugs=new Set(['nlu','nextlevelup','nextleveluplcc','next-level-up']);
export function validExternalMeetingUrl(value){
 const text=String(value||'').trim();if(!text)return null;
 try{const url=new URL(text);if(url.protocol!=='https:'||url.username||url.password||text.length>2048)throw Error();return url.href;}
 catch{throw Object.assign(Error('Enter a valid HTTPS meeting link, or leave the external link blank for now.'),{status:400});}
}
export async function validateExternalMeeting({agencyId,videoRoomMode,externalMeetingUrl,modality},db=pool){
 if(videoRoomMode!=='external'){if(externalMeetingUrl)throw Object.assign(Error('Choose Use external link before adding a meeting URL.'),{status:400});return null;}
 const [[agency]]=await db.execute('SELECT slug,portal_url FROM agencies WHERE id=?',[agencyId]);
 if(![agency?.slug,agency?.portal_url].some(value=>slugs.has(String(value||'').toLowerCase())))throw Object.assign(Error('External session links are currently enabled for NLU only.'),{status:403});
 if(!['TELEHEALTH','VIRTUAL'].includes(String(modality).toUpperCase()))throw Object.assign(Error('External meeting links apply to virtual sessions.'),{status:400});
 return validExternalMeetingUrl(externalMeetingUrl);
}
