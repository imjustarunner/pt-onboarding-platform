import pool from '../config/database.js';
import { getSupportGmailReadClient } from '../services/unifiedEmail/supportGmailReadClient.js';
import { reconcileSupportTicketThreadFromGmail } from '../services/supportTicketGmailReconciliation.service.js';
import { resolveSupportTicketEmailThread } from '../services/supportTicketEmail.service.js';

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const agencyId = Number(option('--agency-id', '2'));
const days = Number(option('--days', '60'));
const limit = Number(option('--limit', '50'));
const apply = args.includes('--apply');
if (!Number.isSafeInteger(agencyId) || agencyId < 1 || !Number.isSafeInteger(days) || days < 1 || days > 365
  || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('Use --agency-id ID --days 1..365 --limit 1..500 [--apply]. Default is dry run.');
try {
  const [tickets] = await pool.execute(`SELECT id,agency_id,source_channel,school_organization_id,client_id,topic,source_email_thread_id,claimed_by_user_id
    FROM support_tickets WHERE agency_id=? AND source_channel='email' AND source_email_thread_id IS NOT NULL
      AND COALESCE(source_email_received_at,created_at)>=DATE_SUB(NOW(),INTERVAL ? DAY)
    ORDER BY (claimed_by_user_id IS NOT NULL) DESC,id DESC`, [agencyId, days]);
  const groups = new Map();
  for (const ticket of tickets) {
    const thread = ticket.source_email_thread_id;
    if (!groups.has(thread)) groups.set(thread, []);
    groups.get(thread).push(ticket);
  }
  const [identities] = await pool.execute('SELECT from_email FROM email_sender_identities WHERE agency_id=? AND is_active=1', [agencyId]);
  const [schools] = await pool.execute(`SELECT DISTINCT sp.itsco_email FROM school_profiles sp
    JOIN organization_affiliations oa ON oa.organization_id=sp.school_organization_id WHERE oa.agency_id=? AND oa.is_active=1`, [agencyId]);
  const [staff] = await pool.execute(`SELECT DISTINCT u.id,u.email,u.work_email,u.personal_email,u.username FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
    WHERE u.role NOT IN ('school_staff','client_guardian') AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0`, [agencyId]);
  const ownAddresses = [...identities.map((i) => i.from_email), ...schools.map((s) => s.itsco_email)].filter(Boolean);
  const gmail = await getSupportGmailReadClient();
  const since = new Date(Date.now() - days * 86400000);
  const results = [];
  for (const [threadId, rows] of [...groups].slice(0, limit)) {
    const scopes = new Set(rows.map((t) => JSON.stringify([t.school_organization_id,t.client_id,t.topic])));
    if (scopes.size > 1) { results.push({ threadId, skipped: 'ambiguous_ticket_scope', ticketIds: rows.map((t) => t.id) }); continue; }
    const target = rows[0];
    try {
      const canonical = apply ? await resolveSupportTicketEmailThread(target) : { canonicalTicketId: target.id };
      const result = await reconcileSupportTicketThreadFromGmail({ agencyId, ticketId: canonical.canonicalTicketId, threadId, gmail,
        ownAddresses, staff, since, apply });
      results.push({ ...result, historicalTicketIds: rows.slice(1).map((t) => t.id) });
    } catch (error) { results.push({ ticketId: target.id, threadId, error: error.code || 'reconciliation_failed' }); }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply_history_only' : 'dry_run', agencyId, days, availableThreads: groups.size,
    inspectedThreads: results.length, results }, null, 2));
  if (results.some((r) => r.error)) process.exitCode = 1;
} finally { await pool.end(); }
