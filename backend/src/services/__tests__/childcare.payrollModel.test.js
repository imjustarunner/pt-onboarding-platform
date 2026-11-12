import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import PayrollTimeClaim from '../../models/PayrollTimeClaim.model.js';
import {assertAppointmentWindowAvailable} from '../appointmentConflict.service.js';

describe('childcare payroll approval and scheduling concurrency boundaries',()=>{
 it('atomically approves only the reviewed unchanged childcare snapshot',async()=>{
  const db={execute:vi.fn(async()=>[{affectedRows:1}])};vi.spyOn(PayrollTimeClaim,'findById').mockResolvedValue({id:4,status:'approved'});
  await PayrollTimeClaim.approve({id:4,approverUserId:3,targetPayrollPeriodId:10,appliedAmount:93,bucket:'direct',creditsHours:3,childcareSnapshotHash:'a'.repeat(64),requireSubmitted:true,db});
  const [sql,params]=db.execute.mock.calls[0];
  expect(sql).toContain("JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.childcareSnapshotHash'))=?");
  expect(sql).toContain("status='submitted'");expect(sql).toContain('reviewRequired');expect(params).toContain('a'.repeat(64));
 });
 it('rejects an approval when attendance changed while the reviewer was saving',async()=>{
  const db={execute:vi.fn(async()=>[{affectedRows:0}])};
  await expect(PayrollTimeClaim.approve({id:4,approverUserId:3,targetPayrollPeriodId:10,appliedAmount:93,childcareSnapshotHash:'a'.repeat(64),requireSubmitted:true,db})).rejects.toMatchObject({status:409,code:'PAYROLL_SOURCE_CHANGED'});
 });
 it('blocks a tutoring appointment over an assigned childcare shift without exposing private details',async()=>{
  const db={execute:vi.fn(async(sql)=>sql.includes('FROM childcare_shifts')?[[{id:8}]]:[[{first_name:'QA',last_name:'Worker'}]])};
  await expect(assertAppointmentWindowAvailable(db,{providerUserId:7,startAt:'2026-11-19 23:00:00',endAt:'2026-11-20 00:00:00',status:'scheduled'})).rejects.toMatchObject({status:409,code:'PROVIDER_TIME_CONFLICT',message:expect.stringContaining('childcare shift')});
  expect(db.execute.mock.calls[0][1]).toEqual([7,'2026-11-20 00:00:00','2026-11-19 23:00:00',0]);
 });
});
