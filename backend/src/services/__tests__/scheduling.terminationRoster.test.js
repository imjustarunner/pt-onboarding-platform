import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../providerSlots.service.js',()=>({adjustProviderSlots:vi.fn(async()=>({ok:true}))}));
import { adjustProviderSlots } from '../providerSlots.service.js';
import { closeTerminatedClientRoster, hasTerminalClientStatus, visibleSchoolRosterClients } from '../clientTerminationRoster.service.js';
import { applyTerminationReconciliationPlan, buildTerminationReconciliationPlan, terminationReconciliationDecision } from '../clientTerminationReconciliation.service.js';
beforeEach(()=>vi.clearAllMocks());
function rosterDb({status='ACTIVE',key='terminated',assignments=[{id:3,organization_id:7,provider_user_id:9,service_day:'Monday'}]}={}) {
  const client={id:8,agency_id:2,status,client_status_key:key,provider_id:assignments.length?9:null,organization_id:7,service_day:assignments.length?'Monday':null};
  return {execute:vi.fn(async sql=>{
    if(sql.includes('LEFT JOIN client_statuses'))return [[client]];
    if(sql.includes('SELECT id,organization_id'))return [assignments];
    return [{affectedRows:1}];
  })};
}
it('archives the current roster and retains ended provider assignments and history',async()=>{
  const db=rosterDb();
  expect(await closeTerminatedClientRoster(db,{clientId:8,actorUserId:9})).toEqual({changed:true,assignmentsClosed:1});
  const calls=db.execute.mock.calls;
  expect(calls.some(([sql])=>sql.includes("status='ARCHIVED',provider_id=NULL,service_day=NULL"))).toBe(true);
  expect(calls.some(([sql])=>sql.includes('SET is_active=FALSE,is_primary=FALSE'))).toBe(true);
  expect(calls.filter(([sql])=>sql.includes('INSERT INTO client_status_history'))).toHaveLength(3);
  expect(calls.some(([sql])=>/DELETE\s+FROM|UPDATE appointments|clinical_notes/i.test(sql))).toBe(false);
  expect(adjustProviderSlots).toHaveBeenCalledExactlyOnceWith(db,expect.objectContaining({delta:0,providerUserId:9,schoolId:7}));
});
it('an already closed roster does not create duplicate audit or capacity changes',async()=>{
  const db=rosterDb({status:'ARCHIVED',assignments:[]});
  expect(await closeTerminatedClientRoster(db,{clientId:8})).toEqual({changed:false,assignmentsClosed:0});
  expect(db.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO client_status_history'))).toBe(false);
  expect(adjustProviderSlots).not.toHaveBeenCalled();
});
it('a historic termination timestamp does not end a currently active episode',async()=>{
  expect(hasTerminalClientStatus({client_status_key:'current',terminated_at:'2020-01-01'})).toBe(false);
  const db=rosterDb({key:'current'});
  expect(await closeTerminatedClientRoster(db,{clientId:8})).toEqual({changed:false,assignmentsClosed:0});
  expect(db.execute).toHaveBeenCalledTimes(1);
});
it('propagates roster history failures so the enclosing client update can roll back',async()=>{
  const db=rosterDb(),base=db.execute.getMockImplementation();
  db.execute.mockImplementation((sql,...args)=>sql.includes('INSERT INTO client_status_history')?Promise.reject(new Error('audit unavailable')):base(sql,...args));
  await expect(closeTerminatedClientRoster(db,{clientId:8})).rejects.toThrow('audit unavailable');
  expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
const candidate={id:8,agency_id:2,status:'ACTIVE',client_status_id:4,provider_id:9,terminated_at:'2025-01-01',updated_at:'2025-01-01',client_status_key:'terminated',active_assignments:1};
it('holds reopened episodes and every future-care source for review',()=>{
  expect(terminationReconciliationDecision({...candidate,client_status_key:'current'}).eligible).toBe(false);
  for(const source of ['future_appointments','future_office_events','future_booking_plans','future_provider_events','future_clinical_sessions']){
    expect(terminationReconciliationDecision({...candidate,[source]:1}).eligible).toBe(false);
  }
  expect(terminationReconciliationDecision(candidate).eligible).toBe(true);
});
it('produces aggregate counts and an identity-minimized plan without writing',async()=>{
  const db={execute:vi.fn(async()=>[[candidate,{...candidate,id:10,client_status_key:'current'}]])};
  const plan=await buildTerminationReconciliationPlan(db,{agencyId:2});
  expect(plan.summary).toMatchObject({candidateClients:2,eligibleToArchive:1,requiresReview:1,activeAssignmentsToEnd:1});
  expect(plan.entries[0]).not.toHaveProperty('provider_id');
  expect(db.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it('cannot apply a plan without an explicit separate enable flag and actor',async()=>{
  const pool={getConnection:vi.fn()};
  await expect(applyTerminationReconciliationPlan(pool,{version:1,entries:[]},{actorUserId:9})).rejects.toThrow('Explicit reviewed apply');
  expect(pool.getConnection).not.toHaveBeenCalled();
});
it('rechecks after all locks and rolls back if reviewed state changed',async()=>{
  const plan=await buildTerminationReconciliationPlan({execute:async()=>[[candidate]]},{agencyId:2});
  const events=[];
  const db={beginTransaction:vi.fn(async()=>events.push('begin')),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{
    if(sql.includes('GET_LOCK')){events.push('schedule-lock');return [[{acquired:1}]];}
    if(sql.includes('FOR UPDATE')){events.push('row-lock');return [[{id:8}]];}
    if(sql.startsWith('SELECT c.id,c.agency_id')){events.push('refresh');return [[{...candidate,updated_at:'2026-01-01'}]];}
    return [[]];
  })};
  await expect(applyTerminationReconciliationPlan({getConnection:async()=>db},plan,{actorUserId:9,enabled:true})).rejects.toThrow('records changed');
  expect(events).toEqual(['schedule-lock','begin','row-lock','row-lock','refresh']);
  expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalledOnce();
  expect(db.execute.mock.calls.some(([sql])=>sql.includes('RELEASE_LOCK'))).toBe(true);
  expect(db.execute.mock.calls.some(([sql])=>/UPDATE|DELETE|INSERT/.test(sql)&&!sql.includes('FOR UPDATE'))).toBe(false);
});

it('hides current terminal records from the default roster while retaining explicit history access',()=>{
  const rows=[{id:1,client_status_key:'terminated'},{id:2,client_status_key:'current',terminated_at:'2020-01-01'},{id:3,client_status_key:'archived'}];
  expect(visibleSchoolRosterClients(rows).map(r=>r.id)).toEqual([2]);
  expect(visibleSchoolRosterClients(rows,{includeTerminated:true})).toEqual(rows);
});
