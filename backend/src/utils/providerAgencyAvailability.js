// Tenant overrides are only written through the membership-authorized availability endpoint.
export function agencyAvailability(details, agencyId) {
 if (typeof details === 'string') { try { details=JSON.parse(details); } catch { details={}; } }
 const value=details?.availabilityByAgency?.[String(agencyId)];
 return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
export function scopeProviderProfile(profile, agencyId) {
 const policy=agencyAvailability(profile?.details,agencyId);
 if(!policy)return profile;
 const status=enabled=>!policy.seesClients||!enabled?'unavailable':policy.acceptingNewClients?'accepting':policy.waitlistEnabled?'waitlist':'unavailable';
 return {...profile,agencyAvailability:policy,acceptingNewClientsOverride:policy.seesClients&&policy.acceptingNewClients,
  details:{...profile.details,inPersonEnabled:policy.inPerson,virtualEnabled:policy.virtual,waitlistEnabled:policy.seesClients&&policy.waitlistEnabled,
   officeAvailability:status(policy.inPerson),virtualAvailability:status(policy.virtual),schoolAvailability:status(policy.school!==false),
   sessionFormats:[...(policy.inPerson?['In person']:[]),...(policy.virtual?['Virtual']:[])]}};
}
export function scopeProviderRow(row,agencyId,details=row?.service_details) {
 const policy=agencyAvailability(details,agencyId);
 return policy?{...row,sees_clients:policy.seesClients,provider_accepting_new_clients:policy.seesClients&&policy.acceptingNewClients,in_office_available:policy.inPerson}:row;
}
export function agencyFormatAllowed(policy,format,{intake=true}={}) {
 if(!policy)return true;
 return policy.seesClients===true && (!intake||policy.acceptingNewClients===true) && (format==='IN_PERSON'?policy.inPerson===true:format==='VIRTUAL'?policy.virtual===true:policy.school!==false);
}
export function agencyOfficeAllowed(policy,id) {
 return !policy||!Array.isArray(policy.officeIds)||policy.officeIds.includes(Number(id));
}
export function validateAgencyAvailability(body,agencyId) {
 const keys=['seesClients','acceptingNewClients','inPerson','virtual','waitlistEnabled','school'];
 if(keys.some(k=>typeof body[k]!=='boolean'))throw Object.assign(new Error('Availability choices must be true or false'),{status:400});
 const scheduleAgencyId=Number(body.scheduleAgencyId||agencyId);
 if(!Number.isSafeInteger(scheduleAgencyId)||scheduleAgencyId<1)throw Object.assign(new Error('Choose a valid schedule agency'),{status:400});
 if(body.officeIds!=null&&(!Array.isArray(body.officeIds)||body.officeIds.some(id=>!Number.isSafeInteger(id)||id<1)))throw Object.assign(new Error('Choose valid assigned offices'),{status:400});
 return {...Object.fromEntries(keys.map(k=>[k,body[k]])),scheduleAgencyId,officeIds:body.officeIds==null?null:[...new Set(body.officeIds)]};
}
