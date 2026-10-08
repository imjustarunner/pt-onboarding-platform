import {describe,it,expect,vi,beforeEach} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>db,execute:db.execute}}));
import {payableHeartbeatSeconds,recordUpdateTime,createUpdateTimeClaim,updateTimestamp} from '../providerUpdateTime.service.js';
beforeEach(()=>vi.clearAllMocks());
describe('paid update time',()=>{
 it('rejects idle gaps, duplicate sequences and competing tabs',()=>{
  const a={elapsedMs:15000,reportedSeconds:15,owner:true,sequence:2,lastSequence:1};
  expect(payableHeartbeatSeconds(a)).toBe(15);
  expect(payableHeartbeatSeconds({...a,elapsedMs:60000})).toBe(0);
  expect(payableHeartbeatSeconds({...a,owner:false})).toBe(0);
  expect(payableHeartbeatSeconds({...a,sequence:1})).toBe(0);
  expect(payableHeartbeatSeconds({...a,reportedSeconds:1})).toBe(1);
 });
 it('does not grant a free minute on first entry',async()=>{
  const r={id:1,token:'editable',active_seconds:0,section_config_json:{},last_heartbeat_at:null};
  db.execute.mockResolvedValueOnce([[r]]).mockResolvedValueOnce([[]]).mockResolvedValue([{}]);
  const result=await recordUpdateTime(1,{sessionId:'12345678-1234-1234-1234-123456789abc',sequence:1,activeSeconds:30});
  expect(result.activeSeconds).toBe(0);expect(db.commit).toHaveBeenCalledOnce();
 });
 it('never tracks a preview or finalized recipient',async()=>{
  for(const r of [{token:'preview_test'},{token:'normal',locked_at:new Date()}]){
   db.execute.mockResolvedValueOnce([[{id:1,active_seconds:0,...r}]]);
   expect((await recordUpdateTime(1,{sessionId:'12345678-1234-1234-1234-123456789abc',sequence:1})).recording).toBe(false);
  }
  expect(db.commit).not.toHaveBeenCalled();
 });
 it('submits precise seconds as support activity and records the claim pointer in the same transaction',async()=>{
  db.execute.mockResolvedValueOnce([[{section_seconds_json:{license:31},active_seconds:31}]]).mockResolvedValueOnce([{insertId:71}]).mockResolvedValue([{}]);
  const id=await createUpdateTimeClaim(db,{id:1,push_id:3,provider_user_id:4,agency_id:2,active_seconds:31,finalized_at:new Date('2026-10-10T12:00:00Z')},4);
  expect(id).toBe(71);const payload=JSON.parse(db.execute.mock.calls[1][1][4]);
  expect(payload.categoryGroup).toBe('support_activity');expect(payload.totalMinutes).toBe(31/60);expect(payload.sectionSeconds).toEqual({license:31});
  expect(db.execute.mock.calls[2][1]).toEqual([71,1]);
 });
 it('does not create a second claim or a claim for an unfinished update',async()=>{
  expect(await createUpdateTimeClaim(db,{payroll_time_claim_id:4},1)).toBe(4);
  expect(await createUpdateTimeClaim(db,{active_seconds:600},1)).toBeNull();expect(db.execute).not.toHaveBeenCalled();
 });
});

it('interprets MySQL UTC timestamps consistently in a Denver process',()=>{expect(updateTimestamp('2026-10-08 15:12:13.123').toISOString()).toBe('2026-10-08T15:12:13.123Z');});
