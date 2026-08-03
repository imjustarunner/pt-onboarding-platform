import pool from '../config/database.js';

let hasKindColumnCache = null;

export async function hasSupportTicketKindColumn() {
  if (hasKindColumnCache !== null) return hasKindColumnCache;
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'ticket_kind'`
    );
    hasKindColumnCache = Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    hasKindColumnCache = false;
  }
  return hasKindColumnCache;
}

/**
 * Keep org escalations in the escalations desk — exclude from support ticket queues by default.
 * @param {string[]} where
 * @param {{ alias?: string, ticketKind?: 'support'|'escalation'|'all' }} options
 */
export async function appendSupportTicketKindFilter(where, { alias = 't', ticketKind = 'support' } = {}) {
  if (!(await hasSupportTicketKindColumn())) return;
  const col = alias ? `${alias}.ticket_kind` : 'ticket_kind';
  if (ticketKind === 'escalation') {
    where.push(`COALESCE(${col}, 'support') = 'escalation'`);
  } else if (ticketKind !== 'all') {
    where.push(`COALESCE(${col}, 'support') <> 'escalation'`);
  }
}
