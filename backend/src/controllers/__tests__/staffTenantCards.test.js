import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: m }));
import { listStaffCardAgencies, guardAgencyMembershipUpdate, listStaffServiceAssignments, updateStaffServiceAssignments } from '../staffTenantCards.controller.js';
const request = (extra = {}) => ({ user: { id: 501 }, params: { id: '538', agencyId: '6' }, body: { serviceIds: [234,239] }, ...extra });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
let actor, targetMember, actorMember, connection, carePerson;
beforeEach(() => {
  carePerson={role:'admin',agency_role:'facilitator',credential:'BA',status:'ACTIVE_EMPLOYEE',is_active:1,membership_active:1,sees_clients:1};
  vi.clearAllMocks(); actor = { id: 501, role: 'super_admin', is_active: 1, status: 'ACTIVE_EMPLOYEE' }; targetMember = true; actorMember = true;
  connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
    if (sql.startsWith('SELECT u.role,u.credential')) return [[carePerson]];
    if (sql.startsWith('SELECT user_id')) return [[{user_id:538}]];
    if (sql.startsWith('SELECT id,service_code FROM tenant_services')) return [[{id:234},{id:239},{id:253}]];
    if (sql.startsWith('SELECT id FROM staff_service_assignments')) return [[{id:1}]];
    return [{affectedRows:1}];
  }) };
  m.getConnection.mockResolvedValue(connection);
  m.execute.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT id,role')) return [[actor]];
    if (sql.startsWith('SELECT user_id')) return [(args[0] === 538 ? targetMember : actorMember) ? [{user_id:args[0]}] : []];
    if (sql.includes('FROM user_agencies ua JOIN agencies')) return [[{id:6,role:'admin',status:'ACTIVE_EMPLOYEE',is_active:1},{id:9,role:'client',status:'ACTIVE',is_active:1}]];
    if (sql.includes('FROM tenant_services ts')) return [[{id:234,service_code:'H0004',business_type:'mental_health',assigned:1},{id:239,service_code:'H2014',business_type:'mental_health',assigned:1},{id:222,service_code:'90791',business_type:'mental_health',assigned:0},{id:253,service_code:'TUTORING',business_type:'tutoring',assigned:0}]];
    if (sql.startsWith('SELECT u.role,u.credential')) return [[carePerson]];
    throw Error('Unexpected SQL '+sql);
  });
});
describe('staff tenant relationships', () => {
  it('uses the same credential policy as scheduling, not a person-specific permission list', async () => {
    const res=response(); await listStaffServiceAssignments(request(),res,vi.fn());
    expect(res.json.mock.calls[0][0]).toMatchObject({credentialTier:'bachelors',credential:'BA'});
    expect(res.json.mock.calls[0][0].services.find(s=>s.service_code==='90791').allowedForCredential).toBe(false);
  });
  it.each(['BA','MA, Unlicensed Masters'])('does not grant care assignments from %s alone', async credential => {
    carePerson={...carePerson,credential,agency_role:'staff',sees_clients:0};
    const res=response(); await listStaffServiceAssignments(request(),res,vi.fn());
    expect(res.json.mock.calls[0][0]).toMatchObject({canProvideCare:false,credential});
    const update=response(); await updateStaffServiceAssignments(request(),update,vi.fn());
    expect(update.status).toHaveBeenCalledWith(403);
    expect(connection.commit).not.toHaveBeenCalled();
  });
  it('lists actual memberships even for a superadmin and excludes non-staff accounts', async () => {
    const res=response(),next=vi.fn(); await listStaffCardAgencies(request({params:{id:'501'}}),res,next);
    expect(next).not.toHaveBeenCalled(); expect(res.json.mock.calls[0][0]).toHaveLength(1);
    const [sql,args]=m.execute.mock.calls.find(([s])=>s.includes('FROM user_agencies ua JOIN agencies'));
    expect(sql).toContain('ua.user_id=?'); expect(sql).toContain('COALESCE(ua.is_active,1)=1'); expect(args).toEqual([501]);
  });
  it('intersects a tenant admin’s access with the target person’s memberships', async () => {
    actor.role='admin'; await listStaffCardAgencies(request({params:{id:'538'}}),response(),vi.fn());
    const [sql,args]=m.execute.mock.calls.find(([s])=>s.includes('FROM user_agencies ua JOIN agencies'));
    expect(sql).toContain('mine.user_id=?'); expect(args).toEqual([538,501]);
  });
  it('prevents ordinary staff from listing another employee’s tenants', async () => {
    actor.role='staff'; const res=response(); await listStaffCardAgencies(request(),res,vi.fn()); expect(res.status).toHaveBeenCalledWith(403);
  });
  it.each([guardAgencyMembershipUpdate,listStaffServiceAssignments,updateStaffServiceAssignments])('blocks cross-tenant reads and edits before returning data', async handler => {
    actor.role='admin'; actorMember=false; const res=response(),next=vi.fn(); await handler(request(),res,next);
    expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled(); expect(m.getConnection).not.toHaveBeenCalled();
  });
  it('keeps superadmin access separate from a professional role', async () => {
    const next=vi.fn(); await guardAgencyMembershipUpdate(request(),response(),next); expect(next).toHaveBeenCalledWith();
    expect(m.execute.mock.calls.some(([s])=>s.startsWith('UPDATE users'))).toBe(false);
  });
  it('rejects inactive memberships even for a superadmin', async () => {
    targetMember=false; const res=response(); await updateStaffServiceAssignments(request(),res,vi.fn()); expect(res.status).toHaveBeenCalledWith(404);
  });
  it('rejects service IDs from another tenant before making changes', async () => {
    const res=response(); await updateStaffServiceAssignments(request({body:{serviceIds:[999]}}),res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(400); expect(connection.rollback).toHaveBeenCalled(); expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.execute.mock.calls.some(([s])=>s.startsWith('UPDATE'))).toBe(false);
  });
  it('updates only the selected employee and tenant, preserving office and modality settings', async () => {
    const res=response(),next=vi.fn(); await updateStaffServiceAssignments(request(),res,next);
    expect(next).not.toHaveBeenCalled(); expect(connection.commit).toHaveBeenCalled();
    const writes=connection.execute.mock.calls.filter(([s])=>s.startsWith('UPDATE'));
    expect(writes.map(([,args])=>args)).toEqual([[1,6,234,538],[1,6,239,538],[0,6,253,538]]);
    for (const [sql] of writes) { expect(sql).toContain('AND user_id=?'); expect(sql).not.toContain('modality='); expect(sql).not.toContain('office_location_id='); }
  });
});
