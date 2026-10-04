import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import {splitSqlStatements,stripSqlLineComments} from '../../../../database/migrationSqlUtils.js';
const state=vi.hoisted(()=>({db:null,serial:0,disconnect:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args),getConnection:()=>state.db.getConnection()}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:async()=>true}));
vi.mock('../meetingAccessPlan.service.js',()=>({getMeetingPlan:async()=>({privateOffice:true,multipleOfficeGuests:true})}));
vi.mock('../vonageVideo.service.js',()=>({resolveVideoProjectId:()=> 'project',default:{isVideoConfigured:()=>true,createSession:async()=>`media-${++state.serial}`,generateToken:(_id,options)=>options.data,disconnectClient:state.disconnect}}));
import {officeHostVideo,joinOffice,admitOfficeGuest,officeGuestVideo,officeWorkspaceContext,leaveOffice,endOffice} from '../privateVirtualOffice.service.js';
import {appendWorkspace,readWorkspace} from '../therapyWorkspace.service.js';
import {processClinicalCallback,finishClinicalEnd} from '../clinicalVideo.service.js';
import {runClinicalSessionMaintenance} from '../clinicalSessionRetention.service.js';
import {counselingClinicalToken,endClinicalCounseling} from '../counselingClinicalVideo.service.js';
import {joinCounselingVisit,admitCounselingVisit} from '../counselingSessionVisit.service.js';
const socket=process.env.CLINICAL_TEST_SOCKET;
describe.skipIf(!socket)('isolated clinical encounter database',()=>{
 const room={id:1,userId:5,agencyId:2,isActive:true};
 async function connect(credentials,id){await processClinicalCallback({event:'connectionCreated',sessionId:credentials.sessionId,projectId:'project',timestamp:Date.now(),connection:{id,createdAt:Date.now(),data:credentials.token}});}
 async function confirmEmpty(mediaId){await processClinicalCallback({sessionId:mediaId,event:'sessionDestroyed',timestamp:Date.now()});}
 async function expireTokens(){await state.db.execute('UPDATE clinical_video_grants SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND)');}
 beforeAll(async()=>{
  if(!/^\/private\/tmp\/clinical-encounter-test\.[^/]+\/mysql\.sock$/.test(socket))throw new Error('Use a disposable clinical test database socket.');
  const admin=await mysql.createConnection({socketPath:socket,user:'root'});await admin.query('CREATE DATABASE clinical_encounter_test');await admin.end();
  state.db=mysql.createPool({socketPath:socket,user:'root',database:'clinical_encounter_test',timezone:'Z',connectionLimit:6});
  await state.db.query('CREATE TABLE users (id INT PRIMARY KEY,role VARCHAR(30))');await state.db.query("INSERT INTO users VALUES (5,'provider')");
  await state.db.query('CREATE TABLE provider_my_rooms (id INT PRIMARY KEY,user_id INT,agency_id INT,UNIQUE KEY uq_provider_my_rooms_user(user_id))');
  await state.db.query('CREATE TABLE counseling_sessions (id INT PRIMARY KEY,agency_id INT,provider_user_id INT,client_user_id INT,status VARCHAR(20),vonage_session_id VARCHAR(512),vonage_application_id VARCHAR(100),started_at DATETIME,ended_at DATETIME)');
  for(const name of ['1456_security_evidence.sql','1522_private_virtual_offices.sql','1530_tenant_office_session_workspace.sql','1531_clinical_encounter_security.sql']){
   const sql=await fs.readFile(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8');
   for(const statement of splitSqlStatements(stripSqlLineComments(sql)))await state.db.query(statement);
  }
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,9).toString('base64'));
  vi.stubEnv('VONAGE_VIDEO_CALLBACK_SECRET','synthetic');vi.stubEnv('VONAGE_APPLICATION_ID','project');
 });
 beforeEach(async()=>{
  vi.spyOn(console,'info').mockImplementation(()=>{});state.disconnect.mockReset().mockResolvedValue(true);
  for(const table of ['clinical_video_connections','clinical_video_grants','therapy_session_artifacts','clinical_video_sessions','private_virtual_office_visits','private_virtual_office_sessions','clinical_session_retention','counseling_session_visits','counseling_sessions'])await state.db.query(`DELETE FROM ${table}`);
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
});
