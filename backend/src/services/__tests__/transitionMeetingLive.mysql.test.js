import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const m=vi.hoisted(()=>({pool:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...a)=>m.pool.execute(...a),getConnection:()=>m.pool.getConnection()}}));
vi.mock('../transitionWorkspace.service.js',()=>({transitionWorkspaceData:async()=>({people:[]})}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async({user})=>({email:user.work_email||user.email})}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:vi.fn()}));
import {createEvent,upsertClaim,transitionClaimRate,recordTransitionInboxSetup,verifiedTransitionDeliveryReceipt} from '../transitionMeetingSequenceLive.service.js';
const port=Number(process.env.TRANSITION_SEQUENCE_TEST_MYSQL_PORT);
describe.skipIf(!port)('native MySQL transition runtime',()=>{
 let admin,name,oldKey;
 const plan={hostIds:[91,92,93]};
 beforeAll(async()=>{
  if(!Number.isSafeInteger(port)||port<1024)throw Error('Use a disposable loopback port.');
  oldKey=process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=randomBytes(32).toString('base64');
  admin=await mysql.createConnection({host:'127.0.0.1',port,user:'root',multipleStatements:true});name=`transition_live_${process.pid}`;await admin.query(`CREATE DATABASE \`${name}\``);m.pool=mysql.createPool({host:'127.0.0.1',port,user:'root',database:name,multipleStatements:true});
  await m.pool.query(await fs.readFile(new URL('../../../../database/migrations/1881_transition_meeting_sequence.sql',import.meta.url),'utf8'));
  await m.pool.query(`CREATE TABLE provider_schedule_events(id INT PRIMARY KEY AUTO_INCREMENT,agency_id INT,provider_id INT,kind VARCHAR(30),meeting_subtype VARCHAR(30),title VARCHAR(200),description TEXT,start_at DATETIME,end_at DATETIME,event_timezone VARCHAR(60),status VARCHAR(20),all_day TINYINT,is_private TINYINT,platform_video_link TINYINT,join_token VARCHAR(40),participant_join_token VARCHAR(40),host_join_token VARCHAR(40),waiting_room_enabled TINYINT,notify_participants TINYINT,attendance_tracking_enabled TINYINT,meeting_settings_json JSON,created_by_user_id INT NULL,updated_by_user_id INT NULL);
   ALTER TABLE provider_schedule_events ADD COLUMN location_text VARCHAR(500) NULL;
   CREATE TABLE scheduled_trainings(event_id INT,series_key VARCHAR(100),topic TEXT,agency_visible TINYINT,video_default_on TINYINT,video_allowed TINYINT,mute_all TINYINT);
   CREATE TABLE provider_schedule_event_attendees(event_id INT,user_id INT,UNIQUE KEY(event_id,user_id));
   CREATE TABLE meeting_participant_preferences(event_id INT,user_id INT,is_required TINYINT,is_cohost TINYINT,UNIQUE KEY(event_id,user_id));
   CREATE TABLE payroll_time_claims(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,user_id INT,submitted_by_user_id INT NULL,status VARCHAR(30),claim_type VARCHAR(40),claim_date DATE,payload_json JSON);`);
 });
 afterAll(async()=>{if(m.pool)await m.pool.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);await admin.end();}if(oldKey===undefined)delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=oldKey;});
 it('creates independent meetings once, with host access but no blanket provider invitations or human agent attribution',async()=>{
  const c=await m.pool.getConnection();try{await c.beginTransaction();const s={number:1,startAt:'2026-11-25T18:00:00Z',endAt:'2026-11-25T19:30:00Z',modality:'video'};const id=await createEvent(c,plan,s);expect(await createEvent(c,plan,s)).toBe(id);await c.commit();
   const [[event]]=await m.pool.execute('SELECT * FROM provider_schedule_events WHERE id=?',[id]);expect(event).toMatchObject({agency_id:2,provider_id:93,notify_participants:0,attendance_tracking_enabled:1,created_by_user_id:null,updated_by_user_id:null});expect(event.meeting_settings_json.compensation).toBe(false);
   const [participants]=await m.pool.execute('SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=?',[id]);expect(participants.map(p=>p.user_id).sort()).toEqual([91,92]);
  }catch(e){await c.rollback();throw e;}finally{c.release();}
 });
 it('creates submitted actual-time claims with a null human submitter and a verified $18 claim mapping',async()=>{
  const receipt=await upsertClaim(plan,{meeting:1,userId:1,seconds:1800});expect(receipt.status).toBe('submitted');expect(await upsertClaim(plan,{meeting:1,userId:1,seconds:1800})).toEqual(receipt);
  const [[claim]]=await m.pool.execute('SELECT * FROM payroll_time_claims WHERE user_id=1');expect(claim.submitted_by_user_id).toBeNull();expect(claim.status).toBe('submitted');expect(claim.payload_json.totalMinutes).toBe(30);expect(claim.payload_json.automation.actorType).toBe('automation');expect(await transitionClaimRate(claim)).toBe(18);
  expect(await transitionClaimRate({...claim,user_id:999})).toBeNull();
 });
 it('puts the conditional Sunday fallback at Windchime without a video link',async()=>{
  const c=await m.pool.getConnection();try{await c.beginTransaction();const id=await createEvent(c,plan,{number:5,startAt:'2026-11-29T15:00:00Z',endAt:'2026-11-29T16:30:00Z',modality:'in_person',location:'Windchime office'});await c.commit();const [[e]]=await m.pool.execute('SELECT platform_video_link,location_text FROM provider_schedule_events WHERE id=?',[id]);expect(e).toEqual({platform_video_link:0,location_text:'Windchime office'});}finally{c.release();}
 });
 it('preserves unrelated/approved claims and excludes all hosts from participant claims',async()=>{
  for(const userId of [91,92,93])await expect(upsertClaim(plan,{meeting:1,userId,seconds:900})).rejects.toThrow('Hosts');
  await m.pool.execute(`INSERT INTO payroll_time_claims(agency_id,user_id,status,claim_type,payload_json) VALUES(2,2,'approved','meeting_training',?)`,[JSON.stringify({scheduleEventId:1})]);
  await expect(upsertClaim(plan,{meeting:1,userId:2,seconds:600})).rejects.toThrow('reconciliation');const [[n]]=await m.pool.execute('SELECT COUNT(*) n FROM payroll_time_claims WHERE user_id=2');expect(n.n).toBe(1);
 });
 it('encrypts setup evidence and appends automation-attributed snapshots without inventing a human actor',async()=>{
  await expect(recordTransitionInboxSetup({address:'transitions@auricwell.com',roundTripVerified:true,senderIdentityId:8})).rejects.toThrow('Owner-verified');
  await recordTransitionInboxSetup({address:'transitions@auricwell.com',roundTripVerified:true,groupSettingsVerifiedByOwner:true,senderIdentityId:8});await recordTransitionInboxSetup({address:'transitions@auricwell.com',roundTripVerified:true,groupSettingsVerifiedByOwner:true,senderIdentityId:8});
  const [[r]]=await m.pool.execute('SELECT payload_json,automation_subject,revision FROM transition_meeting_sequences');expect(JSON.stringify(r.payload_json)).not.toContain('roundTripVerified');expect(r.revision).toBe(1);const [[audit]]=await m.pool.execute('SELECT actor_type,actor_user_id FROM transition_meeting_sequence_audit');expect(audit).toEqual({actor_type:'automation',actor_user_id:null});
 });
 it('persists the actually delivered RFC thread identity and never treats held, redirected or uncertain sends as delivery',()=>{
  const action={internetMessageId:'<requested@example.test>'};expect(verifiedTransitionDeliveryReceipt({id:'receipt',internetMessageId:'<actual@example.test>'},action)).toEqual({status:'sent',reference:'email:receipt'});expect(action.internetMessageId).toBe('<actual@example.test>');
  for(const result of [{},{id:'r',pendingApproval:true},{id:'r',redirected:true},{id:'r',queued:true},{id:'r',blocked:true},{id:'r',skipped:true}])expect(()=>verifiedTransitionDeliveryReceipt(result,action)).toThrow('unconfirmed');
 });
});
