import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../schoolSoftScheduleCalendar.service.js',()=>({schoolSoftScheduleCalendar:{listMany:vi.fn()}}));
import {createAuricwellAgenda,agendaWindow,filterAgenda} from '../auricwellAgenda.service.js';
const actor={id:9,role:'provider',first_name:'DEMO QA',last_name:'Avery',timezone:'America/Denver'};
let database,school,service,appointmentRows,eventRows,assignmentRows;
beforeEach(()=>{appointmentRows=[];eventRows=[];assignmentRows=[];school={listMany:vi.fn(async()=>[])};
 database={execute:vi.fn(async(sql,params)=>{
   expect(sql.trim()).toMatch(/^SELECT/);
   if(sql.includes('FROM users u JOIN user_agencies'))return [[{id:10,first_name:'DEMO QA',last_name:'Jordan',is_active:1,status:'ACTIVE_EMPLOYEE'},{id:11,first_name:'DEMO QA',last_name:'Retired',is_active:0,status:'INACTIVE_EMPLOYEE'}]];
   if(sql.includes('FROM supervisor_assignments'))return [assignmentRows];
   if(sql.includes('FROM appointments a LEFT JOIN'))return [appointmentRows];
   if(sql.includes('FROM provider_schedule_events'))return [sql.includes("UPPER(COALESCE(pse.reason_code")?eventRows.filter(e=>e.client_id||e.reason_code==='CLIENT_SESSION'):eventRows];
   if(sql.includes('FROM office_events'))return [[]];
   if(sql.includes('FROM supervision_sessions'))return [[]];
   if(sql.includes('COUNT(*)'))return [[{total:71}]];
   if(sql.includes('FROM clients c'))return [[{id:100,full_name:'DEMO QA Client'}]];
   throw new Error('Unexpected query');
 })};service=createAuricwellAgenda({database,school});});
