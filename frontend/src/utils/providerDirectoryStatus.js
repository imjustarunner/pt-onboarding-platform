export function providerFormatStatus(provider,availability={},format='office',schoolId='') {
 const details=provider.details||provider.profile?.details||{};
 const school=schoolId ? (provider.schools||[]).find(s=>String(s.id)===String(schoolId)) : null;
 const slot=availability[format==='office'?'inPerson':format]||{};
 const open=format==='school'?(schoolId?school?.hasOpenings:provider.schoolOpenings||slot.hasPublishedOpenings):slot.hasPublishedOpenings||slot.nextAvailableAt;
 if(open)return 'accepting';
 const supported=format==='school'?(provider.schools?.length||availability.schools?.length):format==='office'?(provider.office||details.inPersonEnabled||details.locations?.length):details.virtualEnabled||(details.sessionFormats||[]).some(v=>/virtual|telehealth|online/i.test(v));
 const manual=details[`${format}Availability`];
 if(manual==='waitlist' || (details.waitlistEnabled&&supported&&manual!=='unavailable'))return 'waitlist';
 if(provider.acceptingNewClients===false || manual==='unavailable')return 'unavailable';
 if(slot.status)return slot.status;
 if(supported || manual==='accepting')return 'accepting';
 return 'unavailable';
}
export function providerStatuses(provider,availability={},schoolId='') {
 return Object.fromEntries(['office','virtual','school'].map(f=>[f,providerFormatStatus(provider,availability,f,schoolId)]));
}
export function overallProviderStatus(provider,availability={},schoolId='') {
 const statuses=Object.values(providerStatuses(provider,availability,schoolId));
 if(statuses.includes('accepting'))return 'accepting';
 if(statuses.includes('waitlist'))return 'waitlist';
 return provider.acceptingNewClients && !['officeAvailability','virtualAvailability','schoolAvailability'].some(k=>provider.details?.[k]==='unavailable')?'accepting':'unavailable';
}
// School capacity belongs to enrollment, not the public appointment search.
export function officeVirtualProviderStatus(provider,availability={}) {
 const statuses=['office','virtual'].map(format=>providerFormatStatus(provider,availability,format));
 if(statuses.includes('accepting'))return 'accepting';
 return statuses.includes('waitlist')?'waitlist':'unavailable';
}
export function providerPriority(provider,availability={},mode='all',schoolId='') {
 const s=providerStatuses(provider,availability,schoolId);
 if(mode!=='all'||schoolId)return {accepting:0,waitlist:1,unavailable:2}[s[schoolId?'school':mode]];
 if(Object.values(s).every(v=>v==='accepting'))return 0;
 if(s.office==='accepting'||s.virtual==='accepting')return 1;
 if(s.office==='waitlist'||s.virtual==='waitlist')return 2;
 if(s.school==='accepting')return 3;
 if(s.school==='waitlist')return 4;
 return overallProviderStatus(provider,availability)==='accepting'?1:5;
}
export const statusLabel=status=>({accepting:'Accepting new clients',waitlist:'Waitlist',unavailable:'Closed to new clients'}[status]||'Inquire with our team');
