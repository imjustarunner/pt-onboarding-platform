import pool from '../config/database.js';
import { loadSessionPolicy } from './sessionSecurity.service.js';
import { sessionSecurityState } from '../utils/sessionSecurityPolicy.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';

const fail = (message, status = 403) => Object.assign(new Error(message), { status });
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const clean = value => String(value || '').replace(/[^a-zA-Z0-9 _.:/-]/g, '').slice(0, 100);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// Security evidence is session-scoped, not tenant-scoped. Restrict this feature
// to guardians with exactly one active tenant and recheck before each delivery.
export async function verifyWatchScope(watch, db = pool) {
  const [[target]] = await db.execute('SELECT id,first_name,last_name,role,status,is_active,is_archived FROM users WHERE id=?', [watch.target_user_id]);
  const [[observer]] = await db.execute('SELECT id,role,email,work_email,status,is_active,is_archived FROM users WHERE id=?', [watch.observer_user_id]);
  if (!target || target.role !== 'client_guardian' || Number(target.is_active ?? 1) !== 1 || Number(target.is_archived || 0)
      || !observer || !['super_admin','admin'].includes(observer.role) || Number(observer.is_active ?? 1) !== 1 || Number(observer.is_archived || 0)
      || [target.status,observer.status].some(s => ['SUSPENDED','ARCHIVED','TERMINATED','INACTIVE'].includes(String(s).toUpperCase()))) throw fail('Active guardian and authorized audit administrator accounts are required.');
  const [memberships] = await db.execute('SELECT agency_id FROM user_agencies WHERE user_id=? AND COALESCE(is_active,1)=1', [target.id]);
  if (memberships.length !== 1 || Number(memberships[0].agency_id) !== Number(watch.agency_id)) throw fail('This session watch requires a guardian account scoped to this agency alone.');
  const [links] = await db.execute(`SELECT DISTINCT c.agency_id FROM client_guardians cg JOIN clients c ON c.id=cg.client_id
    WHERE cg.guardian_user_id=? AND cg.access_enabled=1`, [target.id]);
  if (links.length !== 1 || Number(links[0].agency_id) !== Number(watch.agency_id)) throw fail('Guardian relationships must be scoped to this agency alone.');
  if (observer.role !== 'super_admin') {
    const [[member]] = await db.execute('SELECT agency_id FROM user_agencies WHERE user_id=? AND agency_id=? AND COALESCE(is_active,1)=1', [observer.id, watch.agency_id]);
    if (!member) throw fail('Agency audit access is required.');
  }
  const [aliases] = await db.execute('SELECT email FROM user_login_emails WHERE user_id=? AND agency_id=?', [observer.id, watch.agency_id]);
  const addresses = [observer.email, observer.work_email, ...aliases.map(row => row.email)].filter(Boolean).map(s => s.toLowerCase());
  if (!addresses.includes(String(watch.recipient_email).toLowerCase())) throw fail('Send audit alerts only to an email address saved on your own account.');
  const [[sender]] = await db.execute('SELECT id,agency_id,is_active,from_email FROM email_sender_identities WHERE id=?', [watch.sender_identity_id]);
  if (!sender || Number(sender.agency_id) !== Number(watch.agency_id) || Number(sender.is_active) !== 1) throw fail('Select an active sender belonging to this agency.');
  return { target, observer, sender };
}

