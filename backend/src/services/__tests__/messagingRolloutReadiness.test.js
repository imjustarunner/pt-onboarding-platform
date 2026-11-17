import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { verifyMessagingRollout } from '../messagingRolloutReadiness.service.js';
test.after(() => pool.end());
function database({ installed = true, historical = 0 } = {}) {
  return { async execute(sql) {
    assert.match(sql, /^SELECT /); // No mail, ticket or audit-history mutations.
    if (sql.includes('migrations_log')) return [[{ success: installed ? 1 : 0 }]];
    if (sql.includes('information_schema.STATISTICS')) return [[{ total: 1 }]];
    if (sql.includes('AS category')) return [[{ category: 'demo', total: 25 }]];
    if (sql.includes('hidden_qa_tickets')) return [[{ hidden_qa_tickets: 10 }]];
    return [[{ historical_assignment_sends: historical }]];
  } };
}
test('readiness reports aggregate historical filtering without modifying records or sending email', async () => {
  assert.deepEqual(await verifyMessagingRollout(database()), { actorSource: 'messaging_rollout_audit', readOnly: true, migrationInstalled: true,
    conversationsSample: { demo: 25 }, hiddenQaTickets: 10, historicalAssignmentSends: 0 });
});
test('readiness blocks promotion if the migration is missing or historical email was replayed', async () => {
  await assert.rejects(verifyMessagingRollout(database({ installed: false })), { code: 'MESSAGING_MIGRATION_REQUIRED' });
  await assert.rejects(verifyMessagingRollout(database({ historical: 2 })), { code: 'HISTORICAL_MAIL_REPLAY_DETECTED' });
});
