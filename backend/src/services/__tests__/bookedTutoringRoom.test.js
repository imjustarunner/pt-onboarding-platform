import {nluSessionHubClientAccess} from '../nluSessionHubAccess.service.js';
vi.mock('../nluSessionHubAccess.service.js',()=>({nluSessionHubClientAccess:vi.fn(async()=>({client:{full_name:'Synthetic student'}}))}));
vi.mock('../../models/StudentSubject.model.js',()=>({default:{listByClient:vi.fn(async()=>[]),findById:vi.fn()}}));
vi.mock('../../models/StudentLearningPlan.model.js',()=>({default:{findActiveBySubject:vi.fn(),listBySubject:vi.fn(),listGoals:vi.fn(),getPlanBundle:vi.fn()}}));
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../staffAppointmentMeet.service.js',()=>({savedStaffAppointmentMeet:vi.fn(async()=>null)}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:v=>`encrypted:${v}`,maybeDecryptNotePayload:v=>v.replace(/^encrypted:/,'')}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn(),listParticipants:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>({id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}}))}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../../utils/learningAccess.js',()=>({assertLearningClientAccess:vi.fn()}));
vi.mock('../tutoringOffice.service.js',()=>({tutoringVisit:vi.fn()}));
vi.mock('../tutoringAppointmentWorkspace.service.js',()=>({ensureTutoringAppointmentWorkspace:vi.fn()}));
vi.mock('../clinicalVideo.service.js',()=>({requireClinicalVideoMonitoring:vi.fn(),clinicalMedia:vi.fn(),registerClinicalMedia:vi.fn(),clinicalVideoToken:vi.fn(),requireActiveClinicalMedia:vi.fn(),requireMonitoredProvider:vi.fn(),clinicalAttendance:vi.fn(),requestClinicalEnd:vi.fn(),finishClinicalEnd:vi.fn(),revokeClinicalActor:vi.fn(),retryClinicalDisconnections:vi.fn()}));
vi.mock('../vonageVideo.service.js',()=>({default:{createSession:vi.fn()}}));
vi.mock('../clinicalSessionAudit.service.js',()=>({clinicalAudit:vi.fn()}));
vi.mock('../publicFormBranding.service.js',()=>({buildPublicFormBrandingForAgencyId:vi.fn(async()=>({agencyName:'NLU QA'}))}));
vi.mock('../../models/TutoringSessionLearning.model.js',()=>({TutoringSessionBrief:{findBySession:vi.fn(async()=>null)},TutoringSessionNote:{findBySession:vi.fn(),create:vi.fn(),update:vi.fn()}}));
vi.mock('../therapyWorkspace.service.js',()=>({readWorkspace:vi.fn(),appendWorkspace:vi.fn(),recordWorkspaceDownload:vi.fn()}));
vi.mock('../../controllers/learningClassSessions.controller.js',()=>({completeLearningSession:vi.fn()}));
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import User from '../../models/User.model.js';
import {assertLearningClientAccess} from '../../utils/learningAccess.js';
import * as media from '../clinicalVideo.service.js';
import Video from '../vonageVideo.service.js';
import {TutoringSessionNote} from '../../models/TutoringSessionLearning.model.js';
import {clinicalAudit} from '../clinicalSessionAudit.service.js';
import * as room from '../bookedTutoringRoom.service.js';
import {savedStaffAppointmentMeet} from '../staffAppointmentMeet.service.js';
import {completeLearningSession} from '../../controllers/learningClassSessions.controller.js';
const a={id:359,agencyId:453,providerUserId:1496,businessType:'tutoring',serviceCode:'TUTORING',status:'scheduled',modality:'VIRTUAL',startAt:'2026-11-17 18:00:00',endAt:'2026-11-17 19:00:00'};
const tutor={user:{id:1496,role:'provider'},query:{}},parent={user:{id:1759,role:'client_guardian'},query:{}};
let session,visits,db;
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-17T18:10:00Z'));session={id:600,status:'scheduled',provider_user_id:1496};visits=[];
 Appointment.findById.mockResolvedValue(a);Appointment.listParticipants.mockResolvedValue([{clientId:2547}]);User.getAgencies.mockResolvedValue([{id:453}]);assertLearningClientAccess.mockResolvedValue({permissions:{canViewAppointments:true},service:{provider_user_id:1496}});
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{
 if(sql.includes('FROM clinical_work_archive_resources'))return [[]];
 if(sql.startsWith('SELECT status,provider_user_id'))return [[{status:a.status,agency_id:453,provider_user_id:1496,start_at:a.startAt,end_at:a.endAt,modality:a.modality,service_code:'TUTORING',business_type:'tutoring'}]];
 if(sql.includes('FROM users WHERE id='))return [[{id:1759,role:'client_guardian',is_active:1,is_archived:0}]];
 if(sql.includes('FROM tutoring_appointment_sessions b'))return [session?[session]:[]];
 if(sql.includes('FROM tutoring_session_clients'))return [[{client_id:2547}]];
 if(sql.startsWith('SELECT id,status FROM tutoring_session_visits'))return [visits];
 if(sql.includes('FROM tutoring_session_visits'))return [visits];
 return [{insertId:9,affectedRows:1}];})};pool.execute.mockImplementation((...args)=>db.execute(...args));pool.getConnection.mockResolvedValue(db);Video.createSession.mockResolvedValue('new-appointment-media');media.clinicalVideoToken.mockResolvedValue('test-video-credential');media.clinicalMedia.mockResolvedValue({state:'active',session_kind:'tutoring'});media.clinicalAttendance.mockResolvedValue(new Map());media.finishClinicalEnd.mockResolvedValue({state:'ended'});TutoringSessionNote.findBySession.mockResolvedValue(null);TutoringSessionNote.create.mockResolvedValue({id:22});
});
afterEach(()=>vi.useRealTimers());
it('opens the exact booked room as the tutor without reading a permanent office',async()=>{const ctx=await room.bookedTutoringAccess(tutor,359);const value=await room.openBookedTutoringRoom(ctx);expect(value.participantRole).toBe('provider');expect(media.registerClinicalMedia).toHaveBeenCalledWith('new-appointment-media',expect.objectContaining({kind:'tutoring',sessionId:600,agencyId:453}),db);expect(db.execute.mock.calls.some(([sql])=>sql.includes('private_virtual_office'))).toBe(false);expect(media.clinicalVideoToken).toHaveBeenCalledWith('new-appointment-media',expect.objectContaining({actor:'user-1496',role:'provider'}),db);});
it('does not put the tutor into the family waiting room',async()=>{const ctx=await room.bookedTutoringAccess(tutor,359);await room.joinBookedTutoringRoom(ctx);expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO tutoring_session_visits'))).toBe(false);});
it('family entry creates one waiting visit and never a video token',async()=>{const ctx=await room.bookedTutoringAccess(parent,359);expect(await room.joinBookedTutoringRoom(ctx)).toMatchObject({visit:{status:'waiting'}});expect(media.clinicalVideoToken).not.toHaveBeenCalled();visits=[{id:9,status:'waiting'}];await room.joinBookedTutoringRoom(ctx);expect(db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO tutoring_session_visits')).length).toBe(1);});
it('denies a family token before admission',async()=>{session.booked_media_id='exact-room';const ctx=await room.bookedTutoringAccess(parent,359);await expect(room.bookedTutoringToken(ctx)).rejects.toMatchObject({status:403});expect(media.clinicalVideoToken).not.toHaveBeenCalled();});
it('issues an admitted family token for this room and visit only',async()=>{session.booked_media_id='exact-room';visits=[{id:9}];const ctx=await room.bookedTutoringAccess(parent,359);await room.bookedTutoringToken(ctx);expect(media.clinicalVideoToken).toHaveBeenCalledWith('exact-room',expect.objectContaining({role:'client',visitId:9,actor:'user-1759'}),db);});
it('requires confirmed host media before admission',async()=>{session.booked_media_id='exact-room';visits=[{id:9,user_id:1759,status:'waiting'}];media.requireMonitoredProvider.mockRejectedValue(Object.assign(new Error('Host not connected'),{status:409}));const ctx=await room.bookedTutoringAccess(tutor,359);await expect(room.admitBookedTutoringParticipant(ctx,9)).rejects.toMatchObject({status:409});expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE appointments'))).toBe(false);});
it.each(['admin','support','staff','provider_plus'])('does not make another %s the tutor',async role=>{await expect(room.bookedTutoringAccess({user:{id:1807,role},query:{}},359)).rejects.toMatchObject({status:403});});
it('denies wrong student and wrong selected team after normal family authorization',async()=>{await expect(room.bookedTutoringAccess({...parent,query:{clientId:2545}},359)).rejects.toMatchObject({status:403});assertLearningClientAccess.mockResolvedValue({service:{provider_user_id:0}});await expect(room.bookedTutoringAccess(parent,359)).rejects.toMatchObject({status:403});});
it('denies revoked agency membership',async()=>{User.getAgencies.mockResolvedValue([]);await expect(room.bookedTutoringAccess(tutor,359)).rejects.toMatchObject({status:403});});
it('preserves roster boundaries on a saved room',async()=>{db.execute.mockImplementation(async sql=>sql.includes('FROM tutoring_appointment_sessions b')?[[session]]:sql.includes('FROM tutoring_session_clients')?[[{client_id:2545}]]:[[]]);const ctx=await room.bookedTutoringAccess(parent,359);await expect(room.tutoringRoomStatus(ctx)).rejects.toMatchObject({status:409});});
it('records a private General note without generating a subject or claiming attendance',async()=>{const ctx=await room.bookedTutoringAccess(tutor,359);await room.bookedTutoringNote(ctx,{summary:'Synthetic tutoring note'});expect(TutoringSessionNote.create).toHaveBeenCalledWith(expect.objectContaining({clientId:2547,studentSubjectId:null,sessionId:600,generalSupport:true,summary:'Synthetic tutoring note'}),1496,db);expect(db.execute.mock.calls.some(([sql])=>sql.includes("status='live'"))).toBe(false);});
it('does not give family accounts private tutor notes',async()=>{const ctx=await room.bookedTutoringAccess(parent,359);await expect(room.bookedTutoringNote(ctx)).rejects.toMatchObject({status:403});});
it('keeps actual closure even when early billing needs review',async()=>{media.clinicalAttendance.mockResolvedValue(new Map([[9,60]]));session.booked_media_id='exact-room';session.actual_started_at='2026-11-17 18:00:00';completeLearningSession.mockRejectedValue(Object.assign(new Error('Scheduled end is not due'),{status:409}));const ctx=await room.bookedTutoringAccess(tutor,359);const result=await room.endBookedTutoringRoom(ctx);expect(media.requestClinicalEnd).toHaveBeenCalledWith('exact-room',tutor,db);expect(result.billingWarning).toContain('attendance was kept');expect(clinicalAudit).toHaveBeenCalledWith(expect.objectContaining({kind:'tutoring',actor:'user-1496'}),'tutoring_room_ended',expect.objectContaining({appointmentId:359}),db);});
it('does not bill an opened room with no attended start',async()=>{const ctx=await room.bookedTutoringAccess(tutor,359);await room.endBookedTutoringRoom(ctx);expect(completeLearningSession).not.toHaveBeenCalled();});
it.each(['2026-11-17T17:29:59Z','2026-11-17T19:30:01Z'])('withholds access outside the exact joining window %s',at=>{expect(room.bookedTutoringWindow(a,+new Date(at)).available).toBe(false);});
it('keeps quarter hours and inclusive joining bounds',()=>{expect(room.bookedTutoringWindow(a,+new Date('2026-11-17T17:30:00Z')).available).toBe(true);expect(room.bookedTutoringWindow(a,+new Date('2026-11-17T19:30:00Z')).available).toBe(true);expect(room.bookedTutoringWindow({...a,status:'canceled'},Date.now()).available).toBe(false);});

it('seals canceled tutoring media without completing or billing the appointment',async()=>{session.booked_media_id='exact-room';await room.closeChangedBookedTutoringRoom(a,1807);expect(media.requestClinicalEnd).toHaveBeenCalledWith('exact-room',null,db);expect(completeLearningSession).not.toHaveBeenCalled();});
it('does not open a room for a personal portal linked to another student',async()=>{await expect(room.bookedTutoringAccess({...parent,dependentPortalAccess:{client_id:2545}},359)).rejects.toMatchObject({status:403});});

it('admits an authorized active family account after signed host presence and links its start to the exact appointment',async()=>{session.booked_media_id='exact-room';visits=[{id:9,user_id:1759,status:'waiting'}];const ctx=await room.bookedTutoringAccess(tutor,359);await room.admitBookedTutoringParticipant(ctx,9);expect(assertLearningClientAccess).toHaveBeenCalledWith(expect.objectContaining({user:expect.objectContaining({id:1759})}),2547,453);expect(db.execute.mock.calls.some(([sql])=>sql.startsWith("UPDATE appointments SET status='in_progress'"))).toBe(false);});
it('withholds room credentials if the booking moved between access resolution and its row lock',async()=>{const original=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT status,provider_user_id')?[[{status:'scheduled',agency_id:453,provider_user_id:1496,start_at:'2026-11-18 18:00:00',end_at:'2026-11-18 19:00:00'}]]:original(sql,...args));const ctx=await room.bookedTutoringAccess(tutor,359);await expect(room.openBookedTutoringRoom(ctx)).rejects.toMatchObject({status:409});expect(Video.createSession).not.toHaveBeenCalled();});
it('cannot turn an in-person appointment into a video visit',async()=>{const ctx=await room.bookedTutoringAccess(tutor,359);ctx.appointment={...ctx.appointment,modality:'IN_PERSON'};await expect(room.openBookedTutoringRoom(ctx)).rejects.toMatchObject({status:409});expect(media.clinicalVideoToken).not.toHaveBeenCalled();});
it('requires an active matching tutoring assignment even when a family opens a copied link without a service selector',async()=>{assertLearningClientAccess.mockResolvedValue({services:[{provider_user_id:0,service_kind:'tutoring',is_active:1}]});await expect(room.bookedTutoringAccess(parent,359)).rejects.toMatchObject({status:403});});

it('stores a full monitored video ID separately without overwriting legacy room evidence',async()=>{const full='2_MX5synthetic-'+ 'A'.repeat(150);Video.createSession.mockResolvedValue(full);session.twilio_room_sid='retained-twilio';session.vonage_session_id='retained-older-video';const ctx=await room.bookedTutoringAccess(tutor,359);await room.openBookedTutoringRoom(ctx);const updates=db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE learning_class_sessions SET booked_media_id'));expect(updates[0][1]).toEqual([full,600]);expect(updates[0][0]).not.toMatch(/twilio_room_sid|vonage_session_id/);});

it('denies a copied link when the family only has a different subject service with the same tutor',async()=>{Appointment.findById.mockResolvedValue({...a,learningContext:{serviceEnrollmentId:1038}});assertLearningClientAccess.mockResolvedValue({services:[{id:1039,provider_user_id:1496,service_kind:'tutoring',is_active:1}]});await expect(room.bookedTutoringAccess(parent,359)).rejects.toMatchObject({status:403});});
it('starts in person without creating video media and blocks starting it again after its real end',async()=>{const ctx=await room.bookedTutoringAccess(tutor,359);ctx.appointment={...ctx.appointment,modality:'IN_PERSON'};const original=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,p)=>sql.startsWith('SELECT status,provider_user_id')?[[{status:'scheduled',agency_id:453,provider_user_id:1496,start_at:a.startAt,end_at:a.endAt,modality:'IN_PERSON',service_code:'TUTORING'}]]:original(sql,p));await room.startBookedInPersonTutoring(ctx);expect(db.execute.mock.calls.some(([sql])=>sql.startsWith("UPDATE learning_class_sessions SET status='live'"))).toBe(true);expect(Video.createSession).not.toHaveBeenCalled();session.actual_ended_at='2026-11-17 18:30:00';await expect(room.startBookedInPersonTutoring(ctx)).rejects.toMatchObject({status:409});});
it('withholds all joining windows during a pending no-show correction',()=>{expect(room.bookedTutoringWindow({...a,status:'no_show_pending'},Date.now()).available).toBe(false);});
it('cannot open video, save a new note or start in person for an archived test appointment',async()=>{const ctx=await room.bookedTutoringAccess(tutor,359);const original=db.execute.getMockImplementation();db.execute.mockImplementation((sql,p)=>sql.includes('FROM clinical_work_archive_resources')?Promise.resolve([[{resource_type:'appointment',resource_id:359,archive_id:1,archived_at:'2026-11-17 18:00:00'}]]):original(sql,p));await expect(room.openBookedTutoringRoom(ctx)).rejects.toMatchObject({code:'CLINICAL_WORK_ARCHIVED'});await expect(room.bookedTutoringNote(ctx,{summary:'Unpermitted new draft'})).rejects.toMatchObject({code:'CLINICAL_WORK_ARCHIVED'});await expect(room.startBookedInPersonTutoring({...ctx,appointment:{...a,modality:'IN_PERSON'}})).rejects.toMatchObject({code:'CLINICAL_WORK_ARCHIVED'});expect(Video.createSession).not.toHaveBeenCalled();expect(TutoringSessionNote.create).not.toHaveBeenCalled();});

it('keeps plan-checklist context private to the assigned tutor',async()=>{const ctx=await room.bookedTutoringAccess(parent,359);await expect(room.bookedTutoringLearningContext(ctx)).rejects.toMatchObject({status:403});});
it('withholds a mismatched legacy note from learning-context responses',async()=>{TutoringSessionNote.findBySession.mockResolvedValue({id:22,client_id:9999,agency_id:453});const ctx=await room.bookedTutoringAccess(tutor,359);await expect(room.bookedTutoringLearningContext(ctx)).rejects.toMatchObject({status:409});});

it('saves the family draft without replacing Narriva checklist prose, evidence or progress metadata',async()=>{const original={id:22,client_id:2547,agency_id:453,status:'saved',summary:'Private plan-only narrative',metadata_json:{documentationMode:'learning_plan_checklist',checklistRevision:2,planChecklist:{privateResult:'Retain'}}};TutoringSessionNote.findBySession.mockResolvedValue(original);TutoringSessionNote.update.mockImplementation(async(id,body)=>({...original,metadata_json:body.metadata}));const ctx=await room.bookedTutoringAccess(tutor,359);const result=await room.bookedTutoringNote(ctx,{familySummary:true,workedOn:'Family practice',howItWent:'Used one model',homePractice:'Draw two parts',goalIds:[]});expect(TutoringSessionNote.update).toHaveBeenCalledWith(22,{metadata:expect.objectContaining({documentationMode:'learning_plan_checklist',checklistRevision:2,planChecklist:{privateResult:'Retain'}})},1496,db);expect(result.note.summary).toBe('Private plan-only narrative');expect(result.familyDraft.workedOn).toBe('Family practice');expect(TutoringSessionNote.create).not.toHaveBeenCalled();});

it('keeps a scheduled learning room closed when its canonical appointment is a no-show', async () => {
 Appointment.findById.mockResolvedValue({...a,status:'no_show'});
 const ctx=await room.bookedTutoringAccess(tutor,359);
 expect(await room.tutoringRoomStatus(ctx)).toMatchObject({
  status:'no_show',displayStatus:'No-show',closed:true,available:false,visits:[]
 });
 expect(media.clinicalAttendance).not.toHaveBeenCalled();
});

it('shows the authorized family the exact ended appointment publication without exposing the tutor draft', async () => {
 session.actual_started_at='2026-11-17 18:00:00';
 session.actual_ended_at='2026-11-17 18:30:00';
 const summary={workedOn:'Reading',howItWent:'Main idea',homePractice:'Reread'};
 const original=db.execute.getMockImplementation();
 db.execute.mockImplementation((sql,params)=>sql.includes('FROM tutoring_note_publications p')
  ? Promise.resolve([[{snapshot_json:JSON.stringify({summary,goalIds:[54]}),author_name:'QA tutor',signed_at:'2026-11-17 18:40:00'}]])
  : original(sql,params));
 const ctx=await room.bookedTutoringAccess(parent,359);
 const state=await room.tutoringRoomStatus(ctx);
 expect(state).toMatchObject({status:'completed',closed:true,familySummary:{summary,authorName:'QA tutor'}});
 expect(state.familySummary).not.toHaveProperty('goalIds');
 expect(TutoringSessionNote.findBySession).not.toHaveBeenCalled();
 expect(db.execute.mock.calls.find(([sql])=>sql.includes('FROM tutoring_note_publications p'))[1]).toEqual([359,600,453,2547]);
});

it('shows the booked student from the authorized chart in both hubs', async () => {
 assertLearningClientAccess.mockResolvedValue({client:{full_name:'River QA'},permissions:{canViewAppointments:true}});
 for (const actor of [parent, tutor]) {
  const ctx = await room.bookedTutoringAccess(actor,359);
  expect((await room.tutoringRoomStatus(ctx)).studentName).toBe('River QA');
 }
});
it('accepts the approved goal for an assigned track and rejects another track’s goal', async () => {
 const {default:subjects}=await import('../../models/StudentSubject.model.js');
 const {default:plans}=await import('../../models/StudentLearningPlan.model.js');
 session.student_subject_id=92;
 subjects.listByClient.mockResolvedValue([{id:92,status:'active',primary_tutor_user_id:null}]);
 plans.findActiveBySubject.mockResolvedValue({id:16,client_id:2547,agency_id:453,approved_at:'2026-11-16'});
 plans.listGoals.mockResolvedValue([{id:51,student_subject_id:92},{id:31,student_subject_id:7}]);
 const ctx=await room.bookedTutoringAccess(tutor,359);
 await room.bookedTutoringNote(ctx,{summary:'Recorded in this visit',goalIds:[51]});
 await expect(room.bookedTutoringNote(ctx,{summary:'Do not save',goalIds:[31]})).rejects.toMatchObject({status:409});
 expect(TutoringSessionNote.create).toHaveBeenCalledTimes(1);
});

it('rejects admission after waiting presence expires, without starting a timer',async()=>{session.booked_media_id='exact-room';const ctx=await room.bookedTutoringAccess(tutor,359);await expect(room.admitBookedTutoringParticipant(ctx,9)).rejects.toMatchObject({status:409});expect(db.execute.mock.calls.find(([sql])=>sql.startsWith('SELECT * FROM tutoring_session_visits'))[0]).toContain('last_seen_at>=UTC_TIMESTAMP()-INTERVAL 20 SECOND');expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);});
it('keeps stale visitors out of the live waiting list without claiming connected attendance',async()=>{visits=[{id:9,status:'waiting',lastSeenAt:'2026-11-17 18:09:00',displayName:'Rene QA'}];const ctx=await room.bookedTutoringAccess(tutor,359);expect((await room.tutoringRoomStatus(ctx)).visits[0]).toMatchObject({present:false,mediaDurationSeconds:null});expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE tutoring_session_visits'))).toBe(false);});
it('refreshes only the current invited participant presence through an explicit heartbeat',async()=>{const ctx=await room.bookedTutoringAccess(parent,359);await room.heartbeatBookedTutoringRoom(ctx);expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('last_seen_at=UTC_TIMESTAMP()'),[600,1759]);});

it('does not bill a historical admitted-only visit with no verified media attendance',async()=>{session.booked_media_id='exact-room';session.actual_started_at='2026-11-17 18:00:00';const ctx=await room.bookedTutoringAccess(tutor,359);expect((await room.endBookedTutoringRoom(ctx)).billingWarning).toContain('no connected family attendance');expect(completeLearningSession).not.toHaveBeenCalled();});
it('stores measured connected seconds rather than time since the Admit click',async()=>{session.booked_media_id='exact-room';media.clinicalAttendance.mockResolvedValue(new Map([[9,7]]));const ctx=await room.bookedTutoringAccess(parent,359);await room.leaveBookedTutoringRoom(ctx);expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('duration_seconds=CASE id WHEN ? THEN ? ELSE 0 END'),[9,7,600,1759]);});

it('keeps Google Meet status, notes and exact link without exposing a native waiting room or creating media',async()=>{
 const ctx={appointment:{...a,videoRoomMode:'google_meet'},clientId:2547,host:true,hubV2:true,nluVideoChoice:true,actor:'user-1496',req:tutor};
 savedStaffAppointmentMeet.mockResolvedValue('https://meet.google.com/abc-defg-hij');
 const status=await room.tutoringRoomStatus(ctx);
 expect(status).toMatchObject({appointmentId:359,videoRoomMode:'google_meet',meetingUrl:'https://meet.google.com/abc-defg-hij',visits:[],visit:null,sessionId:600});
 await expect(room.openBookedTutoringRoom(ctx)).rejects.toMatchObject({status:409});
 await expect(room.joinBookedTutoringRoom({...ctx,host:false,req:parent})).rejects.toMatchObject({status:409});
 expect(Video.createSession).not.toHaveBeenCalled();expect(media.clinicalVideoToken).not.toHaveBeenCalled();
 expect(db.execute.mock.calls.some(([sql])=>/INSERT INTO tutoring_session_visits/.test(sql))).toBe(false);
});
it('requires the assigned tutor’s explicit attendance attestation before recording an external session start',async()=>{
 const ctx={appointment:{...a,videoRoomMode:'google_meet'},clientId:2547,host:true,actor:'user-1496',req:tutor};
 await expect(room.startBookedExternalTutoring({...ctx,host:false}, {body:{attended:true}})).rejects.toMatchObject({status:403});
 await expect(room.startBookedExternalTutoring(ctx,{body:{}})).rejects.toMatchObject({status:400});
 expect(db.execute).not.toHaveBeenCalled();
 savedStaffAppointmentMeet.mockResolvedValue('https://meet.google.com/abc-defg-hij');
 await expect(room.startBookedExternalTutoring(ctx,{body:{attended:true}})).resolves.toEqual({sessionId:600});
 expect(clinicalAudit).toHaveBeenCalledWith(expect.anything(),'tutoring_external_attendance_started',expect.objectContaining({appointmentId:359,source:'tutor_attestation',videoRoomMode:'google_meet'}),db);
 expect(Video.createSession).not.toHaveBeenCalled();expect(media.clinicalVideoToken).not.toHaveBeenCalled();
});
it('does not reset an already recorded external start on retry or create a second attendance event',async()=>{
 session.actual_started_at='2026-11-17 18:05:00';
 const ctx={appointment:{...a,videoRoomMode:'google_meet'},clientId:2547,host:true,actor:'user-1496',req:tutor};
 await room.startBookedExternalTutoring(ctx,{body:{attended:true}});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE learning_class_sessions'))).toBe(false);
 expect(clinicalAudit).not.toHaveBeenCalled();
});
it.each([{videoRoomMode:'unique_session'},{videoRoomMode:'google_meet',status:'canceled_by_client'},{videoRoomMode:'google_meet',startAt:'2026-11-18 18:00:00',endAt:'2026-11-18 19:00:00'}])('rejects external attendance for an invalid appointment window or mode',async changed=>{
 const appointment={...a,...changed};
 const original=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT status,provider_user_id')?[[{status:appointment.status,agency_id:453,provider_user_id:1496,start_at:appointment.startAt,end_at:appointment.endAt,modality:appointment.modality,video_room_mode:appointment.videoRoomMode}]]:original(sql,...args));
 await expect(room.startBookedExternalTutoring({appointment,clientId:2547,host:true,actor:'user-1496',req:tutor},{body:{attended:true}})).rejects.toMatchObject({status:409});
 expect(clinicalAudit).not.toHaveBeenCalled();
});
it('keeps a Google Meet session unstarted when its meeting link is unavailable',async()=>{
 savedStaffAppointmentMeet.mockResolvedValue(null);
 const ctx={appointment:{...a,videoRoomMode:'google_meet'},clientId:2547,host:true,actor:'user-1496',req:tutor};
 await expect(room.startBookedExternalTutoring(ctx,{body:{attended:true}})).rejects.toMatchObject({status:409,message:expect.stringContaining('Prepare')});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE learning_class_sessions'))).toBe(false);expect(clinicalAudit).not.toHaveBeenCalled();
});

it('never relabels an existing platform media record as an externally attended meeting',async()=>{
 session.booked_media_id='retained-platform-media';
 const ctx={appointment:{...a,videoRoomMode:'google_meet'},clientId:2547,host:true,actor:'user-1496',req:tutor};
 await expect(room.startBookedExternalTutoring(ctx,{body:{attended:true}})).rejects.toMatchObject({status:409,message:expect.stringContaining('platform video record')});
 expect(clinicalAudit).not.toHaveBeenCalled();expect(db.execute.mock.calls.some(([sql])=>sql.includes('actual_started_at=UTC_TIMESTAMP()'))).toBe(false);
});

it.each(['HOMEWORK HELP','H2014','90837','CUSTOM-NLU'])('opens the full NLU Hub for %s while retaining its actual service',async serviceCode=>{
 const appointment={...a,serviceCode,businessType:serviceCode==='HOMEWORK HELP'?'learning':'mental_health',videoRoomMode:'unique_session'};
 Appointment.findById.mockResolvedValue(appointment);
 const ctx=await room.bookedTutoringAccess(tutor,359);
 expect(ctx).toMatchObject({appointment:{serviceCode,businessType:appointment.businessType},hubV2:true,activitiesOnly:true});
 expect(nluSessionHubClientAccess).toHaveBeenCalledWith(tutor,appointment,2547,true);
 expect(assertLearningClientAccess).not.toHaveBeenCalled();
 expect((await room.tutoringRoomStatus(ctx)).serviceCode).toBe(serviceCode);
});
it('keeps arbitrary service codes out of another agency’s Hub',async()=>{
 const Agency=(await import('../../models/Agency.model.js')).default;
 Agency.findById.mockResolvedValueOnce({id:2,slug:'itsco'});Appointment.findById.mockResolvedValue({...a,agencyId:2,serviceCode:'H2014',businessType:'mental_health'});
 await expect(room.bookedTutoringAccess(tutor,359)).rejects.toHaveProperty('status',404);
});
