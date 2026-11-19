import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: m.getConnection } }));
import ClientGuardian from '../ClientGuardian.model.js';
let db, current, independent;
const pending = { access_enabled: 0, permissions_json: { pendingGuardianVerification: true } };
const input = { clientId: 4, guardianUserId: 8, accessEnabled: true, permissionsJson: { canViewDocs: true }, expectedLink: pending };
beforeEach(() => {
  vi.clearAllMocks();current = pending;independent=null;ClientGuardian._hasRelationshipTypeColumn = true;
  db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    execute: vi.fn(async sql => sql.includes('SELECT access_enabled') ? [[current].filter(Boolean)]
      : sql.includes('SELECT user_id FROM client_portal_independence') ? [[independent].filter(Boolean)] : [[]]) };
  m.getConnection.mockResolvedValue(db);
});
it('does not overwrite a staff restriction saved while enrollment was finishing', async () => {
  current = { access_enabled: 0, permissions_json: { pendingGuardianVerification: true, portalAccessDecision: 'none' } };
  await expect(ClientGuardian.upsertLink(input)).rejects.toHaveProperty('status', 409);
  expect(db.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO client_guardians'))).toBe(false);
  expect(db.rollback).toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
});
it('confirms an unchanged prepared relationship under the client lock', async () => {
  await expect(ClientGuardian.upsertLink(input)).resolves.toBe(true);
  expect(db.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(db.commit).toHaveBeenCalled();
});
it('does not replace a relationship created after a new-account check', async () => {
  await expect(ClientGuardian.upsertLink({ ...input, expectedLink: null })).rejects.toHaveProperty('status', 409);
  expect(db.commit).not.toHaveBeenCalled();
});
it('keeps a client independence request closed even when full guardian access was prepared before the request',async()=>{
 independent={user_id:9};
 await expect(ClientGuardian.upsertLink({...input,permissionsJson:{enrollmentAccessConfirmed:true}})).rejects.toHaveProperty('status',409);
 expect(db.commit).not.toHaveBeenCalled();
});
it('permits an enrolled guardian without the old two-guardian preparation limit',async()=>{
 const execute=db.execute.getMockImplementation();
 db.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT guardian_user_id')?[[{guardian_user_id:9},{guardian_user_id:10}]]:execute(sql,...args));
 await expect(ClientGuardian.upsertLink({...input,permissionsJson:{enrollmentAccessConfirmed:true}})).resolves.toBe(true);
});
