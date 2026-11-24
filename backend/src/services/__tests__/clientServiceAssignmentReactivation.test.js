import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),reactivate:vi.fn(),scope:vi.fn(),offering:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.execute,beginTransaction:m.begin,commit:m.commit,rollback:m.rollback,release:m.release})},onTableWrite:vi.fn()}));
vi.mock('../clientReactivation.service.js',async original=>({...await original(),reactivateClientForActivity:m.reactivate}));
vi.mock('../clientAssignmentScope.service.js',()=>({assertAssignableProvider:m.scope}));
vi.mock('../providerServiceOfferings.service.js',()=>({requireAssignmentService:m.offering}));
vi.mock('../clientServiceCatalog.service.js',()=>({clientServiceKindsForAgency:async()=>['tutoring','counseling']}));
import {saveClientService} from '../clientServiceEnrollment.service.js';
let prior,ended;
const context=()=>({clientId:8,agencyId:2,userId:9,input:{serviceKind:'tutoring',providerUserId:7,organizationId:0,label:'Tutoring'}});
beforeEach(()=>{
 vi.clearAllMocks();m.scope.mockResolvedValue(undefined);m.offering.mockResolvedValue(undefined);m.reactivate.mockResolvedValue({reactivated:true});prior=false;ended=false;
 m.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT c.id FROM clients')||sql.startsWith('SELECT id FROM clients WHERE'))return [[{id:8}]];
  if(sql.startsWith('SELECT id AS ended_service_id'))return [ended?[{ended_service_id:5}]:[]];
  if(sql.startsWith('SELECT id FROM client_service_enrollments'))return [prior?[{id:5}]:[]];
  if(sql.startsWith('SELECT id,service_kind'))return [[{id:5,service_kind:'tutoring',label:'Tutoring',organization_id:0}]];
  if(sql.startsWith('SELECT e.*'))return [[]];
  return [{affectedRows:1,insertId:6}];
 });
});
it('reactivates a new service-specific provider assignment in the saved service transaction',async()=>{
 await saveClientService(context());expect(m.reactivate).toHaveBeenCalledWith(expect.objectContaining({clientId:8,agencyId:2,actorUserId:9,trigger:'provider_assignment'}),expect.objectContaining({executor:expect.objectContaining({execute:m.execute})}));
 const insert=m.execute.mock.calls.findIndex(([sql])=>sql.startsWith('INSERT INTO client_service_enrollments'));expect(m.execute.mock.invocationCallOrder[insert]).toBeLessThan(m.reactivate.mock.invocationCallOrder[0]);expect(m.commit).toHaveBeenCalledOnce();
});
it('does not reactivate when an existing service keeps the same provider',async()=>{
 prior=true;const input=context();input.input.serviceId=5;input.input.label='Updated label';await saveClientService(input);expect(m.reactivate).not.toHaveBeenCalled();
});
it('reactivates a new provider on an existing service',async()=>{
 const input=context();input.input.serviceId=5;await saveClientService(input);expect(m.reactivate).toHaveBeenCalledOnce();
});
it('does not activate an unassigned service',async()=>{
 const input=context();input.input.providerUserId=0;await saveClientService(input);expect(m.reactivate).not.toHaveBeenCalled();
});
it('does not reactivate when provider authorization fails',async()=>{
 m.scope.mockRejectedValueOnce(Object.assign(Error('Not authorized'),{status:403}));await expect(saveClientService(context())).rejects.toMatchObject({status:403});expect(m.reactivate).not.toHaveBeenCalled();expect(m.rollback).toHaveBeenCalledOnce();
});
it('preserves an ended service instead of reactivating it from a new-assignment request',async()=>{
 ended=true;await expect(saveClientService(context())).rejects.toMatchObject({status:409});expect(m.reactivate).not.toHaveBeenCalled();expect(m.commit).not.toHaveBeenCalled();
});
it('rolls back a new service if reactivation cannot be audited',async()=>{
 m.reactivate.mockRejectedValueOnce(Error('AUDIT_FAILED'));await expect(saveClientService(context())).rejects.toThrow('AUDIT_FAILED');expect(m.rollback).toHaveBeenCalledOnce();expect(m.commit).not.toHaveBeenCalled();
});
