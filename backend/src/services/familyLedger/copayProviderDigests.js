import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { attendanceCopaysEnabled, pendingProviderCopays } from './copayAttendance.js';
import { escapePortalHtml as e } from '../portalEmailBranding.service.js';
import { portalActionHtml } from '../clientPortalEmailContent.js';
import { clientEmailContext, sendClientPortalEmail } from '../clientPortalEmail.service.js';

export function buildProviderCopayDigest({ agencyName, firstName, count, date, url }) {
  const intro = `Hi ${firstName || 'there'},`;
  const body = `${count} ${count === 1 ? 'session needs' : 'sessions need'} your attendance confirmation for ${date}. Sign in to review each session and select “Occurred” or “Did not occur.”`;
  const terms = 'Please update attendance on the day of the session so families see the copay on the same day as care. After the session ends, selecting Occurred or saving an authored session draft confirms attendance and can collect the authorized, verified copay. Opening the Note Workspace alone does not. Did not occur starts the missed-appointment flow, with a cancel option, and holds the service copay. Late confirmations go to billing review and do not automatically charge on a later day. You can finish your note separately; your billing team handles payment questions.';
  return { subject: `${agencyName}: confirm today’s completed sessions`,
    text: `${intro}\n\n${body}\n\n${terms}\n\nReview sessions:\n${url}`,
    html: `<p>${e(intro)}</p><h2>Confirm your sessions</h2><p>${e(body)}</p>${portalActionHtml('Review sessions',url)}<p>${e(terms)}</p>`, linkUrl: url };
}
export function digestDate(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get = type => parts.find(p=>p.type===type)?.value;
  // One evening summary, after appointments have ended. Never hourly nagging.
  return Number(get('hour')) >= 20 ? `${get('year')}-${get('month')}-${get('day')}` : null;
}
export async function sendProviderCopayDigests({ agencyId, now = new Date() }) {
  if (!await attendanceCopaysEnabled(agencyId)) return [];
  const [[agency]] = await pool.execute('SELECT name,slug,timezone FROM agencies WHERE id=?',[agencyId]);
  const timezone = agency?.timezone || 'America/Denver', date = digestDate(now,timezone);
  if (!date) return [];
  const [providers] = await clinicalPool.execute("SELECT DISTINCT provider_user_id FROM clinical_sessions WHERE agency_id=? AND scheduled_start_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY) AND provider_user_id IS NOT NULL AND encounter_status IN ('scheduled','completed')",[agencyId]);
  const results = [];
  for (const row of providers) {
    const providerUserId = row.provider_user_id;
    let pending;
    try { pending = await pendingProviderCopays({agencyId,providerUserId,serviceDate:date}); }
    catch (err) { if (err.status===403) continue; throw err; }
    const unanswered = pending.sessions.filter(session=>!session.documentationRequired);
    if (!unanswered.length) continue;
    const [future] = await clinicalPool.execute("SELECT scheduled_start_at FROM clinical_sessions WHERE agency_id=? AND provider_user_id=? AND scheduled_end_at>UTC_TIMESTAMP() AND scheduled_start_at<DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY) AND encounter_status='scheduled'",[agencyId,providerUserId]);
    if (future.some(s=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.scheduled_start_at))===date)) continue;
    const [[user]] = await pool.execute('SELECT first_name,email FROM users WHERE id=?',[providerUserId]);
    if (!user?.email) continue;
    const [inserted] = await pool.execute('INSERT IGNORE INTO family_copay_provider_digests (agency_id,provider_user_id,service_date) VALUES (?,?,?)',[agencyId,providerUserId,date]);
    if (!inserted.affectedRows) continue;
    try {
      const context = await clientEmailContext({agencyId,clinical:true});
      const url = context.url(`my-schedule?copayDate=${encodeURIComponent(date)}&agencyId=${agencyId}`);
      const message = buildProviderCopayDigest({agencyName:agency.name,firstName:user.first_name,count:unanswered.length,date,url});
      const sent = await sendClientPortalEmail({agencyId,context,to:user.email,...message,templateType:'provider_copay_attendance',source:'copay_attendance_digest',triggeringUserId:providerUserId});
      const delivered = !!(sent?.id || sent?.messageId || sent?.externalMessageId) && !sent?.skipped && !sent?.queued;
      await pool.execute('UPDATE family_copay_provider_digests SET status=?,communication_id=? WHERE agency_id=? AND provider_user_id=? AND service_date=?',[delivered?'sent':'review',sent?.communicationId||null,agencyId,providerUserId,date]);
      results.push({providerUserId,status:delivered?'sent':'review'});
    } catch {
      // Ambiguous mail acceptance requires review, never an automatic duplicate.
      await pool.execute("UPDATE family_copay_provider_digests SET status='review' WHERE agency_id=? AND provider_user_id=? AND service_date=?",[agencyId,providerUserId,date]);
      results.push({providerUserId,status:'review'});
    }
  }
  return results;
}
