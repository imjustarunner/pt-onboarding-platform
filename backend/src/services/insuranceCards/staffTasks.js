import { latestIntakeCommunicationChoices, INTAKE_COMMUNICATION_VERSION } from '../intakeCommunicationChoices.service.js';
import crypto from 'node:crypto';
import pool from '../../config/database.js';
import { billingWorkspaceAgencies } from '../claimMdWorkspace.service.js';
import { requireBillingStaff } from '../familyLedger/policy.js';
import { billingError, positiveId, auditBilling } from '../familyBillingPolicy.service.js';
import { isActiveBillingAgency } from '../managedBillingAccess.service.js';
import { cardContext, refreshCardFollowup } from './service.js';
import { reminderOrdinal } from './policy.js';
import { guardianReminderPreferences } from '../guardianAppointments.service.js';
import { requireReadySender } from '../familyLedger/senders.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';
import { buildPublicAppUrl } from '../../utils/publicPortalUrl.js';

const uncertainStatuses = ['sending', 'unknown', 'held'];
const activeEmail = profile => profile.email && ![0,false,'0'].includes(profile.user_is_active) && ![1,true,'1'].includes(profile.user_is_archived) && ['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(profile.user_status).toUpperCase());
const depsFor = overrides => ({ db: pool, agencies: billingWorkspaceAgencies, authorize: requireBillingStaff,
  activeAgency: isActiveBillingAgency, context: cardContext, refresh: refreshCardFollowup,
  choices: latestIntakeCommunicationChoices, preferences: guardianReminderPreferences, sender: requireReadySender, send: sendEmailFromIdentity,
  audit: auditBilling, now: new Date(), ...overrides });

function insuranceEmailAllowed(choice,userId) {
  return choice?.version === INTAKE_COMMUNICATION_VERSION && Number(choice.guardianUserId) === Number(userId)
    && choice.signatureAccepted === true && !!choice.signedAt && choice.emailPreference === 'all';
}

export function emailTaskStatus(progress, deliveries, now = new Date()) {
  const ordinal = reminderOrdinal(progress.first_requested_at, now);
  if (progress.state !== 'missing') return { ordinal, blocked: 'Card follow-up is paused, complete, or awaiting office review.' };
  if (!progress.email_enabled) return { ordinal, blocked: 'The account holder has paused card emails.' };
  if (progress.snoozed_until && new Date(progress.snoozed_until) > now) return { ordinal, blocked: 'This request is paused by the office.' };
  if (deliveries.some(d => uncertainStatuses.includes(d.status))) return { ordinal, blocked: 'A previous delivery needs investigation before another email can be sent.' };
  if (ordinal == null || deliveries.some(d => Number(d.ordinal) === ordinal)) return { ordinal, blocked: 'This follow-up has already been handled. The next review will appear when due.' };
  // Never send a catch-up reminder immediately after a late review.
  if (deliveries.some(d => d.status === 'sent' && now - new Date(d.created_at) < 3 * 86400000)) return { ordinal, blocked: 'Allow at least three days after the last email before following up.' };
  return { ordinal, blocked: null };
}

async function authorize(user, agencyId, deps, db = deps.db) {
  await deps.authorize(user, positiveId(agencyId), db);
  if (!await deps.activeAgency(agencyId, db)) throw billingError(403, 'Billing follow-up is available only for active billing agencies.');
}

export async function listStaffCardTasks(user, query = {}, overrides = {}) {
  const deps = depsFor(overrides), organizations = await deps.agencies(user);
  const agencyId = query.agencyId ? positiveId(query.agencyId) : null;
  if (agencyId && !organizations.some(a => Number(a.id) === agencyId)) throw billingError(403, 'Billing access is required for this agency.');
  const agencies = organizations.filter(a => !agencyId || Number(a.id) === agencyId);
  if (!agencies.length) return { rows: [], nextAfter: null };
  const after = Number(query.after || 0);
  if (!Number.isSafeInteger(after) || after < 0) throw billingError(400, 'Invalid task cursor.');
  const ids = agencies.map(a => a.id), clientId = query.clientId ? positiveId(query.clientId) : null;
  const [profiles] = await deps.db.execute(`SELECT p.id,p.agency_id FROM guardian_insurance_profiles p
    WHERE p.agency_id IN (${ids.map(() => '?').join(',')}) AND p.id>?
    ${clientId ? 'AND (p.client_id=? OR EXISTS(SELECT 1 FROM guardian_insurance_clients g WHERE g.profile_id=p.id AND g.agency_id=p.agency_id AND g.client_id=?))' : ''}
    ORDER BY p.id LIMIT 101`, [...ids, after, ...(clientId ? [clientId, clientId] : [])]);
  const rows = [];
  for (const profile of profiles.slice(0, 100)) {
    try {
      const context = await deps.context({ agencyId: profile.agency_id, profileId: profile.id, staff: true }, deps.db);
      if (clientId && !context.clients.some(c => Number(c.id) === clientId)) continue;
      const p = await deps.refresh(context, deps.db);
      if (!['missing', 'help', 'review'].includes(p.state)) continue;
      const [deliveries] = await deps.db.execute('SELECT id,status,ordinal,created_at FROM insurance_card_deliveries WHERE profile_id=? AND cycle_hash=? ORDER BY id DESC', [profile.id, p.cycle_hash]);
      const [[personal]] = await deps.db.execute('SELECT snoozed_until FROM insurance_card_staff_reminders WHERE profile_id=? AND cycle_hash=? AND user_id=?', [profile.id, p.cycle_hash, user.id]);
      const email = emailTaskStatus(p, deliveries, deps.now);
      if (!activeEmail(context.profile)) email.blocked = 'An active portal account with an email address is required.';
      if (!email.blocked) for (const client of context.clients) {
        const preferences = await deps.preferences({userId:context.profile.guardian_user_id,clientId:client.id});
        const choice=await deps.choices(client.id,profile.agency_id);
        if (!insuranceEmailAllowed(choice,context.profile.guardian_user_id) || preferences.channels?.email === false || preferences.optionalRemindersEnabled === false) email.blocked = 'The account holder’s communication preferences do not allow this email.';
      }
      const snoozed = personal?.snoozed_until && new Date(personal.snoozed_until) > deps.now;
      rows.push({ profileId: profile.id, agencyId: profile.agency_id, organization: agencies.find(a => a.id === Number(profile.agency_id)),
        cycle: p.cycle_hash, state: p.state, ownerName: [context.profile.first_name, context.profile.last_name].filter(Boolean).join(' '),
        clients: context.clients.map(c => ({ id: c.id, name: c.full_name || c.initials })),
        missingSlots: p.missingSlots, slots: p.slots, delivery: deliveries[0] || null,
        emailBlocked: email.blocked, snoozedUntil: snoozed ? personal.snoozed_until : null, reminderDue: !email.blocked && !snoozed });
    } catch (e) { if (e.status !== 404) throw e; }
  }
  return { rows, nextAfter: profiles.length > 100 ? profiles[99].id : null };
}

async function emailPreview(input, deps, db, { locked = false } = {}) {
  const context = await deps.context({ ...input, staff: true }, db);
  const progress = await deps.refresh(context, db, { locked });
  const [deliveries] = await db.execute('SELECT status,ordinal,created_at FROM insurance_card_deliveries WHERE profile_id=? AND cycle_hash=?', [input.profileId, progress.cycle_hash]);
  const status = emailTaskStatus(progress, deliveries, deps.now);
  if (input.cycle !== progress.cycle_hash) throw billingError(409, 'Insurance changed. Refresh the task before reviewing this email.');
  const profile = context.profile;
  let blocked = status.blocked;
  if (!activeEmail(profile)) blocked = 'An active portal account with an email address is required.';
  for (const client of context.clients) {
    const preferences = await deps.preferences({ userId: profile.guardian_user_id, clientId: client.id });
    const choice=await deps.choices(client.id,input.agencyId);
    if (!insuranceEmailAllowed(choice,profile.guardian_user_id) || preferences.channels?.email === false || preferences.optionalRemindersEnabled === false) blocked = 'The account holder’s communication preferences do not allow this email.';
  }
  let sender;
  try { sender = await deps.sender(input.agencyId, 'billing'); }
  catch (e) { if (e.status !== 409) throw e; blocked = e.message; }
  const url = buildPublicAppUrl({ slug: profile.slug, portal_url: profile.portal_url }, `guardian?panel=payment_methods&insuranceProfile=${profile.id}`);
  const subject = 'Please complete your insurance information';
  const text = `Your care team needs an insurance card image. Sign in to see which side is missing and upload a photo or PDF.\n\n${url}\n\nPlease use the secure upload instead of attaching cards to an email reply. If you do not have the card or need help, choose “I need help” in the portal. You can pause these emails there.`;
  const snapshot = { to: profile.email || '', from: sender?.from_email || '', subject, text, senderId: sender?.id || null,
    cycle: progress.cycle_hash, ordinal: status.ordinal, missingSlots: progress.missingSlots, guardianUserId: profile.guardian_user_id };
  const reviewHash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return { ...snapshot, reviewHash, blocked, canSend: !blocked };
}

export async function previewCardEmail(user, input, overrides = {}) {
  const deps = depsFor(overrides);
  await authorize(user, input.agencyId, deps);
  return emailPreview(input, deps, deps.db);
}

export async function snoozeCardEmail(user, input, overrides = {}) {
  const deps = depsFor(overrides);
  await authorize(user, input.agencyId, deps);
  const hours = Number(input.hours);
  if (![1, 24].includes(hours)) throw billingError(400, 'Choose send later (one hour) or snooze for 24 hours.');
  const context = await deps.context({ ...input, staff: true }, deps.db), p = await deps.refresh(context, deps.db);
  if (p.cycle_hash !== input.cycle) throw billingError(409, 'Insurance changed. Refresh this task.');
  const until = new Date(deps.now.getTime() + hours * 3600000);
  await deps.db.execute(`INSERT INTO insurance_card_staff_reminders(profile_id,cycle_hash,user_id,snoozed_until) VALUES(?,?,?,?)
    ON DUPLICATE KEY UPDATE snoozed_until=VALUES(snoozed_until)`, [input.profileId, input.cycle, user.id, until]);
  await deps.audit({ agencyId: input.agencyId, userId: user.id, action: 'insurance_email_staff_snoozed', objectId: input.profileId });
  return { snoozedUntil: until };
}

export async function sendReviewedCardEmail(user, input, overrides = {}) {
  const deps = depsFor(overrides);
  await authorize(user, input.agencyId, deps);
  if (!/^[a-f0-9]{64}$/.test(input.reviewHash || '')) throw billingError(400, 'Preview this email before sending.');
  const db = await deps.db.getConnection();
  let locked = false, transaction = false, deliveryId;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [`insurance-card:${input.profileId}`]);
    locked = Number(lock.acquired) === 1;
    if (!locked) throw billingError(409, 'Another biller is handling this request. Refresh shortly.');
    await db.beginTransaction(); transaction = true;
    await db.execute('SELECT id FROM guardian_insurance_profiles WHERE id=? AND agency_id=? FOR UPDATE', [input.profileId, input.agencyId]);
    await authorize(user, input.agencyId, deps, db);
    const preview = await emailPreview(input, deps, db, { locked: true });
    if (!preview.canSend) throw billingError(409, preview.blocked);
    if (preview.reviewHash !== input.reviewHash) throw billingError(409, 'The email or insurance request changed. Review the current email before sending.');
    const [claim] = await db.execute(`INSERT IGNORE INTO insurance_card_deliveries(profile_id,cycle_hash,ordinal,status,reviewed_by_user_id,reviewed_content_hash)
      VALUES(?,?,?,'sending',?,?)`, [input.profileId, preview.cycle, preview.ordinal, user.id, preview.reviewHash]);
    if (!claim.affectedRows) throw billingError(409, 'This follow-up has already been handled.');
    deliveryId = claim.insertId;
    await deps.audit({ agencyId: input.agencyId, userId: user.id, action: 'insurance_email_reviewed_for_send', objectId: deliveryId }, db);
    await db.commit(); transaction = false;
    const result = await deps.send({ senderIdentityId: preview.senderId, replyToOverride: preview.from, to: preview.to,
      userId: preview.guardianUserId, subject: preview.subject, text: preview.text, templateType: 'insurance_card_followup',
      source: 'manual', generatedByUserId: user.id, usedFallbackSender: false });
    const sent = !!result?.id && !result.queued && !result.skipped && !result.blocked && !result.redirected;
    await db.execute('UPDATE insurance_card_deliveries SET status=?,communication_id=? WHERE id=?', [sent ? 'sent' : 'held', result?.communicationId || null, deliveryId]);
    return { status: sent ? 'sent' : 'held' };
  } catch (e) {
    if (transaction) await db.rollback();
    // Once dispatch might have begun, neither a refresh nor another biller may retry blindly.
    if (deliveryId && !transaction) {
      await db.execute("UPDATE insurance_card_deliveries SET status='unknown' WHERE id=? AND status='sending'", [deliveryId]);
      throw billingError(409, 'Delivery could not be confirmed. Investigate the email history before sending another reminder.');
    }
    throw e;
  } finally {
    try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [`insurance-card:${input.profileId}`]); }
    finally { db.release(); }
  }
}
