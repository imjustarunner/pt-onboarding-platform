import { beforeEach, expect, it, vi } from 'vitest';
import { enrollmentReplyIsHuman, ingestEnrollmentFollowupReply, reopenEnrollment } from '../enrollmentFollowupReply.service.js';

const reply = () => ({ fromEmail: 'family@example.com', addresses: ['schools@itsco.health'], headers: new Map(), authenticationResults: 'mx.google.com; dmarc=pass (p=NONE) header.from=example.com;', inReplyTo: '<outbound-99@example.com>', messageId: '<reply-1@example.com>' });

it('reopens a uniquely matched verified reply through the existing client ID', async () => {
  const execute = vi.fn(async () => [[{ id: 89, client_id: 51, agency_id: 2, reply_to_email: 'schools@itsco.health' }]]);
  const reopen = vi.fn(async () => ({ reopened: true, clientId: 51 }));
  expect(await ingestEnrollmentFollowupReply(reply(), { pool: { execute }, reopenEnrollment: reopen })).toMatchObject({ matched: true, reopened: true, clientId: 51 });
  expect(reopen).toHaveBeenCalledWith({ clientId: 51, agencyId: 2, followupId: 89, replyMessageId: '<reply-1@example.com>', actorUserId: null });
  expect(execute.mock.calls[0][1]).toEqual(['<outbound-99@example.com>', 'family@example.com']);
});

it.each([
  { authenticationResults: 'sender.example; dmarc=pass header.from=example.com;' },
  { authenticationResults: 'mx.google.com; dmarc=fail header.from=example.com;' },
  { authenticationResults: 'mx.google.com; dmarc=pass header.from=attacker.example;' },
  { headers: new Map([['auto-submitted', 'auto-replied']]) },
  { headers: new Map([['content-type', 'multipart/report; report-type=delivery-status']]) }
])('ignores spoofed, automated, and delivery-report messages: %j', async change => {
  const execute = vi.fn();
  expect(enrollmentReplyIsHuman({ ...reply(), ...change })).toBe(false);
  expect(await ingestEnrollmentFollowupReply({ ...reply(), ...change }, { pool: { execute } })).toEqual({ matched: false });
  expect(execute).not.toHaveBeenCalled();
});

it('does not reopen a message sent to a different mailbox or ambiguous thread', async () => {
  const reopen = vi.fn();
  const action = { id: 89, client_id: 51, agency_id: 2, reply_to_email: 'other@itsco.health' };
  expect(await ingestEnrollmentFollowupReply(reply(), { pool: { execute: async () => [[action]] }, reopenEnrollment: reopen })).toEqual({ matched: false });
  expect(await ingestEnrollmentFollowupReply(reply(), { pool: { execute: async () => [[{ ...action, reply_to_email: 'schools@itsco.health' }, { ...action, id: 90, reply_to_email: 'schools@itsco.health' }]] }, reopenEnrollment: reopen })).toEqual({ matched: false });
  expect(reopen).not.toHaveBeenCalled();
});

let client, action, db, deps;
beforeEach(() => {
  client = { id: 51, agency_id: 2, status: 'ARCHIVED', client_status_key: 'terminated', client_status_id: 7, provider_id: null, enrollment_followup_id: 89 };
  action = { id: 89, state: 'awaiting_reply', disposition: 'inactive', created_by_user_id: 8 };
  db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
    if (sql.includes('FROM clients c')) return [[client]];
    if (sql.includes('FROM client_enrollment_followups')) return [[action]];
    if (sql.includes('FROM client_statuses')) return [[{ id: 3 }]];
    if (sql.startsWith('UPDATE client_enrollment_followups')) action.state = 'reopened';
    return [{ affectedRows: 1 }];
  }) };
  deps = { pool: { getConnection: async () => db }, Client: { update: vi.fn(async () => ({ id: 51 })) }, Notification: { create: vi.fn(async () => ({})) } };
});
const reopen = () => reopenEnrollment({ clientId: 51, agencyId: 2, followupId: 89, replyMessageId: '<reply-1@example.com>' }, deps);

it('returns the same record to New Enrollments with automation attribution and retained history', async () => {
  expect(await reopen()).toMatchObject({ reopened: true, clientId: 51 });
  const [id, patch, actor] = deps.Client.update.mock.calls[0];
  expect(id).toBe(51); expect(actor).toBeNull();
  expect(patch).toMatchObject({ status: 'PENDING_REVIEW', client_status_id: 3, enrollment_reopened_source: 'email_reply' });
  expect(patch).not.toHaveProperty('provider_id');
  expect(patch).not.toHaveProperty('termination_reason');
  const history = db.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO client_status_history'))[1];
  expect(history[1]).toBeNull(); expect(history[5]).toContain('Automation:');
  expect(deps.Notification.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 8, actorUserId: null, actorSource: 'enrollment_reply_automation' }));
  expect(db.commit).toHaveBeenCalledOnce();
});

it('does not reopen or notify twice when the same inbound message is replayed', async () => {
  await reopen();
  expect(await reopen()).toMatchObject({ reopened: false });
  expect(deps.Client.update).toHaveBeenCalledOnce();
  expect(deps.Notification.create).toHaveBeenCalledOnce();
});

it.each([{ enrollment_followup_id: 90 }, { client_status_key: 'current' }, { status: 'ACTIVE' }, { provider_id: 77 }])('preserves a later care decision or assignment: %j', async change => {
  Object.assign(client, change);
  expect(await reopen()).toMatchObject({ reopened: false });
  expect(deps.Client.update).not.toHaveBeenCalled();
  expect(db.commit).not.toHaveBeenCalled();
});

it('keeps compliance retention records out of automated reopening', async () => {
  client.compliance_archived_at = '2026-01-01';
  await expect(reopen()).rejects.toMatchObject({ status: 409 });
  expect(deps.Client.update).not.toHaveBeenCalled();
});

it('rolls back reopening when the audit event cannot be recorded', async () => {
  const base = db.execute.getMockImplementation();
  db.execute.mockImplementation((sql, ...args) => sql.includes('INSERT INTO client_status_history') ? Promise.reject(new Error('Audit unavailable')) : base(sql, ...args));
  await expect(reopen()).rejects.toThrow('Audit unavailable');
  expect(db.rollback).toHaveBeenCalledOnce(); expect(db.commit).not.toHaveBeenCalled();
  expect(deps.Notification.create).not.toHaveBeenCalled();
});
