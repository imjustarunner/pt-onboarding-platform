import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
const normalize = value => String(value || '').trim().toLowerCase();
const valid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Historical imports put personal addresses in work_email. Only use saved
// addresses on this agency's configured mail domain; never invent an alias.
export function providerUpdateWorkEmail(user, identities, agencyId) {
 const scoped = identities.filter(i => Number(i.agency_id) === Number(agencyId) && i.is_active !== false && Number(i.is_active) !== 0);
 const domains = new Set(scoped.map(i => normalize(i.from_email)).filter(e => valid(e) && e.startsWith('po@')).map(e => e.split('@')[1]));
 const owned = scoped.find(i => i.identity_key === `personal_${user.provider_user_id || user.id}`);
 return [owned?.from_email, user.work_email, user.email].map(normalize).find(e => valid(e) && domains.has(e.split('@')[1])) || null;
}
export async function resolveProviderUpdateRecipients(agencyId, users) {
 const identities = await EmailSenderIdentity.list({agencyId:Number(agencyId),includePlatformDefaults:false,onlyActive:true});
 return users.map(user => ({...user,work_email:providerUpdateWorkEmail(user, identities, agencyId)}));
}
