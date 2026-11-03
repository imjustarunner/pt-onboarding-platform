import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
vi.mock('../../models/NoteAidWorkQueueItem.model.js',()=>({default:{}}));
vi.mock('../clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
import {bookedWorkItem,reconcileBookedSessionWork} from '../bookedSessionWorkQueue.service.js';
let db,clinical,queue,connection,agencyAccess,clientAccess,appointment,session;
const user={id:501,role:'provider'};
beforeEach(()=>{
 appointment={id:132,agency_id:377,provider_user_id:501,clinical_session_id:214,start_at:'2026-09-05 20:30:00',end_at:'2026-09-05 21:30:00',source_timezone:'America/Denver',service_code:'90791'};
 session={id:214,agency_id:377,client_id:2104,appointment_id:132,provider_user_id:501};
 connection={execute:vi.fn(async()=>[[{acquired:1}]]),release:vi.fn()};
 db={getConnection:vi.fn(async()=>connection),execute:vi.fn(async()=>[[appointment]])};
 clinical={execute:vi.fn(async()=>[[session]])};
 queue={ensureForUser:vi.fn(async(id,item)=>({...item,serverId:72}))};
 agencyAccess=vi.fn(async()=>{});clientAccess=vi.fn(async()=>({ok:true,client:{agency_id:377,initials:'Test client'}}));
});
const run=(actor=user,options={})=>reconcileBookedSessionWork(actor,{db,clinical,queue,agencyAccess,clientAccess,...options});
it('creates documentation work with the exact saved appointment/session and source timezone',async()=>{
 expect(await run()).toEqual([expect.objectContaining({appointmentId:132,clinicalSessionId:214,clientId:2104,date:'2026-09-05',timeLabel:'2:30 PM',noteKind:'intake',serviceCode:'90791',status:'not_started',durationMinutes:60,sourceTimezone:'America/Denver'})]);
 expect(db.execute.mock.calls[0][0]).toContain('a.end_at<=UTC_TIMESTAMP()');
 expect(db.execute.mock.calls[0][0]).toContain('NOT EXISTS');
 expect(clinical.execute.mock.calls[0][0]).toContain('n.provider_signed_at IS NOT NULL');
 expect(clinical.execute.mock.calls[0][1]).toEqual([501,214]);
 expect(connection.release).toHaveBeenCalledOnce();
});
it('uses MST after the clock change and reuses a saved draft',()=>{
 const item=bookedWorkItem({...appointment,start_at:'2026-11-01 18:00:00',end_at:'2026-11-01 19:00:00',service_code:'90837',draft_id:6,draft_created_at:'2026-11-02 14:05:00'},session,{initials:'Example'});
 expect(item).toMatchObject({date:'2026-11-01',timeLabel:'11:00 AM',noteKind:'progress',status:'started',draftId:6,startedAt:'2026-11-02T14:05:00.000Z'});
});
it.each(['client_guardian','support','school_staff'])('does not create clinical work for %s',async role=>{
 expect(await run({id:501,role})).toEqual([]);expect(db.getConnection).not.toHaveBeenCalled();
});
it('excludes signed/missing or mismatched session associations',async()=>{
 clinical.execute.mockResolvedValue([[]]);expect(await run()).toEqual([]);
 clinical.execute.mockResolvedValue([[{...session,appointment_id:999}]]);expect(await run()).toEqual([]);
 clinical.execute.mockResolvedValue([[{...session,agency_id:999}]]);expect(await run()).toEqual([]);
 expect(queue.ensureForUser).not.toHaveBeenCalled();
});
it('enforces agency/client authorization and preview scope',async()=>{
 await run(user,{agencyId:377});expect(db.execute.mock.calls[0][1]).toEqual([501,377]);
 queue.ensureForUser.mockClear();agencyAccess.mockRejectedValue(Object.assign(new Error('Denied'),{status:403}));
 expect(await run()).toEqual([]);expect(queue.ensureForUser).not.toHaveBeenCalled();
 agencyAccess.mockResolvedValue();clientAccess.mockResolvedValue({ok:false});expect(await run()).toEqual([]);
});
it('does not reconcile concurrently with another worker and releases its lock after errors',async()=>{
 connection.execute.mockResolvedValueOnce([[{acquired:0}]]);expect(await run()).toEqual([]);expect(db.execute).not.toHaveBeenCalled();
 db.execute.mockRejectedValue(new Error('Database unavailable'));await expect(run()).rejects.toThrow('Database unavailable');
 expect(connection.execute).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)',['booked_session_work:501']);
});
