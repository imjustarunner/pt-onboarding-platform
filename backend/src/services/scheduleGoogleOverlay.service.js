// Calendar copies identify their app source explicitly. Never deduplicate by
// title or coincident time: a real external meeting can overlap an app session.
const id = value => String(value || '').trim();
const link = value => { try { const u = new URL(value); return u.protocol === 'https:' && ['calendar.google.com', 'www.google.com'].includes(u.hostname) ? u.href : null; } catch { return null; } };
const appKinds = new Set(['PROVIDER_SCHEDULE_EVENT', 'SUPERVISION_SESSION', 'COMPANY_EVENT_SESSION', 'SKILL_BUILDERS_SESSION']);
export function projectScheduleGoogleOverlay({ events = [], scheduleEvents = [], officeEvents = [], supervisionSessions = [] } = {}) {
  const groups = [scheduleEvents, officeEvents, supervisionSessions];
  const copies = new Map();
  const officeById = new Map(officeEvents.map(row => [id(row.id), row]));
  const supervisionById = new Map(supervisionSessions.map(row => [id(row.id), row]));
  for (const rows of groups) for (const row of rows) {
    const key = id(row.googleEventId || row.google_event_id || row.googleProviderEventId);
    if (key) { if (!copies.has(key)) copies.set(key, []); copies.get(key).push(row); }
  }
  const urls = new Map();
  const external = events.filter(event => {
    const meta = event.extendedProperties?.private || {};
    const matches = copies.get(id(event.id)) || copies.get(id(event.recurringEventId)) || [];
    const office = officeById.get(id(meta.pt_office_event_id));
    const supervision = supervisionById.get(id(meta.pt_supervision_session_id));
    for (const row of [...matches, office, supervision].filter(Boolean)) {
      const url = link(event.htmlLink);
      if (url) urls.set(row, url);
    }
    return !matches.length && !office && !supervision && !appKinds.has(meta.pt_kind)
      && !id(meta.pt_office_event_id) && !id(meta.pt_supervision_session_id);
  }).filter(event => event.status !== 'cancelled');
  const attach = rows => rows.map(row => ({ ...row, ...(urls.has(row) ? { googleCalendarUrl: urls.get(row) } : {}) }));
  return { scheduleEvents: attach(scheduleEvents), officeEvents: attach(officeEvents), supervisionSessions: attach(supervisionSessions), events: external };
}
