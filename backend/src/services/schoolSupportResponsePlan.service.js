import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import { parseMetadataJson } from '../utils/schoolSupportDraftSources.shared.js';
import {
  buildResponsePlan,
  RESPONSE_PLAN_STATUS
} from '../utils/schoolSupportResponsePlan.shared.js';
import { listTicketActionItems } from './unifiedEmail/ticketActionSuggestion.service.js';

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

async function hasResponsePlansTable() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'support_ticket_response_plans'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function hasClientPaperworkItemsTable() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'client_paperwork_items'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function loadChecklistItems({ clientId, agencyId, metadata }) {
  const fromMeta = Array.isArray(metadata?.checklistItems) ? metadata.checklistItems : [];
  if (fromMeta.length) return fromMeta;

  const cid = Number(clientId || 0);
  const aid = Number(agencyId || 0);
  if (!cid || !aid || !(await hasClientPaperworkItemsTable())) return [];

  try {
    const [rows] = await pool.execute(
      `SELECT ps.status_key, ps.label, cpi.is_needed, cpi.received_at
       FROM client_paperwork_items cpi
       INNER JOIN paperwork_statuses ps ON ps.id = cpi.paperwork_status_id
       WHERE cpi.client_id = ?
         AND ps.agency_id = ?
       ORDER BY cpi.is_needed DESC, cpi.received_at DESC, ps.label ASC`,
      [cid, aid]
    );
    return (rows || []).map((r) => ({
      statusKey: String(r.status_key || '').toLowerCase(),
      label: r.label || r.status_key || 'Item',
      isNeeded: r.is_needed === 1 || r.is_needed === true,
      receivedAt: r.received_at || null
    }));
  } catch {
    return [];
  }
}

function serializePlanRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    intentKey: row.intent_key,
    planType: row.plan_type,
    title: row.title,
    status: row.status,
    steps: parseJson(row.steps_json) || [],
    summary: parseJson(row.summary_json) || {},
    proposedBy: row.proposed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getResponsePlanForTicket(ticketId) {
  if (!(await hasResponsePlansTable())) return null;
  const tid = Number(ticketId || 0);
  if (!tid) return null;
  const [rows] = await pool.execute(
    `SELECT *
     FROM support_ticket_response_plans
     WHERE ticket_id = ?
     LIMIT 1`,
    [tid]
  );
  return serializePlanRow(rows?.[0] || null);
}

async function linkActionItemsToPlan({ ticketId, planId, steps }) {
  if (!planId) return;
  const actionSteps = (steps || []).filter((step) => step.type === 'action_item' && step.actionItemId);
  for (const step of actionSteps) {
    await pool.execute(
      `UPDATE support_ticket_action_items
       SET response_plan_id = ?, response_plan_step = ?
       WHERE id = ? AND ticket_id = ?`,
      [Number(planId), Number(step.step) || null, Number(step.actionItemId), Number(ticketId)]
    ).catch(() => {});
  }
}

export async function buildAndPersistResponsePlanForTicket(ticketId, { proposedBy = 'ai' } = {}) {
  if (!(await hasResponsePlansTable())) {
    return { plan: null, skipped: 'table_missing' };
  }

  const tid = Number(ticketId || 0);
  if (!tid) return { plan: null, skipped: 'invalid_ticket_id' };

  const [rows] = await pool.execute(
    `SELECT *
     FROM support_tickets
     WHERE id = ?
     LIMIT 1`,
    [tid]
  );
  const ticket = rows?.[0] || null;
  if (!ticket) return { plan: null, skipped: 'ticket_not_found' };

  const metadata = parseMetadataJson(ticket.ai_draft_metadata_json);
  let client = null;
  if (ticket.client_id) {
    try {
      client = await Client.findById(ticket.client_id, { includeSensitive: false });
    } catch {
      client = null;
    }
  }

  const checklistItems = await loadChecklistItems({
    clientId: ticket.client_id,
    agencyId: ticket.agency_id,
    metadata
  });
  const actionItems = await listTicketActionItems(tid);
  const built = buildResponsePlan({
    ticket,
    client,
    metadata,
    checklistItems,
    actionItems
  });

  const existing = await getResponsePlanForTicket(tid);
  const stepsJson = JSON.stringify(built.steps || []);
  const summaryJson = JSON.stringify(built.summary || {});

  if (existing?.id) {
    await pool.execute(
      `UPDATE support_ticket_response_plans
       SET intent_key = ?,
           title = ?,
           status = ?,
           steps_json = ?,
           summary_json = ?,
           proposed_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        built.intentKey,
        built.title,
        built.status || RESPONSE_PLAN_STATUS.PROPOSED,
        stepsJson,
        summaryJson,
        proposedBy,
        existing.id
      ]
    );
    await linkActionItemsToPlan({ ticketId: tid, planId: existing.id, steps: built.steps });
    return { plan: { ...existing, ...built, id: existing.id }, rebuilt: true };
  }

  const [result] = await pool.execute(
    `INSERT INTO support_ticket_response_plans
      (ticket_id, intent_key, plan_type, title, status, steps_json, summary_json, proposed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tid,
      built.intentKey,
      built.planType,
      built.title,
      built.status || RESPONSE_PLAN_STATUS.PROPOSED,
      stepsJson,
      summaryJson,
      proposedBy
    ]
  );
  const planId = Number(result?.insertId || 0);
  await linkActionItemsToPlan({ ticketId: tid, planId, steps: built.steps });
  const plan = await getResponsePlanForTicket(tid);
  return { plan, created: true };
}

export async function dismissResponsePlanForTicket(ticketId) {
  if (!(await hasResponsePlansTable())) return null;
  const tid = Number(ticketId || 0);
  if (!tid) return null;
  await pool.execute(
    `UPDATE support_ticket_response_plans
     SET status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE ticket_id = ?`,
    [RESPONSE_PLAN_STATUS.DISMISSED, tid]
  );
  return getResponsePlanForTicket(tid);
}
