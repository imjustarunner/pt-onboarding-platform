import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { inferAgencyMailDomain } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { enrollmentMailBrand, renderPortalEmail, escapePortalHtml } from './portalEmailBranding.service.js';
import { staffCommunicationKey, STAFF_COMMUNICATION_CHOICES } from '../utils/staffCommunicationChoices.js';
import { exchangeSmsOptedOut } from './exchangeSmsPreference.service.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value || {};
const email = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()) ? String(value).trim().toLowerCase() : null;
const workEmail = user => email(user.work_email) || email(user.email);

export function providerStopEmail({ agency, user, event, admin, enabled, alreadyOff }) {
  const evidence = parse(event.evidence_json);
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Provider';
  const program = evidence.provider === 'notifyre' ? 'all texts through our shared texting account' : `${agency.name}'s staff texting program`;
  const text = `Hi ${name},\n\nYou replied STOP on ${new Date(event.created_at).toISOString()} (UTC). At that time, this stopped ${program} for your phone ending ${String(event.phone).slice(-4)}.\n\nText categories affected: ${enabled.length ? enabled.join('; ') : 'all text categories in this program'}.${alreadyOff.length ? `\nAlready individually turned off: ${alreadyOff.join('; ')}.` : ''}\n\nEmail and in-app messages remain available. To restart texts, reply START to ${evidence.senderNumber}. Individual category choices remain in place after a full STOP. If you have already replied START since then, that later reply may have restored delivery.\n\nYour assigned supervisor, when available, and Administration are copied so they know which communication channels can reach you. Contact ${admin} if you need help.`;
  const brand = enrollmentMailBrand({ agency, domain: admin.split('@')[1], clinicalOverride: false });
  brand.displayName = `${agency.name} Notifications`; brand.replyTo = admin;
  return { subject: `${agency.name}: text notifications stopped — ${name}`, text,
    html: renderPortalEmail({ brand, html: `<h1 style="font-size:24px;line-height:1.3">Your text notifications are stopped</h1>${text.split('\n\n').map(p => `<p>${escapePortalHtml(p).replaceAll('\n','<br>')}</p>`).join('')}` }) };
}

