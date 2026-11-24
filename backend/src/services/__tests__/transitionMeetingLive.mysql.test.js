import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const m=vi.hoisted(()=>({pool:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...a)=>m.pool.execute(...a),getConnection:()=>m.pool.getConnection()}}));
vi.mock('../transitionWorkspace.service.js',async original=>({...await original(),transitionWorkspaceData:async()=>({people:[],staff:[]})}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async({user})=>({email:user.work_email||user.email})}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:vi.fn()}));
import {createEvent,upsertClaim,transitionClaimRate,recordTransitionInboxSetup,verifiedTransitionDeliveryReceipt,hasVerifiedTransitionSmtpSender} from '../transitionMeetingSequenceLive.service.js';
import {encryptChatText} from '../chatEncryption.service.js';
import {transitionGuestTrainingEventIds,transitionTrainingGuestHomeAgency} from '../transitionMeetingGuestAccess.service.js';
import {hasActiveMeetingMembership,canJoinTeamMeeting} from '../meetingJoinPolicy.service.js';
import {trainingAccess} from '../scheduledTraining.service.js';
import {saveTrainingRsvp} from '../scheduledTrainingRsvp.service.js';
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
   ALTER TABLE provider_schedule_events ADD COLUMN location_text VARCHAR(500) NULL, ADD COLUMN meeting_completed_at DATETIME NULL;
   CREATE TABLE scheduled_trainings(event_id INT,series_key VARCHAR(100),topic TEXT,agency_visible TINYINT,video_default_on TINYINT,video_allowed TINYINT,mute_all TINYINT);
   CREATE TABLE provider_schedule_event_attendees(event_id INT,user_id INT,UNIQUE KEY(event_id,user_id));
   CREATE TABLE meeting_participant_preferences(event_id INT,user_id INT,is_required TINYINT,is_cohost TINYINT,rsvp VARCHAR(20),rsvp_at DATETIME,rsvp_decline_reason TEXT,UNIQUE KEY(event_id,user_id));
   CREATE TABLE payroll_time_claims(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,user_id INT,submitted_by_user_id INT NULL,status VARCHAR(30),claim_type VARCHAR(40),claim_date DATE,payload_json JSON);
   CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(100),last_name VARCHAR(100),preferred_name VARCHAR(100),role VARCHAR(40),status VARCHAR(40),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0,is_demo TINYINT DEFAULT 0,has_provider_access TINYINT DEFAULT 0);
   CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active TINYINT DEFAULT 1,agency_role VARCHAR(40));
   CREATE TABLE agencies(id INT PRIMARY KEY,is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0);
   INSERT INTO agencies(id) VALUES(2),(6);
   INSERT INTO users(id,first_name,last_name,role,status) VALUES(4,'Kimi','Synthetic','provider','ACTIVE_EMPLOYEE'),(8,'Family','Synthetic','client_guardian','ACTIVE_EMPLOYEE');
   INSERT INTO user_agencies(user_id,agency_id) VALUES(4,6),(8,6);`);
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
  await recordTransitionInboxSetup({address:'transitions@auricwell.com',verifiedFrom:'transitions@auricwell.com',transport:'workspace_smtp_relay',automationSubject:'auricwell-transition-sequence@ptonboard-dev.iam.gserviceaccount.com',roundTripVerified:true,visibleFromVerified:true,groupSettingsVerifiedByOwner:true,groupMembershipVerifiedByOperator:true,senderIdentityId:8,verificationCommunicationId:17,relayReceipt:'relay-synthetic',verifiedAt:'2026-11-24T18:00:00Z'});await recordTransitionInboxSetup({address:'transitions@auricwell.com',verifiedFrom:'transitions@auricwell.com',transport:'workspace_smtp_relay',automationSubject:'auricwell-transition-sequence@ptonboard-dev.iam.gserviceaccount.com',roundTripVerified:true,visibleFromVerified:true,groupSettingsVerifiedByOwner:true,groupMembershipVerifiedByOperator:true,senderIdentityId:8,verificationCommunicationId:17,relayReceipt:'relay-synthetic',verifiedAt:'2026-11-24T18:00:00Z'});
  expect(await hasVerifiedTransitionSmtpSender(8,m.pool)).toBe(true);expect(await hasVerifiedTransitionSmtpSender(9,m.pool)).toBe(false);
  const [[r]]=await m.pool.execute('SELECT payload_json,automation_subject,revision FROM transition_meeting_sequences');expect(JSON.stringify(r.payload_json)).not.toContain('roundTripVerified');expect(r.revision).toBe(1);const [[audit]]=await m.pool.execute('SELECT actor_type,actor_user_id FROM transition_meeting_sequence_audit');expect(audit).toEqual({actor_type:'automation',actor_user_id:null});
 });
 it('persists the actually delivered RFC thread identity and never treats held, redirected or uncertain sends as delivery',()=>{
  const action={internetMessageId:'<requested@example.test>'};expect(verifiedTransitionDeliveryReceipt({id:'receipt',internetMessageId:'<actual@example.test>'},action)).toEqual({status:'sent',reference:'email:receipt'});expect(action.internetMessageId).toBe('<actual@example.test>');
  for(const result of [{},{id:'r',pendingApproval:true},{id:'r',redirected:true},{id:'r',queued:true},{id:'r',blocked:true},{id:'r',skipped:true}])expect(()=>verifiedTransitionDeliveryReceipt(result,action)).toThrow('unconfirmed');
 });
 it('grants the named NLU participant only her issued training, with RSVP and no host or ITSCO membership grant',async()=>{
  const data={plan:{id:'itsco-auricwell-2026-11-30-v2',agencyId:2,fingerprint:'synthetic',providers:[{userId:4,explicitAddition:true,payrollAgencyId:6}]},state:{planFingerprint:'synthetic',issued:{'4:1':{userId:4,meeting:1}}}};
  await m.pool.execute("UPDATE transition_meeting_sequences SET status='active',payload_json=?",[JSON.stringify(encryptChatText(JSON.stringify(data)))]);
  await m.pool.execute('INSERT INTO provider_schedule_event_attendees(event_id,user_id) VALUES(1,4),(1,8)');
  await m.pool.execute('INSERT INTO meeting_participant_preferences(event_id,user_id,is_required,is_cohost) VALUES(1,4,1,0)');
  const [[event]]=await m.pool.execute('SELECT * FROM provider_schedule_events WHERE id=1');
  expect(await hasActiveMeetingMembership(2,4)).toBe(false);expect(await hasActiveMeetingMembership(6,4)).toBe(true);
  expect(await transitionGuestTrainingEventIds(4,6,m.pool)).toEqual([1]);expect(await canJoinTeamMeeting(event,4)).toBe(true);
  expect(await transitionTrainingGuestHomeAgency(4,m.pool)).toBe(6);expect(await transitionTrainingGuestHomeAgency(8,m.pool)).toBeNull();
  expect(await canJoinTeamMeeting({...event,id:999},4)).toBe(false);expect(await canJoinTeamMeeting(event,8)).toBe(false);
  expect((await trainingAccess(1,{id:4,role:'provider'})).proctor).toBe(false);await expect(trainingAccess(1,{id:4,role:'provider'},{edit:true})).rejects.toHaveProperty('status',403);
  expect(await saveTrainingRsvp(event,4,'declined')).toMatchObject({ok:true,response:'declined'});
  await m.pool.execute("UPDATE users SET role='client_guardian' WHERE id=4");expect(await canJoinTeamMeeting(event,4)).toBe(false);await m.pool.execute("UPDATE users SET role='provider' WHERE id=4");
  await m.pool.execute('DELETE FROM provider_schedule_event_attendees WHERE event_id=1 AND user_id=4');expect(await canJoinTeamMeeting(event,4)).toBe(false);
  const [[count]]=await m.pool.execute('SELECT COUNT(*) n FROM user_agencies WHERE user_id=4 AND agency_id=2');expect(count.n).toBe(0);
 });
 it('submits the named guest’s exact attendance to NLU payroll and protects its rate by the actual claim agency',async()=>{
  const guestPlan={...plan,providers:[{userId:4,explicitAddition:true,payrollAgencyId:6}]};
  await upsertClaim(guestPlan,{meeting:1,userId:4,agencyId:6,seconds:1200});const [[claim]]=await m.pool.execute('SELECT * FROM payroll_time_claims WHERE user_id=4');
  expect(claim).toMatchObject({agency_id:6,submitted_by_user_id:null,status:'submitted'});expect(claim.payload_json.totalMinutes).toBe(20);
  expect(await transitionClaimRate(claim)).toBe(18);expect(await transitionClaimRate({...claim,agency_id:2})).toBeNull();
  await expect(upsertClaim(guestPlan,{meeting:1,userId:4,agencyId:2,seconds:1200})).rejects.toThrow('payroll practice');
  await expect(upsertClaim({...plan,providers:[{userId:2,explicitAddition:true,payrollAgencyId:6}]},{meeting:1,userId:2,agencyId:6,seconds:600})).rejects.toThrow('reconciliation');
 });
});
