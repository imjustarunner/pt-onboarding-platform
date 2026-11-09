import { createHash } from 'node:crypto';
import { addDaysYmd } from './scheduleRecurrence.js';
import { utcDateToZonedYmd, utcMysqlToIso } from './zonedWallTime.util.js';

const normalized = value => String(value || '').trim().toLowerCase();
const email = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized(value)) ? normalized(value) : null;
const realSchool = school => !/(\btest\b|\bdemo\b|fake|hogwarts|durmstrang|detention.academy|analytical.engine|onboarding.test|qr.self.serve|self.serve.school)/i.test(`${school.name || ''} ${school.slug || ''}`);
const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
function closureDates(event, today) {
  const first = utcDateToZonedYmd(utcMysqlToIso(event.starts_at), event.timezone || 'America/Denver');
  const end = new Date(utcMysqlToIso(event.ends_at));
  const last = utcDateToZonedYmd(new Date(end.getTime() - 1000), event.timezone || 'America/Denver');
  if (!first || !last) return [];
  const dates = [];
  for (let date = first < today ? today : first; date <= last && date < addDaysYmd(today, 5); date = addDaysYmd(date, 1)) dates.push(date);
  return dates;
}
export function previousWeekday(date) {
  let previous = addDaysYmd(date, -1);
  while ([0, 6].includes(weekday(previous))) previous = addDaysYmd(previous, -1);
  return previous;
}

/** Only the current delivery window is eligible; never replay old notices. */
export function closureNoticePhase(date, timeZone, now) {
  const today = utcDateToZonedYmd(now, timeZone);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (today === date && hour >= 6 && hour < 12) return 'morning';
  if (today === previousWeekday(date) && hour >= 15) return 'advance';
  return null;
}

/** Keep both school and district evidence instead of choosing one closure. */
export function schoolClosurePlans({ events, schools, assignments, now = new Date() }) {
  const days = new Map();
  for (const event of events) {
    if (!Number(event.is_active) || !['scheduled', 'rescheduled'].includes(event.school_event_status)
      || !['school_holiday', 'school_day_off', 'school_sessions_prohibited'].includes(event.event_type)) continue;
    const timeZone = event.timezone || 'America/Denver';
    const today = utcDateToZonedYmd(now, timeZone);
    const dates = closureDates(event, today);
    const targets = schools.filter(school => realSchool(school) && Number(school.agency_id) === Number(event.agency_id)
      && (event.organization_id == null
        ? !!normalized(event.district_name) && normalized(school.district_name) === normalized(event.district_name)
        : Number(school.id) === Number(event.organization_id)));
    for (const date of dates) {
      // School assignments use weekdays. Multi-day breaks must not produce weekend mail.
      if ([0, 6].includes(weekday(date))) continue;
      const phase = closureNoticePhase(date, timeZone, now);
      if (!phase) continue;
      for (const school of targets) {
        const district = String(school.district_name || event.district_name || '').trim() || 'District not recorded';
        const key = `${event.agency_id}:${normalized(district)}:${date}:${phase}`;
        if (!days.has(key)) days.set(key, { key, agencyId: Number(event.agency_id), district, date, phase, timeZone, schools: new Map() });
        const group = days.get(key);
        if (!group.schools.has(Number(school.id))) group.schools.set(Number(school.id), { id: Number(school.id), name: school.name, sources: [], providers: [] });
        const affected = group.schools.get(Number(school.id));
        if (!affected.sources.some(source => source.id === Number(event.id))) affected.sources.push({ id: Number(event.id), scope: event.organization_id == null ? 'district' : 'school', title: event.title, description: event.description, type: event.event_type });
      }
    }
  }
  const plans = [];
  for (const group of days.values()) {
    const affected = [...group.schools.values()].sort((a, b) => a.name.localeCompare(b.name));
    const providers = new Map();
    for (const assignment of assignments) {
      if (Number(assignment.agency_id) !== group.agencyId || !group.schools.has(Number(assignment.school_id))) continue;
      const school = group.schools.get(Number(assignment.school_id));
      const id = Number(assignment.provider_id);
      if (!school.providers.some(provider => provider.id === id)) school.providers.push({ id, name: assignment.provider_name });
      if (!providers.has(id)) providers.set(id, { id, name: assignment.provider_name, to: email(assignment.work_email) || email(assignment.email), schools: new Map() });
      providers.get(id).schools.set(school.id, school);
    }
    plans.push({ ...group, key: `${group.key}:team`, audience: 'team', schools: affected, userId: null, to: null });
    for (const provider of providers.values()) plans.push({ ...group, key: `${group.key}:provider:${provider.id}`, audience: 'provider', schools: [...provider.schools.values()].sort((a, b) => a.name.localeCompare(b.name)), userId: provider.id, providerName: provider.name, to: provider.to });
  }
  return plans;
}

export function closureNoticeMessage(plan, schoolsEmail) {
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${plan.date}T12:00:00Z`));
  const reminder = plan.phase === 'morning' ? 'Today’s reminder' : 'Advance notice';
  const districtClosure = plan.schools.some(school => school.sources.some(source => source.scope === 'district'));
  const schoolLines = plan.schools.flatMap(school => [
    `- ${school.name}`,
    ...school.sources.map(source => `  ${source.scope === 'district' ? `${plan.district} district calendar` : 'School calendar'}: ${source.title}${source.description ? ` — ${source.description}` : ''}${source.type === 'school_sessions_prohibited' ? ' (school sessions prohibited)' : ''}`),
    ...(plan.audience === 'team' ? [`  Assigned providers: ${school.providers.map(provider => provider.name).join(', ') || 'None recorded'}`] : [])
  ]);
  const text = [
    plan.audience === 'provider' ? `Hello ${plan.providerName},` : 'Hello Schools team,', '',
    `${reminder}: ${plan.district} — ${date}.`,
    districtClosure ? `${plan.district} has a district-wide no-school or school-session restriction on the calendar. All ${plan.audience === 'provider' ? 'your assigned' : 'affiliated'} schools in that district are likely impacted.` : 'The following school-specific no-school or school-session restrictions are recorded on the calendar.',
    '', plan.audience === 'provider' ? 'Your affected assigned schools:' : 'Affected schools and assigned providers:', ...schoolLines, '',
    'Where both district and school dates are listed, both calendar entries are shown above. Check the calendar and coordinate any affected school sessions; this email does not cancel appointments or notify families.',
    '', `Reply to ${schoolsEmail} with questions or calendar corrections.`
  ].join('\n');
  return { subject: `${reminder}: ${plan.district} school closures — ${date}`, text };
}

export const closureNoticeMessageId = (key, schoolsEmail) => `<school-closure-${createHash('sha256').update(key).digest('hex').slice(0, 40)}@${schoolsEmail.split('@')[1]}>`;
