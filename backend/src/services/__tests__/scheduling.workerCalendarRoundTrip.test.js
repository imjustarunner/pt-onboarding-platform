import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),insert:vi.fn(),updateProvider:vi.fn(),updateSupervision:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../recurringScheduleCancellation.service.js',()=>({withRecurringScheduleEdit:fn=>fn({execute:m.execute})}));
vi.mock('../googleMeetTranscript.service.js',()=>({ensureMeetAutoTranscriptionEnabled:vi.fn()}));
vi.mock('../scheduleCalendarPolicy.service.js',()=>({googleScheduleAllowedForEmail:async()=>true,GOOGLE_SCHEDULE_DISABLED:{skipped:true}}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://example.test'}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async()=>({email:'host@example.test'})}}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{listByGoogleEventIds:async()=>[],updateForProvider:m.updateProvider}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{updateById:m.updateSupervision}}));
import Google from '../googleCalendar.service.js';
import { syncRecurringCalendars } from '../recurringScheduleWindow.service.js';
import { reconcileGoogleLinkedSchedule } from '../googleScheduleInboundSync.service.js';
import { clientScheduleInstantToUtcMysql,utcMysqlToIso } from '../../utils/zonedWallTime.util.js';
import { providerScheduleCalendarTiming } from '../../utils/providerScheduleCalendar.js';

let row,type;
beforeEach(()=>{
 vi.restoreAllMocks();vi.clearAllMocks();
 m.insert.mockResolvedValue({data:{id:'copy'}});
 vi.spyOn(Google,'isConfigured').mockReturnValue(true);
 vi.spyOn(Google,'buildCalendarClientForSubject').mockReturnValue({events:{insert:m.insert}});
 m.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT e.*'))return [(type==='supervision')===sql.includes('supervision_sessions')?[row]:[]];
  if(sql.startsWith('UPDATE'))return [{affectedRows:1}];
  throw Error('Unexpected SQL in isolated test');
 });
});
const cases=['supervision','TEAM_MEETING','HUDDLE','SCHEDULE_HOLD'].flatMap(kind=>
 ['America/Denver','America/New_York','America/Phoenix','UTC'].flatMap(zone=>
 ['2026-03-07','2026-03-09','2026-10-25','2026-11-15'].flatMap(day=>
 ['string','Date'].map(representation=>[kind,zone,day,representation]))));
it.each(cases)('keeps noon through worker → real Google adapter → inbound: %s %s %s %s',async(kind,zone,day,representation)=>{
 type=kind;
 const start=clientScheduleInstantToUtcMysql(`${day}T12:00:00`,zone),end=clientScheduleInstantToUtcMysql(`${day}T13:00:00`,zone);
 const stored=value=>representation==='Date'?new Date(utcMysqlToIso(value)):value;
 row={id:100,agency_id:2,supervisor_user_id:7,provider_id:7,supervisee_user_id:8,session_type:'individual',kind:kind==='supervision'?undefined:kind,
  status:kind==='supervision'?'SCHEDULED':'ACTIVE',start_at:stored(start),end_at:stored(end),event_timezone:zone,
  recurrence_series_id:'series',recurrence_calendar_pending:1,recurrence_calendar_generation:0,host_email:'host@example.test',title:'Example'};
 await syncRecurringCalendars();expect(m.insert).toHaveBeenCalledOnce();
 const payload=m.insert.mock.calls[0][0].requestBody;
 expect(payload.start.timeZone).toBe(zone);
 expect(clientScheduleInstantToUtcMysql(payload.start.dateTime,zone)).toBe(start);
 expect(clientScheduleInstantToUtcMysql(payload.end.dateTime,zone)).toBe(end);
 const summary={id:100,providerId:7,supervisorUserId:7,kind,status:row.status,googleEventId:'copy',startAt:utcMysqlToIso(start),endAt:utcMysqlToIso(end)};
 const result=await reconcileGoogleLinkedSchedule({viewedProviderId:7,viewedProviderEmail:'host@example.test',scheduleEvents:kind==='supervision'?[]:[summary],supervisionSessions:kind==='supervision'?[summary]:[],googleEvents:[{id:'copy',startAt:utcMysqlToIso(clientScheduleInstantToUtcMysql(payload.start.dateTime,zone)),endAt:utcMysqlToIso(clientScheduleInstantToUtcMysql(payload.end.dateTime,zone))}]});
 expect(result.updatedCount).toBe(0);expect(m.updateSupervision).not.toHaveBeenCalled();expect(m.updateProvider).not.toHaveBeenCalled();
});
it('keeps all-day exclusive dates through the worker without turning midnight into the previous day',async()=>{
 type='SCHEDULE_HOLD';row={id:100,provider_id:7,kind:type,status:'ACTIVE',all_day:1,start_date:new Date('2026-11-01T00:00:00Z'),end_date:'2026-11-03',event_timezone:'America/Denver',host_email:'host@example.test',title:'Away'};
 await syncRecurringCalendars();const payload=m.insert.mock.calls[0][0].requestBody;
 expect(payload.start).toEqual({date:'2026-11-01'});expect(payload.end).toEqual({date:'2026-11-03'});
});
it('retains midnight and overnight saved windows for office/clinical calendar copies',async()=>{
 const start='2026-11-02 06:30:00',end='2026-11-02 07:30:00';
 const result=await Google.upsertProviderPrimaryCalendarEvent({subjectEmail:'host@example.test',summary:'Booked',...providerScheduleCalendarTiming({start_at:start,end_at:end,event_timezone:'America/Denver'}),sendUpdates:'none'});
 expect(result.ok).toBe(true);
 const payload=m.insert.mock.calls[0][0].requestBody;
 expect(payload.start.dateTime).toBe('2026-11-01T23:30:00');expect(payload.end.dateTime).toBe('2026-11-02T00:30:00');
});
