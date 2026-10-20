import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';

export async function resolveProviderUpdateSender(agencyId) {
 const identities=await EmailSenderIdentity.list({agencyId:Number(agencyId),includePlatformDefaults:false,onlyActive:true});
 const active=identities.filter(row=>Number(row.agency_id)===Number(agencyId)&&row.is_active!==false&&row.is_active!==0);
 const identity=active.find(row=>row.identity_key==='notifications'&&/^notifications@[^\s@]+\.[^\s@]+$/i.test(String(row.from_email||'').trim()));
 const technology=active.find(row=>row.identity_key==='technology'&&/^technology@[^\s@]+\.[^\s@]+$/i.test(String(row.from_email||'').trim()));
 if(!identity||!technology)throw Object.assign(Error('Configure active Notifications and Technology identities for this agency before sending Provider Update emails.'),{status:409});
 return {identity,replyTo:String(technology.from_email).trim().toLowerCase()};
}
