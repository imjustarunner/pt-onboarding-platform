import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),find:vi.fn(),finalize:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:m.find}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:v=>v,maybeDecryptNotePayload:v=>v}));
vi.mock('../appointmentChange.service.js',()=>({finalizeAppointmentNoShow:m.finalize}));
import {declareAppointmentNoShow,undoAppointmentNoShow,processDueAppointmentNoShows,getAppointmentNoShowReview} from '../appointmentNoShowReview.service.js';
import {noShowReviewTiming} from '../../utils/noShowReviewTiming.js';
let appointment,row,events,db;
const preview={eventType:'no_show',consequence:{model:'fee',feeCents:2200},appointment:{id:90}};
beforeEach(()=>{
 vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-01T17:01:00Z'));
 appointment={id:90,agencyId:453,providerUserId:1496,startAt:'2030-01-01 17:00:00',endAt:'2030-01-01 18:00:00',status:'scheduled'};row=null;events=[];
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,p=[])=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
  if(sql.startsWith('SELECT')&&sql.includes('FROM appointments'))return [[{id:90,status:appointment.status,start_at:appointment.startAt,end_at:appointment.endAt,provider_user_id:1496,agency_id:453}]];
  if(sql.startsWith('SELECT appointment_id'))return [row&&['pending','finalizing'].includes(row.state)&&+new Date(row.notify_at.replace(' ','T')+'Z')<=Date.now()?[{appointment_id:90}]:[]];
  if(sql.startsWith('SELECT * FROM appointment_no_show_reviews'))return [row?[{...row}]:[]];
  if(sql.startsWith('INSERT INTO appointment_no_show_reviews')){row=Object.fromEntries(['appointment_id','agency_id','provider_user_id','declared_by_user_id','declared_at','notify_at','previous_status','snapshot_json'].map((k,i)=>[k,p[i]]));row.id=1;row.state='pending';return [{insertId:1}];}
  if(sql.startsWith('INSERT INTO appointment_no_show_review_events')){events.push({actorId:p[3],actorType:p[4],action:p[5],metadata:JSON.parse(p[6])});return [{insertId:events.length}];}
  if(sql.startsWith("UPDATE appointments SET status='no_show_pending'")){appointment.status='no_show_pending';return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE appointments SET status=?')){appointment.status=p[0];return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE appointment_no_show_reviews')){row.state=sql.match(/state='([^']+)'/)[1];if(row.state==='undone'){row.undone_by_user_id=p[0];row.undone_at=new Date();}if(row.state==='finalized')row.result_json=p[0];return [{affectedRows:1}];}
  throw Error('Unexpected test SQL: '+sql);
 })};m.execute.mockImplementation((...args)=>db.execute(...args));m.connection.mockResolvedValue(db);m.find.mockImplementation(async()=>({...appointment}));m.finalize.mockImplementation(async()=>{appointment.status='no_show';return {settlement:{amountCents:2200},notificationDelivery:{pending:1}};});
});
afterEach(()=>vi.useRealTimers());
it('requires confirmation before fifteen minutes, then defers all money and notices until ten minutes after the end',async()=>{
 await expect(declareAppointmentNoShow(appointment,{},preview,1496)).rejects.toMatchObject({code:'EARLY_NO_SHOW_CONFIRMATION_REQUIRED'});expect(row).toBeNull();
 const review=await declareAppointmentNoShow(appointment,{earlyNoShowConfirmed:true},preview,1496);
 expect(review).toMatchObject({state:'pending',notifyAt:'2030-01-01T18:10:00.000Z',canUndo:true});expect(appointment.status).toBe('no_show_pending');expect(m.finalize).not.toHaveBeenCalled();
 expect(await processDueAppointmentNoShows()).toEqual([]);expect(events[0]).toMatchObject({actorId:1496,actorType:'user',metadata:{financialOutcome:'deferred',automationActor:{kind:'qa_automation'}}});
});
it('keeps one declaration on retries and undoes it without rewriting the saved signed snapshot or applying a consequence',async()=>{
 await declareAppointmentNoShow(appointment,{earlyNoShowConfirmed:true},preview,1496);const original=row.snapshot_json;
 await declareAppointmentNoShow(appointment,{earlyNoShowConfirmed:true},preview,1496);expect(events).toHaveLength(1);
 await undoAppointmentNoShow(90,1496,'Client arrived; recording the performed session.');expect(appointment.status).toBe('scheduled');expect(row.state).toBe('undone');expect(row.snapshot_json).toBe(original);
 await undoAppointmentNoShow(90,1496,'Client arrived; recording the performed session.');expect(events.filter(e=>e.action==='no_show_undone')).toHaveLength(1);
 vi.setSystemTime(new Date('2030-01-01T18:15:00Z'));expect(await processDueAppointmentNoShows()).toEqual([]);expect(m.finalize).not.toHaveBeenCalled();
});
it('closes undo at the exact deadline and finalizes the frozen reviewed consequence once with a system audit actor',async()=>{
 await declareAppointmentNoShow(appointment,{earlyNoShowConfirmed:true},preview,1496);vi.setSystemTime(new Date('2030-01-01T18:10:00Z'));
 await expect(undoAppointmentNoShow(90,1496,'Client arrived; recording the performed session.')).rejects.toMatchObject({status:409});await processDueAppointmentNoShows();await processDueAppointmentNoShows();
 expect(m.finalize).toHaveBeenCalledTimes(1);expect(m.finalize.mock.calls[0][1].preview.consequence.feeCents).toBe(2200);expect(events.at(-1)).toMatchObject({actorId:null,actorType:'system',action:'no_show_finalized',metadata:{requestedByUserId:1496}});
});
it('withholds finalization and notification when the appointment changed',async()=>{
 await declareAppointmentNoShow(appointment,{earlyNoShowConfirmed:true},preview,1496);appointment.startAt='2030-01-02 17:00:00';vi.setSystemTime(new Date('2030-01-01T18:11:00Z'));
 expect(await processDueAppointmentNoShows()).toEqual([{appointmentId:90,reviewRequired:true}]);expect(row.state).toBe('review');expect(m.finalize).not.toHaveBeenCalled();
});
it('rejects a declaration before start and preserves the full date-specific review window',async()=>{
 vi.setSystemTime(new Date('2030-01-01T16:59:00Z'));await expect(declareAppointmentNoShow(appointment,{earlyNoShowConfirmed:true},preview,1496)).rejects.toMatchObject({status:400});expect(row).toBeNull();
 expect(noShowReviewTiming(appointment,new Date('2030-01-01T17:15:00Z'))).toMatchObject({earlyConfirmationRequired:false,canUndo:true});expect(await getAppointmentNoShowReview(90)).toBeNull();
});

