import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../providerAvailability.service.js',()=>({default:{}}));
import {activeSchedulingAgreement,schedulingWeek,unionMilliseconds,readContractSchedulingExpectation} from '../contractSchedulingExpectation.service.js';
const signed=(id,minimum=6,extra={})=>({id,token_values_json:{MIN_HOURS:minimum,START_DATE:'2026-10-01',...extra},metadata:{contractGeneration:true},signed_pdf_path:'private/signed.pdf',audit_trail:{adminCountersign:{signedAt:'2026-09-25T12:00:00Z'}}});
const span=(start,end)=>({start_at:`2026-10-13 ${start}:00:00`,end_at:`2026-10-13 ${end}:00:00`});
const now=new Date('2026-10-14T18:00:00Z');
let db,availability,contracts,appointments,tutoring;
beforeEach(()=>{
 contracts=[signed(1)];appointments=[];tutoring=[];
 db={execute:vi.fn(async sql=>[sql.includes('FROM contract_generations')?contracts:sql.includes('FROM learning_class_sessions')?tutoring:appointments])};
 availability={resolveAgencyTimeZone:vi.fn(async()=> 'America/Denver'),computeWeekAvailability:vi.fn(async()=>({ok:true,virtualSlots:[],inPersonSlots:[]}))};
});
const read=()=>readContractSchedulingExpectation({providerId:9,agencyId:2,now},{db,availability});
describe('signed contract scheduling targets',()=>{
 it('derives both targets from the signed minimum, ignoring manually supplied totals',()=>{
  expect(activeSchedulingAgreement([signed(1,6,{MIN_SCHEDULED_HOURS:999})],'2026-10-14')).toMatchObject({minimumHours:6,requiredHours:8});
 });
 it('uses the latest effective signed hours, not a draft or unrelated compensation amendment',()=>{
  const rows=[signed(1,6),signed(2,10),{...signed(3,30),signed_pdf_path:null},signed(4,40,{START_DATE:'2026-11-01'}),signed(5,undefined,{MIN_HOURS:undefined})];
  expect(activeSchedulingAgreement(rows,'2026-10-14')).toMatchObject({generationId:2,requiredHours:13});
 });
 it('does not treat a missing countersignature as an executed agreement',()=>{
  expect(activeSchedulingAgreement([{...signed(1),audit_trail:{}}],'2026-10-14')).toBeNull();
 });
 it('does not impose a full-week shortfall for a midweek contract start',async()=>{
  contracts=[signed(1,6,{START_DATE:'2026-10-14'})];
  expect(await read()).toMatchObject({status:'partial_week',showNotice:false});expect(availability.computeWeekAvailability).not.toHaveBeenCalled();
 });
 it('keeps an explicitly cleared minimum from reverting to an older agreement',()=>{
  expect(activeSchedulingAgreement([signed(1,6),signed(2,'')],'2026-10-14').requiredHours).toBeNull();
 });
});
describe('weekly recorded hours',()=>{
 it('uses the agency calendar week, including the daylight saving transition',()=>{
  expect(schedulingWeek(new Date('2026-11-01T18:00:00Z'),'America/Denver')).toMatchObject({weekStart:'2026-10-26',weekEnd:'2026-11-02',startAt:'2026-10-26 06:00:00',endAt:'2026-11-02 07:00:00'});
 });
 it('merges overlaps and clips records at the week boundaries',()=>{
  expect(unionMilliseconds([span('08','12'),span('10','14'),span('08','12')],'2026-10-13 09:00:00','2026-10-13 13:00:00')/3600000).toBe(4);
 });
 it.each([8,9])('hides the notice at or above the 8-hour target (%s recorded)',async total=>{
  appointments=[span('08',String(8+total))];
  expect(await read()).toMatchObject({status:'met',showNotice:false,scheduledHours:total});expect(availability.computeWeekAvailability).not.toHaveBeenCalled();
 });
 it('counts booked plus open capacity once across duplicated formats',async()=>{
  appointments=[span('08','14')];
  const slots=[{startAt:'2026-10-13T14:00:00Z',endAt:'2026-10-13T16:00:00Z'}];
  availability.computeWeekAvailability.mockResolvedValue({ok:true,virtualSlots:slots,inPersonSlots:slots});
  expect(await read()).toMatchObject({showNotice:true,scheduledHours:6,scheduledShortfallHours:2,capacityHours:8,capacityShortfallHours:0});
  expect(availability.computeWeekAvailability).toHaveBeenCalledWith(expect.objectContaining({materializeOfficeEvents:false,intakeOnly:true}));
 });
 it('counts an assigned tutoring session and avoids counting its appointment twice',async()=>{
  appointments=[span('08','14')];tutoring=[span('08','14'),span('14','16')];
  expect(await read()).toMatchObject({showNotice:false,scheduledHours:8});
 });
 it('shows unknown availability when calendars fail, never a zero-hour claim',async()=>{
  appointments=[span('08','14')];availability.computeWeekAvailability.mockRejectedValue(new Error('calendar offline'));
  expect(await read()).toMatchObject({showNotice:true,scheduledHours:6,capacityHours:null,capacityShortfallHours:null,availabilityStatus:'unavailable'});
 });
 it('treats partial calendar warnings as incomplete availability',async()=>{
  availability.computeWeekAvailability.mockResolvedValue({ok:true,calendarWarnings:['Reconnect calendar'],virtualSlots:[]});
  expect(await read()).toMatchObject({capacityHours:null,availabilityStatus:'unavailable'});
 });
 it('scopes contract and appointment reads to the employee and selected agency',async()=>{
  await read();expect(db.execute.mock.calls[0][1]).toEqual([9,2]);expect(db.execute.mock.calls[1][1].slice(0,3)).toEqual([9,2,2]);
 });
});