export async function deliverProviderStopNotice(id) {
  const db = await pool.getConnection(), lockName = `provider-stop-notice:${id}`;
  let locked = false, attempted = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [lockName]);
    if (!Number(lock?.acquired)) return;
    locked = true;
    const [[job]] = await db.execute(`SELECT n.*,e.phone,e.evidence_json,e.created_at AS stopped_at FROM provider_sms_stop_notices n
      JOIN sms_permission_events e ON e.id=n.permission_event_id WHERE n.id=? AND n.status='pending' AND n.next_attempt_at<=UTC_TIMESTAMP()`, [id]);
    if (!job) return;
    const [[user]] = await db.execute(`SELECT u.*,p.notification_categories FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      LEFT JOIN user_preferences p ON p.user_id=u.id WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1
      AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.role IN ('provider','provider_plus','intern','intern_plus','supervisor')`, [job.user_id, job.agency_id]);
    const agency = await Agency.findById(job.agency_id);
    if (!user || !agency || parse(agency.feature_flags).qaSandbox?.syntheticOnly === true || /qa-demo/.test(agency.slug || '')) {
      await db.execute("UPDATE provider_sms_stop_notices SET status='skipped',receipt_json=? WHERE id=?", [JSON.stringify({reason:!user?'provider_inactive':'isolated_test_agency'}),id]);
      return;
    }
    const identities = await EmailSenderIdentity.list({ agencyId: job.agency_id, includePlatformDefaults:false, onlyActive:true });
    const sender = identities.find(row => row.identity_key === 'notifications');
    const domain = await inferAgencyMailDomain(job.agency_id);
    const admin = email(domain && `admin@${domain}`), to = workEmail(user);
    if (!sender || !admin || !to) throw new Error('Provider work email, agency admin address or Notifications sender is unavailable');
    const [supervisors] = await db.execute(`SELECT DISTINCT u.work_email,u.email FROM supervisor_assignments s
      JOIN users u ON u.id=s.supervisor_id JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=s.agency_id
      WHERE s.supervisee_id=? AND s.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0`, [user.id, job.agency_id]);
    const cc = [...new Set([admin, ...supervisors.map(workEmail)].filter(address => address && address !== to))];
    const state = parse(user.notification_categories)[staffCommunicationKey(job.agency_id)];
    const categories = STAFF_COMMUNICATION_CHOICES.map(choice => ({ ...choice, on: state?.choices?.[choice.key] === true }));
    if (await exchangeSmsOptedOut({agencyId:job.agency_id,phone:job.phone})) categories.find(c => c.key === 'exchangeMatches').on = false;
    const message = providerStopEmail({ agency, user, event:{...job,created_at:job.stopped_at}, admin,
      enabled:categories.filter(c=>c.on).map(c=>c.label), alreadyOff:state ? categories.filter(c=>!c.on).map(c=>c.label) : [] });
    await db.execute("UPDATE provider_sms_stop_notices SET status='sending',receipt_json=? WHERE id=? AND status='pending'", [JSON.stringify({to,cc,attemptedAt:new Date().toISOString()}),id]);
    attempted = true;
    const result = await sendEmailFromIdentity({ ...message, senderIdentityId:sender.id, to, cc:cc.join(', ') || null,
      userId:user.id, source:'auto', templateType:'provider_sms_stopped', replyToOverride:admin,
      fromDisplayNameOverride:`${agency.name} Notifications`,
      internetMessageIdOverride:`<provider-sms-stop-${job.permission_event_id}-${user.id}@${sender.from_email.split('@')[1]}>` });
    const status = result?.queued || result?.pendingApproval ? 'queued' : result?.blocked || result?.skipped || result?.failed ? 'needs_review' : result?.id || result?.sent ? 'sent' : 'needs_review';
    await db.execute('UPDATE provider_sms_stop_notices SET status=?,receipt_json=? WHERE id=?', [status,JSON.stringify({to,cc,messageId:result?.id||null,communicationId:result?.communicationId||null,reason:result?.reason||null}),id]);
  } catch (error) {
    await db.execute(`UPDATE provider_sms_stop_notices SET status=?,receipt_json=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE) WHERE id=?`,
      [attempted?'needs_review':'pending',JSON.stringify({reason:String(error.code||error.message).slice(0,300),attempted}),id]);
  } finally {
    if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lockName]);
    db.release();
  }
}

export async function processProviderStopNotices() {
  // Only new, marked STOP events participate. Historical opt-outs are not mailed.
  // The event is durable before this worker runs; an email outage cannot undo STOP.
  await pool.execute(`INSERT IGNORE INTO provider_sms_stop_notices (permission_event_id,user_id,agency_id)
    SELECT e.id,u.id,ua.agency_id FROM sms_permission_events e
    JOIN user_agencies ua ON ua.agency_id=CAST(JSON_UNQUOTE(JSON_EXTRACT(e.evidence_json,'$.agencyId')) AS UNSIGNED) AND ua.is_active=1
    JOIN users u ON u.id=ua.user_id AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND u.role IN ('provider','provider_plus','intern','intern_plus','supervisor')
      AND RIGHT(REGEXP_REPLACE(COALESCE(NULLIF(u.personal_phone,''),NULLIF(u.work_phone,''),u.phone_number,''),'[^0-9]',''),10)=RIGHT(e.phone,10)
    LEFT JOIN provider_sms_stop_notices n ON n.permission_event_id=e.id AND n.user_id=u.id
    WHERE e.purpose='suppression' AND e.status='opted_out' AND JSON_EXTRACT(e.evidence_json,'$.providerNoticeRequested')=TRUE
      AND n.id IS NULL ORDER BY e.id LIMIT 100`);
  const [jobs] = await pool.execute("SELECT id FROM provider_sms_stop_notices WHERE status='pending' AND next_attempt_at<=UTC_TIMESTAMP() ORDER BY id LIMIT 20");
  for (const job of jobs) await deliverProviderStopNotice(job.id);
}
