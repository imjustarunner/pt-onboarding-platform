import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';

export async function resolveProviderUpdateSender(agencyId) {
 const identities=await EmailSenderIdentity.list({agencyId:Number(agencyId),includePlatformDefaults:false,onlyActive:true});
 const identity=identities.find(row=>Number(row.agency_id)===Number(agencyId)&&row.is_active!==false&&row.is_active!==0&&/^po@[^\s@]+\.[^\s@]+$/i.test(String(row.from_email||'').trim()));
 if(!identity)throw Object.assign(Error('Configure an active People Operations (po@) sender for this agency before sending Provider Update emails.'),{status:409});
 return {identity,replyTo:String(identity.from_email).trim().toLowerCase()};
}
