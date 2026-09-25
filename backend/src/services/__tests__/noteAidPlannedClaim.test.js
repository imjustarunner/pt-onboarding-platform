import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({agency:vi.fn(),client:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
vi.mock('../clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.agency}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:m.client}));
vi.mock('../supervisedBillingPolicy.service.js',()=>({validDate:v=>/^\d{4}-\d{2}-\d{2}$/.test(v)}));
import {plannedServiceIdentity,linkImportedPlannedServices} from '../noteAidPlannedClaim.service.js';
const item={agencyId:377,clientId:4,noteKind:'progress',serviceCode:'90837',date:'2026-09-20',timeLabel:'1:00 PM'};
beforeEach(()=>{vi.clearAllMocks();m.agency.mockResolvedValue();m.client.mockResolvedValue({ok:true,client:{agency_id:377}});});
it('only plans TISI service documents and uses a stable identity independent of queue IDs',()=>{
  expect(plannedServiceIdentity({...item,agencyId:1},3)).toBeNull();expect(plannedServiceIdentity({...item,noteKind:'termination'},3)).toBeNull();
  expect(plannedServiceIdentity({...item,id:'new-random-id'},3).key).toBe(plannedServiceIdentity(item,3).key);
  expect(plannedServiceIdentity(item,4).key).not.toBe(plannedServiceIdentity(item,3).key);
});
it('reimports reuse a permanent session without creating a claim or another session',async()=>{
  const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn().mockImplementation(async sql=>sql.startsWith('SELECT clinical_session_id')?[[{clinical_session_id:27}]]:[{}])};
  const result=await linkImportedPlannedServices([item],{id:3,role:'provider'},{getConnection:async()=>db});
  expect(result[0].clinicalSessionId).toBe(27);expect(db.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO clinical_sessions')||sql.includes('clinical_claims'))).toBe(false);expect(db.commit).toHaveBeenCalled();
});
it('refuses an ambiguous existing encounter rather than creating a duplicate original',async()=>{
  const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn().mockImplementation(async sql=>sql.startsWith('SELECT clinical_session_id')?[[{clinical_session_id:null}]]:sql.includes('FROM clinical_sessions')?[[{id:27}]]:[{}])};
  await expect(linkImportedPlannedServices([item],{id:3,role:'provider'},{getConnection:async()=>db})).rejects.toMatchObject({status:409});expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
});
it('rejects a cross-tenant client before any clinical mutation',async()=>{
  m.client.mockResolvedValue({ok:true,client:{agency_id:378}});const getConnection=vi.fn();await expect(linkImportedPlannedServices([item],{id:3,role:'provider'},{getConnection})).rejects.toMatchObject({status:403});expect(getConnection).not.toHaveBeenCalled();
});
