import {missedNote,completeMissedSessionDocumentation} from '../nonbillableNoteCompletion.service.js';
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { billingError, positiveId, auditBilling, BILLING_TERMS_VERSION } from '../familyBillingPolicy.service.js';
import { decryptFamilyBilling, encryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { readClientInsurance } from '../clientInsurance.service.js';
import { hasMedicaidCoverage } from '../../utils/insurancePaymentPolicy.js';
import { getReadiness, assertReady } from './readiness.js';
import { assertCoverageCollectionSafe } from '../coverageVerification.service.js';
import { assertServiceTermsCurrent } from './serviceRates.js';
import { activeCard, payAllocation } from './payments.js';
import { createReceivable, allocationsFor, findReceivable, sourcePayload } from './receivables.js';
import { transaction, parseJson, dateOnly } from './policy.js';
import { isGuardianTestAccountId } from '../guardianTestAccess.service.js';

// Both switches are explicit launch controls. Deploying code never enables charges.
export async function attendanceCopaysEnabled(agencyId, db = pool) {
  const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0', [agencyId]);
  const flags = parseJson(agency?.feature_flags, {});
  return flags.familyBillingAutomationEnabled === true && flags.attendanceCopaysEnabled === true;
}
export function assertSessionEnded(session, now = new Date()) {
  const start = new Date(session.scheduled_start_at), end = new Date(session.scheduled_end_at);
  if (!session.scheduled_start_at || !session.scheduled_end_at || !Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end > now)
    throw billingError(409, 'Confirm attendance after the scheduled session has ended.');
}
export function assertOccurrence(session, now = new Date()) {
  assertSessionEnded(session, now);
  if (!['scheduled', 'completed'].includes(session.encounter_status)) throw billingError(409, 'This session was canceled or did not occur. Ask the office to review a correction.');
  if (session.claim_blocked_reason) throw billingError(409, 'This session requires billing review before collecting a copay.');
}
export function assertCopayCard(card, now = new Date()) {
  const year = Number(card?.card_exp_year), month = Number(card?.card_exp_month);
  if (!card?.stripe_setup_intent_id || card.legacyRequiresReview || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || Date.UTC(year, month, 1) <= +now)
    throw billingError(409, 'A current verified payment card is required.');
}
export function copayServiceDate(session, timezone = 'UTC') {
  return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(session.scheduled_start_at));
}
export function chooseCopayTerm(terms, session, timezone = 'UTC') {
  const code = session.effective_service_code || session.service_code, date = copayServiceDate(session, timezone);
  const matching = terms.filter(t => Number(t.clientId) === Number(session.client_id) && t.serviceCode === code && t.paymentBasis === 'copay' && t.priceBasis === 'visit' && Number(t.units) === 1 && date >= t.effectiveFrom && date <= t.effectiveThrough && Number.isSafeInteger(Number(t.totalCents)) && Number(t.totalCents) > 0);
  if (matching.length !== 1) throw billingError(409, 'One current signed service agreement with a verified copay is required.');
  return matching[0];
}
async function sessionFor(agencyId, sessionId, clinical = clinicalPool) {
  const [[session]] = await clinical.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=?', [positiveId(sessionId), positiveId(agencyId)]);
  if (!session) throw billingError(404, 'Session not found.');
  return session;
}
export async function requireAttendanceProvider(agencyId, providerUserId, db = pool) {
  const [[membership]] = await db.execute("SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id JOIN agencies a ON a.id=ua.agency_id WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant','admin','agency_admin','super_admin','superadmin') AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND LOWER(u.status) IN ('active','active_employee') AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP())", [positiveId(providerUserId), positiveId(agencyId)]);
  if (!membership) throw billingError(403, 'Active provider access to this organization is required.');
}
// Exact amount comes from signed, staff-verified benefit terms, never a browser,
// gross fee schedule, eligibility guess, or claim billed charge.
export async function attendanceCopayTerms(session, db = pool) {
  const agencyId = session.agency_id, clientId = session.client_id;
  const [[agency]]=await db.execute('SELECT timezone FROM agencies WHERE id=?',[agencyId]);
  const timezone=agency?.timezone||'America/Denver';
  const insurance = await readClientInsurance(clientId, agencyId, db);
  if (hasMedicaidCoverage(insurance) || insurance?.secondary || !insurance?.primary?.memberId) throw billingError(409, 'This coverage requires billing review rather than an attendance copay.');
  const readiness = await getReadiness(agencyId, clientId, db);
  assertReady(readiness, insurance);
  if (readiness.collection_policy !== 'verified_copay' || !readiness.automatic_from || new Date(session.scheduled_start_at) < new Date(readiness.automatic_from)) throw billingError(409, 'Automatic collection is not enabled for this visit.');
  await assertCoverageCollectionSafe(agencyId, clientId, db);
  const [payers] = await db.execute("SELECT guardian_user_id FROM client_billing_payers WHERE agency_id=? AND client_id=? AND status='active' AND consent_id IS NOT NULL", [agencyId, clientId]);
  if (payers.length !== 1) throw billingError(409, 'One authorized automatic payer is required.');
  const userId = Number(payers[0].guardian_user_id);
  if (await isGuardianTestAccountId(userId)) throw billingError(409, 'Demo accounts cannot be charged.');
  const { payer, card } = await activeCard(agencyId, clientId, userId, db);
  assertCopayCard(card);
  const [[consent]] = await db.execute("SELECT id FROM guardian_billing_consents WHERE id=? AND agency_id=? AND guardian_user_id=? AND client_id=? AND payment_card_id=? AND purpose='recurring' AND terms_version=? AND revoked_at IS NULL", [payer.consent_id, agencyId, userId, clientId, card.id, BILLING_TERMS_VERSION]);
  if (!consent) throw billingError(409, 'Sign the current same-day copay authorization before enabling this workflow.');
  const [tasks] = await db.execute("SELECT id,signed_evidence_encrypted FROM family_billing_tasks WHERE agency_id=? AND guardian_user_id=? AND status='completed' AND signed_evidence_encrypted IS NOT NULL ORDER BY completed_at DESC,id DESC LIMIT 100", [agencyId, userId]);
  let selected = null;
  for (const task of tasks) {
    const evidence = decryptFamilyBilling(task.signed_evidence_encrypted, `billing-task:${agencyId}:${userId}`);
    try { selected = { term: chooseCopayTerm(evidence.waiver?.serviceTerms || [], session, timezone), taskId: task.id }; break; }
    catch (e) { if (e.status !== 409) throw e; }
  }
  if (!selected) throw billingError(409, 'A signed agreement with the verified copay for this service is required.');
  await assertServiceTermsCurrent([selected.term], agencyId, db);
  if (selected.term.totalCents > Number(payer.recurring_limit_cents || 0)) throw billingError(409, 'The verified copay exceeds the payer’s authorization.');
  return { ...selected, payerUserId: userId, serviceDate:copayServiceDate(session,timezone), timezone };
}
export async function recordCopayAttendance({ agencyId, sessionId, providerUserId, occurred, noteId = null, source = 'provider' }) {
  if (typeof occurred !== 'boolean' || !['provider','signed_note','reviewed_note'].includes(source)) throw billingError(400, 'Choose whether this session occurred.');
  if (!await attendanceCopaysEnabled(agencyId)) throw billingError(409, 'Attendance copays are not enabled for this organization.');
  await requireAttendanceProvider(agencyId, providerUserId);
  const session = await sessionFor(agencyId, sessionId);
  if (Number(session.provider_user_id) !== Number(providerUserId)) throw billingError(403, 'Only the assigned provider can confirm this session.');
  assertSessionEnded(session);
  if (occurred) assertOccurrence(session);
  else {
    const [completed] = await clinicalPool.execute('SELECT id FROM clinical_notes WHERE clinical_session_id=? AND agency_id=? AND provider_signed_at IS NOT NULL AND is_billable=1 AND is_deleted=0 LIMIT 1',[session.id,agencyId]);
    if (completed.length) throw billingError(409,'A completed service note already exists. Review the conflicting documentation before changing attendance.');
  }
  if (source === 'reviewed_note') {
    const [[note]]=await clinicalPool.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? AND clinical_session_id=? AND created_by_user_id=? AND is_deleted=0',[positiveId(noteId),agencyId,session.id,providerUserId]);
    if(occurred||!note||!missedNote(note)||(!note.provider_signed_at&&note.content_review_source!=='provider_review'))throw billingError(409,'Complete the missed appointment note review first.');
  }
  if (source === 'signed_note') {
    const [[note]] = await clinicalPool.execute('SELECT id FROM clinical_notes WHERE id=? AND clinical_session_id=? AND agency_id=? AND client_id=? AND provider_signed_by_user_id=? AND provider_signed_at IS NOT NULL AND is_billable=1 AND is_deleted=0', [positiveId(noteId), session.id, agencyId, session.client_id, providerUserId]);
    if (!note || !occurred) throw billingError(409, 'A signed completed service note is required.');
  }
  // Validate before recording a new occurred decision. A negative answer must
  // still be allowed if coverage or card eligibility has changed.
  if (occurred) await attendanceCopayTerms(session);
  const attendance = occurred ? 'occurred' : 'did_not_occur';
  const result = await transaction(async db => {
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [session.client_id, agencyId]);
    const [[previous]] = await db.execute('SELECT * FROM family_copay_attendance WHERE agency_id=? AND clinical_session_id=? FOR UPDATE', [agencyId, session.id]);
    if (previous?.attendance === attendance) return { alreadyRecorded: true, attendance, receivableId: previous.receivable_id };
    if (previous?.attendance === 'did_not_occur') throw billingError(409, 'This session was marked as not occurring. Ask billing to review the correction before any charge.');
    if (!occurred) {
      // A claim balance can precede this workflow. Find it even when no earlier
      // attendance decision has attached its receivable, and hold the same debt.
      const ids=new Set(previous?.receivable_id?[Number(previous.receivable_id)]:[]);
      const [visitBalances]=await db.execute("SELECT id FROM family_receivables WHERE agency_id=? AND client_id=? AND source_type='clinical_copay' AND source_key=? FOR UPDATE",[agencyId,session.client_id,String(session.id)]);
      for(const row of visitBalances)ids.add(Number(row.id));
      const [claims]=await clinicalPool.execute('SELECT id,parent_claim_id FROM clinical_claims WHERE agency_id=? AND clinical_session_id=? AND client_id=?',[agencyId,session.id,session.client_id]);
      for(const claim of claims){
        const [balances]=await db.execute("SELECT id FROM family_receivables WHERE agency_id=? AND client_id=? AND source_type='claim_responsibility' AND source_key=? FOR UPDATE",[agencyId,session.client_id,String(claim.parent_claim_id||claim.id)]);
        for(const row of balances)ids.add(Number(row.id));
      }
      for(const receivableId of ids){
        const [payments] = await db.execute("SELECT p.id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? AND p.status NOT IN ('failed','cancelled') LIMIT 1", [receivableId]);
        if (payments.length) throw billingError(409, 'A payment has already started. Billing must reconcile it before changing attendance.');
        await db.execute("UPDATE family_receivables SET status='review',hold_reason='attendance_not_occurred' WHERE id=? AND agency_id=? AND status<>'void'", [receivableId, agencyId]);
      }
    }
    await db.execute('INSERT INTO family_copay_attendance (agency_id,clinical_session_id,client_id,provider_user_id,attendance,decision_source,clinical_note_id,decided_by_user_id,collection_status) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE attendance=VALUES(attendance),decision_source=VALUES(decision_source),clinical_note_id=VALUES(clinical_note_id),decided_by_user_id=VALUES(decided_by_user_id),decided_at=CURRENT_TIMESTAMP(6),collection_status=VALUES(collection_status)', [agencyId, session.id, session.client_id, providerUserId, attendance, source, noteId, providerUserId, occurred ? 'pending' : 'suppressed']);
    await db.execute('INSERT INTO family_copay_attendance_events (agency_id,clinical_session_id,actor_user_id,attendance,decision_source) VALUES (?,?,?,?,?)', [agencyId, session.id, providerUserId, attendance, source]);
    await auditBilling({ agencyId, clientId: session.client_id, userId: providerUserId, action: occurred ? 'session_occurred_confirmed' : 'session_not_occurred_confirmed', objectId: session.id }, db);
    return { attendance };
  });
  if (!occurred) {
    const documented=await completeMissedSessionDocumentation({session,providerUserId,noteId});
    return { ...result, ...documented, charged: false };
  }
  // Encounter attendance is independent of documentation completion. This does
  // not create/sign a clinical note or submit an insurance claim.
  await clinicalPool.execute("UPDATE clinical_sessions SET encounter_status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=? AND provider_user_id=? AND encounter_status='scheduled' AND scheduled_end_at<=UTC_TIMESTAMP()", [session.id,agencyId,providerUserId]);
  // A collection error does not undo the provider's attendance or signed note.
  try { return { ...result, collection: await collectAttendanceCopay({ agencyId, sessionId }) }; }
  catch (e) { await pool.execute("UPDATE family_copay_attendance SET collection_status='review' WHERE agency_id=? AND clinical_session_id=? AND attendance='occurred'", [agencyId, sessionId]); return { ...result, collection: { paid: false, needsReview: true } }; }
}
export async function assertSessionAttendanceNotSuppressed({agencyId,clientId,sessionId},db=pool){
  // Serialize against a first negative decision, including when no attendance
  // row exists yet. Existing payment attempts and negative answers cannot cross.
  await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[clientId,agencyId]);
  const [[decision]]=await db.execute('SELECT attendance FROM family_copay_attendance WHERE agency_id=? AND clinical_session_id=? FOR UPDATE',[agencyId,sessionId]);
  if(decision?.attendance==='did_not_occur')throw billingError(409,'This session was marked as not occurring. Billing review is required.');
}
export async function assertAttendanceCopay(receivable, db = pool) {
  const payload = sourcePayload(receivable), sessionId = payload.attendanceSessionId || (receivable.source_type === 'clinical_copay' ? receivable.source_key : null);
  if (!sessionId) return;
  const [[decision]] = await db.execute('SELECT * FROM family_copay_attendance WHERE agency_id=? AND clinical_session_id=? FOR UPDATE', [receivable.agency_id, sessionId]);
  if (decision?.attendance !== 'occurred') throw billingError(409, 'This session has not been confirmed as occurring.');
  const session = await sessionFor(receivable.agency_id, sessionId);
  assertOccurrence(session);
  if (Number(session.client_id) !== Number(receivable.client_id) || Number(session.provider_user_id) !== Number(decision.provider_user_id)) throw billingError(409, 'The session changed. Billing review is required.');
  if (payload.serviceTerm && ((session.effective_service_code || session.service_code) !== payload.serviceTerm.serviceCode || copayServiceDate(session,payload.serviceTimezone||session.source_timezone||'UTC') !== dateOnly(receivable.service_date))) throw billingError(409, 'The session service or date changed. Billing review is required.');
  if (receivable.source_type === 'clinical_copay') {
    const [claims] = await clinicalPool.execute("SELECT c.claim_lifecycle,c.claim_status,EXISTS(SELECT 1 FROM clinical_claim_change_requests cr WHERE cr.agency_id=c.agency_id AND cr.clinical_session_id=c.clinical_session_id) AS changed FROM clinical_claims c WHERE c.agency_id=? AND c.clinical_session_id=? AND c.client_id=? AND c.is_deleted=0",[receivable.agency_id,sessionId,receivable.client_id]);
    if(claims.some(c=>Number(c.changed)||['paid','adjusted','denied','void'].includes(c.claim_lifecycle)||['VOID','VOIDED','CANCELLED','CANCELED'].includes(String(c.claim_status).toUpperCase())))throw billingError(409,'Reconcile the changed or adjudicated claim before collecting its copay.');
  }
}
export async function collectAttendanceCopay({ agencyId, sessionId }) {
  if (!await attendanceCopaysEnabled(agencyId)) return { paid: false, disabled: true };
  const session = await sessionFor(agencyId, sessionId);
  assertOccurrence(session);
  const terms = await attendanceCopayTerms(session);
  const receivable = await transaction(async db => {
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [session.client_id, agencyId]);
    const [[decision]] = await db.execute('SELECT * FROM family_copay_attendance WHERE agency_id=? AND clinical_session_id=? FOR UPDATE', [agencyId, sessionId]);
    if (decision?.attendance !== 'occurred') throw billingError(409, 'Attendance is not confirmed.');
    if (decision.receivable_id) return findReceivable(agencyId, decision.receivable_id, db);
    const [claims] = await clinicalPool.execute("SELECT id,parent_claim_id FROM clinical_claims WHERE agency_id=? AND clinical_session_id=? AND client_id=? AND is_deleted=0 AND claim_lifecycle<>'void'", [agencyId, sessionId, session.client_id]);
    let existing = null;
    for (const claim of claims) {
      const [[row]] = await db.execute("SELECT * FROM family_receivables WHERE agency_id=? AND source_type='claim_responsibility' AND source_key=?", [agencyId, String(claim.parent_claim_id || claim.id)]);
      if (row) { if (existing && Number(existing.id) !== Number(row.id)) throw billingError(409, 'Multiple claim balances need reconciliation.'); existing = row; }
    }
    const row = existing || await createReceivable({ agencyId, clientId: session.client_id, sourceType: 'clinical_copay', sourceKey: String(sessionId), serviceDomain: 'mental_health', serviceDate: terms.serviceDate, serviceLabel: 'Verified visit copay', amountCents: terms.term.totalCents, insuranceReviewed: true, actorUserId: decision.decided_by_user_id, shares: [{ payerUserId: terms.payerUserId, basisPoints: 10000 }], payload: { attendanceSessionId: Number(sessionId), serviceTimezone:terms.timezone, serviceTerm: terms.term, authorizationTaskId: terms.taskId, responsibilityType: 'copay', verificationBasis: 'benefit', serviceCompleted: true } }, db);
    if (existing) {
      const payload=sourcePayload(existing);
      if(payload.responsibilityType!=='copay'||Number(existing.amount_cents)!==Number(terms.term.totalCents)||dateOnly(existing.service_date)!==terms.serviceDate)throw billingError(409,'Existing claim responsibility requires billing review.');
      await db.execute('UPDATE family_receivables SET source_payload=? WHERE id=? AND agency_id=?',[encryptFamilyBilling({...payload,attendanceSessionId:Number(sessionId),serviceTimezone:terms.timezone,serviceTerm:terms.term,authorizationTaskId:terms.taskId},`receivable:${agencyId}:${session.client_id}`),row.id,agencyId]);
    }
    await db.execute('UPDATE family_copay_attendance SET receivable_id=? WHERE agency_id=? AND clinical_session_id=?', [row.id, agencyId, sessionId]);
    return row;
  });
  const allocations = await allocationsFor(receivable.id);
  if (allocations.length !== 1 || Number(allocations[0].payer_user_id) !== terms.payerUserId) throw billingError(409, 'Payer shares require review.');
  const allocation = allocations[0], due = Number(allocation.amount_cents) - Number(allocation.paid_cents);
  if (due <= 0) { await pool.execute("UPDATE family_copay_attendance SET collection_status='paid' WHERE agency_id=? AND clinical_session_id=?", [agencyId, sessionId]); return { paid: true, alreadyPaid: true }; }
  if (Number(allocation.amount_cents) !== Number(terms.term.totalCents)) throw billingError(409, 'The balance differs from the signed copay. Billing review is required.');
  const result = await payAllocation({ agencyId, userId: terms.payerUserId, allocationId: allocation.id, amountCents: due, idempotencyKey: `automatic-copay:${agencyId}:${allocation.id}`, automatic: true });
  if (result.paid) await pool.execute("UPDATE family_copay_attendance SET collection_status='paid' WHERE agency_id=? AND clinical_session_id=?", [agencyId, sessionId]);
  return result;
}
export async function onSignedNoteCopay({ agencyId, noteId, providerUserId }) {
  const [[note]] = await clinicalPool.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? AND is_deleted=0', [noteId, agencyId]);
  if(note && missedNote(note) && (note.provider_signed_at||note.content_review_source==='provider_review')) {
    if(Number(note.created_by_user_id)!==Number(providerUserId))throw billingError(403,'Only the author can complete this attendance entry.');
    const session=await sessionFor(agencyId,note.clinical_session_id);
    if(await attendanceCopaysEnabled(agencyId))return recordCopayAttendance({agencyId,sessionId:session.id,providerUserId,occurred:false,noteId,source:'reviewed_note'});
    return completeMissedSessionDocumentation({session,providerUserId,noteId});
  }
  if (!await attendanceCopaysEnabled(agencyId)) return { disabled: true };
  if(!note?.provider_signed_at||!Number(note.is_billable))return {eligible:false};
  if (!note?.clinical_session_id) return { eligible: false };
  try { return await recordCopayAttendance({ agencyId, sessionId: note.clinical_session_id, providerUserId, occurred: true, source: 'signed_note', noteId }); }
  catch (e) { if ([403,404,409].includes(e.status)) return { eligible: false }; throw e; }
}
export async function pendingProviderCopays({ agencyId, providerUserId, serviceDate = null }) {
  await requireAttendanceProvider(agencyId, providerUserId);
  if (!await attendanceCopaysEnabled(agencyId)) return { enabled: false, sessions: [] };
  if (serviceDate) dateOnly(serviceDate);
  const [sessions] = await clinicalPool.execute("SELECT s.*,EXISTS(SELECT 1 FROM clinical_notes n WHERE n.clinical_session_id=s.id AND n.agency_id=s.agency_id AND n.client_id=s.client_id AND n.provider_signed_at IS NOT NULL AND n.is_billable=1 AND n.is_deleted=0) AS signed_note FROM clinical_sessions s WHERE s.agency_id=? AND s.provider_user_id=? AND s.scheduled_end_at<=UTC_TIMESTAMP() AND s.scheduled_start_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY) AND s.encounter_status IN ('scheduled','completed') ORDER BY s.scheduled_start_at DESC", [agencyId, providerUserId]);
  const [[agency]] = await pool.execute('SELECT timezone FROM agencies WHERE id=?', [agencyId]);
  const zone = agency?.timezone || 'America/Denver';
  const result = [];
  for (const session of sessions) {
    if (serviceDate && new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(session.scheduled_start_at)) !== serviceDate) continue;
    const [[decision]] = await pool.execute('SELECT attendance FROM family_copay_attendance WHERE agency_id=? AND clinical_session_id=?', [agencyId, session.id]);
    if (decision || session.signed_note) continue;
    try {
      assertOccurrence(session);
      const terms = await attendanceCopayTerms(session);
      const [[client]] = await pool.execute('SELECT initials FROM clients WHERE id=? AND agency_id=?', [session.client_id, agencyId]);
      result.push({ sessionId: session.id, clientId: session.client_id, clientLabel: client?.initials || 'Client', startAt: session.scheduled_start_at, endAt: session.scheduled_end_at, copayCents: terms.term.totalCents, officeEventId: session.office_event_id || null });
    } catch (e) { if (![403,409].includes(e.status)) throw e; }
  }
  return { enabled: true, sessions: result, timezone: zone };
}
export async function runAttendanceCopays({ agencyId }) {
  if (!await attendanceCopaysEnabled(agencyId)) return [];
  // Recover a signed-note hook interrupted after the clinical signature committed.
  // The readiness effective date still prevents a launch from charging old visits.
  const [signed]=await clinicalPool.execute("SELECT n.id,n.clinical_session_id,n.provider_signed_by_user_id FROM clinical_notes n JOIN clinical_sessions s ON s.id=n.clinical_session_id AND s.agency_id=n.agency_id AND s.client_id=n.client_id WHERE n.agency_id=? AND n.provider_signed_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY) AND n.provider_signed_at IS NOT NULL AND n.is_billable=1 AND n.is_deleted=0 AND s.scheduled_end_at<=UTC_TIMESTAMP() AND s.encounter_status IN ('scheduled','completed') ORDER BY n.provider_signed_at DESC LIMIT 100",[agencyId]);
  for(const note of signed) {
    const [[existing]]=await pool.execute('SELECT attendance FROM family_copay_attendance WHERE agency_id=? AND clinical_session_id=?',[agencyId,note.clinical_session_id]);
    if(!existing)await onSignedNoteCopay({agencyId,noteId:note.id,providerUserId:note.provider_signed_by_user_id});
  }
  const [rows] = await pool.execute("SELECT clinical_session_id FROM family_copay_attendance WHERE agency_id=? AND attendance='occurred' AND collection_status='pending' ORDER BY decided_at LIMIT 100", [agencyId]);
  const result = [];
  for (const row of rows) try { result.push(await collectAttendanceCopay({ agencyId, sessionId: row.clinical_session_id })); }
  catch { await pool.execute("UPDATE family_copay_attendance SET collection_status='review' WHERE agency_id=? AND clinical_session_id=?", [agencyId, row.clinical_session_id]); result.push({ needsReview: true }); }
  return result;
}
