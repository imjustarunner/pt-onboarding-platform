import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {createNoteworthyLifecycle,noteworthyTrialState} from '../noteworthyLifecycle.service.js';
import {noteworthyTrialDb} from './fixtures/noteworthyTrialDb.js';
let fixture,service;
const now=new Date('2026-11-12T20:00:00Z');
beforeEach(()=>{fixture=noteworthyTrialDb();service=createNoteworthyLifecycle({db:fixture.db,now:()=>now,encrypt:v=>({encrypted:v})});});
afterEach(()=>fixture.close());
it('does not spend the 30-day no-card trial before activation and requires explicit data-policy acceptance',async()=>{
  expect(await service.status(1,1)).toMatchObject({trialDays:30,cardRequired:false,trialStartedAt:null,policyAccepted:false,canWrite:false});
  await expect(service.assertWritable(1)).rejects.toMatchObject({code:'NOTEWORTHY_TRIAL_ACTION_REQUIRED'});
  expect(await service.policy(1,1,{retentionDays:0,acknowledged:true})).toMatchObject({policyAccepted:true,retentionDays:0,canWrite:true,trialStartedAt:null});
});
it('limits trial controls and deletion receipts to the exact active owner',async()=>{
  await expect(service.status(2,1)).rejects.toMatchObject({status:403});
  await expect(service.policy(2,1,{retentionDays:90,acknowledged:true})).rejects.toMatchObject({status:403});
  fixture.sql.exec('UPDATE user_agencies SET is_active=0 WHERE user_id=1');
  await expect(service.status(1,1)).rejects.toMatchObject({status:403});
});
it.each([undefined,null,false,99,-1])('rejects an invalid retention choice %s',async retentionDays=>{
  await expect(service.policy(1,1,{retentionDays,acknowledged:true})).rejects.toMatchObject({code:'RETENTION_CHOICE_REQUIRED'});
});
it('keeps retained expired workspaces read-only and schedules deletion at the chosen boundary',()=>{
  const row={trial_policy_version:1,trial_policy_accepted_at:'2026-10-01',trial_started_at:'2026-10-10 20:00:00',trial_ends_at:'2026-11-09 20:00:00',retention_days:7};
  expect(noteworthyTrialState(row,now)).toMatchObject({state:'retained',canWrite:false,scheduledDeletionAt:'2026-11-16T20:00:00.000Z'});
  expect(noteworthyTrialState({...row,retention_days:0},now).state).toBe('deletion_due');
  expect(noteworthyTrialState(row,new Date('2026-11-16T20:00:00Z')).state).toBe('deletion_due');
  expect(noteworthyTrialState({...row,commercial_activated_at:'2026-11-10'},now)).toMatchObject({state:'active',scheduledDeletionAt:null,canWrite:true});
});
it('does not restart or shorten the existing trial when data choices change',async()=>{
  fixture.sql.exec("UPDATE noteworthy_practices SET activated_at='2026-11-01 20:00:00',trial_started_at='2026-11-01 20:00:00',trial_ends_at='2026-12-01 20:00:00'");
  await service.policy(1,1,{retentionDays:30,acknowledged:true});
  expect((await service.status(1,1)).trialEndsAt).toBe('2026-12-01T20:00:00.000Z');
});
it('requires exact typed confirmation and enqueues a durable wipe without claiming completion',async()=>{
  await expect(service.requestWipe(1,1,{practiceName:'Wrong',confirmed:true})).rejects.toMatchObject({code:'DELETION_CONFIRMATION_REQUIRED'});
  const state=await service.requestWipe(1,1,{practiceName:'Example Practice',confirmed:true});
  expect(state).toMatchObject({state:'deleting',deletedAt:null,deletionJob:{status:'queued'}});
  expect(fixture.sql.prepare('SELECT COUNT(*) n FROM noteworthy_practices').get().n).toBe(2);
  await expect(service.assertReadable(1)).rejects.toMatchObject({code:'WORKSPACE_DELETION_PENDING'});
  await expect(service.policy(1,1,{retentionDays:90,acknowledged:true})).rejects.toMatchObject({code:'DELETION_ALREADY_REQUESTED'});
});
it('refuses the standalone wipe for clinical or other connected workspaces',async()=>{
  fixture.sql.exec('INSERT INTO clients VALUES(1,1)');
  await expect(service.requestWipe(1,1,{practiceName:'Example Practice',confirmed:true})).rejects.toMatchObject({code:'EHR_DATA_REVIEW_REQUIRED'});
  expect(fixture.sql.prepare('SELECT COUNT(*) n FROM noteworthy_deletion_jobs').get().n).toBe(0);
  fixture.sql.exec("DELETE FROM clients;UPDATE agencies SET feature_flags='{}' WHERE id=1");
  await expect(service.assertStandalone(1)).rejects.toMatchObject({code:'EHR_DATA_REVIEW_REQUIRED'});
});
it('rolls back the wipe request if its durable job cannot be saved',async()=>{
  fixture.sql.exec("CREATE TRIGGER synthetic_queue_failure BEFORE INSERT ON noteworthy_deletion_jobs BEGIN SELECT RAISE(ABORT,'Synthetic queue failure'); END");
  await expect(service.requestWipe(1,1,{practiceName:'Example Practice',confirmed:true})).rejects.toThrow('Synthetic queue failure');
  expect(fixture.sql.prepare('SELECT deletion_requested_at FROM noteworthy_practices WHERE agency_id=1').get().deletion_requested_at).toBeNull();
});
it('records continuation as a bounded hold and requires actual operator plan confirmation',async()=>{
  expect(await service.requestContinue(1,1)).toMatchObject({commercialActive:false,retentionDays:7});
  await expect(service.activateCommercial(1,1,{billingReference:'order',confirmed:true})).rejects.toMatchObject({status:403});
  fixture.sql.exec("UPDATE noteworthy_practices SET activated_at='2026-11-12',trial_policy_accepted_at='2026-11-12'");
  expect(await service.activateCommercial(10,1,{billingReference:'Synthetic agreed order',confirmed:true})).toMatchObject({state:'active',commercialActive:true,scheduledDeletionAt:null});
});
