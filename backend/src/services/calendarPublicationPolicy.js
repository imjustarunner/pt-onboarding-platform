import crypto from 'crypto';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { isClientCalendarEvent } from './calendarClientPrivacy.js';
export const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export function calendarWindow(from, to, maxDays = 370) {
  const start = new Date(from), end = new Date(to);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end-start > maxDays*86400000) {
    const error=new Error(`Choose a calendar range of up to ${maxDays} days.`);error.status=400;throw error;
  }
  return {start,end};
}
export function workTitle(event) {
  if (event.is_private) return 'Busy';
  if (isClientCalendarEvent(event)) return 'Client session';
  if (['PERSONAL_EVENT','SCHEDULE_HOLD'].includes(event.kind)) return 'Busy';
  const names={TEAM_MEETING:'Team meeting',HUDDLE:'Huddle',SESSION:'Session',CLINICAL_SESSION:'Clinical session',APPOINTMENT:'Appointment',INDIVIDUAL_SESSION:'Individual session',GROUP_SESSION:'Group session',SUPERVISION:'Supervision',OFFICE:'Office booking',WORK_HOURS:'Work hours',TRAINING:'Training',INDIRECT_SERVICES:'Indirect services',OUTREACH_TRIP:'Outreach trip'};
  const subtypes={GROUP_THERAPY:'Group therapy',TELEHEALTH:'Telehealth session',ASSESSMENT:'Assessment',INDIRECT_SERVICES:'Indirect services',SUPERVISION:'Supervision',MEETING:'Meeting'};
  return subtypes[event.appointment_subtype_code] || subtypes[event.appointment_type_code] || names[event.kind] || 'Work';
}
const escapeText = v => String(v || '').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r/g,'');
function fold(line) {
  const lines=[];let chunk='';
  for(const character of line){if(Buffer.byteLength(chunk+character)>75){lines.push(chunk);chunk=' ';}chunk+=character;}
  lines.push(chunk);return lines.join('\r\n');
}
const stamp = value => new Date(utcMysqlToIso(value)).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export function renderCalendar(name,events) {
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PlotTwist//Private Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${escapeText(name)}`];
  for(const event of events){
    lines.push('BEGIN:VEVENT',`UID:${digest(event.key)}@calendar.plottwisthq.com`,`DTSTAMP:${stamp(event.updatedAt || new Date())}`,`SUMMARY:${escapeText(event.title)}`,'CLASS:PRIVATE');
    if(event.startDate && event.endDate) lines.push(`DTSTART;VALUE=DATE:${event.startDate.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${event.endDate.replace(/-/g,'')}`);
    else lines.push(`DTSTART:${stamp(event.start)}`,`DTEND:${stamp(event.end)}`);
    if(event.calendarStatus)lines.push(`STATUS:${event.calendarStatus==='tentative'?'TENTATIVE':'CONFIRMED'}`);
    if(event.location)lines.push(`LOCATION:${escapeText(event.location)}`);
    if(event.url && /^https:\/\//.test(event.url))lines.push(`URL:${event.url.replace(/[\r\n]/g,'')}`,`DESCRIPTION:${escapeText(`Join: ${event.url}`)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
export function googleEventBody(event) {
  return {summary:event.title,...(event.calendarStatus?{status:event.calendarStatus==='tentative'?'tentative':'confirmed'}:{}),description:event.url?`Join: ${event.url}`:'',location:event.location || '',
    reminders:{useDefault:false,overrides:[]},
    start:event.startDate?{date:event.startDate}:{dateTime:utcMysqlToIso(event.start)},
    end:event.endDate?{date:event.endDate}:{dateTime:utcMysqlToIso(event.end)},
    visibility:'default',extendedProperties:{private:{plotCalendar:'1',eventKey:event.key}}};
}

// Same reservation represented by multiple legacy rows: one mirror, not multiple
// copies. Never collapse different rooms, clients, or overlapping (non-identical) times.
export function uniqueOfficeReservations(rows) {
  const seen = new Set();
  return [...rows].sort((a,b)=>Number(a.id)-Number(b.id)).filter(row => {
    const key = JSON.stringify([row.office_location_id,row.room_id,utcMysqlToIso(row.start_at),utcMysqlToIso(row.end_at),row.client_id || null,row.clinical_session_id || null,row.appointment_type_code || null,row.appointment_subtype_code || null]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function publicationOwner(agencyId, env = process.env) {
  let owners = {};
  if (env.CALENDAR_PUBLICATION_OWNERS) {
    try { owners = JSON.parse(env.CALENDAR_PUBLICATION_OWNERS); }
    catch { throw new Error('CALENDAR_PUBLICATION_OWNERS must be an agency-id to Workspace mailbox JSON object.'); }
  }
  const owner = owners[String(agencyId)] || env.CALENDAR_PUBLICATION_OWNER || env.GOOGLE_WORKSPACE_IMPERSONATE_USER || env.GMAIL_IMPERSONATE_USER;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(owner || ''))) throw new Error('Configure a Workspace calendar owner before creating shared calendars.');
  return String(owner).trim().toLowerCase();
}
