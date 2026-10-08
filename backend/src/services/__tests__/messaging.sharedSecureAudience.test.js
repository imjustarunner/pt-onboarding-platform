import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../guardianClinicalAccess.service.js', () => ({ clinicalAccess: vi.fn() }));
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: vi.fn() }));
import pool from '../../config/database.js';
import { clinicalAccess } from '../guardianClinicalAccess.service.js';
import { resolveClientRecordAccess } from '../clientRecordAccess.service.js';
import { clientSecureAudience, ensureClientSecureConversation, resolveClientForSecureRecipients } from '../clientSecureConversation.service.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
const client = { id: 4, agency_id: 2, user_id: 8, provider_id: 3, client_type: 'clinical', guardian_portal_enabled: 1 };
let db;
beforeEach(() => {
  vi.clearAllMocks();
  pool.execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM clients WHERE id')) return [[client]];
    if (sql.includes('SELECT cg.guardian_user_id')) return [[{ guardian_user_id: 9 }, { guardian_user_id: 10 }]];
    if (sql.includes('SELECT DISTINCT u.id')) return [[{ id: 3 }, { id: 11 }]];
    if (sql.includes('SELECT id, first_name')) return [[{ id: 8 }]];
    if (sql.includes('SELECT role')) return [[{ role: 'client_guardian' }]];
    return [[]];
  });
  clinicalAccess.mockResolvedValue({ scopes: ['clinical_messages'] });
  resolveClientRecordAccess.mockResolvedValue({ ok: false, status: 403, message: 'Access denied' });
  db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
    if (sql.includes('SELECT id FROM chat_threads')) return [[{ id: 5 }]];
    if (sql.includes('SELECT p.user_id')) return [[{ user_id: 77, role: 'provider' }]];
    return pool.execute(sql);
  }) };
  pool.getConnection.mockResolvedValue(db);
});
it('includes both guardians, client, primary provider, and active care assignments', async () => {
  expect((await clientSecureAudience(4)).userIds.sort((a,b)=>a-b)).toEqual([3, 8, 9, 10, 11]);
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes('client_contact_affiliations'))).toBe(false);
});
it('does not restore a guardian whose clinical access was restricted', async () => {
  clinicalAccess.mockImplementation(async ({ userId }) => ({ scopes: userId === 9 ? [] : ['clinical_messages'] }));
  expect((await clientSecureAudience(4)).userIds).not.toContain(9);
});
it('reuses the same thread for both guardians and removes revoked participants', async () => {
  const first = await ensureClientSecureConversation({ clientId: 4, actorUserId: 9, agencyId: 2 });
  const second = await ensureClientSecureConversation({ clientId: 4, actorUserId: 10, agencyId: 2 });
  expect(first.threadId).toBe(second.threadId);
  const deletion = db.execute.mock.calls.find(([sql]) => sql.includes('DELETE FROM chat_thread_participants'));
  expect(deletion[1]).toContain(9); expect(deletion[1]).toContain(10); expect(deletion[1]).not.toContain(77);
  expect(db.commit).toHaveBeenCalledTimes(2);
});
it('rejects a reminder-only or unrelated account and the wrong agency', async () => {
  await expect(ensureClientSecureConversation({ clientId: 4, actorUserId: 99 })).rejects.toMatchObject({ status: 403 });
  await expect(ensureClientSecureConversation({ clientId: 4, actorUserId: 9, agencyId: 8 })).rejects.toMatchObject({ status: 403 });
  expect(db.release).toHaveBeenCalledTimes(2);
});
it('requires client selection when a guardian has more than one child', async () => {
  pool.execute.mockResolvedValueOnce([[{ id: 9 }]]).mockResolvedValueOnce([[{ id: 4 }, { id: 5 }]]);
  await expect(resolveClientForSecureRecipients({ agencyId: 2, actorUserId: 3, recipientUserId: 9 })).rejects.toMatchObject({ status: 400 });
});
describe('two guardian account limit', () => {
  beforeEach(() => { vi.spyOn(ClientGuardian, 'hasRelationshipTypeColumn').mockResolvedValue(true); });
  it('locks the client row and refuses a third enabled guardian', async () => {
    db.execute.mockResolvedValueOnce([[{ id: 4 }]]).mockResolvedValueOnce([[{ guardian_user_id: 9 }, { guardian_user_id: 10 }]]);
    await expect(ClientGuardian.upsertLink({ clientId: 4, guardianUserId: 12, accessEnabled: true })).rejects.toMatchObject({ status: 409 });
    expect(db.execute.mock.calls[0][0]).toContain('FOR UPDATE'); expect(db.rollback).toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled();
  });
  it('allows a second guardian and excludes the updated account from the count', async () => {
    db.execute.mockResolvedValueOnce([[{ id: 4 }]]).mockResolvedValueOnce([[{ guardian_user_id: 9 }]]).mockResolvedValueOnce([{}]);
    await ClientGuardian.upsertLink({ clientId: 4, guardianUserId: 10, accessEnabled: true });
    expect(db.execute.mock.calls[1][1]).toEqual([4, 10]); expect(db.commit).toHaveBeenCalled();
  });
});
it('removes a revoked actor before rejecting the read so stale inbox membership cannot disclose content', async () => {
  clinicalAccess.mockImplementation(async ({ userId }) => ({ scopes: userId === 9 ? [] : ['clinical_messages'] }));
  await expect(ensureClientSecureConversation({ clientId: 4, actorUserId: 9, agencyId: 2 })).rejects.toMatchObject({ status: 403 });
  const deletion = db.execute.mock.calls.find(([sql]) => sql.includes('DELETE FROM chat_thread_participants'));
  expect(deletion[1]).not.toContain(9); expect(deletion[1]).toContain(10);
  expect(db.commit).toHaveBeenCalled();
});
