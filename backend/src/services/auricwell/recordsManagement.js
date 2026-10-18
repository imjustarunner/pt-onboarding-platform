import { pool, open, seal, list, get, update, transaction, lockPractice, audit } from './repository.js';
import { fail, has, json, requirePermission, requirePhi } from './policy.js';

export const RECORDS_PERMISSION = 'records_manager';
const SYSTEM_ACTOR = '00000000-0000-4000-8000-000000000001';
export const isFinished = r => ['fulfilled', 'closed'].includes(r.data.status);
export function followUpAt(record, settings) {
  return record.data.followUpAt || new Date(new Date(record.createdAt).getTime() + (settings.recordsManagement?.followUpDays || 7) * 86400000).toISOString();
}
export function routingState(record, settings, managers, now = Date.now()) {
  const active = new Set(managers.map(m => m.id));
  const assignedAccountId = active.has(record.data.assignedAccountId) ? record.data.assignedAccountId
    : [settings.recordsManagement?.primaryAccountId, settings.recordsManagement?.backupAccountId].find(id => active.has(id)) || null;
  const due = followUpAt(record, settings);
  return { assignedAccountId, followUpAt: due, unassigned: !assignedAccountId, overdue: !isFinished(record) && Date.parse(due) <= now };
}
export async function eligibleManagers(ctx, db = pool) {
  const [rows] = await db.execute(`SELECT a.id,a.profile,m.permissions FROM auricwell_memberships m
    JOIN auricwell_accounts a ON a.id=m.account_id
    WHERE m.practice_id=? AND m.actor_type='staff' AND m.status='active' AND a.status='active'`, [ctx.practiceId]);
  return rows.filter(r => json(r.permissions, []).includes(RECORDS_PERMISSION))
    .map(r => ({ id: r.id, name: open(r.profile, `auricwell:account:${r.id}`).name }));
}
export async function managementOptions(ctx) {
  if (!has(ctx, 'admin') && !has(ctx, RECORDS_PERMISSION)) throw fail(403, 'Records Manager permission is required.');
  return { managers: await eligibleManagers(ctx), settings: ctx.settings.recordsManagement || { primaryAccountId: null, backupAccountId: null, followUpDays: 7 } };
}
export async function saveManagement(ctx, input) {
  requirePermission(ctx, 'admin');
  const followUpDays = Number(input.followUpDays);
  if (!Number.isInteger(followUpDays) || followUpDays < 1 || followUpDays > 30) throw fail(400, 'Choose an internal follow-up target between 1 and 30 days.');
  return transaction(async db => {
    await lockPractice(ctx, db);
    const managers = await eligibleManagers(ctx, db);
    const settings = { primaryAccountId: input.primaryAccountId || null, backupAccountId: input.backupAccountId || null, followUpDays };
    for (const id of [settings.primaryAccountId, settings.backupAccountId]) {
      if (id && !managers.some(m => m.id === id)) throw fail(400, 'Choose an active Records Manager in this practice.');
    }
    if (settings.primaryAccountId && settings.primaryAccountId === settings.backupAccountId) throw fail(400, 'Choose a different backup.');
    if (settings.backupAccountId && !settings.primaryAccountId) throw fail(400, 'Choose a primary Records Manager first.');
    const [[practice]] = await db.execute('SELECT settings,revision FROM auricwell_practices WHERE id=?', [ctx.practiceId]);
    if (Number(input.revision) !== practice.revision) throw fail(409, 'Practice settings changed. Refresh before saving.');
    const next = { ...open(practice.settings, `auricwell:practice:${ctx.practiceId}`), recordsManagement: settings };
    await db.execute('UPDATE auricwell_practices SET settings=?,revision=revision+1 WHERE id=?', [seal(next, `auricwell:practice:${ctx.practiceId}`), ctx.practiceId]);
    await audit(ctx, 'records_management.configured', null, settings, db);
    return { saved: true };
  });
}
export async function assignRequest(ctx, id, input) {
  requirePhi(ctx);
  requirePermission(ctx, RECORDS_PERMISSION);
  return transaction(async db => {
    await lockPractice(ctx, db);
    const record = await get(ctx, 'records_request', id, db, true);
    if (isFinished(record)) throw fail(409, 'Completed requests cannot be reassigned.');
    if (!(await eligibleManagers(ctx, db)).some(m => m.id === input.accountId)) throw fail(400, 'Choose an active Records Manager in this practice.');
    await update(ctx, record, { ...record.data, assignedAccountId: input.accountId }, db);
    await audit(ctx, 'records_request.assigned', id, { assignedAccountId: input.accountId }, db);
    return { saved: true };
  });
}
// Ticket text deliberately contains no names, contact information, chart IDs,
// requested record descriptions, or release decisions. AuricWell remains authoritative.
export function ticketSummary(ctx, record, state) {
  const condition = isFinished(record) ? 'Completed' : state.unassigned ? 'Unassigned' : state.overdue ? 'Follow-up overdue' : 'Pending';
  return {
    subject: `Records request follow-up — ${condition}`,
    question: `Coordinate follow-up with the practice Records Manager. Do not collect or attach medical records in this ticket.\nOpen the protected AuricWell queue: https://auricwell.com/app/${encodeURIComponent(ctx.slug)}/records-requests?request=${encodeURIComponent(record.id)}\nOnly a Records Manager can review the request. Closing this ticket does not complete the records request.`,
    status: isFinished(record) ? 'closed' : 'open',
    priority: !isFinished(record) && (state.unassigned || state.overdue) ? 'high' : 'medium',
  };
}
export async function syncRequest(practiceId, id) {
  return transaction(async db => {
    const ctx = { practiceId, accountId: SYSTEM_ACTOR };
    await lockPractice(ctx, db);
    const [[p]] = await db.execute('SELECT slug,agency_id,settings FROM auricwell_practices WHERE id=?', [practiceId]);
    Object.assign(ctx, { slug: p.slug, agencyId: p.agency_id, settings: open(p.settings, `auricwell:practice:${practiceId}`) });
    const record = await get(ctx, 'records_request', id, db, true);
    const state = routingState(record, ctx.settings, await eligibleManagers(ctx, db));
    const data = { ...record.data, assignedAccountId: state.assignedAccountId, followUpAt: state.followUpAt };
    if (ctx.agencyId) {
      const summary = ticketSummary(ctx, record, state);
      let ticket;
      if (data.supportTicketId) [[ticket]] = await db.execute('SELECT id,status,subject,priority FROM support_tickets WHERE id=? AND agency_id=? AND created_by_source_key=? FOR UPDATE', [data.supportTicketId, ctx.agencyId, 'auricwell_records_request']);
      if (!ticket) {
        const [result] = await db.execute(`INSERT INTO support_tickets
          (school_organization_id,created_by_user_id,created_by_source_key,agency_id,subject,question,status,priority)
          VALUES (?,NULL,'auricwell_records_request',?,?,?,?,?)`, [ctx.agencyId, ctx.agencyId, summary.subject, summary.question, summary.status, summary.priority]);
        data.supportTicketId = result.insertId;
        await audit(ctx, 'records_request.support_ticket_created', id, { ticketId: result.insertId }, db);
      } else {
        const remind = !isFinished(record) && (state.unassigned || state.overdue)
          && (!data.lastReminderAt || Date.now() - Date.parse(data.lastReminderAt) >= 86400000);
        if (ticket.status !== summary.status || ticket.subject !== summary.subject || ticket.priority !== summary.priority || remind) {
          await db.execute('UPDATE support_tickets SET subject=?,status=?,priority=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?', [summary.subject, summary.status, summary.priority, ticket.id, ctx.agencyId]);
        }
        if (remind) {
          data.lastReminderAt = new Date().toISOString();
          await audit(ctx, 'records_request.follow_up_reminded', id, { unassigned: state.unassigned, overdue: state.overdue }, db);
        }
      }
    }
    if (JSON.stringify(data) !== JSON.stringify(record.data)) await update(ctx, record, data, db);
  });
}
export async function trySyncRequest(practiceId, id) {
  try { await syncRequest(practiceId, id); }
  catch (error) { console.warn('[records-requests] Support sync pending retry:', error.code || 'sync_failed'); }
}
export async function recordsNotifications(ctx) {
  if (!ctx.settings.phiActivatedAt || (!has(ctx, RECORDS_PERMISSION) && !has(ctx, 'admin'))) return [];
  const managers = await eligibleManagers(ctx);
  const rows = (await list(ctx, 'records_request', { limit: 10000 })).filter(r => !isFinished(r));
  if (!has(ctx, RECORDS_PERMISSION)) {
    // Administration receives routing reminders only, never individual request data.
    return rows.some(r => routingState(r, ctx.settings, managers).unassigned)
      ? [{ id: 'records-manager-needed', type: 'records_request', title: 'Assign a Records Manager to handle unassigned requests', section: 'settings' }] : [];
  }
  return rows.map(r => {
    const state = routingState(r, ctx.settings, managers);
    return { id: r.id, type: 'records_request', title: state.unassigned ? 'Unassigned records request' : state.overdue ? 'Records request follow-up overdue' : 'Records request awaiting action', section: 'records-requests' };
  });
}
let running = false;
export async function runRecordsRequestFollowUpTick() {
  if (running) return;
  running = true;
  try {
    // Keyset pagination avoids silently dropping older requests. Row/practice locks
    // make concurrent server instances and immediate submission sync idempotent.
    let cursor = '';
    while (true) {
      const [rows] = await pool.execute("SELECT r.id,r.practice_id FROM auricwell_records r JOIN auricwell_practices p ON p.id=r.practice_id WHERE r.kind='records_request' AND r.id>? AND p.status IN ('setup','active') ORDER BY r.id LIMIT 200", [cursor]);
      if (!rows.length) break;
      for (const row of rows) await trySyncRequest(row.practice_id, row.id);
      cursor = rows.at(-1).id;
    }
  } finally { running = false; }
}
