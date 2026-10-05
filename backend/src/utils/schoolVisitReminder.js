const TZ = 'America/Denver';
const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parts = date => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
}).formatToParts(date).map(p => [p.type, p.value]));
const ymd = p => `${p.year}-${p.month}-${p.day}`;

// One business day before the visit, at 10am Mountain. Catch up during
// business hours if the worker was unavailable, but never after the visit.
export function schoolVisitReminderDue(startAt, now = new Date()) {
  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime()) || start <= now) return false;
  const visit = parts(start), current = parts(now);
  const day = new Date(`${ymd(visit)}T12:00:00Z`);
  do { day.setUTCDate(day.getUTCDate() - 1); } while ([0, 6].includes(day.getUTCDay()));
  const today = new Date(`${ymd(current)}T12:00:00Z`);
  return ![0, 6].includes(today.getUTCDay()) && Number(current.hour) >= 10 && Number(current.hour) < 17 &&
    ymd(current) >= day.toISOString().slice(0, 10);
}

export function schoolVisitReminderDetails(booking, event) {
  if (!event || event.status === 'cancelled') return { hold: 'calendar_cancelled_or_missing' };
  if (event.allDay || !event.startAt || !event.endAt) return { hold: 'calendar_time_missing' };
  const utc = value => value instanceof Date ? value.getTime() : new Date(/[zZ]|[+-]\d\d:\d\d$/.test(String(value)) ? value : String(value).replace(' ', 'T') + 'Z').getTime();
  if (utc(booking.starts_at) !== utc(event.startAt) || utc(booking.ends_at) !== utc(event.endAt)) return { hold: 'calendar_booking_time_conflict' };
  const virtualTitle = /\bvirtual\b/i.test(event.summary || '');
  const inPersonTitle = /\bin[ -]person\b/i.test(event.summary || '');
  if ((booking.modality === 'in_person' && virtualTitle) || (booking.modality === 'virtual' && inPersonTitle)) return { hold: 'calendar_booking_modality_conflict' };
  if (booking.modality === 'virtual') {
    if (!/^https:\/\//i.test(event.meetLink || '')) return { hold: 'virtual_link_missing' };
    return { startAt: event.startAt, detail: `Virtual meeting: ${event.meetLink}`, meetLink: event.meetLink };
  }
  if (booking.modality !== 'in_person' || !String(event.location || '').trim()) return { hold: 'location_missing' };
  if (String(booking.location_text || '').trim() && String(booking.location_text).trim() !== String(event.location).trim()) return { hold: 'calendar_booking_location_conflict' };
  return { startAt: event.startAt, detail: `Location: ${event.location}` };
}

export function schoolVisitReminderBody({ schoolName, startAt, detail, meetLink, changeUrl }) {
  const date = new Date(startAt);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
  const caveat = 'If Rachel has contacted you directly with updated arrangements—including meeting virtually instead of in person—please follow her latest message. This reminder does not change those arrangements.';
  return {
    subject: `Reminder: School check-in with Rachel — ${day}`,
    text: `Hi ${schoolName} team,\n\nA friendly reminder of your school check-in with Rachel on ${day} at ${time}.\n\nMeeting details: ${detail}\n\n${caveat}\n\n${changeUrl ? `Need a change? Request a different time, virtual visit, or cancellation: ${changeUrl}\nYour appointment stays as arranged until Rachel confirms the change.\n\n` : ''}We look forward to connecting with you!\nITSCO Schools team\nQuestions? Reply to schools@itsco.health.`,
    html: `<div style="font:16px/1.6 Arial,Helvetica,sans-serif;color:#263c33;max-width:640px;margin:auto;">
      <p style="color:#367552;font-size:12px;letter-spacing:2px;font-weight:bold;">ITSCO · SCHOOL CHECK-IN</p>
      <h1 style="color:#145a3d;font-size:28px;line-height:1.25;">Your check-in with Rachel</h1>
      <p>Hi ${esc(schoolName)} team,</p><p>A friendly reminder of your upcoming school check-in with Rachel.</p>
      <div style="padding:20px;background:#f0f6f2;border-radius:12px;margin:20px 0;"><strong>${esc(day)}</strong><br>${esc(time)}<br>${esc(detail)}</div>
      ${meetLink ? `<p><a href="${esc(meetLink)}" style="display:inline-block;padding:12px 20px;background:#145a3d;color:white;border-radius:8px;text-decoration:none;">Join virtual check-in</a></p>` : ''}
      <p>${esc(caveat)}</p>${changeUrl ? `<p><a href="${esc(changeUrl)}" style="display:inline-block;padding:12px 20px;background:#145a3d;color:white;border-radius:8px;text-decoration:none;">Request a change</a></p><p style="font-size:14px;">Request a different time, a virtual visit, or cancellation. Your appointment stays as arranged until Rachel confirms the change.</p>` : ''}<p>We look forward to connecting with you!</p><p><strong>ITSCO Schools team</strong><br>Questions? Reply to <a href="mailto:schools@itsco.health">schools@itsco.health</a>.</p></div>`
  };
}
