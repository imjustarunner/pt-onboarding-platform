import crypto from 'crypto';
export const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export function calendarWindow(from, to, maxDays = 370) {
  const start = new Date(from), end = new Date(to);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end-start > maxDays*86400000) {
    const error=new Error(`Choose a calendar range of up to ${maxDays} days.`);error.status=400;throw error;
  }
  return {start,end};
}
export function workTitle(event) {
  if (event.is_private || event.kind === 'PERSONAL_EVENT') return 'Busy';
  const names={TEAM_MEETING:'Team meeting',HUDDLE:'Huddle',SESSION:'Session',CLINICAL_SESSION:'Clinical session',APPOINTMENT:'Appointment',INDIVIDUAL_SESSION:'Individual session',GROUP_SESSION:'Group session',SUPERVISION:'Supervision',OFFICE:'Office booking',WORK_HOURS:'Work hours'};
  const subtypes={GROUP_THERAPY:'Group therapy',TELEHEALTH:'Telehealth session',ASSESSMENT:'Assessment',INDIRECT_SERVICES:'Indirect services',SUPERVISION:'Supervision',MEETING:'Meeting'};
  const title=subtypes[event.appointment_subtype_code] || subtypes[event.appointment_type_code] || names[event.kind] || (event.client_id ? 'Session' : 'Work');
  // Only the dedicated initials field is eligible; titles/notes/full_name never leave the app.
  const rawInitials=String(event.client_initials || '').trim();
  const initials=/^[\p{L}. -]{1,10}$/u.test(rawInitials) && rawInitials.replace(/[^\p{L}]/gu,'').length<=4 ? rawInitials : rawInitials.split(/\s+/).map(part=>part.match(/\p{L}/u)?.[0] || '').slice(0,3).join('.');
  return event.client_id && initials ? `${title} · ${initials}` : title;
}
const escapeText = v => String(v || '').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r/g,'');
function fold(line) {
  const lines=[];let chunk='';
  for(const character of line){if(Buffer.byteLength(chunk+character)>75){lines.push(chunk);chunk=' ';}chunk+=character;}
  lines.push(chunk);return lines.join('\r\n');
}
const stamp = value => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export function renderCalendar(name,events) {
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PlotTwist//Private Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${escapeText(name)}`];
  for(const event of events){
    lines.push('BEGIN:VEVENT',`UID:${digest(event.key)}@calendar.plottwisthq.com`,`DTSTAMP:${stamp(event.updatedAt || new Date())}`,`SUMMARY:${escapeText(event.title)}`);
    if(event.startDate && event.endDate) lines.push(`DTSTART;VALUE=DATE:${event.startDate.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${event.endDate.replace(/-/g,'')}`);
    else lines.push(`DTSTART:${stamp(event.start)}`,`DTEND:${stamp(event.end)}`);
    if(event.location)lines.push(`LOCATION:${escapeText(event.location)}`);
    if(event.url && /^https:\/\//.test(event.url))lines.push(`URL:${event.url.replace(/[\r\n]/g,'')}`,`DESCRIPTION:${escapeText(`Join: ${event.url}`)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
export function googleEventBody(event) {
  return {summary:event.title,description:event.url?`Join: ${event.url}`:'',location:event.location || '',
    start:event.startDate?{date:event.startDate}:{dateTime:new Date(event.start).toISOString()},
    end:event.endDate?{date:event.endDate}:{dateTime:new Date(event.end).toISOString()},
    visibility:'default',extendedProperties:{private:{plotCalendar:'1',eventKey:event.key}}};
}
