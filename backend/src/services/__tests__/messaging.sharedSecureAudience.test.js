import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../guardianClinicalAccess.service.js', () => ({ clinicalAccess: vi.fn() }));
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: vi.fn() }));
vi.mock('../familySharedConversations.service.js',()=>({familySharedConversations:{open:vi.fn(),requireAccess:vi.fn()}}));
vi.mock('../dependentPortalMessages.service.js',()=>({assertDependentThreadAccess:vi.fn(async()=>null)}));
import pool from '../../config/database.js';
import { clinicalAccess } from '../guardianClinicalAccess.service.js';
import { resolveClientRecordAccess } from '../clientRecordAccess.service.js';
import { clientSecureAudience, ensureClientSecureConversation, resolveClientForSecureRecipients,refreshClientSecureAccess } from '../clientSecureConversation.service.js';
import {familySharedConversations} from '../familySharedConversations.service.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
const client = { id: 4, agency_id: 2, provider_id: 3, client_type: 'clinical', guardian_portal_enabled: 1 };
let db;
beforeEach(() => {
  vi.clearAllMocks();
  familySharedConversations.open.mockResolvedValue({threadId:5,participants:[{id:9},{id:10}],audienceUserIds:[3,8,9,10,11]});
  familySharedConversations.requireAccess.mockResolvedValue(null);
  pool.execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM clients WHERE id')) return [[client]];
    if (sql.includes('SELECT cg.guardian_user_id')) return [[{ guardian_user_id: 9 }, { guardian_user_id: 10 }, { guardian_user_id: 8, relationship_type: 'self' }]];
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
it('routes new guardian opens to the immutable audience gateway without modifying older memberships', async () => {
  const first = await ensureClientSecureConversation({ clientId: 4, actorUserId: 9, agencyId: 2 });
  const second = await ensureClientSecureConversation({ clientId: 4, actorUserId: 10, agencyId: 2 });
  expect(first.threadId).toBe(second.threadId);
  expect(familySharedConversations.open).toHaveBeenCalledWith({clientId:4,userId:9,agencyId:2,serviceId:null});
  expect(familySharedConversations.open).toHaveBeenCalledWith({clientId:4,userId:10,agencyId:2,serviceId:null});
  expect(pool.getConnection).not.toHaveBeenCalled();
});
it('rejects a reminder-only or unrelated account and the wrong agency', async () => {
  familySharedConversations.open.mockRejectedValueOnce(Object.assign(new Error('Access denied'),{status:403})).mockRejectedValueOnce(Object.assign(new Error('Practice unavailable'),{status:404}));
  await expect(ensureClientSecureConversation({ clientId: 4, actorUserId: 99 })).rejects.toMatchObject({ status: 403 });
  await expect(ensureClientSecureConversation({ clientId: 4, actorUserId: 9, agencyId: 8 })).rejects.toMatchObject({ status: 404 });
  expect(db.commit).not.toHaveBeenCalled();
});
it('requires client selection when a guardian has more than one child', async () => {
  pool.execute.mockResolvedValueOnce([[{ id: 9 }]]).mockResolvedValueOnce([[{ id: 4 }, { id: 5 }]]);
  await expect(resolveClientForSecureRecipients({ agencyId: 2, actorUserId: 3, recipientUserId: 9 })).rejects.toMatchObject({ status: 400 });
});
describe('two guardian account limit', () => {
  beforeEach(() => { vi.spyOn(ClientGuardian, 'hasRelationshipTypeColumn').mockResolvedValue(true); });
  it('locks the client row and refuses a third enabled guardian', async () => {
    db.execute.mockResolvedValueOnce([[{ id: 4 }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ guardian_user_id: 9 }, { guardian_user_id: 10 }]]);
    await expect(ClientGuardian.upsertLink({ clientId: 4, guardianUserId: 12, accessEnabled: true })).rejects.toMatchObject({ status: 409 });
    expect(db.execute.mock.calls[0][0]).toContain('FOR UPDATE'); expect(db.rollback).toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled();
  });
  it('allows a second guardian and excludes the updated account from the count', async () => {
    db.execute.mockResolvedValueOnce([[{ id: 4 }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ guardian_user_id: 9 }]]).mockResolvedValueOnce([{}]);
    await ClientGuardian.upsertLink({ clientId: 4, guardianUserId: 10, accessEnabled: true });
    expect(db.execute.mock.calls[2][1]).toEqual([4, 10]); expect(db.commit).toHaveBeenCalled();
  });
});
it('rejects a revoked actor with stale old membership without adding anyone to that history', async () => {
  clinicalAccess.mockImplementation(async ({ userId }) => ({ scopes: userId === 9 ? [] : ['clinical_messages'] }));
  const execute=pool.execute.getMockImplementation();pool.execute.mockImplementation(async(sql,...params)=>sql.includes('SELECT client_id,agency_id,service_enrollment_id')?[[{client_id:4,agency_id:2,message_channel:'secure'}]]:sql.startsWith('SELECT user_id FROM chat_thread_participants')?[[{user_id:9}]]:execute(sql,...params));
  await expect(refreshClientSecureAccess(5,9)).rejects.toMatchObject({status:403});
  expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT')&&sql.includes('chat_thread_participants'))).toBe(false);
});

it("resolves self access through the authorized relationship, without a nonexistent clients.user_id column",async()=>{const audience=await clientSecureAudience(4);expect(audience.participants.find(p=>p.id===8).role).toBe("client");expect(audience.guardians).not.toContain(8);expect(pool.execute.mock.calls.some(([sql])=>/c\.user_id|organization_id, user_id/.test(sql))).toBe(false);});
