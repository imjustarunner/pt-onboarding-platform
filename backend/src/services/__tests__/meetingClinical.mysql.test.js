import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import {splitSqlStatements,stripSqlLineComments} from '../../../../database/migrationSqlUtils.js';
const state=vi.hoisted(()=>({db:null,serial:0,disconnect:vi.fn(),inventory:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:(...args)=>state.db.execute(...args)}}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args),getConnection:()=>state.db.getConnection()}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:async()=>true}));
vi.mock('../meetingAccessPlan.service.js',()=>({getMeetingPlan:async()=>({privateOffice:true,multipleOfficeGuests:true})}));
vi.mock('../vonageVideo.service.js',()=>({resolveVideoProjectId:()=> 'project',default:{isVideoConfigured:()=>true,createSession:async()=>`media-${++state.serial}`,generateToken:(_id,options)=>options.data,disconnectClient:state.disconnect,listConnections:state.inventory}}));
import {officeHostVideo,officeLobby,joinOffice,admitOfficeGuest,officeGuestVideo,officeWorkspaceContext,officeHistory,resumeOfficeVisit,leaveOffice,endOffice} from '../privateVirtualOffice.service.js';
import {appendWorkspace,readWorkspace} from '../therapyWorkspace.service.js';
import {processClinicalCallback,finishClinicalEnd} from '../clinicalVideo.service.js';
import {officeSchedule} from '../virtualOfficeSchedule.service.js';
import {scheduledAttendance,syncOfficeAttendance} from '../virtualOfficeAttendance.service.js';
import {runClinicalSessionMaintenance} from '../clinicalSessionRetention.service.js';
import {counselingClinicalToken,endClinicalCounseling} from '../counselingClinicalVideo.service.js';
import {joinCounselingVisit,admitCounselingVisit} from '../counselingSessionVisit.service.js';
const socket=process.env.CLINICAL_TEST_SOCKET;
describe.skipIf(!socket)('isolated clinical encounter database',()=>{
 const room={id:1,userId:5,agencyId:2,isActive:true,slug:'permanent-office'};
 async function connect(credentials,id){await processClinicalCallback({event:'connectionCreated',sessionId:credentials.sessionId,projectId:'project',timestamp:Date.now(),connection:{id,createdAt:Date.now(),data:credentials.token}});}
 async function confirmEmpty(mediaId){await processClinicalCallback({sessionId:mediaId,event:'sessionDestroyed',timestamp:Date.now()});}
 async function expireTokens(){await state.db.execute('UPDATE clinical_video_grants SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND)');}
 beforeAll(async()=>{
  if(!/^\/private\/tmp\/clinical-encounter-test\.[^/]+\/mysql\.sock$/.test(socket))throw new Error('Use a disposable clinical test database socket.');
  const admin=await mysql.createConnection({socketPath:socket,user:'root'});await admin.query('CREATE DATABASE clinical_encounter_test');await admin.end();
  state.db=mysql.createPool({socketPath:socket,user:'root',database:'clinical_encounter_test',timezone:'Z',connectionLimit:6});
  await state.db.query('CREATE TABLE users (id INT PRIMARY KEY,role VARCHAR(30))');await state.db.query("INSERT INTO users VALUES (5,'provider')");
  await state.db.query('CREATE TABLE provider_my_rooms (id INT PRIMARY KEY,user_id INT,agency_id INT,slug VARCHAR(100),join_token VARCHAR(64),display_name VARCHAR(100),is_active BOOLEAN DEFAULT TRUE,UNIQUE KEY uq_provider_my_rooms_user(user_id))');
  await state.db.query('CREATE TABLE counseling_sessions (id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,provider_user_id INT,client_user_id INT,appointment_id INT,title VARCHAR(100),guest_invite_token VARCHAR(64),public_id VARCHAR(36),created_at DATETIME DEFAULT CURRENT_TIMESTAMP,status VARCHAR(20),vonage_session_id VARCHAR(512),vonage_application_id VARCHAR(100),started_at DATETIME,ended_at DATETIME)');
  for(const name of ['1456_security_evidence.sql','1522_private_virtual_offices.sql','1530_tenant_office_session_workspace.sql','1531_clinical_encounter_security.sql','1560_unified_virtual_office.sql','1685_private_office_messages.sql']){
   const sql=await fs.readFile(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8');
   for(const statement of splitSqlStatements(stripSqlLineComments(sql)))await state.db.query(statement);
  }
  await state.db.query("INSERT INTO provider_my_rooms(id,user_id,agency_id,slug,display_name) VALUES (1,5,2,'permanent-office','Provider')");
  await state.db.query('CREATE TABLE appointments (id INT PRIMARY KEY,agency_id INT,provider_user_id INT,title VARCHAR(100),start_at DATETIME,end_at DATETIME,modality VARCHAR(24),business_type VARCHAR(24),status VARCHAR(24),office_event_id INT)');
  await state.db.query('CREATE TABLE learning_program_classes (id INT PRIMARY KEY,organization_id INT)');
  await state.db.query('CREATE TABLE learning_class_sessions (id INT PRIMARY KEY,learning_class_id INT,provider_user_id INT,delivery_context VARCHAR(24),title VARCHAR(100),description TEXT,status VARCHAR(24),starts_at DATETIME,ends_at DATETIME)');
  await state.db.query('CREATE TABLE clients (id INT PRIMARY KEY,agency_id INT,full_name VARCHAR(100),initials VARCHAR(10),date_of_birth DATE)');
  await state.db.query('CREATE TABLE appointment_participants (appointment_id INT,client_id INT)');
  await state.db.query('CREATE TABLE client_agency_assignments (client_id INT,agency_id INT,is_active BOOLEAN)');
  await state.db.query('CREATE TABLE client_guardians (client_id INT,guardian_user_id INT,access_enabled BOOLEAN)');
  await state.db.query('CREATE TABLE clinical_sessions (id INT PRIMARY KEY,appointment_id INT,office_event_id INT,agency_id INT,provider_user_id INT,client_id INT,metadata_json JSON)');
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,9).toString('base64'));
  vi.stubEnv('VONAGE_VIDEO_CALLBACK_SECRET','synthetic');vi.stubEnv('VONAGE_APPLICATION_ID','project');
 });
 beforeEach(async()=>{
  vi.spyOn(console,'info').mockImplementation(()=>{});state.disconnect.mockReset().mockResolvedValue(true);state.inventory.mockReset().mockRejectedValue(new Error('synthetic unavailable inventory'));vi.spyOn(console,'warn').mockImplementation(()=>{});
  for(const table of ['learning_class_sessions','learning_program_classes','virtual_office_encounters','appointments','clients','appointment_participants','clinical_sessions','clinical_video_connections','clinical_video_grants','therapy_session_artifacts','clinical_video_sessions','private_virtual_office_visits','private_virtual_office_sessions','clinical_session_retention','counseling_session_visits','counseling_sessions'])await state.db.query(`DELETE FROM ${table}`);
 });
 afterAll(async()=>{if(state.db){await state.db.query('DROP DATABASE clinical_encounter_test');await state.db.end();}});
 it('keeps patient A private from B, including after A leaves and during end/reconnect races',async()=>{
  const host=await officeHostVideo(room);await connect(host,'provider');
  const a=await joinOffice(room,{displayName:'Synthetic A'}),b=await joinOffice(room,{displayName:'Synthetic B'});
  await admitOfficeGuest(room,a.id);const av=await officeGuestVideo(room,a.id,a.credential);await connect(av,'patient-a');
  const acontext=await officeWorkspaceContext(room,{id:a.id,credential:a.credential});
  await appendWorkspace(acontext,{type:'chat',payload:{text:'Synthetic private A content'}});
  await leaveOffice(room,a.id,a.credential);
  await expect(admitOfficeGuest(room,b.id)).rejects.toMatchObject({status:409});
  await expect(admitOfficeGuest(room,b.id,{sameEncounter:true})).rejects.toMatchObject({status:409});
  await expect(readWorkspace(acontext)).rejects.toMatchObject({status:403});
  expect(await endOffice(room)).toMatchObject({state:'ending'});
  await expect(officeHostVideo(room)).rejects.toMatchObject({status:409});
  await connect(av,'late-a');expect(state.disconnect).toHaveBeenCalledWith(host.sessionId,'late-a');
  await expireTokens();await confirmEmpty(host.sessionId);expect(await finishClinicalEnd(host.sessionId)).toMatchObject({state:'ended'});
  const next=await officeHostVideo(room);expect(next.sessionId).not.toBe(host.sessionId);await connect(next,'next-provider');
  await admitOfficeGuest(room,b.id);const bc=await officeWorkspaceContext(room,{id:b.id,credential:b.credential});
  expect((await readWorkspace(bc)).artifacts).toEqual([]);
  await expect(readWorkspace({...bc,agencyId:999})).rejects.toMatchObject({status:404});
  const [[stored]]=await state.db.execute('SELECT payload_envelope FROM therapy_session_artifacts');expect(stored.payload_envelope).not.toContain('Synthetic private A content');
 });
 it('serializes competing admission requests and requires explicit couples intent',async()=>{
  const host=await officeHostVideo(room);await connect(host,'provider');
  const a=await joinOffice(room,{}),b=await joinOffice(room,{});
  const result=await Promise.allSettled([admitOfficeGuest(room,a.id),admitOfficeGuest(room,b.id)]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const other=result[0].status==='rejected'?a:b;await admitOfficeGuest(room,other.id,{sameEncounter:true});
  const [[count]]=await state.db.execute("SELECT COUNT(*) total FROM private_virtual_office_visits WHERE status='admitted'");expect(count.total).toBe(2);
 });
 it('retains failed disconnections and retries subscribers who never publish a stream',async()=>{
  const host=await officeHostVideo(room);await connect(host,'quiet-provider');
  state.disconnect.mockRejectedValue(new Error('synthetic provider outage'));await expireTokens();
  expect(await endOffice(room)).toMatchObject({ok:false,state:'ending'});
  await expect(officeHostVideo(room)).rejects.toMatchObject({status:409});
  state.disconnect.mockResolvedValue(true);await confirmEmpty(host.sessionId);expect(await finishClinicalEnd(host.sessionId)).toMatchObject({ok:true,state:'ended'});
 });
 it('handles duplicate and reordered connection callbacks without resurrecting a departed connection',async()=>{
  const host=await officeHostVideo(room);const event={sessionId:host.sessionId,event:'connectionDestroyed',timestamp:Date.now(),connection:{id:'reordered',createdAt:Date.now(),data:''}};
  await processClinicalCallback(event);await connect(host,'reordered');await connect(host,'reordered');
  const [[row]]=await state.db.execute('SELECT * FROM clinical_video_connections WHERE connection_id=?',['reordered']);expect(row.disconnected_at).not.toBeNull();
 });
 it('can end an already-empty room without waiting for a second session-destroyed event',async()=>{
  const host=await officeHostVideo(room);await connect(host,'provider');await expireTokens();await confirmEmpty(host.sessionId);
  expect(await endOffice(room)).toMatchObject({ok:true,state:'ended'});
  expect((await officeHostVideo(room)).sessionId).not.toBe(host.sessionId);
 });
 it('recovers lost callbacks through maintenance and keeps the permanent office while isolating the next visit',async()=>{
  const host=await officeHostVideo(room);await connect(host,'provider');
  const a=await joinOffice(room,{});await admitOfficeGuest(room,a.id);
  const started=(await officeLobby(room)).encounter.startedAt;expect(started).toBeInstanceOf(Date);
  await officeHostVideo(room);expect((await officeLobby(room)).encounter.startedAt).toEqual(started);
  const b=await joinOffice(room,{});await admitOfficeGuest(room,b.id,{sameEncounter:true});expect((await officeLobby(room)).encounter.startedAt).toEqual(started);
  await appendWorkspace(await officeWorkspaceContext(room,{id:a.id,credential:a.credential}),{type:'chat',payload:{text:'Previous encounter only'}});
  state.inventory.mockResolvedValue({count:0,items:[]});expect(await endOffice(room)).toMatchObject({state:'ending'});
  await expireTokens();state.inventory.mockResolvedValueOnce({count:1,items:[{connectionId:'unreported-silent-client',connectionState:'Connecting',createdAt:Date.now()-10000}]}).mockResolvedValue({count:0,items:[]});
  await runClinicalSessionMaintenance();expect((await officeLobby(room)).encounter.state).toBe('ended');
  expect(state.disconnect).toHaveBeenCalledWith(host.sessionId,'unreported-silent-client');
  const next=await officeHostVideo(room);expect(next.sessionId).not.toBe(host.sessionId);expect(room.slug).toBe('permanent-office');
  expect((await officeLobby(room)).encounter).toMatchObject({startedAt:null,hasParticipants:false});
  await expect(officeGuestVideo(room,a.id,a.credential)).rejects.toMatchObject({status:403});
  expect((await readWorkspace(await officeWorkspaceContext(room))).artifacts).toEqual([]);
 });
 it('enforces retention policy and holds while independently expiring transient photos',async()=>{
  const host=await officeHostVideo(room);await connect(host,'provider');const a=await joinOffice(room,{});await admitOfficeGuest(room,a.id);
  await appendWorkspace(await officeWorkspaceContext(room,{id:a.id,credential:a.credential}),{type:'chat',payload:{text:'Synthetic record'}});
  await endOffice(room);await expireTokens();await confirmEmpty(host.sessionId);await finishClinicalEnd(host.sessionId);
  await state.db.execute('UPDATE clinical_video_sessions SET ended_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 40 DAY)');
  await state.db.execute("UPDATE private_virtual_office_visits SET photo_envelope='synthetic photo' WHERE id=?",[a.id]);
  await runClinicalSessionMaintenance();
  const [[photo]]=await state.db.execute('SELECT photo_envelope FROM private_virtual_office_visits WHERE id=?',[a.id]);expect(photo.photo_envelope).toBeNull();
  const count=async()=>Number((await state.db.execute('SELECT COUNT(*) n FROM therapy_session_artifacts'))[0][0].n);
  expect(await count()).toBe(1);
  await state.db.execute('INSERT INTO clinical_session_retention (agency_id,artifact_days,updated_by_user_id) VALUES (2,30,5)');
  await state.db.execute('UPDATE clinical_video_sessions SET legal_hold=TRUE');await runClinicalSessionMaintenance();expect(await count()).toBe(1);
  await state.db.execute('UPDATE clinical_video_sessions SET legal_hold=FALSE');await runClinicalSessionMaintenance();expect(await count()).toBe(0);
  await expect(state.db.execute('DELETE FROM security_evidence')).rejects.toThrow('append-only');
 });
 it('creates counseling media once under concurrent provider joins, and enforces client admission',async()=>{
  await state.db.execute("INSERT INTO counseling_sessions (id,agency_id,provider_user_id,status) VALUES (7,2,5,'scheduled')");
  const provider={user:{id:5},headers:{},method:'POST'},client={user:{id:null},headers:{},counselingInvitationAccess:{clientId:10},method:'POST'};
  const hosts=await Promise.all([counselingClinicalToken(provider,7,'provider'),counselingClinicalToken(provider,7,'provider')]);
  expect(hosts[0].sessionId).toBe(hosts[1].sessionId);await connect(hosts[0],'counseling-provider');
  await expect(counselingClinicalToken(client,7,'client')).rejects.toMatchObject({status:403});
  const session={id:7,agency_id:2};const visit=await joinCounselingVisit(client,session);await admitCounselingVisit(session,visit.id,provider);
  const token=await counselingClinicalToken(client,7,'client');await connect(token,'counseling-client');
  const ctx={kind:'counseling',sessionId:7,agencyId:2,role:'client',actor:'client-10',visitId:visit.id};
  await appendWorkspace(ctx,{type:'share',payload:{mode:'whiteboard',title:'Client drawing'}});
  expect(await endClinicalCounseling(provider,7)).toMatchObject({state:'ending'});
  await expect(counselingClinicalToken(client,7,'client')).rejects.toMatchObject({status:410});
  await expect(appendWorkspace(ctx,{type:'chat',payload:{text:'late'}})).rejects.toMatchObject({status:410});
  await expireTokens();await confirmEmpty(token.sessionId);expect(await finishClinicalEnd(token.sessionId)).toMatchObject({state:'ended'});
  expect((await readWorkspace({...ctx,role:'provider',historical:true,actor:'user-5'})).artifacts).toHaveLength(1);
 });
 async function booking(id=20,clientId=10,agencyId=2,providerId=5){
  await state.db.execute("INSERT INTO appointments VALUES (?,?,?,'Synthetic appointment',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 45 MINUTE),'TELEHEALTH','mental_health','scheduled',NULL)",[id,agencyId,providerId]);
  await state.db.execute("INSERT INTO clients(id,agency_id,full_name,initials) VALUES (?,?,'Synthetic Client','SC') ON DUPLICATE KEY UPDATE id=id",[clientId,agencyId]);
  await state.db.execute('INSERT INTO appointment_participants VALUES (?,?)',[id,clientId]);
  await state.db.execute("INSERT INTO clinical_sessions(id,appointment_id,agency_id,provider_user_id,client_id,metadata_json) VALUES (?,?,?,?,?,JSON_OBJECT('existing','retain'))",[id,id,agencyId,providerId,clientId]);
 }
 it('opens an appointment in the permanent office, admits invited and confirmed fallback clients to the same private media and workspace',async()=>{
  await booking();const host=await officeHostVideo(room,{appointmentId:20});await connect(host,'provider');
  const lobby=await officeLobby(room);expect(lobby.encounter.scheduled.appointmentId).toBe(20);expect(lobby.encounter.startedAt).toBeNull();
  const session={id:lobby.encounter.scheduled.id,agency_id:2,appointment_id:20};
  const client={user:{id:null},headers:{},counselingInvitationAccess:{clientId:10},ip:'192.0.2.5'};
  const invited=await joinCounselingVisit(client,session);expect((await officeLobby(room)).scheduledWaiting.map(v=>v.id)).toContain(invited.id);
  await admitCounselingVisit(session,invited.id,{user:{id:5},headers:{}});
  const token=await counselingClinicalToken(client,session.id,'client');expect(token.sessionId).toBe(host.sessionId);
  const guest=await joinOffice(room,{displayName:'Fallback'},'192.0.2.6');
  await expect(admitOfficeGuest(room,guest.id)).rejects.toMatchObject({status:409});
  await expect(admitOfficeGuest(room,guest.id,{clientId:999,confirmIdentity:true})).rejects.toMatchObject({status:409});
  await admitOfficeGuest(room,guest.id,{clientId:10,confirmIdentity:true});
  const fallback=await officeGuestVideo(room,guest.id,guest.credential);expect(fallback.sessionId).toBe(token.sessionId);
  const ctx=await officeWorkspaceContext(room,{id:guest.id,credential:guest.credential});expect(ctx).toMatchObject({kind:'counseling',sessionId:session.id,clientId:10});
  await appendWorkspace(ctx,{type:'chat',payload:{text:'Same scheduled record'}});
  expect((await readWorkspace({kind:'counseling',sessionId:session.id,agencyId:2,role:'client',actor:'client-10',visitId:invited.id})).artifacts).toHaveLength(1);
  expect((await officeHistory(room)).visits.map(v=>v.entryMethod).sort()).toEqual(['invitation','office_link']);
  await endOffice(room);await expect(officeGuestVideo(room,guest.id,guest.credential)).rejects.toMatchObject({status:403});
  await expect(counselingClinicalToken(client,session.id,'client')).rejects.toMatchObject({status:410});
 });
 it('assigns an empty connected office to the selected appointment without changing its public link or camera connection',async()=>{
  await booking();const host=await officeHostVideo(room);await connect(host,'provider');
  const scheduled=await officeHostVideo(room,{appointmentId:20});expect(scheduled.sessionId).toBe(host.sessionId);expect((await officeLobby(room)).encounter.providerReady).toBe(true);
  await booking(21,11);await expect(officeHostVideo(room,{appointmentId:21})).rejects.toMatchObject({status:409});
 });
 it('never assigns existing unscheduled client content to a different appointment',async()=>{
  await booking();const host=await officeHostVideo(room);await connect(host,'provider');const guest=await joinOffice(room,{});await admitOfficeGuest(room,guest.id);
  await expect(officeHostVideo(room,{appointmentId:20})).rejects.toMatchObject({status:409});
 });
 it('rejects other providers, agencies, canceled appointments and concurrent different-session opens',async()=>{
  await booking(20,10,3);await booking(21,11,2,9);await booking(22,12);await state.db.execute("UPDATE appointments SET status='canceled_by_client' WHERE id=22");
  for(const appointmentId of [20,21,22])await expect(officeHostVideo(room,{appointmentId})).rejects.toMatchObject({status:appointmentId===22?409:404});
  await booking(23,13);await booking(24,14);
  const results=await Promise.allSettled([officeHostVideo(room,{appointmentId:23}),officeHostVideo(room,{appointmentId:24})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 });
 it('merges confirmed client reconnects and overlapping devices across link types and projects evidence into the correct EHR record',async()=>{
  await booking();const host=await officeHostVideo(room,{appointmentId:20});await connect(host,'provider');const sessionId=(await officeLobby(room)).encounter.scheduled.id;
  const guest=await joinOffice(room,{});await admitOfficeGuest(room,guest.id,{clientId:10,confirmIdentity:true});const fallback=await officeGuestVideo(room,guest.id,guest.credential);
  const req={user:{id:null},headers:{},counselingInvitationAccess:{clientId:10}};const invited=await joinCounselingVisit(req,{id:sessionId,agency_id:2});await admitCounselingVisit({id:sessionId,agency_id:2},invited.id,req);const personal=await counselingClinicalToken(req,sessionId,'client');
  const base=Date.now()-120000;
  async function segment(credentials,id,start,end){const connection={id,createdAt:base+start*1000,data:credentials.token};await processClinicalCallback({sessionId:host.sessionId,event:'connectionCreated',timestamp:base+start*1000,connection});await processClinicalCallback({sessionId:host.sessionId,event:'connectionDestroyed',timestamp:base+end*1000,connection});}
  await segment(fallback,'first',0,20);await segment(personal,'overlap',10,30);await segment(fallback,'return',50,80);
  const attendance=await scheduledAttendance(sessionId);expect(attendance.participants).toHaveLength(1);expect(attendance.participants[0].durationSeconds).toBe(60);expect(attendance.participants[0].segments).toHaveLength(2);
  await syncOfficeAttendance();const [[ehr]]=await state.db.execute('SELECT metadata_json FROM clinical_sessions WHERE id=20');expect(ehr.metadata_json.existing).toBe('retain');expect(ehr.metadata_json.virtualAttendance).toMatchObject({clientId:10,connectedSeconds:60,appointmentId:20,entryMethods:expect.arrayContaining(['office_link','invitation'])});
 });
 it('re-admits a returning credential to the same visit but rejects it after provider end or a new generation',async()=>{
  const host=await officeHostVideo(room);await connect(host,'provider');const guest=await joinOffice(room,{});await admitOfficeGuest(room,guest.id);const started=(await officeLobby(room)).encounter.startedAt;
  await leaveOffice(room,guest.id,guest.credential);await resumeOfficeVisit(room,guest.id,guest.credential);await admitOfficeGuest(room,guest.id);expect((await officeLobby(room)).encounter.startedAt).toEqual(started);
  await endOffice(room);await expect(resumeOfficeVisit(room,guest.id,guest.credential)).rejects.toMatchObject({status:409});
 });

 it('lists only the owning provider and agency, keeps tutoring in its full view, and validates the day',async()=>{
  await booking();await booking(21,11,3,5);await booking(22,12,2,6);
  await state.db.execute("INSERT INTO learning_program_classes VALUES (1,2)");
  await state.db.execute("INSERT INTO learning_class_sessions VALUES (1,1,5,'virtual','Math practice','Full tutoring tools','scheduled',UTC_TIMESTAMP(),NULL)");
  const day={from:new Date(Date.now()-3600000).toISOString(),to:new Date(Date.now()+7200000).toISOString()};
  const {items}=await officeSchedule(room,day);expect(items.map(i=>i.appointmentId).filter(Boolean)).toEqual([20]);
  expect(items.find(i=>i.kind==='tutoring')).toMatchObject({type:'meeting',url:'/tutoring-session/1',canOpen:true});
  await expect(officeSchedule(room,{from:day.from,to:new Date(Date.now()+72*3600000).toISOString()})).rejects.toMatchObject({status:400});
 });
 it('keeps missing clinical records pending and never updates another provider record',async()=>{
  await booking();const host=await officeHostVideo(room,{appointmentId:20});await connect(host,'provider');const guest=await joinOffice(room,{});await admitOfficeGuest(room,guest.id,{clientId:10,confirmIdentity:true});await connect(await officeGuestVideo(room,guest.id,guest.credential),'client');
  await state.db.execute('UPDATE clinical_sessions SET provider_user_id=999 WHERE id=20');await syncOfficeAttendance();
  const [[record]]=await state.db.execute('SELECT metadata_json FROM clinical_sessions WHERE id=20');expect(record.metadata_json.virtualAttendance).toBeUndefined();
  const [[link]]=await state.db.execute('SELECT * FROM virtual_office_encounters');expect(link.synced_version).toBeLessThan(link.attendance_version);
 });

});
