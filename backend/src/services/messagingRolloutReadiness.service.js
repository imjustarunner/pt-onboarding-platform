import pool from '../config/database.js';
import { messageInboxPolicySql, ticketMailVisibilitySql } from './messageInboxPolicy.js';

// Aggregate checks only. Never act as an application user or change source mail.
export async function verifyMessagingRollout(database = pool) {
  const [[migration]] = await database.execute("SELECT success FROM migrations_log WHERE migration_name='1839_school_ticket_assignment_mail' LIMIT 1");
  if (!migration?.success) throw Object.assign(new Error('Messaging migration is not installed'), { code: 'MESSAGING_MIGRATION_REQUIRED' });
  const policy = messageInboxPolicySql();
  const [classes] = await database.execute(`SELECT ${policy.category} AS category,COUNT(*) AS total
    FROM communication_conversations c JOIN agencies a ON a.id=c.agency_id AND a.slug='itsco'
    WHERE c.archived_at IS NULL AND c.channel='email' GROUP BY category`);
  const [[tickets]] = await database.execute(`SELECT COUNT(*) AS hidden_qa_tickets FROM support_tickets t
    JOIN agencies a ON a.id=t.agency_id AND a.slug='itsco' WHERE NOT ${ticketMailVisibilitySql('t')}`);
  const [[replay]] = await database.execute(`SELECT COUNT(*) AS historical_assignment_sends FROM ticket_assignment_email_deliveries d
    JOIN ticket_assignment_email_settings settings ON settings.id=1
    WHERE d.assignment_at<settings.enabled_at AND d.delivery_status IN ('sent','queued','sending')`);
  if (Number(replay.historical_assignment_sends)) throw Object.assign(new Error('Historical assignment mail requires review'), { code: 'HISTORICAL_MAIL_REPLAY_DETECTED' });
  return { actorSource: 'messaging_rollout_audit', readOnly: true, migrationInstalled: true,
    conversations: Object.fromEntries(classes.map(row => [row.category, Number(row.total)])),
    hiddenQaTickets: Number(tickets.hidden_qa_tickets), historicalAssignmentSends: Number(replay.historical_assignment_sends) };
}
