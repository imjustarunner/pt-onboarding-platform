import { eventType, themedFamilyCalendarEvent } from './familyCommandCenter';

const hex = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : null;
export function calendarEventColor(event, mode = 'activity', members = []) {
  const member = members.find(m => String(m.user_id) === String(event.memberId));
  const personColor = hex(member?.color) || hex(event.color);
  const activityColor = hex(event.metadata?.color) || (event.metadata?.eventType ? eventType(event.metadata.eventType).color : null);
  return (mode === 'person' ? personColor || activityColor : activityColor || personColor)
    || (event.work ? '#376c9c' : event.source === 'Google' ? '#287652' : '#6552a8');
}

// Keep text dark and readable even when someone chooses a very pale or bright color.
export function calendarEventStyle(event, mode, members) {
  const color = calendarEventColor(event, mode, members);
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const blend = (weight, base) => `rgb(${rgb.map(c => Math.round(c * weight + base * (1 - weight))).join(', ')})`;
  return { '--event-color': color, '--event-fill': blend(0.19, 255), '--event-ink': blend(0.42, 15) };
}

export function filterCalendarEvents(events, memberId = 'all', source = 'all') {
  return events.filter(e => {
    // Unassigned plans belong to the whole household, including when filtering for one person.
    const personMatches = memberId === 'all' || e.memberId == null || String(e.memberId) === String(memberId);
    const calendar = e.work ? 'work' : e.source === 'Google' ? 'google' : 'family';
    return personMatches && (source === 'all' || source === calendar);
  });
}

// The household response (including a just-saved entry) must remain visible while
// optional Google/work overlays load, fail, or return an older copy of the event.
export function mergeFamilyCalendarEntries(events, entries, householdId, members = [], timezone = 'America/Denver') {
  const merged=new Map(events.map(e=>[e.key,e]));
  const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  for(const entry of entries){
    if(!['event','status'].includes(entry.kind) || entry.archived_at || !entry.start_at || !entry.end_at)continue;
    const member=members.find(m=>String(m.user_id)===String(entry.member_user_id));
    const event=themedFamilyCalendarEvent({key:`family:${householdId}:${entry.id}`,id:entry.id,title:entry.title,start:entry.start_at,end:entry.end_at,
      memberId:entry.member_user_id,memberName:member?.display_name,color:member?.color,photo:member?.photo_url,
      metadata:entry.metadata,location:entry.metadata?.address || '',
      ...(entry.metadata?.allDay?{startDate:day(entry.start_at),endDate:day(entry.end_at)}:{})});
    merged.set(event.key,event);
  }
  return [...merged.values()];
}
