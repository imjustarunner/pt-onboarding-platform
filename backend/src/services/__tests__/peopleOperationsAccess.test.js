import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../agencyAccessProfiles.service.js', () => ({
  accessProfileSchemaReady: vi.fn(async () => true),
  agencyIdsWithPermission: vi.fn(async () => [2]),
  readAgencyAccess: vi.fn(async (_userId, agencyId) => ({ permissions: { has_hiring_access: Number(agencyId) === 2 } }))
}));
import { accessProfileSchemaReady, agencyIdsWithPermission, readAgencyAccess } from '../agencyAccessProfiles.service.js';
import {
  canAccessPeopleOperations, peopleOperationsAgencyIds,
  appendPeopleOperationsTicketVisibility, peopleOperationsRecipients
} from '../peopleOperationsAccess.service.js';

const employee = (id = 5, changes = {}) => ({ id, role:'support', status:'ACTIVE_EMPLOYEE',
  email:`employee${id}@agency.test`, work_email:`employee${id}@agency.test`,
  is_active:1,is_archived:0,is_demo:0,is_assistant_account:0,has_hiring_access:0,...changes });
let users, memberships, db;
beforeEach(() => {
  vi.clearAllMocks();
  accessProfileSchemaReady.mockResolvedValue(true);
  agencyIdsWithPermission.mockResolvedValue([2]);
  readAgencyAccess.mockImplementation(async (_id, agencyId) => ({permissions:{has_hiring_access:Number(agencyId)===2}}));
  users = [employee()]; memberships = [{agency_id:2}];
  db = {execute:vi.fn(async (sql, params = []) => {
    expect((sql.match(/\?/g)||[]).length).toBe(params.length);
    if (sql.includes('FROM users u WHERE u.id')) return [users.filter(user=>user.id===Number(params[0]))];
    if (sql.includes('ORDER BY u.last_name')) return [users];
    if (sql.startsWith('SELECT id FROM agencies')) return [[{id:2},{id:3}]];
    if (sql.includes('FROM user_agencies ua')) return [params.length===2 ? memberships.filter(row=>row.agency_id===Number(params[1])) : memberships];
    throw new Error(`Unexpected query in People Operations fixture: ${sql}`);
  })};
});

describe('organization People Operations authority', () => {
  it('uses the hiring permission for the selected company rather than payroll access', async () => {
    users=[employee(5,{has_payroll_access:1})];
    expect(await canAccessPeopleOperations(5,2,db)).toBe(true);
    expect(await canAccessPeopleOperations(5,3,db)).toBe(false);
  });
  it('honors an explicit company Off even for an admin with a global hiring flag', async () => {
    users=[employee(5,{role:'admin',has_hiring_access:1})];
    readAgencyAccess.mockResolvedValue({permissions:{has_hiring_access:false},sources:{has_hiring_access:'agency_override'}});
    expect(await canAccessPeopleOperations(5,2,db)).toBe(false);
  });
  it('supports authorized platform staff without requiring an employment affiliation', async () => {
    readAgencyAccess.mockResolvedValue({platformAccessOnly:true,membership:false,permissions:{has_hiring_access:true}});
    expect(await canAccessPeopleOperations(5,2,db)).toBe(true);
    expect(db.execute.mock.calls.some(([sql])=>sql.includes('FROM user_agencies ua'))).toBe(false);
  });
  it('preserves the active superadmin owner without granting a role to any account', async () => {
    users=[employee(5,{role:'super_admin'})];
    expect(await canAccessPeopleOperations(5,3,db)).toBe(true);
    expect(readAgencyAccess).not.toHaveBeenCalled();
    expect(db.execute.mock.calls.every(([sql])=>sql.trim().startsWith('SELECT'))).toBe(true);
  });
  it.each([
    {is_active:0},{is_archived:1},{is_demo:1},{is_assistant_account:1},
    {status:'INACTIVE_EMPLOYEE'},{status:'TERMINATED'},
    {role:'client_guardian'},{role:'client'},{role:'school_staff'}
  ])('rejects inactive, demo, assistant, and non-staff identities: %j', async changes => {
    users=[employee(5,changes)];
    expect(await canAccessPeopleOperations(5,2,db)).toBe(false);
    expect(readAgencyAccess).not.toHaveBeenCalled();
  });
  it('fails closed when the current organization profile is missing', async () => {
    readAgencyAccess.mockResolvedValue(null);
    expect(await canAccessPeopleOperations(5,2,db)).toBe(false);
  });
  it('requires both the legacy hiring flag and active membership before the profile rollout', async () => {
    accessProfileSchemaReady.mockResolvedValue(false);
    users=[employee(5,{has_hiring_access:1})];
    expect(await canAccessPeopleOperations(5,2,db)).toBe(true);
    expect(await canAccessPeopleOperations(5,3,db)).toBe(false);
    users=[employee(5,{has_payroll_access:1})];
    expect(await canAccessPeopleOperations(5,2,db)).toBe(false);
  });
  it('rejects malformed user and organization identifiers', async () => {
    for(const agency of [0,-1,'invalid',null]) expect(await canAccessPeopleOperations(5,agency,db)).toBe(false);
    expect(await canAccessPeopleOperations({id:5,role:'super_admin'},2,db)).toBe(false);
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe('People Operations queue and recipient privacy', () => {
  it('rechecks current grants before using materialized profile IDs in the queue filter', async () => {
    agencyIdsWithPermission.mockResolvedValue([2,3]);
    expect(await peopleOperationsAgencyIds(5,db)).toEqual([2]);
    expect(agencyIdsWithPermission).toHaveBeenCalledWith(5,'has_hiring_access',db);
  });
  it('filters before pagination, preserves the requester, and gives no claimant/payroll bypass', async () => {
    const where=[],params=[];
    await appendPeopleOperationsTicketVisibility(5,where,params,db);
    expect(params).toEqual([5,2]);
    expect(where.join(' ')).toContain("<>'people_operations'");
    expect(where.join(' ')).toContain('t.created_by_user_id=?');
    expect(where.join(' ')).not.toMatch(/claimed_by|payroll/);
    expect((where.join(' ').match(/\?/g)||[]).length).toBe(params.length);
  });
  it('limits a requester without staff permissions to their own People Operations conversations', async () => {
    users=[employee(5,{role:'client'})];
    const where=[],params=[];
    await appendPeopleOperationsTicketVisibility(5,where,params,db);
    expect(params).toEqual([5]);
    expect(where.join(' ')).not.toContain('agency_id IN');
  });
  it('keeps the active global owner visible across companies', async () => {
    users=[employee(5,{role:'super_admin'})];
    const where=[],params=[];
    await appendPeopleOperationsTicketVisibility(5,where,params,db);
    expect(where).toEqual([]);expect(params).toEqual([]);
  });
  it('excludes payroll-only and other-company staff from notices and assignment choices', async () => {
    users=[employee(1,{role:'super_admin'}),employee(2),employee(3,{has_payroll_access:1}),employee(4),employee(5,{role:'provider'})];
    readAgencyAccess.mockImplementation(async (id,agencyId)=>({permissions:{has_hiring_access:Number(agencyId)===2&&[2,5].includes(id)}}));
    expect((await peopleOperationsRecipients(2,db)).map(user=>user.id)).toEqual([1,2,5]);
  });
});