const call=(input={},who=actor)=>service.agenda({agencyId:450,actor:who,input:{start:'2026-11-02',end:'2026-11-09',...input}});
it('uses DST-aware midnights and rejects impossible or oversized windows',()=>{
 expect(agendaWindow({start:'2026-11-01',end:'2026-11-02'},'America/Denver')).toMatchObject({windowStart:'2026-11-01 06:00:00',windowEnd:'2026-11-02 07:00:00'});
 for(const input of [{start:'2026-02-30',end:'2026-03-02'},{start:'2026-11-02',end:'2026-11-02'},{start:'2026-11-01',end:'2026-12-03'}])expect(()=>agendaWindow(input,'America/Denver')).toThrow();
});
it('rejects forged practice/supervisee scopes and providers before schedule reads',async()=>{
 for(const input of [{scope:'practice'},{scope:'supervisees'},{providerId:10},{providerId:'9 OR 1=1'}])await expect(call(input)).rejects.toMatchObject({status:403});
 expect(school.listMany).not.toHaveBeenCalled();expect(database.execute.mock.calls.every(([q])=>!q.includes('FROM appointments'))).toBe(true);
});
it('permits only actual supervisees in the selected practice',async()=>{
 assignmentRows=[{supervisee_id:10}];await call({scope:'supervisees',providerId:10});
 expect(school.listMany).toHaveBeenCalledWith(expect.objectContaining({agencyId:450,providerIds:[10]}));
 expect(database.execute.mock.calls.find(([sql])=>sql.includes('FROM supervisor_assignments'))[1]).toEqual([450,9]);
 await expect(call({scope:'supervisees',providerId:11})).rejects.toMatchObject({status:403});
});
it('includes administrative actor in authorized practice scope',async()=>{
 await call({scope:'practice'},{...actor,role:'super_admin'});expect(school.listMany.mock.calls[0][0].providerIds).toEqual([10,11,9]);
});
it('groups participants, passes booked precedence, preserves separate timed and untimed plans',async()=>{
 appointmentRows=[100,101].map(client_id=>({id:1,provider_user_id:9,start_at:'2026-11-03 17:28:00',end_at:'2026-11-03 18:21:00',status:'scheduled',client_id,full_name:`DEMO QA ${client_id}`}));
 school.listMany.mockResolvedValue([{key:'retained',date:'2026-11-04',providerId:9,clientId:102,clientName:'DEMO QA School',schoolName:'Cedar Grove',canceled:true,slots:[{id:1,startAt:'2026-11-04T17:28:00Z',endAt:'2026-11-04T18:21:00Z'},{id:2,startAt:'2026-11-04T19:03:00Z',endAt:'2026-11-04T19:48:00Z'}],delivery:{deliveries:[{status:'sent',receiptConfirmedAt:null}]}},{key:'untimed',providerId:9,clientId:103,clientName:'DEMO QA Untimed',date:'2026-11-04',slots:[]}]);
 const result=await call({context:'false'});expect(result.total).toBe(4);expect(result.items[0].clientName).toContain('100, DEMO QA 101');
 expect(school.listMany.mock.calls[0][0].appointments).toEqual(expect.arrayContaining([{providerId:9,clientId:100,date:'2026-11-03'}]));
 const rows=result.items.filter(r=>r.kind==='school');expect(rows.filter(r=>r.startAt)).toHaveLength(2);expect(rows.find(r=>!r.startAt).date).toBe('2026-11-04');expect(rows[0].notice).toContain('receipt not confirmed');expect(rows.every(r=>r.readOnly)).toBe(true);
});
it('keeps context optional and queries tenant-bound stored events',async()=>{
 eventRows=[{id:3,provider_id:9,kind:'TEAM_MEETING',title:'Staff huddle',start_at:'2026-11-03 20:00:00',end_at:'2026-11-03 20:30:00',status:'scheduled'}];
 expect((await call()).items[0].kind).toBe('block');expect((await call({context:'false'})).total).toBe(0);
 const [sql,params]=database.execute.mock.calls.find(([q])=>q.includes('FROM provider_schedule_events'));expect(sql).toContain('pse.agency_id IS NULL AND pse.provider_id=?');expect(params.slice(0,3)).toEqual([9,450,9]);expect(sql).toContain('NOT EXISTS');
});
it('searches and sorts all rows before pagination',()=>{
 const items=Array.from({length:71},(_,i)=>({key:String(i),date:'2026-11-02',clientName:`DEMO QA ${String(70-i).padStart(2,'0')}`}));
 const page=filterAgenda(items,{sort:'client',page:2});expect(page.total).toBe(71);expect(page.items[0].clientName).toBe('DEMO QA 50');expect(filterAgenda(items,{search:'QA 70'}).items).toHaveLength(1);
});
it('fails visibly at source safety limits',async()=>{appointmentRows=Array.from({length:10001},()=>({}));await expect(call()).rejects.toMatchObject({status:422});});
it('counts and searches clients in the same scope with safe sorting',async()=>{
 const result=await service.clients({agencyId:450,actor,input:{search:'DEMO%',page:2,sort:'injection',order:'desc'}});expect(result.total).toBe(71);
 const [sql,params]=database.execute.mock.calls.find(([q])=>q.includes('SELECT c.id'));expect(sql).toContain('LIMIT 50 OFFSET 50');expect(sql).toContain('c.agency_id=?');expect(sql).toContain('cpa.is_active=1');expect(params).toEqual([450,9,9,'DEMO%','DEMO%']);expect(sql).not.toContain('injection');
});

it('keeps attended meeting links on the selected schedule instead of switching to the host',async()=>{eventRows=[{id:3,provider_id:10,viewer_ids:'9',title:'DEMO QA Meeting',start_at:'2026-11-03 20:00:00',end_at:'2026-11-03 20:30:00'}];expect((await call()).items[0].providerId).toBe(9);});
it('includes stored legacy client sessions even when other context is hidden',async()=>{eventRows=[{id:4,provider_id:9,client_id:100,full_name:'DEMO QA Legacy',reason_code:'CLIENT_SESSION',start_at:'2026-11-03 20:00:00',end_at:'2026-11-03 20:30:00'}];const result=await call({context:'false'});expect(result.items[0]).toMatchObject({kind:'appointment',clientName:'DEMO QA Legacy'});expect(school.listMany.mock.calls[0][0].appointments).toContainEqual({providerId:9,clientId:100,date:'2026-11-03'});});
