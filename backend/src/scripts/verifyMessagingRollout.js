// Read-only release verification. Runs as cloud automation, never an app user.
import pool from '../config/database.js';
import { messageInboxPolicySql, ticketMailVisibilitySql } from '../services/messageInboxPolicy.js';
try {
  const [[migration]] = await pool.execute("SELECT success FROM migrations_log WHERE migration_name='1839_school_ticket_assignment_mail' LIMIT 1");
  if (!migration?.success) throw Object.assign(new Error('Messaging migration is not installed'), { code: 'MESSAGING_MIGRATION_REQUIRED' });
  const policy = messageInboxPolicySql();
  const [classes] = await pool.execute(`SELECT ${policy.category} AS category,COUNT(*) AS total
    FROM communication_conversations c JOIN agencies a ON a.id=c.agency_id AND a.slug='itsco'
    WHERE c.archived_at IS NULL AND c.channel='email' GROUP BY category`);
  const [[tickets]] = await pool.execute(`SELECT COUNT(*) AS hidden_qa_tickets FROM support_tickets t
    JOIN agencies a ON a.id=t.agency_id AND a.slug='itsco' WHERE NOT ${ticketMailVisibilitySql('t')}`);
  const [[replay]] = await pool.execute(`SELECT COUNT(*) AS historical_assignment_sends FROM ticket_assignment_email_deliveries d
    JOIN ticket_assignment_email_settings settings ON settings.id=1
    WHERE d.assignment_at<settings.enabled_at AND d.delivery_status IN ('sent','queued','sending')`);
  if (Number(replay.historical_assignment_sends)) throw Object.assign(new Error('Historical assignment mail requires review'), { code: 'HISTORICAL_MAIL_REPLAY_DETECTED' });
  console.log(JSON.stringify({ actorSource: 'messaging_rollout_audit', readOnly: true, migrationInstalled: true,
    conversations: Object.fromEntries(classes.map(row => [row.category, Number(row.total)])),
    hiddenQaTickets: Number(tickets.hidden_qa_tickets), historicalAssignmentSends: Number(replay.historical_assignment_sends) }));
} catch (error) {
  console.error(JSON.stringify({ actorSource: 'messaging_rollout_audit', code: error.code || 'MESSAGING_AUDIT_FAILED' }));
  process.exitCode = 1;
} finally { await pool.end(); }
