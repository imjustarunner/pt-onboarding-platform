export const appointmentDays = [['weekdays','Weekdays'],['weekends','Weekends'],['Mon','Monday'],['Tue','Tuesday'],['Wed','Wednesday'],['Thu','Thursday'],['Fri','Friday'],['Sat','Saturday'],['Sun','Sunday']];
export function hasTimePreference(filters={}) { return Boolean(filters.day || filters.timeFrom || filters.timeTo); }
export function slotMatchesTime(slot, filters={}, timeZone='America/Denver') {
 if (!hasTimePreference(filters)) return true;
 const date=new Date(slot.startAt); if(!Number.isFinite(date.getTime())) return false;
 let parts; try {parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);} catch {return false;}
 const get=type=>parts.find(p=>p.type===type)?.value;
 const day=get('weekday'),time=`${get('hour')}:${get('minute')}`;
 const dayMatches=!filters.day || (filters.day==='weekdays'?!['Sat','Sun'].includes(day):filters.day==='weekends'?['Sat','Sun'].includes(day):filters.day===day);
 return dayMatches && (!filters.timeFrom || time>=filters.timeFrom) && (!filters.timeTo || time<=filters.timeTo);
}
export function matchingProviderTags(provider, search='', specialty='', limit=3) {
 const all=[...new Set([...(provider.specialties||[]),...(provider.modalities||[]),...(provider.populations||[]),...(provider.subjects||[])])];
 const q=search.trim().toLowerCase(),matches=all.filter(tag=>tag===specialty||(q&&tag.toLowerCase().includes(q)));
 return [...new Set([...matches,...(provider.specialties||[])])].slice(0,Math.max(limit,matches.length));
}
export const normalizeServiceState=value=>String(value||'').trim().replace(/^Colorado$/i,'CO').toUpperCase();
// Virtual service coverage is explicit; an office address alone does not authorize another state.
export function publicVirtualStates(provider={}) {
 const configured=provider.virtualStates||provider.details?.virtualStates;
 return Array.isArray(configured)?configured.map(normalizeServiceState):(!provider.agencySlug||['itsco','nlu'].includes(provider.agencySlug)?['CO']:[]);
}
