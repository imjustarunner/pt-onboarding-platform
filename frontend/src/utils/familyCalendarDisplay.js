import { eventType } from './familyCommandCenter';

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
