export function isFamilyHost(host = typeof window === 'undefined' ? '' : window.location.hostname) {
  return String(host).toLowerCase() === 'qv.app.mentalrange.org';
}
import { familyEventTypes, familyEventCategories, familyStatuses, legacyFamilyStatuses } from './familyEventCatalog';
export { familyEventTypes, familyEventCategories, familyStatuses };
export const normalizeFamilyStatus = status => legacyFamilyStatuses[status] || status;
export const familyCalendarEntries = entries => entries.filter(e => ['event','status'].includes(e.kind));
const eventTypesById = new Map(familyEventTypes.map(type => [type.id,type]));
export const eventType = id => eventTypesById.get(id) || familyEventTypes[0];
export const eventArtworkChoices = id => {
  const type = eventType(id);
  return type.artworks || [{ id: 'default', label: type.label, artwork: type.artwork }];
};
export function eventArtwork(metadata = {}) {
  const m = metadata || {};
  return m.artwork || eventArtworkChoices(m.artworkType || m.eventType).find(a => a.id === m.artworkVariant)?.artwork || eventType(m.artworkType || m.eventType).artwork;
}
export function memberStatus(member, entries, work, now = new Date()) {
  const active = entries.filter(e => ['event', 'status'].includes(e.kind) && (!e.member_user_id || e.member_user_id === member.user_id) && new Date(e.start_at) <= now && new Date(e.end_at) > now);
  const manual = active.filter(e => e.kind === 'status').sort((a,b) => Number(!!b.member_user_id)-Number(!!a.member_user_id) || new Date(b.created_at || b.start_at)-new Date(a.created_at || a.start_at) || Number(b.id || 0)-Number(a.id || 0))[0];
  if (manual) return normalizeFamilyStatus(manual.title);
  const event = active.filter(e=>eventType(e.metadata?.eventType).status !== 'Unknown / No Status').sort((a,b) => new Date(b.start_at) - new Date(a.start_at))[0];
  if (event) return eventType(event.metadata.eventType).status;
  if (work.some(e => e.provider_id === member.user_id && new Date(e.start_at) <= now && new Date(e.end_at) > now)) return 'Work';
  return 'Unknown / No Status';
}

export function entryType(entry) {
  if (entry?.kind !== 'status') return eventType(entry?.metadata?.eventType);
  const label = normalizeFamilyStatus(entry.title);
  const themes = { School:'school', Daycare:'school', Work:'work', 'Working From Home':'work', 'At Practice':'sports-practice', 'At Game':'sports-game-competition', 'At Activity':'club', 'At Appointment':'appointment', Driving:'drive', 'On the Way':'travel', Pickup:'pickup', 'Drop-Off':'drop-off', Traveling:'travel', Vacation:'vacation', Sick:'sick-day', Resting:'self-care', 'With Friends':'friends', 'With Family':'family', Babysitter:'babysitter', 'Getting Ready':'travel-preparation', Busy:'reminder', 'Do Not Disturb':'self-care', 'Running Late':'drive' };
  const base=eventType(themes[label] || 'family');
  return {...base,label,icon:label==='Sleeping'?'🌙':label==='Awake'?'☀':base.icon};
}
const normalizeEventTitle = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const searchGroups = familyEventCategories.map(group=>({...group,entries:group.ids.map(id=>{
  const type=eventType(id);
  return {type,search:normalizeEventTitle([type.label,group.label,...(type.keywords || []),...(type.artworks || []).map(a=>a.label)].join(' '))};
})}));
export function searchFamilyEventGroups(query = '', category = '') {
  const words=normalizeEventTitle(query).split(' ').filter(Boolean);
  return searchGroups.filter(g=>!category || g.label===category).map(({entries,...group})=>({...group,types:entries.filter(e=>words.every(w=>e.search.includes(w))).map(e=>e.type)})).filter(g=>g.types.length);
}

// Match whole words/phrases so “park” cannot match “parking”. Specific activities
// outrank generic pickup/travel/family labels; an explicit selection always wins.
const aliases = { 'scheels-shopping': ['scheels', 'scheel s'], airport: ['airport', 'flight', 'arrivals', 'departures'], zoo: ['zoo'], pickup: ['pick up', 'pickup'], 'drop-off': ['drop off'], 'school-pickup': ['school pickup', 'school pick up'], 'grocery-shopping': ['groceries', 'grocery shopping'], 'np-rocky-mountain': ['rocky mountain national park'], 'np-yellowstone': ['yellowstone'], camping: ['camping', 'campsite'], 'dog-walk': ['walk the dog', 'dog walk'] };
const genericTypes = new Set(['family', 'pickup', 'drop-off', 'travel', 'trip', 'drive', 'park', 'work', 'appointment', 'practice', 'sports-practice', 'sports-game-competition', 'competition', 'lesson', 'class']);
const titleMatches=familyEventTypes.flatMap(type=>[type.id.replaceAll('-', ' '),...type.label.split(/\s+\/\s+/),...(aliases[type.id] || [])].map(normalizeEventTitle).filter(phrase=>phrase.length>=3).map(phrase=>({type,phrase:` ${phrase} `,score:(genericTypes.has(type.id)?0:100)+phrase.length})));
export function inferFamilyEventType(title) {
  const text = ` ${normalizeEventTitle(title)} `;
  let best = null, bestScore = 0;
  for (const match of titleMatches) {
    if(match.score>bestScore && text.includes(match.phrase)){best=match.type;bestScore=match.score;}
  }
  return best || eventType('family');
}
export function familyEventMetadata(title, metadata = {}) {
  const m = metadata || {};
  if (m.eventType && m.autoTheme !== true) return m;
  const type = inferFamilyEventType(title);
  return { ...m, eventType: type.id, color: type.color };
}
export function themedFamilyCalendarEvent(event) {
  if (event.work) return event;
  return { ...event, metadata: familyEventMetadata(event.title, event.metadata) };
}
