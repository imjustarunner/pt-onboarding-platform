import { describe,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../providerDayCancellation.service.js',()=>({default:{}}));
import { dayAbsenceMessage } from '../dayAbsencePolicy.service.js';
import { plannedOutCancellationInput } from '../plannedOutCancellation.service.js';
import { createSchoolSoftScheduleCalendar } from '../schoolSoftScheduleCalendar.service.js';
import { createSchoolAbsenceHistory } from '../schoolAbsenceHistory.service.js';
import { createPlannedOutParticipation } from '../plannedOutParticipation.service.js';

describe('day absence policy and schedule evidence',()=>{
  it('uses first-person urgent school copy and concise nonurgent copy without requesting a reply',()=>{
    const urgent=dayAbsenceMessage({urgent:true,providerName:'Avery QA',schoolName:'Cedar Grove',date:'2026-11-09',reason:'Weather conditions'});
    expect(urgent.text).toContain('I need to cancel');expect(urgent.text).toContain('at Cedar Grove');expect(urgent.text).toContain('Avery QA');
    expect(urgent.text).not.toMatch(/confirm|text|receipt/i);
    const planned=dayAbsenceMessage({urgent:false,date:'2026-11-09',reason:'Private reason'});
    expect(planned.text).toContain('Your care team has canceled an upcoming session');
    expect(planned.text).toContain('Please log in');expect(planned.text).not.toContain('Private reason');
  });
  it('preserves timed planned-out boundaries and handles DST with local dates',()=>{
    const input=plannedOutCancellationInput({providerId:7,agencyId:450,payload:{timeZone:'America/Denver',availability:'unavailable',startAt:'2026-11-01 07:30:00',endAt:'2026-11-02 18:00:00'}});
    expect(input).toMatchObject({dates:['2026-11-01','2026-11-02'],urgent:false,absenceSource:'planned_out',windowStart:'2026-11-01 07:30:00',windowEnd:'2026-11-02 18:00:00'});
    expect(plannedOutCancellationInput({payload:{availability:'available'}})).toBeNull();
  });
  it('uses an exclusive end date for multi-day Planned Out',()=>{
    const input=plannedOutCancellationInput({providerId:7,agencyId:450,payload:{allDay:true,availability:'unavailable',timeZone:'America/Denver',startDate:'2026-11-09',endDate:'2026-11-12'}});
    expect(input.dates).toEqual(['2026-11-09','2026-11-10','2026-11-11']);expect(input.windowStart).toBeUndefined();
  });
  it('shows timed and untimed soft-schedule clients, gives EHR sessions precedence, and retains canceled snapshots',async()=>{
    const roster={list:vi.fn(async()=>[
      {client_id:1,school_id:451,client_name:'One',school_name:'School',slots:[{id:1,startTime:'09:00:00',endTime:'10:00:00'}]},
      {client_id:2,school_id:451,client_name:'Two',school_name:'School',slots:[]},
      {client_id:3,school_id:451,client_name:'EHR',school_name:'School',slots:[]}
    ])};
    const history={list:vi.fn(async()=>[{id:4,clientId:4,schoolId:451,date:'2026-11-09',clientName:'Old assignment',delivery:{held:1}}])};
    const service=createSchoolSoftScheduleCalendar({roster,history});
    const rows=await service.list({agencyId:450,providerId:7,startDate:'2026-11-09',endDate:'2026-11-10',timeZone:'America/Denver',appointments:[{clientId:3,date:'2026-11-09'}]});
    expect(rows.map(r=>r.clientId).sort()).toEqual([1,2,4]);
    expect(rows.find(r=>r.clientId===1).slots[0].startAt).toBe('2026-11-09T16:00:00Z');
    expect(rows.find(r=>r.clientId===2).slots).toEqual([]);expect(rows.find(r=>r.clientId===4).canceled).toBe(true);
  });
  it('encrypts a stable cancellation snapshot before any delivery and scopes history to the client and agency',async()=>{
    const database={execute:vi.fn(async sql=>sql.startsWith('SELECT id')?[[{id:9}]]:[{}])};
    const encrypt=vi.fn(s=>`encrypted:${s}`),history=createSchoolAbsenceHistory({database,encrypt,decrypt:s=>s.slice(10)});
    const item={agencyId:450,providerId:7,clientId:1,schoolId:451,date:'2026-11-09',urgent:true,reasonCategory:'weather',message:{text:'Private snapshot'}};
    expect(await history.begin('token',item,8)).toBe(9);
    expect(database.execute.mock.calls[0][0]).toContain('INSERT IGNORE');expect(database.execute.mock.calls[0][1].at(-1)).toMatch(/^encrypted:/);
    await history.finish(9,{sent:0,skipped:1});expect(encrypt).toHaveBeenCalledTimes(2);
    database.execute.mockResolvedValueOnce([[]]);await history.list({agencyId:450,clientId:1});
    expect(database.execute.mock.lastCall[1]).toEqual([450,null,null,1,1,null,null,null,null]);
  });
  it('declines an attended meeting for the provider without canceling the host event or deleting participation',async()=>{
    const source={id:11,agency_id:450,start_at:'2030-01-01 16:00:00',end_at:'2030-01-01 17:00:00'};
    const database={execute:vi.fn(async sql=>sql.startsWith('SELECT')?[[source]]:[{affectedRows:1}])};
    const service=createPlannedOutParticipation({database});
    await service.apply({id:11,type:'meeting',agencyId:450,providerId:7,source},8);
    expect(database.execute.mock.calls[1][1]).toEqual([7,7,11,450]);
    expect(database.execute.mock.calls[1][0]).toContain("rsvp='declined'");
    expect(database.execute.mock.calls.flat().join(' ')).not.toMatch(/DELETE|SET status='CANCELLED'/);
    database.execute.mockResolvedValueOnce([[{...source,start_at:'2030-01-02 16:00:00'}]]);
    await expect(service.apply({id:11,type:'meeting',agencyId:450,providerId:7,source},8)).rejects.toThrow('event changed');
  });
});

it('bulk agenda reads retain provider identity, exact slots and cancellations without per-provider day queries',async()=>{
 const roster={readMany:vi.fn(async()=>[
  {provider_id:7,client_id:1,school_id:451,client_name:'DEMO QA One',school_name:'Cedar',slots:[{id:1,startTime:'10:28:00',endTime:'11:21:00'}]},
  {provider_id:8,client_id:1,school_id:451,client_name:'DEMO QA One',school_name:'Cedar',slots:[]}
 ])};
 const history={list:vi.fn(async()=>[{id:5,providerId:7,clientId:9,schoolId:451,date:'2026-11-03',clientName:'DEMO QA retained',slots:[],delivery:{held:1}}])};
 const service=createSchoolSoftScheduleCalendar({roster,history});
 const rows=await service.listMany({agencyId:450,providerIds:[7,8],startDate:'2026-11-03',endDate:'2026-11-05',timeZone:'America/Denver',appointments:[{providerId:7,clientId:1,date:'2026-11-03'}]});
 expect(roster.readMany).toHaveBeenCalledTimes(2);expect(history.list).toHaveBeenCalledWith(expect.objectContaining({agencyId:450,providerIds:[7,8]}));
 expect(rows.some(r=>r.providerId===7&&r.clientId===1&&r.date==='2026-11-03')).toBe(false);
 expect(rows.some(r=>r.providerId===8&&r.clientId===1&&r.date==='2026-11-03')).toBe(true);
 expect(rows.find(r=>r.clientId===9)).toMatchObject({canceled:true,id:5,delivery:{held:1}});
 expect(rows.find(r=>r.providerId===7&&r.date==='2026-11-04').slots[0]).toMatchObject({startAt:'2026-11-04T17:28:00Z',endAt:'2026-11-04T18:21:00Z'});
});
