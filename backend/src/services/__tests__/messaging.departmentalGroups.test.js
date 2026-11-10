import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../agencyAccessProfiles.service.js',()=>({accessProfileSchemaReady:vi.fn(async()=>false),readAgencyAccess:vi.fn()}));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { DEPARTMENTAL_GROUPS, groupKeyForIdentity, departmentalGroupKeysForUser, listUserDepartmentalGroupKeys, assertDepartmentalGroupAccess } from '../departmentalGroupAccess.service.js';
import { managedGroupEnvelope } from '../managedWorkspaceGroupAccess.service.js';
import { buildManagedGroupPlan } from '../managedWorkspaceGroupPolicy.js';

const staff = { id: 12, role: 'provider', status: 'ACTIVE_EMPLOYEE', is_active: 1, membership_active: 1, is_archived: 0, is_demo: 0 };
beforeEach(() => vi.clearAllMocks());
describe('departmental identities and permissions', () => {
  it('preserves administrator mailboxes until a sensitive category is explicitly turned off',()=>{
    const admin={...staff,role:'admin',agencyAccess:{sources:{has_billing_access:'preserved_agency_access'},permissions:{has_billing_access:false}}};
    expect(departmentalGroupKeysForUser(admin)).toContain('billing');
    expect(departmentalGroupKeysForUser({...admin,agencyAccess:{sources:{has_billing_access:'agency_override'},permissions:{has_billing_access:false}}})).not.toContain('billing');
    expect(departmentalGroupKeysForUser({...admin,agencyAccess:{sources:{has_payroll_access:'platform_default'},permissions:{has_payroll_access:false}}})).not.toContain('payroll');
  });
  it('classifies department identities while preserving individual non-SSO Group inboxes', () => {
    expect(groupKeyForIdentity({ identity_key: 'payroll', from_email: 'payroll@agency.test' })).toBe('payroll');
    expect(groupKeyForIdentity({ kind: 'shared', identity_key: 'technology', from_email: 'technology@agency.test' })).toBe('technology');
    expect(groupKeyForIdentity({ kind: 'shared', identity_key: 'compliance', from_email: 'compliance@agency.test' })).toBe('compliance');
    for (const identity of [
      { kind: 'personal', identity_key: 'payroll' },
      { owner_user_id: 12, identity_key: 'payroll' },
      { kind: 'shared', identity_key: 'personal_12', from_email: 'payroll@agency.test' },
      { kind: 'shared', identity_key: 'login_12', from_email: 'payroll@agency.test' },
      { kind: 'shared', identity_key: 'people_operations', from_email: 'po@agency.test' },
      { kind: 'shared', identity_key: 'po', from_email: 'peopleoperations@agency.test' },
      { identity_key: 'notifications', from_email: 'notifications@agency.test' }
    ]) expect(groupKeyForIdentity(identity)).toBeNull();
  });
  it('uses explicit agency grants, supports non-SSO group logins, and rejects inactive membership', () => {
    expect(departmentalGroupKeysForUser({ ...staff, login_is_group_email: 1, has_payroll_access: 1, can_manage_credentialing: 1 })).toEqual(['payroll', 'credentialing']);
    expect(departmentalGroupKeysForUser({ ...staff, role: 'support' })).toEqual(['support', 'schools', 'technology']);
    expect(departmentalGroupKeysForUser({ ...staff, role: 'staff', department: 'Payroll' })).toEqual([]);
    for (const changes of [{ membership_active: 0 }, { is_active: 0 }, { is_demo: 1 }, { is_archived: 1 }, { is_assistant_account: 1 }, { role: 'school_staff' }]) {
      expect(departmentalGroupKeysForUser({ ...staff, has_payroll_access: 1, ...changes })).toEqual([]);
    }
  });
  it('keeps billing and payroll rights within the requested agency', async () => {
    pool.execute.mockImplementation(async (sql, args) => [[{ ...staff, has_payroll_access: Number(args[1]) === 2 ? 1 : 0 }]]);
    expect(await listUserDepartmentalGroupKeys({ agencyId: 2, userId: 12 })).toEqual(['payroll']);
    await expect(assertDepartmentalGroupAccess({ agencyId: 3, userId: 12, groupKey: 'payroll' })).rejects.toMatchObject({ status: 403 });
  });
  it('gives agency administrators access without relying on Google delivery preferences', () => {
    expect(departmentalGroupKeysForUser({ ...staff, role: 'admin' })).toEqual(Object.keys(DEPARTMENTAL_GROUPS));
  });
  it('adds only granted staff to the departmental plan', () => {
    const plans = buildManagedGroupPlan({ domain: 'agency.test', rows: [{ ...staff, has_payroll_access: 1 }, { ...staff, id: 13 }] });
    expect(plans.find(plan => plan.key === 'payroll')).toMatchObject({ userIds: [12], ticketed: true });
    expect(plans.find(plan => plan.key === 'billing').userIds).toEqual([]);
  });
  it('keeps People Operations and hiring access outside this ticketed group rollout', () => {
    expect(DEPARTMENTAL_GROUPS).not.toHaveProperty('people_operations');
    expect(departmentalGroupKeysForUser({ ...staff, has_hiring_access: 1 })).toEqual([]);
    const plans = buildManagedGroupPlan({ domain: 'agency.test', rows: [{ ...staff, role: 'admin', has_hiring_access: 1 }] });
    expect(plans.some(plan => ['po', 'people_operations'].includes(plan.key))).toBe(false);
    for (const key of ['technology', 'compliance']) expect(plans.find(plan => plan.key === key)).toMatchObject({ ticketed: true, userIds: [12] });
  });
  it('sends to a departmental address without distributing copies to individual members', async () => {
    pool.execute.mockResolvedValue([[{ group_key: 'payroll', email: 'payroll@agency.test', member_emails: ['private@agency.test'] }]]);
    expect(await managedGroupEnvelope({ to: 'Payroll <payroll@agency.test>', actorUserId: 12 })).toEqual({ to: 'Payroll <payroll@agency.test>', cc: null, bcc: null });
  });
});
