import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';
import { setTicketAssignment, ticketAssignmentHistory } from '../ticketAssignment.service.js';
import { changeSharedInboxTicketArchive } from '../sharedInboxTicketArchive.service.js';

vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: () => {} }));
vi.mock('../departmentalGroupAccess.service.js', async () => ({
  ...await import('../departmentalGroupPolicy.js'),
  assertDepartmentalGroupAccess: vi.fn(async ({ userId }) => {
    if (userId === 9) throw Object.assign(new Error('Wrong group'), { status: 403 });
  })
}));

describe.skipIf(!recoveryMysqlEnabled)('shared inbox archive transaction', () => {
  let fixture;
  const user = { id: 4, role: 'support' };
  const change = (values = {}) => changeSharedInboxTicketArchive({ conversationId: 28, user, ...values }, fixture.db);
  async function sql(statements) {
    for (const statement of statements.split(';').map(s => s.trim()).filter(Boolean)) await fixture.db.query(statement);
  }
  async function status() {
    const [[row]] = await fixture.db.execute(`SELECT t.status AS ticket_status,c.status AS conversation_status,c.archived_at,t.close_on_read
      FROM support_tickets t JOIN communication_conversations c ON c.support_ticket_id=t.id WHERE t.id=53`);
    return row;
  }

  beforeAll(async () => {
    fixture = await isolatedWorkflowMysql('shared_inbox_archive');
    await sql(await readFile(new URL('../../../../database/migrations/1854_shared_inbox_archive_and_security_mail.sql', import.meta.url), 'utf8'));
    await sql(`
      CREATE TABLE support_tickets (id INT PRIMARY KEY, agency_id INT, status VARCHAR(32),
        close_on_read TINYINT, claimed_by_user_id INT, claimed_at DATETIME NULL, source_channel VARCHAR(32), source_email_thread_id VARCHAR(100));
      CREATE TABLE communication_inboxes (id INT PRIMARY KEY, agency_id INT, identity_key VARCHAR(32),
        kind VARCHAR(32), from_email VARCHAR(254), owner_user_id INT);
      CREATE TABLE communication_conversations (id INT PRIMARY KEY, agency_id INT, support_ticket_id INT,
        inbox_id INT, channel VARCHAR(32), status VARCHAR(32), archived_at DATETIME NULL);
      CREATE TABLE support_ticket_messages (id INT PRIMARY KEY, ticket_id INT, is_deleted TINYINT DEFAULT 0);
      CREATE TABLE users (id INT PRIMARY KEY, first_name VARCHAR(32), last_name VARCHAR(32));
      CREATE TABLE user_activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY, action_type VARCHAR(40), user_id INT, agency_id INT,
        metadata JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users VALUES (4, 'Alex', 'Coordinator'), (5, 'Morgan', 'Support'), (6, 'Taylor', 'Support');
      INSERT INTO support_tickets VALUES (53, 2, 'answered', 1, NULL, NULL, 'email', NULL);
      INSERT INTO communication_inboxes VALUES (12, 2, 'support', 'support', 'support@example.test', NULL);
      INSERT INTO communication_conversations VALUES (28, 2, 53, 12, 'email', 'waiting_on_them', NULL);
    `);
  });
  afterAll(async () => { await fixture?.close(); });
  beforeEach(async () => {
    await sql(`DELETE FROM shared_inbox_ticket_archives; DELETE FROM support_ticket_messages; DELETE FROM user_activity_log;
      UPDATE support_tickets SET status='answered', close_on_read=1, claimed_by_user_id=NULL;
      UPDATE communication_conversations SET status='waiting_on_them', archived_at=NULL;`);
  });

  it('closes and archives in one operation and restores the exact prior status and flags on undo', async () => {
    const archive = await change();
    expect(await status()).toMatchObject({ ticket_status: 'closed', conversation_status: 'resolved', archived_at: expect.any(Date), close_on_read: 0 });
    await expect(change({ undoId: archive.undoId })).resolves.toMatchObject({ undone: true });
    expect(await status()).toEqual({ ticket_status: 'answered', conversation_status: 'waiting_on_them', archived_at: null, close_on_read: 1 });
    await expect(change({ undoId: archive.undoId })).rejects.toMatchObject({ status: 409 });
  });

  it('archives an already-closed ticket and checks the last visible message before doing so', async () => {
    await sql(`UPDATE support_tickets SET status='closed', close_on_read=0;
      INSERT INTO support_ticket_messages VALUES (10, 53, 0), (11, 53, 1);`);
    await expect(change({ expectedLastMessageId: 0 })).rejects.toMatchObject({ status: 409 });
    expect(await status()).toMatchObject({ ticket_status: 'closed', archived_at: null });
    const { undoId } = await change({ expectedLastMessageId: 10 });
    expect(await status()).toMatchObject({ ticket_status: 'closed', archived_at: expect.any(Date) });
    await change({ undoId });
    expect(await status()).toMatchObject({ ticket_status: 'closed', archived_at: null });
  });

  it('scopes undo to the actor and prevents undo from overwriting a new reply', async () => {
    const { undoId } = await change();
    await expect(change({ undoId, user: { id: 5, role: 'admin' } })).rejects.toMatchObject({ status: 409 });
    await fixture.db.execute('INSERT INTO support_ticket_messages (id,ticket_id) VALUES (10,53)');
    await expect(change({ undoId })).rejects.toMatchObject({ status: 409 });
    expect(await status()).toMatchObject({ ticket_status: 'closed', archived_at: expect.any(Date) });
  });

  it('rejects an expired undo receipt and denies closing tickets outside the actor’s group', async () => {
    await expect(change({ user: { id: 9, role: 'support' } })).rejects.toMatchObject({ status: 403 });
    const { undoId } = await change();
    await fixture.db.execute('UPDATE shared_inbox_ticket_archives SET expires_at=UTC_TIMESTAMP(6) WHERE id=?', [undoId]);
    await expect(change({ undoId })).rejects.toMatchObject({ status: 409 });
  });

  it('records both owners and the actor atomically, rejecting a competing transfer', async () => {
    await fixture.db.execute('UPDATE support_tickets SET claimed_by_user_id = 5 WHERE id = 53');
    const transfer = { ticketId: 53, agencyId: 2, actorUserId: 4, previousUserId: 5, kind: 'reassigned' };
    await setTicketAssignment({ ...transfer, assigneeUserId: 6 }, fixture.db);
    await expect(setTicketAssignment({ ...transfer, assigneeUserId: 4 }, fixture.db)).rejects.toMatchObject({ status: 409 });
    const [[ticket]] = await fixture.db.execute('SELECT * FROM support_tickets WHERE id = 53');
    expect(ticket.claimed_by_user_id).toBe(6);
    const history = await ticketAssignmentHistory(ticket, fixture.db);
    expect(history).toMatchObject([{
      kind: 'reassigned', previousUserId: 5, previousName: 'Morgan Support',
      assigneeUserId: 6, assigneeName: 'Taylor Support', actorName: 'Alex Coordinator', at: expect.any(Date)
    }]);
  });
});
