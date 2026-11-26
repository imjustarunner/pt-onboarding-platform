import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {reactivateClientForActivity,reactivateSubmittedIntakeClients,REACTIVATION_TRIGGERS} from '../clientReactivation.service.js';
let store,connection,db,snapshot;
const input={clientId:8,agencyId:2,actorUserId:7,trigger:'event_registration',sourceId:'event:12:new-registration'};
beforeEach(()=>{
 store={client:{id:8,agency_id:2,status:'ARCHIVED',client_status_id:11,client_status_key:'inactive',is_demo:0,created_via_dev_fill:0,terminated_at:'2026-10-01 12:00:00',updated_at:'2026-10-01 12:00:00',termination_last_provider_id:99},history:[],pending:false,closedAt:'2026-10-01 12:00:00',failAudit:false};
 connection={beginTransaction:vi.fn(async()=>{snapshot=structuredClone(store);}),commit:vi.fn(async()=>{}),rollback:vi.fn(async()=>{store=snapshot;}),release:vi.fn(),execute:vi.fn(async(sql,args)=>{
  if(sql.includes('s.status_key AS client_status_key'))return [[!args[1]||args[1]===store.client.agency_id?store.client:undefined].filter(Boolean)];
  if(sql.startsWith('SELECT id FROM client_status_history'))return [[...store.history.filter(h=>h.field==='reactivated'&&h.note.includes(args[1].slice(1,-1))).map(()=>({id:1}))]];
  if(sql.includes('MAX(changed_at)'))return [[{closed_at:store.closedAt}]];
  if(sql.startsWith('SELECT id FROM client_schedule_termination_jobs'))return [store.pending?[{id:3}]:[]];
  if(sql.startsWith('SELECT id,status_key'))return [[{id:2,status_key:'current'},{id:3,status_key:'prospective'},{id:20,status_key:'packet'}]];
  if(sql.startsWith('UPDATE clients')){Object.assign(store.client,{status:args[0],client_status_id:args[1],client_status_key:args[1]===3?'prospective':'current',terminated_at:null});return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO client_status_history')){if(store.failAudit)throw Error('AUDIT_FAILED');store.history.push({actor:args[1],field:args[2],from:args[3],to:args[4],note:args[5]});return [{insertId:store.history.length}];}
  throw Error('Unexpected query: '+sql);
 })};db={getConnection:vi.fn(async()=>connection)};
});
describe('deliberate returns from Inactive',()=>{
 it.each(REACTIVATION_TRIGGERS.filter(t=>t!=='guardian_return_request'))('reactivates for saved %s with attributed history',async trigger=>{
  const result=await reactivateClientForActivity({...input,trigger},{db});expect(result).toMatchObject({reactivated:true,status:'ACTIVE',reviewOnly:false});
  expect(store.history).toHaveLength(3);expect(store.history.every(h=>h.actor===7)).toBe(true);
  expect(JSON.parse(store.history.find(h=>h.field==='reactivated').from)).toMatchObject({lastProviderId:99,terminatedAt:'2026-10-01 12:00:00'});
  expect(store.client.termination_last_provider_id).toBe(99);expect(store.client.terminated_at).toBeNull();expect(connection.commit).toHaveBeenCalledOnce();
  const updates=connection.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE')).map(([sql])=>sql).join('\n');expect(updates).not.toMatch(/provider_id\s*=|UPDATE appointments|UPDATE client_service_enrollments|UPDATE client_provider_assignments/);
 });
 it('reopens guardian requests for review without restarting an ended service',async()=>{
  expect(await reactivateClientForActivity({...input,trigger:'guardian_return_request'},{db})).toMatchObject({status:'PENDING_REVIEW',statusKey:'prospective',reviewOnly:true});
 });
 it('does not replay an old activity after a later closure',async()=>{
  await reactivateClientForActivity(input,{db});Object.assign(store.client,{status:'ARCHIVED',client_status_id:11,client_status_key:'inactive'});
  expect(await reactivateClientForActivity(input,{db})).toMatchObject({reactivated:false,reason:'activity_already_applied'});expect(store.client.status).toBe('ARCHIVED');expect(store.history).toHaveLength(3);
 });
 it('does not reopen on a form submitted before the latest closure',async()=>{
  expect(await reactivateClientForActivity({...input,trigger:'form_submission',occurredAt:'2026-09-30 12:00:00'},{db})).toMatchObject({reactivated:false,reason:'activity_predates_closure'});expect(store.history).toHaveLength(0);
 });
 it('uses a new form after closure, with an honest public-intake actor',async()=>{
  await reactivateClientForActivity({...input,trigger:'form_submission',occurredAt:'2026-10-02 12:00:00',actorUserId:null},{db});expect(store.client.status).toBe('ACTIVE');expect(store.history.every(h=>h.actor===null)).toBe(true);
 });
 it.each(['login','contact_edit','old_balance_payment'])('rejects passive trigger %s',async trigger=>{await expect(reactivateClientForActivity({...input,trigger},{db})).rejects.toMatchObject({status:400});expect(db.getConnection).not.toHaveBeenCalled();});
 it.each([{client_status_key:'archived'},{is_demo:1},{created_via_dev_fill:1},{termination_reason:'Fake client.'},{compliance_archived_at:'2026-09-01'}])('retains excluded record %j',async change=>{
  Object.assign(store.client,change);expect(await reactivateClientForActivity(input,{db})).toMatchObject({reactivated:false});expect(store.history).toHaveLength(0);expect(store.client.status).toBe('ARCHIVED');
 });
 it('does not cross an unauthorized agency boundary',async()=>{await expect(reactivateClientForActivity({...input,agencyId:9},{db})).rejects.toMatchObject({status:404});expect(store.history).toHaveLength(0);});
 it.each(['Client requested testing with a specialist','No longer attending, for example after moving'])('does not confuse a real clinical reason with a demo marker: %s',async reason=>{
  store.client.termination_reason=reason;expect(await reactivateClientForActivity(input,{db})).toMatchObject({reactivated:true});
 });
 it('waits for prior closure cleanup before a new assignment',async()=>{store.pending=true;await expect(reactivateClientForActivity({...input,trigger:'provider_assignment'},{db})).rejects.toMatchObject({status:409});expect(store.client.status).toBe('ARCHIVED');});
 it('rolls back a status transition if its audit cannot be saved',async()=>{store.failAudit=true;await expect(reactivateClientForActivity(input,{db})).rejects.toThrow('AUDIT_FAILED');expect(store.client.status).toBe('ARCHIVED');expect(store.history).toHaveLength(0);expect(connection.rollback).toHaveBeenCalledOnce();});
 it('leaves transaction control with the originating saved activity',async()=>{await reactivateClientForActivity(input,{executor:connection});expect(connection.beginTransaction).not.toHaveBeenCalled();expect(connection.commit).not.toHaveBeenCalled();expect(connection.release).not.toHaveBeenCalled();});
});
it('reactivates only server-bound clients from a completed form, including siblings',async()=>{
 const reactivate=vi.fn();const execute=vi.fn(async()=>[[{id:8,agency_id:2,submitted_at:'2026-11-23 12:00:00'},{id:9,agency_id:2,submitted_at:'2026-11-23 12:00:00'}]]);
 expect(await reactivateSubmittedIntakeClients(100,{db:{execute},reactivate})).toEqual({processed:2});expect(reactivate).toHaveBeenCalledTimes(2);
 expect(execute.mock.calls[0][0]).toContain("s.status='submitted'");expect(execute.mock.calls[0][0]).toContain('intake_submission_clients');
 expect(reactivate).toHaveBeenCalledWith(expect.objectContaining({clientId:9,agencyId:2,sourceId:'intake:100',occurredAt:'2026-11-23 12:00:00',actorUserId:null}),expect.anything());
});

it('allows record imports to reopen only a current-client transition from ordinary Inactive', async () => {
 store.client.client_status_key='terminated';
 const result=await reactivateClientForActivity({...input,trigger:'records_import',sourceId:'records-import:2'},{db});
 expect(result.reactivated).toBe(false);
 expect(store.history).toHaveLength(0);
 expect(store.client.status).toBe('ARCHIVED');
});
