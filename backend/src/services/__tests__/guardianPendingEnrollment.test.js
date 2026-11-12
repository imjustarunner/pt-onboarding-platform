import { beforeEach, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../config/config.js', () => ({ default: { jwt: { secret: 'unit-test-secret' } } }));
import { listOwnPendingEnrollments, openOwnPendingEnrollment, resolvePortalEnrollmentCapability } from '../guardianPendingEnrollment.service.js';
const scope = { userId: 9, agencyId: 450, inviteId: 28 };
let rows, db, drafts;
beforeEach(() => {
  drafts = [];
  rows = [6, 7].map(id => ({ id: 28, invited_email:'owner@example.test', public_key:'own-form', agency_id: 450, client_agency_id: 450, client_type: 'school', status: 'pending', expires_at: '2099-01-01T00:00:00Z', client_id: id, full_name: `Child ${id}`, guardian_portal_enabled: 1, access_enabled: 1, date_of_birth: '2020-01-01', permissions_json: '{}' }));
  db = { execute: vi.fn(async sql => sql.includes('FROM intake_submissions') ? [drafts] : sql.startsWith('SELECT *') ? [[rows[0]]] : [rows]) };
});
it('lists both children without returning private enrollment answers or the emailed token', async () => {
  const result = await listOwnPendingEnrollments(scope, db);
  expect(result).toEqual([{ id: 28, agencyId: 450, expired: false, children: [{ id: 6, name: 'Child 6' }, { id: 7, name: 'Child 7' }] }]);
  expect(db.execute.mock.calls[0][1]).toEqual([9, 450, 0, 28, 28, null, null]);
});
it.each([{access_enabled:0}, {client_agency_id:2}, {client_type:'learning'}, {guardian_portal_enabled:0}, {permissions_json:'{"canSignDocs":false}'}, {permissions_json:'{"noViewOtherGuardian":true}'}, {date_of_birth:'1990-01-01'}])('requires rights for every child in the invitation: %j', async change => {
  Object.assign(rows[1], change);
  expect(await listOwnPendingEnrollments(scope, db)).toEqual([]);
  await expect(openOwnPendingEnrollment(scope, db)).rejects.toMatchObject({ status: 403 });
});
it('mints a short lived enrollment capability that cannot serve as a login token and makes no database writes', async () => {
  const { token } = await openOwnPendingEnrollment(scope, db);
  expect(() => jwt.verify(token.slice(7), 'unit-test-secret')).toThrow();
  expect(await resolvePortalEnrollmentCapability(token, db)).toEqual(rows[0]);
  expect(db.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
  await expect(resolvePortalEnrollmentCapability(`${token}tampered`, db)).rejects.toMatchObject({status:403});
  rows[1].access_enabled = 0;
  await expect(resolvePortalEnrollmentCapability(token, db)).rejects.toMatchObject({status:403});
});
it('cannot open another account’s invitation or expired enrollment', async () => {
  rows=[];await expect(openOwnPendingEnrollment(scope,db)).rejects.toMatchObject({status:403});
  rows=[{id:28,agency_id:450,client_agency_id:450,client_type:'school',status:'expired',expires_at:'2020-01-01',access_enabled:1,guardian_portal_enabled:1}];
  expect((await listOwnPendingEnrollments(scope,db))[0].expired).toBe(true);
  await expect(openOwnPendingEnrollment(scope,db)).rejects.toMatchObject({status:403});
});

it('opens only the exact isolated invitation without granting access to the other guardian’s documents',async()=>{
 rows.forEach(row=>row.permissions_json={isolatedIntake:true,coGuardianInviteRestricted:true,coGuardianInviteId:28,noView:true,noViewOtherGuardian:true,canViewDocs:false,canSignDocs:false});
 expect((await listOwnPendingEnrollments(scope,db))[0].children).toHaveLength(2);expect((await openOwnPendingEnrollment(scope,db)).token).toMatch(/^portal\./);
 rows[1].permissions_json.coGuardianInviteId=29;expect(await listOwnPendingEnrollments(scope,db)).toEqual([]);
});

it('resumes only this authenticated guardian’s saved enrollment bound to this exact invitation',async()=>{
 drafts=[{id:100,co_guardian_invite_id:28,public_key:'own-form',guardian_user_id:9,status:'consented',session_token:'same-owned-return-session',draft_expires_at:'2099-01-01',retention_expires_at:'2099-01-01',intake_data:{guardian:{email:'owner@example.test'},responses:{clients:[{ownAnswer:'private own answer'}]}}}];
 const before=structuredClone(drafts);expect((await openOwnPendingEnrollment(scope,db)).sessionToken).toBe('same-owned-return-session');expect(drafts).toEqual(before);
 expect(db.execute.mock.calls.every(([sql])=>sql.trim().startsWith('SELECT'))).toBe(true);
});
it.each([
 {guardian_user_id:10}, {co_guardian_invite_id:29}, {public_key:'other-form'}, {status:'submitted'},
 {draft_expires_at:'2020-01-01'}, {session_token:null},
 {guardian_user_id:null,intake_data:{guardian:{email:'other-parent@example.test'}}}
])('does not expose or renew a different owner/form, completed, expired or revoked session: %j',async change=>{
 drafts=[{id:100,co_guardian_invite_id:28,public_key:'own-form',guardian_user_id:9,status:'consented',session_token:'do-not-return',draft_expires_at:'2099-01-01',retention_expires_at:'2099-01-01',intake_data:{guardian:{email:'owner@example.test'}},...change}];
 expect((await openOwnPendingEnrollment(scope,db)).sessionToken).toBeNull();expect(db.execute.mock.calls.every(([sql])=>sql.trim().startsWith('SELECT'))).toBe(true);
});
it('can restore a pre-activation saved session only when its invited email matches the current authenticated invitation owner',async()=>{
 drafts=[{id:100,co_guardian_invite_id:28,public_key:'own-form',guardian_user_id:null,status:'consented',session_token:'own-before-account-activation',draft_expires_at:'2099-01-01',intake_data:{progressSnapshot:{guardian:{email:'owner@example.test'}}}}];
 expect((await openOwnPendingEnrollment(scope,db)).sessionToken).toBe('own-before-account-activation');
});

it('restores encrypted pre-activation answers only for the exact invited owner',async()=>{
 vi.stubEnv('INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));
 try{
  const {encryptIntakePayload}=await import('../intakeResponsesEncryption.service.js');
  const encrypted=encryptIntakePayload({intakeData:{guardian:{email:'owner@example.test'},responses:{clients:[{ownAnswer:'second-parent-only'}]}}});
  drafts=[{id:101,co_guardian_invite_id:28,public_key:'own-form',guardian_user_id:null,status:'consented',session_token:'encrypted-owned-draft',draft_expires_at:'2099-01-01',intake_data:null,payload_encrypted:encrypted.ciphertext,payload_iv_b64:encrypted.ivB64,payload_auth_tag_b64:encrypted.authTagB64,payload_key_id:encrypted.keyId}];
  expect((await openOwnPendingEnrollment(scope,db)).sessionToken).toBe('encrypted-owned-draft');
 }finally{vi.unstubAllEnvs();}
});