export async function createPortalActivityWatch(actor, input, { db = pool, now = new Date() } = {}) {
  if (!['super_admin','admin'].includes(actor?.role)) throw fail('Audit administrator access is required.');
  const watch = { agency_id: Number(input.agencyId), target_user_id: Number(input.targetUserId), observer_user_id: Number(actor.id),
    sender_identity_id: Number(input.senderIdentityId), recipient_email: String(input.recipientEmail || '').trim().toLowerCase() };
  const requestKey = String(input.requestKey || '');
  if (!watch.agency_id || !watch.target_user_id || !watch.sender_identity_id || !/^[a-zA-Z0-9_-]{8,64}$/.test(requestKey)) throw fail('Agency, guardian, sender and an idempotency key are required.', 400);
  const since = input.notBefore ? new Date(input.notBefore) : now;
  if (!Number.isFinite(+since) || +since > +now || +now - +since > 24 * 3600000) throw fail('The watch start must be within the past 24 hours.', 400);
  const timezone = String(input.timezone || 'America/Denver');
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { throw fail('Invalid timezone.',400); }
  await verifyWatchScope(watch, db);
  const [prior] = await db.execute('SELECT * FROM portal_activity_watches WHERE observer_user_id=? AND request_key=?', [actor.id, requestKey]);
  if (prior[0]) {
    if (Number(prior[0].agency_id) !== watch.agency_id || Number(prior[0].target_user_id) !== watch.target_user_id
        || prior[0].recipient_email !== watch.recipient_email || Number(prior[0].sender_identity_id) !== watch.sender_identity_id) throw fail('That request key already belongs to a different watch.',409);
    return prior[0];
  }
  try {
    const [result] = await db.execute(`INSERT INTO portal_activity_watches
      (agency_id,target_user_id,observer_user_id,recipient_email,sender_identity_id,request_key,not_before,timezone)
      VALUES (?,?,?,?,?,?,?,?)`, [watch.agency_id,watch.target_user_id,actor.id,watch.recipient_email,watch.sender_identity_id,requestKey,since,timezone]);
    const [[saved]] = await db.execute('SELECT * FROM portal_activity_watches WHERE id=?',[result.insertId]);
    return saved;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw fail('An active watch already exists for this account. Review it before creating another.',409);
    throw error;
  }
}

