import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

export function providerAbsenceStatement(context) {
  // Only the newest sender's own statement; quoted history is not a new absence.
  const body = String(context.latestInbound?.body || '').split(/\n\s*(?:On .+wrote:|From:|>|CONFIDENTIAL)/i)[0].replace(/\bI['’]m\b/g, 'I am').replace(/\s+/g, ' ');
  return body.match(/\bI\s+(?:will not|won['’]t|cannot|can['’]t)\s+be\s+(?:at|in|available)\b[^.!?]*/i)?.[0]
    || body.match(/\bI\s+(?:will be|am going to be|am)\s+(?:out|absent|unavailable)\b[^.!?]*/i)?.[0]
    || body.match(/\bI\s+am\s+unable to\b[^.!?]*/i)?.[0] || null;
}
export function absenceDate(statement, receivedAt, timeZone) {
  const explicit = [...new Set(String(statement).match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])];
  if (explicit.length === 1 && Number.isFinite(Date.parse(explicit[0])) && new Date(explicit[0]).toISOString().slice(0,10) === explicit[0]) return explicit[0];
  if (explicit.length || /\b(?:week|through|until|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(statement)) return null;
  const tomorrow = /\btomorrow\b/i.test(statement), today = /\btoday\b/i.test(statement);
  if (today === tomorrow) return null;
  const stamp = new Date(receivedAt);
  if (!Number.isFinite(+stamp)) return null;
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).format(stamp);
  return new Date(Date.parse(`${localDate}T12:00:00Z`) + (tomorrow ? 86400000 : 0)).toISOString().slice(0,10);
}

export async function lookupSupportProviderAbsence(context, dependencies = {}) {
  const statement = providerAbsenceStatement(context);
  if (!statement || !context.agencyId) return null;
  const base = { status: 'unavailable', statement, source: 'Current provider account and school-day assignments', date: null, reviewUrl: null };
  const sender = String(context.latestInbound?.from || (context.latestInbound?.body === context.original?.body ? context.original?.from : '') || '').trim().toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender)) return { ...base, reason: 'sender_identity_unavailable' };
  try {
    const db = dependencies.database || (await import('../config/database.js')).default;
    const [providers] = await db.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name FROM users u
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
      WHERE (LOWER(TRIM(u.email))=? OR LOWER(TRIM(u.work_email))=?)
      AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
      AND (u.role IN ('provider','provider_plus') OR u.has_provider_access=1)`, [context.agencyId,sender,sender]);
    if (providers.length !== 1) return { ...base, status: 'identity_needed', reason: providers.length ? 'ambiguous_provider' : 'provider_not_verified' };
    const provider = providers[0];
    const [[agency]] = await db.execute('SELECT * FROM agencies WHERE id=?', [context.agencyId]);
    if (!agency) return base;
    const timeZone = await (dependencies.resolveAbsenceTimeZone || (async id => (await import('./providerAvailability.service.js')).default.resolveAgencyTimeZone({agencyId:id})))(context.agencyId);
    const date = absenceDate(statement, context.latestInbound.at, timeZone);
    const result = { ...base, status: 'verified_provider', providerId: Number(provider.id), firstName: provider.first_name,
      providerName: [provider.first_name,provider.last_name].filter(Boolean).join(' '), date, timeZone, schools: [], assignedClientCount: null };
    if (!date) return { ...result, reason: 'absence_date_needs_confirmation' };
    const today = new Intl.DateTimeFormat('en-CA', {timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(dependencies.now?.() || new Date());
    if (date < today) return { ...result, reason: 'absence_date_has_passed' };
    const weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(`${date}T12:00:00Z`).getUTCDay()];
    const [schools] = await db.execute(`SELECT DISTINCT a.id,a.name FROM provider_school_assignments psa
      JOIN agencies a ON a.id=psa.school_organization_id
      JOIN organization_affiliations oa ON oa.organization_id=a.id AND oa.agency_id=? AND oa.is_active=1
      WHERE psa.provider_user_id=? AND psa.day_of_week=? AND psa.is_active=1 ORDER BY a.id`, [context.agencyId,provider.id,weekday]);
    const roster = await (dependencies.listAbsenceRoster || (async args => (await import('./cancellationSchoolRoster.service.js')).cancellationSchoolRoster.list(args)))({agencyId:context.agencyId,providerId:Number(provider.id),date});
    let missingFamilyEmailCount = 0;
    for (const clientId of new Set(roster.map(r => Number(r.client_id)))) {
      const contacts = await (dependencies.reviewAbsenceContact || (async id => (await import('./cancellationRecipients.service.js')).cancellationRecipients.review(id, context.agencyId)))(clientId);
      if (!contacts.recipients.some(r => r.email)) missingFamilyEmailCount++;
    }
    const url = new URL(buildPublicAppUrl(agency,'my-schedule'));
    url.search = new URLSearchParams({cancelDay:date,providerId:String(provider.id),agencyId:String(context.agencyId)}).toString();
    return { ...result, schools: schools.map(s=>({id:Number(s.id),name:s.name})), assignedClientCount: new Set(roster.map(r=>Number(r.client_id))).size,
      reviewUrl:url.href, missingFamilyEmailCount, requiresProviderConfirmation:true,
      limitation:'Assigned-day clients are included even without appointments. Contact availability and notification preferences are checked during review and delivery; a link does not prove anyone was notified.' };
  } catch { return { ...base, reason: 'provider_or_roster_lookup_failed' }; }
}

export function providerAbsenceReply(lookup, { body = '' } = {}) {
  if (lookup?.status !== 'verified_provider') return null;
  const currentBody = String(body).split(/\n\s*(?:On .+wrote:|From:|>)/i)[0];
  // Notification updates and requests need the full conversation-aware draft:
  // a fixed cancel-day template cannot tell completed, intended or missing work apart.
  if (/\b(?:notify|notifying|notified|notification|inform|informing|informed)\b/i.test(currentBody)
      || /\b(?:contacted|contacting|emailed|emailing)\b[^.!?\n]{0,80}\b(?:school|families|family|parents?)\b/i.test(currentBody)) return null;
  const emergency = /\b(?:family emergency|urgent family matter|bereavement)\b/i.test(currentBody);
  if (emergency) {
    const acknowledgement = "I'm sorry you're dealing with this. Thank you for letting us know.";
    if (lookup.reason === 'absence_date_has_passed') return `${acknowledgement} Is any follow-up still needed with the school or affected families?`;
    const offer = 'Would you like help notifying the school or your clients’ parents?';
    if (!lookup.reviewUrl) return `${acknowledgement} ${offer}${lookup.date ? '' : ' Please confirm which day you’ll be out.'}`;
    return `${acknowledgement} ${offer}\n\nIf helpful, you can also use this link for ${lookup.date}:\n${lookup.reviewUrl}\n\nSign in, review the recipients and messages, then confirm.${lookup.missingFamilyEmailCount ? ' Some families do not have an email address available for these notices and will need separate follow-up.' : ''}`;
  }
  const greeting = `Thanks for letting us know, ${lookup.firstName}.`;
  if (!lookup.reviewUrl) return lookup.reason === 'absence_date_has_passed'
    ? `${greeting} Were your school and affected families notified about your absence on ${lookup.date}? Please let us know if any follow-up is still needed.`
    : `${greeting} Please confirm the date you’ll be out so we can provide the right cancel-day link. Please also make sure your school and affected families know about the change.`;
  return `${greeting} Please use this cancel-day link for ${lookup.date} to review and notify your school and affected families:\n\n${lookup.reviewUrl}\n\nSign in, review the recipients and messages, then confirm. ${lookup.missingFamilyEmailCount ? 'Some assigned families do not yet have an email address available for these notices. Please contact those families directly and let us know if you need help updating their details.' : 'If anyone is missing or you run into a problem, please reply so we can help.'}`;
}
