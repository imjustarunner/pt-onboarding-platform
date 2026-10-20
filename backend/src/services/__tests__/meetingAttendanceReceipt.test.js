import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),pay:vi.fn(),rate:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../meetingClaimRate.service.js',()=>({meetingClaimCompensation:m.pay,meetingClaimHourlyRate:m.rate}));
import {meetingAttendanceReceipt} from '../meetingAttendanceReceipt.service.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockImplementation(async sql=>sql.includes('attendance_rollups')?[[{total_seconds:1800}]]:sql.includes('FROM users')?[[{name:'Ryn Pantoya',supervision_is_prelicensed:1,is_compensable_snapshot:0}]]:[[]]);});
it('uses corrected supervision credit minutes and the recorded before/after balance',async()=>{
 const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes('hour_credits')?[[{total_seconds:2700,individual_hours:0.75,group_hours:0,source_json:JSON.stringify({hoursBefore:4,hoursAfter:4.75})}]]:base(sql,args));
 expect(await meetingAttendanceReceipt('supervision',5,9,{supervisor_user_id:3,session_type:'individual'})).toMatchObject({minutes:45,host:'Ryn Pantoya',balance:{before:4,after:4.75,earned:0.75,track:'Individual supervision'}});
});
it('uses only this attendee’s claim and does not invent a missing pay rate',async()=>{
 const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>{if(sql.includes('FROM payroll_time_claims')){expect(args).toEqual([2,9,5]);return [[{id:8,payload_json:'{"totalMinutes":30}'}]];}return base(sql,args);});m.pay.mockResolvedValue({rateLabel:'Administrative time',hourlyRate:null,estimatedAmount:null,appliedAmount:null});
 const receipt=await meetingAttendanceReceipt('team',5,9,{agency_id:2,provider_id:3});expect(receipt.minutes).toBe(30);expect(receipt.compensation).toContain('Rate needs review');expect(receipt.compensation).not.toContain('$');
});
it('describes intern training as unpaid indirect time',async()=>{
 const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes('scheduled_training_logs')?[[{credit_type:'indirect',payable:0}]]:base(sql,args));
 expect((await meetingAttendanceReceipt('team',5,9,{agency_id:2,meeting_subtype:'training'})).compensation).toContain('Unpaid indirect');
});

it.each([{role:'intern',title:'Counseling Intern',supervision_is_prelicensed:1},{role:'provider',credential:'BA',supervision_is_prelicensed:0}])('hides untracked balances while retaining actual attendance: %j',async person=>{
 m.execute.mockImplementation(async sql=>sql.includes('hour_credits')?[[{total_seconds:2119,individual_hours:0,group_hours:0,source_json:'{"countable":false,"hoursBefore":0,"hoursAfter":0}'}]]:sql.includes('FROM users')?[[{...person,is_compensable_snapshot:0}]]:[[]]);
 const receipt=await meetingAttendanceReceipt('supervision',368,500,{agency_id:2,session_type:'group'});
 expect(receipt.minutes).toBe(35.32);expect(receipt.balance).toBeNull();
});
it('estimates eligible bachelor attendance without claiming a payment',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('attendance_rollups')?[[{total_seconds:2119}]]:sql.includes('FROM users')?[[{id:500,credential:'BA',is_required:1,is_compensable_snapshot:1}]]:[[]]);m.rate.mockResolvedValue(18);
 const receipt=await meetingAttendanceReceipt('supervision',368,500,{agency_id:2,session_type:'group',start_at:'2026-10-16 00:00:00'});
 expect(receipt.compensation).toContain('$10.60');expect(receipt.compensation).toContain('not a payment confirmation');expect(receipt.balance).toBeNull();
});