export function portalSection(route = '') {
  if (/heartbeat|session-activity|session-lock-config|app-version|\/presence\b/.test(route)) return null;
  if (/guardian-billing|insurance|payments|invoices|billing/.test(route)) return 'Billing and insurance';
  if (/notification|reminder|communication-preference/.test(route)) return 'Notification preferences';
  if (/messages|threads|emails|chat/.test(route)) return 'Messages';
  if (/appointments|book-session|availability|booking/.test(route)) return 'Appointments';
  if (/documents|files|download|intake|waiver/.test(route)) return 'Documents and forms';
  if (/clinical|treatment|safety-plan|progress|plan-rating|checkin/.test(route)) return 'Care information';
  if (/help|support-ticket/.test(route)) return 'Support';
  if (/account|profile|demographics|password/.test(route)) return 'Account settings';
  if (/\/auth\//.test(route)) return 'Account access';
  if (/guardian-portal/.test(route)) return 'Portal overview';
  return null;
}

export function summarizePortalEvidence(events, activities = []) {
  const sections = {}, timeline = [], seen = new Set();
  for (const row of events.slice(0, 5000)) {
    if (seen.has(row.request_id)) continue;
    seen.add(row.request_id);
    const section = portalSection(row.route);
    if (!section) continue;
    const status = Number(row.status_code);
    const outcome = status >= 400 ? (status === 401 || status === 403 ? 'Access denied' : 'Request failed')
      : row.outcome === 'interrupted' ? 'Request interrupted'
      : row.action === 'download_link_issued' ? 'File link issued'
      : row.action === 'file_response' ? 'File response sent'
      : row.method === 'GET' || row.method === 'HEAD' ? 'Data requested' : 'Action request succeeded';
    sections[section] = (sections[section] || 0) + 1;
    timeline.push({ at: row.occurred_at, section, outcome });
  }
  const actions = activities.slice(0, 100).map(row => ({ at: row.created_at, action: clean(row.action_type) }));
  return { sections, timeline: timeline.slice(-40), actions, recordedRequests: seen.size,
    truncated: events.length > 5000 || activities.length > 100 || timeline.length > 40,
    limitation: 'These are recorded portal requests and actions. A data request may happen automatically when a page opens; it does not prove every displayed item was read. No screen, keystroke, message body, or clinical content is included.' };
}

export function watchEmail(watch, target, kind, report = null) {
  const name = `${target.first_name || ''} ${target.last_name || ''}`.trim() || `Account ${target.id}`;
  const format = value => new Date(value).toLocaleString('en-US', { timeZone: watch.timezone, dateStyle:'medium', timeStyle:'long' });
  const lines = kind === 'login'
    ? [`${name} signed in to AuricWell.`, `Sign-in: ${format(watch.login_at)}`, 'This is your requested one-session alert. A second email will follow when this session signs out or times out.']
    : [`${name}'s AuricWell session has ended.`, `Sign-in: ${format(watch.login_at)}`, `Session end: ${format(watch.ended_at)}`, `End type: ${watch.end_reason}`,
      '', 'Recorded portal activity:', ...Object.entries(report.sections).map(([section,count]) => `${section}: ${count} request${count === 1 ? '' : 's'}`),
      ...(!Object.keys(report.sections).length ? ['No section activity was recorded for this session.'] : []), '',
      ...report.timeline.map(row => `${format(row.at)} — ${row.section}: ${row.outcome}`),
      ...report.actions.map(row => `${format(row.at)} — Recorded action: ${row.action}`), '', report.limitation,
      ...(report.truncated ? ['The email shows a bounded activity timeline; the complete underlying audit remains in Audit Center.'] : []),
      'This one-session watch is complete and will not send alerts for later sessions.'];
  lines.push('', `Audit reference: portal watch #${watch.id}; account #${target.id}; agency #${watch.agency_id}.`);
  const subject = kind === 'login' ? `AuricWell sign-in: ${name}` : `AuricWell session activity: ${name}`;
  return { subject, text: lines.join('\n'), html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:24px;color:#18354b"><p>AuricWell · Portal activity</p><h2>${escape(subject)}</h2>${lines.map(line=>`<p>${escape(line)}</p>`).join('')}</div>` };
}

export async function processPortalActivityWatch(id, { db = pool, verify = verifyWatchScope, policy = loadSessionPolicy, send = sendNotificationEmail, now = () => new Date() } = {}) {
  const connection = await db.getConnection();
  let acquired = false;
  try {
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?,0) AS acquired', [`portal_activity_watch:${id}`]);
    acquired = Number(lock?.acquired) === 1;
    if (!acquired) return;
    let [[watch]] = await db.execute('SELECT * FROM portal_activity_watches WHERE id=?', [id]);
    if (!watch || !['armed','watching'].includes(watch.status)) return;
    const { target } = await verify(watch, db);
    if (watch.status === 'armed') {
      const [[login]] = await db.execute(`SELECT session_ref,occurred_at FROM security_evidence
        WHERE user_id=? AND phase='completed' AND action='login' AND status_code BETWEEN 200 AND 299
          AND session_ref IS NOT NULL AND occurred_at>=?
          AND JSON_EXTRACT(details,'$.switchedFromUserId') IS NULL
        ORDER BY occurred_at,id LIMIT 1`, [watch.target_user_id,watch.not_before]);
      if (!login) return;
      await db.execute("UPDATE portal_activity_watches SET status='watching',session_ref=?,login_at=? WHERE id=? AND status='armed'", [login.session_ref,login.occurred_at,id]);
      watch = { ...watch, status:'watching', session_ref:login.session_ref, login_at:login.occurred_at };
    }
    const deliver = async (kind, report = null) => {
      const state = `${kind}_state`, receiptColumn = `${kind}_receipt_json`;
      if (watch[state] === 'sent') return true;
      // A crash after transport acceptance is ambiguous: never blindly resend.
      if (watch[state] !== 'pending') throw fail('DELIVERY_REQUIRES_REVIEW',503);
      await db.execute(`UPDATE portal_activity_watches SET ${state}='sending' WHERE id=? AND ${state}='pending'`,[id]);
      const email = watchEmail(watch,target,kind,report);
      const receipt = await send({ agencyId:watch.agency_id,userId:watch.observer_user_id,generatedByUserId:watch.observer_user_id,
        to:watch.recipient_email,senderIdentityId:watch.sender_identity_id,triggerKey:`portal_activity_${kind}`,
        templateType:`portal_activity_${kind}`,source:'auto',...email });
      const accepted = !!receipt?.id && !receipt.redirected && !receipt.queued && !receipt.skipped;
      await db.execute(`UPDATE portal_activity_watches SET ${state}=?,${receiptColumn}=? WHERE id=?`,
        [accepted ? 'sent' : 'attention',JSON.stringify({ id:receipt?.id || null,communicationId:receipt?.communicationId || null,reason:receipt?.reason || null,redirected:!!receipt?.redirected }),id]);
      if (!accepted) throw fail('DELIVERY_REQUIRES_REVIEW',503);
      watch[state] = 'sent';
      return true;
    };
    await deliver('login');
    const [[session]] = await db.execute('SELECT * FROM auth_session_security WHERE user_id=? AND session_ref=? LIMIT 1',[watch.target_user_id,watch.session_ref]);
    if (!session) throw fail('SESSION_EVIDENCE_MISSING',503);
    const state = sessionSecurityState(session, await policy(target), +now());
    if (state.phase !== 'expired') return;
    const endedAt = session.revoked_at || new Date(state.expiresAt);
    // Let completed response evidence settle before collecting the report.
    if (+now() - +new Date(endedAt) < 10000) return;
    const endReason = session.revoked_at && session.end_reason !== 'Session timed out'
      ? String(session.end_reason || 'Session revoked') : 'Session timed out (no explicit sign-out recorded)';
    const [events] = await db.execute(`SELECT request_id,occurred_at,route,method,action,outcome,status_code FROM security_evidence
      WHERE user_id=? AND session_ref=? AND phase='completed' AND occurred_at>=? AND occurred_at<=?
      ORDER BY occurred_at,id LIMIT 5001`, [watch.target_user_id,watch.session_ref,watch.login_at,endedAt]);
    const [activities] = await db.execute(`SELECT created_at,action_type FROM user_activity_log WHERE user_id=? AND agency_id=?
      AND SHA2(session_id,256)=? AND created_at>=? AND created_at<=? ORDER BY created_at,id LIMIT 101`,
    [watch.target_user_id,watch.agency_id,watch.session_ref,watch.login_at,endedAt]);
    const report = summarizePortalEvidence(events,activities);
    await db.execute('UPDATE portal_activity_watches SET ended_at=?,end_reason=?,report_json=? WHERE id=?',[endedAt,endReason,JSON.stringify(report),id]);
    watch = { ...watch, ended_at:endedAt, end_reason:endReason };
    await deliver('summary',report);
    await db.execute("UPDATE portal_activity_watches SET status='completed' WHERE id=?",[id]);
  } catch (error) {
    if (acquired) await db.execute("UPDATE portal_activity_watches SET status='attention',error_code=? WHERE id=? AND status IN ('armed','watching')",[clean(error.code || error.message || 'WATCH_FAILED'),id]);
    throw error;
  } finally {
    try { if (acquired) await connection.execute('SELECT RELEASE_LOCK(?)',[`portal_activity_watch:${id}`]); }
    finally { connection.release(); }
  }
}

export async function runPortalActivityWatches({ db = pool, process = processPortalActivityWatch } = {}) {
  const [rows] = await db.execute("SELECT id FROM portal_activity_watches WHERE status IN ('armed','watching') ORDER BY updated_at,id LIMIT 50");
  for (const row of rows) {
    try { await process(row.id,{db}); }
    catch (error) { console.warn('[portal activity watch]',row.id,error.code || 'REVIEW_REQUIRED'); }
    finally { await db.execute("UPDATE portal_activity_watches SET updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status IN ('armed','watching')",[row.id]); }
  }
  return { checked:rows.length };
}

export const publicWatch = row => ({ id:row.id,agencyId:row.agency_id,targetUserId:row.target_user_id,
  recipientEmail:row.recipient_email,status:row.status,notBefore:row.not_before,loginAt:row.login_at,endedAt:row.ended_at,
  endReason:row.end_reason,loginState:row.login_state,summaryState:row.summary_state,
  loginReceipt:parse(row.login_receipt_json),summaryReceipt:parse(row.summary_receipt_json),report:parse(row.report_json),errorCode:row.error_code });