it('requires an undo reason and permits a new declaration after withdrawal without reusing its signature',async()=>{await declareAppointmentNoShow(appointment,{earlyNoShowConfirmed:true},preview,1496);await expect(undoAppointmentNoShow(90,1496,'')).rejects.toMatchObject({status:400});expect(appointment.status).toBe('no_show_pending');await undoAppointmentNoShow(90,1496,'Client arrived, then corrected the attendance report.');await declareAppointmentNoShow(appointment,{earlyNoShowConfirmed:true},preview,1496);expect(events.map(e=>e.action)).toEqual(['no_show_declared','no_show_undone','no_show_declared']);expect(events[1].metadata.reason).toContain('Client arrived');expect(appointment.status).toBe('no_show_pending');});
it('cannot mark a stale scheduled tutoring record missed after attendance was actually recorded',async()=>{appointment.businessType='tutoring';const original=db.execute.getMockImplementation();db.execute.mockImplementation((sql,p)=>sql.includes('AS attendance_started')?Promise.resolve([[{attendance_started:1,note_signed:0}]]):original(sql,p));await expect(declareAppointmentNoShow(appointment,{earlyNoShowConfirmed:true},preview,1496)).rejects.toMatchObject({code:'ATTENDED_SESSION_LOCKED'});expect(row).toBeNull();expect(m.finalize).not.toHaveBeenCalled();});
