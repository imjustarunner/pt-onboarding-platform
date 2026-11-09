import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { splitSqlStatements, stripSqlLineComments } from '../../../../database/migrationSqlUtils.js';
const m = vi.hoisted(() => ({ db: null, transport: { connect: vi.fn(), getCall: vi.fn(), hangup: vi.fn(), disconnect: vi.fn() }, createSession: vi.fn(), transcription: vi.fn(), claims: vi.fn() }));
vi.mock('../../config/database.js', () => ({ onTableWrite: () => () => {}, default: { execute: (...args) => m.db.execute(...args), getConnection: () => m.db.getConnection() } }));
vi.mock('../vonageVideo.service.js', () => ({ resolveVideoProjectId: () => 'test', default: { isVideoConfigured: () => true, createSession: m.createSession } }));
vi.mock('../meetingDialInTransport.service.js', async original => ({ ...await original(), dialInTransport: m.transport }));
vi.mock('../meetingDialInTranscription.service.js', () => ({ syncDialInTranscription: m.transcription }));
vi.mock('../meetingCompensationClaims.service.js', () => ({ syncCompensationClaimsForEvent: m.claims }));
import { personalDialIn, answerDialIn, enterDialInPin, chooseDialInHostOption, reconcileDialInCall, callWithInvitation, endDialInCall, dialInCallEvent, endMeetingDialIn, runMeetingDialInTick } from '../meetingDialIn.service.js';
import { createOrGetMeetingRoom } from '../video.service.js';
import { recomputeAttendanceRollupForUser } from '../supervisionAttendanceRollup.service.js';
import { computeSegmentSeconds } from '../meetingAttendanceSegments.service.js';
import { closeMeetingAsHost } from '../meetingEndPermission.service.js';
import {reserveSupervisionJoin,supervisionJoinOccupancy,reserveSupervisionCalendarGuest} from '../supervisionJoinCapacity.service.js';
import {dialInContext,admitDialInUser} from '../meetingDialInContext.service.js';
const socket = process.env.DIAL_IN_TEST_SOCKET;
const host = process.env.DIAL_IN_TEST_MYSQL_HOST;
const port = Number(process.env.DIAL_IN_TEST_MYSQL_PORT || 0);
const schema = `meeting_dial_in_test_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;
let admin;
const enabled = !!socket || !!host;
const toSql = date => new Date(date).toISOString().slice(0,23).replace('T',' ');
describe.skipIf(!enabled)('telephone meeting lifecycle with isolated MySQL', () => {
  let callStatus;
  beforeAll(async () => {
    if (socket && !/^\/private\/tmp\/meeting-dial-in-test\.[^/]+\/mysql\.sock$/.test(socket)) throw new Error('An isolated test socket is required.');
    if (!socket && (host!=='127.0.0.1' || ![33319,33316].includes(port))) throw new Error('Explicit loopback test host and isolated test port required.');
    if (!/^meeting_dial_in_test_\d+_[a-f0-9]{10}$/.test(schema)) throw new Error('Unsafe fixture schema');
    const connection = socket ? {socketPath:socket,user:'root'} : {host,port,user:process.env.DIAL_IN_TEST_MYSQL_USER || 'root',password:process.env.DIAL_IN_TEST_MYSQL_PASSWORD || ''};
    admin = await mysql.createConnection(connection);
    await admin.query(`CREATE DATABASE ${schema}`);
    m.db = mysql.createPool({...connection,database:schema,timezone:'Z',connectionLimit:12});
    const sql = await fs.readFile(new URL('../../../../database/migrations/1753_meeting_personal_dial_in.sql', import.meta.url), 'utf8');
    for (const statement of splitSqlStatements(stripSqlLineComments(sql))) await m.db.query(statement);
    const tables = [
      `CREATE TABLE users (id INT PRIMARY KEY,email VARCHAR(80),work_email VARCHAR(80),preferred_name VARCHAR(80),first_name VARCHAR(80),last_name VARCHAR(80),personal_phone VARCHAR(30),work_phone VARCHAR(30),phone_number VARCHAR(30),role VARCHAR(30),status VARCHAR(30),is_active BOOLEAN DEFAULT TRUE,is_archived BOOLEAN DEFAULT FALSE,is_demo BOOLEAN DEFAULT FALSE)`,
      `CREATE TABLE agencies (id INT PRIMARY KEY,is_active BOOLEAN,timezone VARCHAR(80))`,
      `CREATE TABLE user_agencies (user_id INT,agency_id INT,is_active BOOLEAN)`,
      `CREATE TABLE supervision_sessions (id INT PRIMARY KEY,agency_id INT,supervisor_user_id INT,co_facilitator_user_id INT,supervisee_user_id INT,start_at DATETIME(3),end_at DATETIME(3),event_timezone VARCHAR(80),status VARCHAR(32),modality VARCHAR(20),waiting_room_enabled BOOLEAN,twilio_room_sid VARCHAR(512),twilio_room_unique_name VARCHAR(80),live_ended_at DATETIME(3),live_ended_by_user_id INT,meeting_settings_json JSON,updated_at DATETIME)`,
      `CREATE TABLE supervision_session_attendees (id INT AUTO_INCREMENT PRIMARY KEY,session_id INT,user_id INT,status VARCHAR(24),UNIQUE KEY(session_id,user_id))`,
      `CREATE TABLE supervision_session_presenters (session_id INT,user_id INT)`,
      `CREATE TABLE supervision_session_join_presence (session_id INT,join_identity VARCHAR(100),display_name VARCHAR(100),is_guest BOOLEAN,joined_at DATETIME(3),last_seen_at DATETIME(3),left_at DATETIME(3),PRIMARY KEY(session_id,join_identity))`,
      `CREATE TABLE supervision_session_video_admissions (session_id INT,user_id INT,join_identity VARCHAR(100),admitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY(session_id,user_id))`,
      `CREATE TABLE meeting_calendar_guests (id BIGINT AUTO_INCREMENT PRIMARY KEY,meeting_type ENUM('supervision','team-meeting') NOT NULL,meeting_id INT NOT NULL,credential_hash CHAR(64) NOT NULL UNIQUE,display_name VARCHAR(120) NOT NULL,status ENUM('waiting','admitted','left') NOT NULL DEFAULT 'waiting',created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at DATETIME NOT NULL,INDEX calendar_guest_meeting(meeting_type,meeting_id,status))`,
      `CREATE TABLE supervision_session_attendance_events (id INT AUTO_INCREMENT PRIMARY KEY,session_id INT,user_id INT,event_type VARCHAR(20),event_at DATETIME(3),participant_session_key VARCHAR(80))`,
      `CREATE TABLE provider_schedule_events (id INT PRIMARY KEY,agency_id INT,provider_id INT,kind VARCHAR(30),meeting_subtype VARCHAR(30),start_at DATETIME(3),end_at DATETIME(3),event_timezone VARCHAR(80),status VARCHAR(32),waiting_room_enabled BOOLEAN,platform_video_link BOOLEAN DEFAULT TRUE,google_meet_link VARCHAR(255),title VARCHAR(80),attendance_tracking_enabled BOOLEAN DEFAULT TRUE,twilio_room_sid VARCHAR(512),twilio_room_unique_name VARCHAR(80),meeting_completed_at DATETIME(3),meeting_completed_by_user_id INT,meeting_settings_json JSON,updated_at DATETIME,updated_by_user_id INT)`,
      `CREATE TABLE provider_schedule_event_attendees (event_id INT,user_id INT)`,
      `CREATE TABLE meeting_participant_preferences (event_id INT,user_id INT,is_cohost BOOLEAN)`,
      `CREATE TABLE provider_schedule_event_join_presence (event_id INT,join_identity VARCHAR(100),display_name VARCHAR(100),is_guest BOOLEAN,joined_at DATETIME(3),last_seen_at DATETIME(3),left_at DATETIME(3),PRIMARY KEY(event_id,join_identity))`,
      `CREATE TABLE provider_schedule_event_video_admissions (event_id INT,user_id INT,join_identity VARCHAR(100),admitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY(event_id,user_id))`,
      `CREATE TABLE provider_schedule_event_attendance_segments (id INT AUTO_INCREMENT PRIMARY KEY,event_id INT,user_id INT,started_at DATETIME(3),ended_at DATETIME(3))`,
      `CREATE TABLE agency_meeting_attendance_rollups (event_id INT,user_id INT,total_seconds INT,participant_email VARCHAR(100),synced_at DATETIME,updated_at DATETIME,PRIMARY KEY(event_id,user_id))`,
      `CREATE TABLE supervision_session_attendance_rollups (session_id INT,user_id INT,first_joined_at DATETIME,last_left_at DATETIME,total_seconds INT,segment_count INT,is_finalized BOOLEAN,manual_correction_id INT,updated_at DATETIME,PRIMARY KEY(session_id,user_id))`
    ];
    for (const statement of tables) await m.db.query(statement);
    await m.db.query("INSERT INTO agencies VALUES (2,1,'America/Denver')");
    await m.db.query("INSERT INTO users(id,email,first_name,last_name,role,status) VALUES (7,'host@example.test','Host','Person','provider','ACTIVE'),(8,'peer@example.test','Invited','Person','provider','ACTIVE'),(9,'other@example.test','Other','Person','provider','ACTIVE')");
    await m.db.query('INSERT INTO user_agencies VALUES (7,2,1),(8,2,1),(9,2,1)');
    vi.stubEnv('MEETING_DIAL_IN_ENABLED', 'true'); vi.stubEnv('MEETING_DIAL_IN_NUMBER', '+12025550123');
    vi.stubEnv('MEETING_DIAL_IN_PUBLIC_ORIGIN', 'https://example.test'); vi.stubEnv('MEETING_DIAL_IN_PIN_SECRET', 'p'.repeat(32));
    vi.stubEnv('MEETING_DIAL_IN_VOICE_APPLICATION_ID','01234567-1234-4234-8234-012345678901'); vi.stubEnv('MEETING_DIAL_IN_VOICE_PRIVATE_KEY','synthetic-only');
    vi.stubEnv('VONAGE_API_KEY','test'); vi.stubEnv('VONAGE_API_SECRET','test');
    vi.stubEnv('VONAGE_VOICE_SIGNATURE_SECRET', 'synthetic'); vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 9).toString('base64'));
  });
  beforeEach(async () => {
    vi.stubEnv('MEETING_DIAL_IN_ENABLED', 'true');
    await m.db.query('UPDATE users SET personal_phone=NULL,work_phone=NULL,phone_number=NULL');
    await m.db.query('DELETE FROM meeting_calendar_guests');
    for (const table of ['meeting_dial_in_deliveries','meeting_dial_in_calls','meeting_dial_in_invitations','supervision_session_attendance_events','supervision_session_attendance_rollups','supervision_session_video_admissions','supervision_session_join_presence','supervision_session_attendees','supervision_sessions','provider_schedule_events','provider_schedule_event_attendees','meeting_participant_preferences','provider_schedule_event_join_presence','provider_schedule_event_video_admissions','provider_schedule_event_attendance_segments','agency_meeting_attendance_rollups']) await m.db.query(`DELETE FROM ${table}`);
    await m.db.query("INSERT INTO supervision_sessions(id,agency_id,supervisor_user_id,supervisee_user_id,start_at,end_at,status,modality,waiting_room_enabled,meeting_settings_json) VALUES (5,2,7,8,DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 50 MINUTE),'SCHEDULED','VIRTUAL',1,JSON_OBJECT('dialIn',true))");
    await m.db.query("INSERT INTO supervision_session_attendees(session_id,user_id,status) VALUES (5,7,'INVITED'),(5,8,'INVITED')");
    await m.db.query('UPDATE user_agencies SET is_active=1');
    callStatus = new Map();
    m.createSession.mockReset().mockImplementation(async () => `media-${crypto.randomUUID()}`);
    m.transport.getCall.mockReset().mockImplementation(async id => ({ status: callStatus.get(id) || 'answered' }));
    m.transport.hangup.mockReset().mockImplementation(async id => { callStatus.set(id, 'completed'); });
    m.transport.disconnect.mockReset().mockResolvedValue({});
    m.transcription.mockReset().mockResolvedValue({});
    m.transport.connect.mockReset().mockImplementation(async (call, context, secret) => {
      const bridgeId = crypto.randomUUID();
      const ncco = await answerDialIn({ uuid: bridgeId, 'SipHeader_X-Meeting-Call': call.id, 'SipHeader_X-Meeting-Bridge': secret });
      expect(ncco[0]).toMatchObject({ action: 'conversation', name: `meeting-phone-${call.id}`, startOnEnter: true });
      await dialInCallEvent({ uuid: bridgeId, status: 'answered', timestamp: new Date().toISOString() });
      return { connectionId: `connection-${call.id}`, streamId: `stream-${call.id}` };
    });
  });
  afterAll(async () => { vi.unstubAllEnvs(); if (m.db) await m.db.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${schema}`); await admin.end(); } });
  async function enter(userId, pin, type='supervision') {
    // Match real Vonage inbound Voice IDs rather than only outbound UUIDs.
    const id = crypto.randomBytes(16).toString('hex');
    await answerDialIn({ uuid: id, from: '12025550199', to: '12025550123' });
    const invitation = pin ? { pin } : await personalDialIn(type,5,userId);
    const ncco = await enterDialInPin({ uuid: id, dtmf: { digits: invitation.pin } });
    return { id, ncco, pin: invitation.pin };
  }
  it('requires the registered calling number with a short PIN and invalidates it after a phone change',async()=>{
    await m.db.query("UPDATE users SET personal_phone='+12025550199' WHERE id=8");
    const details=await personalDialIn('supervision',5,8);
    expect(details.pin).toMatch(/^\d{4}$/);
    const wrong=crypto.randomUUID();
    await answerDialIn({uuid:wrong,from:'12025550198',to:'12025550123'});
    expect((await enterDialInPin({uuid:wrong,dtmf:{digits:details.pin}}))[0].text).toContain('unavailable');
    expect((await enter(8,details.pin)).ncco[0].text).toContain('Welcome');
    await m.db.query("UPDATE users SET personal_phone='+12025550197' WHERE id=8");
    expect((await enter(8,details.pin)).ncco[0].text).toContain('unavailable');
    const replacement=await personalDialIn('supervision',5,8);
    expect(replacement.invitationId).not.toBe(details.invitationId);
  });
  it('keeps short invitation credentials stable under concurrent requests',async()=>{
    await m.db.query("UPDATE users SET personal_phone='+12025550199' WHERE id IN (7,8)");
    const details=await Promise.all(Array.from({length:8},()=>personalDialIn('supervision',5,8)));
    expect(new Set(details.map(d=>d.invitationId)).size).toBe(1);
    expect(new Set(details.map(d=>d.pin)).size).toBe(1);
    expect((await personalDialIn('supervision',5,7)).pin).not.toBe(details[0].pin);
  });
  it('retries a short PIN collision without giving two participants the same credential',async()=>{
    await m.db.query("UPDATE users SET personal_phone='+12025550199' WHERE id IN (7,8)");
    const random=vi.spyOn(crypto,'randomInt').mockReturnValue(1);
    try {
      const host=await personalDialIn('supervision',5,7);
      random.mockReset();
      for(let n=0;n<4;n++)random.mockReturnValueOnce(1);
      random.mockReturnValue(2);
      const peer=await personalDialIn('supervision',5,8);
      expect(host.pin).toBe('1111');expect(peer.pin).toBe('2222');
      expect(random).toHaveBeenCalledTimes(8);
    }finally{random.mockRestore();}
  });
  async function connectHost() {
    const host = await enter(7); await chooseDialInHostOption({ uuid: host.id, dtmf: { digits: '1' } }); await reconcileDialInCall(host.id); return host;
  }
  it('issues stable distinct encrypted PINs and rejects a nonparticipant', async () => {
    const [host, peer, again] = await Promise.all([personalDialIn('supervision',5,7),personalDialIn('supervision',5,8),personalDialIn('supervision',5,8)]);
    expect(host.pin).not.toBe(peer.pin); expect(peer.pin).toBe(again.pin);
    const [[stored]] = await m.db.execute('SELECT * FROM meeting_dial_in_invitations WHERE id=?',[peer.invitationId]);
    expect(stored.pin_hash).not.toContain(peer.pin); expect(stored.pin_encrypted).not.toContain(peer.pin);
    await expect(personalDialIn('supervision',5,9)).rejects.toMatchObject({status:403});
  });
  it('retries guarded schema installation without replacing private invitations or call records', async () => {
    const peer=await enter(8);
    const before=await callWithInvitation(peer.id);
    const sql=await fs.readFile(new URL('../../../../database/migrations/1753_meeting_personal_dial_in.sql',import.meta.url),'utf8');
    for(const statement of splitSqlStatements(stripSqlLineComments(sql)))await m.db.query(statement);
    expect(await callWithInvitation(peer.id)).toEqual(before);
    expect((await personalDialIn('supervision',5,8)).pin).toBe(peer.pin);
  });
  it('admits two phones into the same room and gives each a separate named stream', async () => {
    const peer = await enter(8); await reconcileDialInCall(peer.id); expect((await callWithInvitation(peer.id)).connected_at).toBeNull();
    const host = await connectHost(); await reconcileDialInCall(peer.id);
    const a = await callWithInvitation(host.id), b = await callWithInvitation(peer.id);
    expect(a.state).toBe('connected'); expect(b.state).toBe('connected');
    expect(a.video_session_id).toBe(b.video_session_id); expect(a.video_stream_id).not.toBe(b.video_stream_id);
    expect(m.createSession).toHaveBeenCalledTimes(1); expect(m.transcription).toHaveBeenCalledTimes(2);
    const [rollups] = await m.db.execute('SELECT user_id,is_finalized FROM supervision_session_attendance_rollups ORDER BY user_id');
    expect(rollups).toEqual([{user_id:7,is_finalized:0},{user_id:8,is_finalized:0}]);
  });
  it('preserves supervision capacity and counts a browser/phone identity once', async () => {
    await connectHost();
    await m.db.query("INSERT INTO supervision_session_join_presence VALUES (5,'user-7','Host',0,UTC_TIMESTAMP(),UTC_TIMESTAMP(),NULL)");
    const peer=await enter(8);await reconcileDialInCall(peer.id);
    expect((await callWithInvitation(peer.id)).state).toBe('connected');
    await m.db.query("INSERT INTO supervision_session_attendees(session_id,user_id,status) VALUES (5,9,'INVITED')");
    const third=await enter(9);await expect(reconcileDialInCall(third.id)).rejects.toThrow('full');
    expect((await callWithInvitation(third.id)).connected_at).toBeNull();
  });
  it('reserves the final supervision place for only one of two simultaneous telephone participants',async()=>{
    await connectHost();await m.db.query("INSERT INTO supervision_session_attendees(session_id,user_id,status) VALUES(5,9,'INVITED')");
    const [peer,other]=await Promise.all([enter(8),enter(9)]);
    const results=await Promise.allSettled([reconcileDialInCall(peer.id),reconcileDialInCall(other.id)]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(results.find(result=>result.status==='rejected').reason.message).toContain('full');
    const calls=await Promise.all([callWithInvitation(peer.id),callWithInvitation(other.id)]);
    expect(calls.filter(call=>call.connected_at)).toHaveLength(1);expect((await supervisionJoinOccupancy(5)).size).toBe(2);
  });
  it('shares the final place between a simultaneous browser reservation and telephone connection',async()=>{
    await connectHost();await m.db.query("INSERT INTO supervision_session_attendees(session_id,user_id,status) VALUES(5,9,'INVITED')");
    const other=await enter(9);
    const results=await Promise.allSettled([reserveSupervisionJoin({sessionId:5,userId:8,joinIdentity:'user-8'}),reconcileDialInCall(other.id)]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(results.find(result=>result.status==='rejected').reason.message).toContain('full');expect((await supervisionJoinOccupancy(5)).size).toBe(2);
  });
  async function calendarGuest(){
    const credentialHash=crypto.randomBytes(32).toString('hex');
    const [guest]=await m.db.execute("INSERT INTO meeting_calendar_guests(meeting_type,meeting_id,credential_hash,display_name,expires_at) VALUES('supervision',5,?,'External guest',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))",[credentialHash]);
    return {sessionId:5,guestId:guest.insertId,credentialHash};
  }
  it('shares the last place between an admitted calendar guest and a concurrent phone call',async()=>{
    await connectHost();const peer=await enter(8),guest=await calendarGuest();
    const results=await Promise.allSettled([reserveSupervisionCalendarGuest({...guest,hostUserId:7}),reconcileDialInCall(peer.id)]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(results.find(result=>result.status==='rejected').reason.message).toContain('full');
    expect((await supervisionJoinOccupancy(5)).size).toBe(2);
  });
  it('rejects expired, left, wrong-credential and cross-session calendar guests before reserving',async()=>{
    const guest=await calendarGuest();
    await expect(reserveSupervisionCalendarGuest({...guest,credentialHash:'a'.repeat(64)})).rejects.toMatchObject({status:403});
    await expect(reserveSupervisionCalendarGuest({...guest,hostUserId:8})).rejects.toMatchObject({status:403});
    await m.db.execute("UPDATE meeting_calendar_guests SET status='admitted',expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?",[guest.guestId]);
    await expect(reserveSupervisionCalendarGuest(guest)).rejects.toMatchObject({status:403});
    await m.db.execute("UPDATE meeting_calendar_guests SET expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),status='left' WHERE id=?",[guest.guestId]);
    await expect(reserveSupervisionCalendarGuest(guest)).rejects.toMatchObject({status:403});
    await m.db.execute("UPDATE meeting_calendar_guests SET status='admitted',meeting_id=6 WHERE id=?",[guest.guestId]);
    await expect(reserveSupervisionCalendarGuest(guest)).rejects.toMatchObject({status:403});
    expect((await supervisionJoinOccupancy(5)).size).toBe(0);
  });
  it('keeps each guest distinct and releases its shared reservation on leave',async()=>{
    await connectHost();const guest=await calendarGuest();
    await reserveSupervisionCalendarGuest({...guest,hostUserId:7});
    await expect(reserveSupervisionCalendarGuest(guest)).resolves.toMatchObject({alreadyPresent:true,activeCount:2});
    expect([...(await supervisionJoinOccupancy(5))]).toContain(`calendar-guest-${guest.guestId}`);
    await expect(reserveSupervisionJoin({sessionId:5,userId:8,joinIdentity:'user-8'})).rejects.toThrow('full');
    await reserveSupervisionCalendarGuest({...guest,leave:true});
    await expect(reserveSupervisionJoin({sessionId:5,userId:8,joinIdentity:'user-8'})).resolves.toMatchObject({activeCount:2});
  });
  it('counts connecting carrier reservations after presence expires and releases them on leave',async()=>{
    await connectHost();await m.db.query("INSERT INTO supervision_session_attendees(session_id,user_id,status) VALUES(5,9,'INVITED')");
    const peer=await enter(8);await reserveSupervisionJoin({sessionId:5,userId:8,joinIdentity:'dial-8'});
    await m.db.execute("UPDATE meeting_dial_in_calls SET state='connecting',bridge_started_at=UTC_TIMESTAMP(),last_verified_at=UTC_TIMESTAMP() WHERE id=?",[peer.id]);
    await m.db.query("UPDATE supervision_session_join_presence SET last_seen_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND) WHERE join_identity='dial-8'");
    await expect(reserveSupervisionJoin({sessionId:5,userId:9,joinIdentity:'user-9'})).rejects.toThrow('full');
    await endDialInCall(peer.id);await expect(reserveSupervisionJoin({sessionId:5,userId:9,joinIdentity:'user-9'})).resolves.toMatchObject({activeCount:2});
  });
  it('holds a carrier place through stale verification and failed disconnect until carrier cleanup succeeds',async()=>{
    await connectHost();const peer=await enter(8);await reconcileDialInCall(peer.id);
    await m.db.query("INSERT INTO supervision_session_attendees(session_id,user_id,status) VALUES(5,9,'INVITED')");
    await m.db.execute("UPDATE meeting_dial_in_calls SET last_verified_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),bridge_started_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE) WHERE id=?",[peer.id]);
    await m.db.query("UPDATE supervision_session_join_presence SET last_seen_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 MINUTE) WHERE join_identity='dial-8'");
    await expect(reserveSupervisionJoin({sessionId:5,userId:9,joinIdentity:'user-9'})).rejects.toThrow('full');
    m.transport.hangup.mockRejectedValue(new Error('Carrier temporarily unavailable'));
    await endDialInCall(peer.id);
    expect((await callWithInvitation(peer.id)).disconnected_at).toBeNull();
    await expect(reserveSupervisionJoin({sessionId:5,userId:9,joinIdentity:'user-9'})).rejects.toThrow('full');
    m.transport.hangup.mockResolvedValue({});await reconcileDialInCall(peer.id);
    await expect(reserveSupervisionJoin({sessionId:5,userId:9,joinIdentity:'user-9'})).resolves.toMatchObject({activeCount:2});
  });
  it('rejects stale browser host or presenter roles and returns a database-bound token deadline',async()=>{
    await m.db.query('UPDATE supervision_sessions SET co_facilitator_user_id=8 WHERE id=5');
    const reservation=await reserveSupervisionJoin({sessionId:5,userId:8,joinIdentity:'user-8',expectedRole:'supervisor'});
    const [[clock]]=await m.db.execute('SELECT UNIX_TIMESTAMP() AS epoch');
    expect(reservation.tokenExpiresAt).toBeGreaterThan(Number(clock.epoch)+35);expect(reservation.tokenExpiresAt).toBeLessThanOrEqual(Number(clock.epoch)+40);
    await m.db.query('UPDATE supervision_sessions SET co_facilitator_user_id=NULL WHERE id=5');
    await expect(reserveSupervisionJoin({sessionId:5,userId:8,joinIdentity:'user-8',expectedRole:'supervisor'})).rejects.toThrow('role changed');
    await m.db.query('INSERT INTO supervision_session_presenters VALUES(5,8)');
    await reserveSupervisionJoin({sessionId:5,userId:8,joinIdentity:'user-8',expectedRole:'presenter'});
    await m.db.query('DELETE FROM supervision_session_presenters WHERE session_id=5 AND user_id=8');
    await expect(reserveSupervisionJoin({sessionId:5,userId:8,joinIdentity:'user-8',expectedRole:'presenter'})).rejects.toThrow('role changed');
  });
  it('deduplicates a single account across browser and phone and expires an unused browser reservation',async()=>{
    await connectHost();const peer=await enter(8);await reconcileDialInCall(peer.id);
    await expect(reserveSupervisionJoin({sessionId:5,userId:8,joinIdentity:'user-8'})).resolves.toMatchObject({alreadyPresent:true,activeCount:2});
    await endDialInCall(peer.id);await m.db.query("UPDATE supervision_session_join_presence SET last_seen_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND) WHERE join_identity='user-8'");
    await m.db.query("INSERT INTO supervision_session_attendees(session_id,user_id,status) VALUES(5,9,'INVITED')");
    await expect(reserveSupervisionJoin({sessionId:5,userId:9,joinIdentity:'user-9'})).resolves.toMatchObject({activeCount:2});
  });
  it('uses current participant role when a co-facilitator changes during media room creation',async()=>{
    await m.db.query('UPDATE supervision_sessions SET co_facilitator_user_id=8 WHERE id=5');
    const peer=await enter(8);await chooseDialInHostOption({uuid:peer.id,dtmf:{digits:'2'}});
    m.createSession.mockImplementationOnce(async()=>{await m.db.query('UPDATE supervision_sessions SET co_facilitator_user_id=NULL WHERE id=5');return `media-${crypto.randomUUID()}`;});
    await reconcileDialInCall(peer.id);
    expect(m.transport.connect.mock.calls[0][1].isHost).toBe(false);
    expect((await callWithInvitation(peer.id)).state).toBe('connected');
  });
  it('does not self-admit a former phone host when its role changes between context and reservation',async()=>{
    await m.db.query('UPDATE supervision_sessions SET co_facilitator_user_id=8 WHERE id=5');
    const context=await dialInContext('supervision',5,8,{joining:true});
    expect(context.supervisionRole).toBe('supervisor');
    await m.db.query('UPDATE supervision_sessions SET co_facilitator_user_id=NULL WHERE id=5');
    await expect(admitDialInUser(context)).rejects.toThrow('role changed');
    const [admissions]=await m.db.execute('SELECT * FROM supervision_session_video_admissions WHERE session_id=5 AND user_id=8');
    expect(admissions).toHaveLength(0);
  });
  it('serializes simultaneous browser and phone room creation', async () => {
    const host = await enter(7); await chooseDialInHostOption({uuid:host.id,dtmf:{digits:'1'}});
    const [browser] = await Promise.all([createOrGetMeetingRoom('supervision',5,'supervision-5'), reconcileDialInCall(host.id)]);
    expect((await callWithInvitation(host.id)).video_session_id).toBe(browser.sid); expect(m.createSession).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate a person on two phones and survives repeated carrier callbacks', async () => {
    const first = await enter(8), second = await enter(8);
    expect(second.ncco[0].text).toContain('another telephone');
    expect((await enterDialInPin({uuid:first.id,dtmf:{digits:first.pin}}))[0].action).toBe('conversation');
    await endDialInCall(first.id);
    expect((await enterDialInPin({uuid:first.id,dtmf:{digits:first.pin}}))[0].action).toBe('talk');
    expect((await enter(8)).ncco.some(a=>a.action==='conversation')).toBe(true);
  });
  it('invalidates rescheduled PINs and disconnects a removed attendee', async () => {
    const old = await personalDialIn('supervision',5,8);
    await m.db.query('UPDATE supervision_sessions SET end_at=DATE_ADD(end_at,INTERVAL 1 MINUTE)');
    expect((await personalDialIn('supervision',5,8)).pin).not.toBe(old.pin);
    expect((await enter(8,old.pin)).ncco[0].text).toContain('unavailable');
    await connectHost(); const peer = await enter(8); await reconcileDialInCall(peer.id);
    await m.db.query("UPDATE supervision_session_attendees SET status='REMOVED' WHERE user_id=8");
    await reconcileDialInCall(peer.id); expect((await callWithInvitation(peer.id)).state).toBe('ended');
  });
  it('ends all telephone legs and invalidates every PIN when the host closes the meeting', async () => {
    const host = await connectHost(), peer = await enter(8); await reconcileDialInCall(peer.id);
    await closeMeetingAsHost('supervision',5,7);
    expect((await callWithInvitation(host.id)).state).toBe('ended'); expect((await callWithInvitation(peer.id)).state).toBe('ended');
    await expect(personalDialIn('supervision',5,8)).rejects.toMatchObject({status:410});
    expect(m.transport.hangup).toHaveBeenCalledTimes(4); expect(m.transport.disconnect).toHaveBeenCalledTimes(2);
  });
  it('disconnects a late SIP response after the host ends during connection', async () => {
    const host = await enter(7); await chooseDialInHostOption({uuid:host.id,dtmf:{digits:'1'}});
    const connect = m.transport.connect.getMockImplementation();
    m.transport.connect.mockImplementationOnce(async (...args) => {
      const result=await connect(...args);await closeMeetingAsHost('supervision',5,7);return result;
    });
    await expect(reconcileDialInCall(host.id)).rejects.toMatchObject({status:410});
    const closed=await callWithInvitation(host.id);
    expect(closed.state).toBe('ended');expect(m.transport.disconnect).toHaveBeenCalledWith(closed.video_session_id,closed.video_connection_id);
  });
  it('terminates a bridge that never answers even when carrier heartbeats keep arriving', async () => {
    const host = await enter(7); await chooseDialInHostOption({uuid:host.id,dtmf:{digits:'1'}});
    m.transport.connect.mockResolvedValueOnce({connectionId:'delayed',streamId:'delayed-stream'});
    await reconcileDialInCall(host.id);
    await m.db.execute('UPDATE meeting_dial_in_calls SET bridge_started_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 70 SECOND) WHERE id=?',[host.id]);
    await reconcileDialInCall(host.id);expect((await callWithInvitation(host.id)).state).toBe('ended');
  });
  it('retains failed hangups for retry and closes calls when the feature is disabled', async () => {
    const host = await connectHost(); m.transport.hangup.mockRejectedValueOnce(new Error('temporary carrier failure'));
    await endMeetingDialIn('supervision',5); expect((await callWithInvitation(host.id)).state).toBe('ending');
    await runMeetingDialInTick(); expect((await callWithInvitation(host.id)).state).toBe('ended');
    // A different occurrence has fresh credentials.
    await m.db.query('UPDATE supervision_sessions SET end_at=DATE_ADD(end_at,INTERVAL 1 MINUTE)');
    const next = await connectHost(); vi.stubEnv('MEETING_DIAL_IN_ENABLED','false'); await runMeetingDialInTick();
    expect((await callWithInvitation(next.id)).state).toBe('ended');
  });
  it.each([['TEAM_MEETING','admin'],['TEAM_MEETING','general'],['HUDDLE','huddle']])('tracks an invited phone participant in %s / %s and syncs only their claim', async(kind,subtype)=>{
    await m.db.execute("INSERT INTO provider_schedule_events(id,agency_id,provider_id,kind,meeting_subtype,start_at,end_at,status,waiting_room_enabled,meeting_settings_json) VALUES (5,2,7,?,?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 50 MINUTE),'ACTIVE',0,JSON_OBJECT('dialIn',true))",[kind,subtype]);
    await m.db.query('INSERT INTO provider_schedule_event_attendees VALUES (5,8)');
    const peer=await enter(8,null,'team-meeting');await reconcileDialInCall(peer.id);
    const connected=await callWithInvitation(peer.id);expect(connected.state).toBe('connected');
    const start=Date.now()-120000;
    await m.db.execute('UPDATE meeting_dial_in_calls SET connected_at=?,last_verified_at=UTC_TIMESTAMP(3) WHERE id=?',[toSql(start),peer.id]);
    await m.db.execute('INSERT INTO provider_schedule_event_attendance_segments(event_id,user_id,started_at,ended_at) VALUES (5,8,?,?)',[toSql(start+30000),toSql(start+60000)]);
    await endDialInCall(peer.id);
    const [rollups]=await m.db.query('SELECT user_id,total_seconds FROM agency_meeting_attendance_rollups');
    expect(rollups).toHaveLength(1);expect(rollups[0].user_id).toBe(8);expect(rollups[0].total_seconds).toBeGreaterThanOrEqual(120);expect(rollups[0].total_seconds).toBeLessThan(123);
    expect(m.claims).toHaveBeenCalledWith(expect.objectContaining({eventId:5,allowScheduledFallback:false}));
    await closeMeetingAsHost('team-meeting',5,7);
    await expect(personalDialIn('team-meeting',5,8)).rejects.toMatchObject({status:410});
  });
  it('unions browser and telephone time, preserves reconnect gaps and manual compensation corrections', async () => {
    const host = await connectHost(); const start = Date.now()-9*60000;
    await m.db.execute("UPDATE meeting_dial_in_calls SET connected_at=?,ended_at=?,state='ended' WHERE id=?",[toSql(start+60000),toSql(start+4*60000),host.id]);
    await m.db.execute("INSERT INTO supervision_session_attendance_events(session_id,user_id,event_type,event_at) VALUES (5,7,'joined',?),(5,7,'left',?),(5,7,'joined',?),(5,7,'left',?)",[toSql(start),toSql(start+2*60000),toSql(start+5*60000),toSql(start+6*60000)]);
    expect((await recomputeAttendanceRollupForUser({sessionId:5,userId:7,sessionStartAt:toSql(start)})).totalSeconds).toBe(300);
    await m.db.query('UPDATE supervision_session_attendance_rollups SET manual_correction_id=99,total_seconds=420');
    await recomputeAttendanceRollupForUser({sessionId:5,userId:7,sessionStartAt:toSql(start)});
    expect((await m.db.query('SELECT total_seconds FROM supervision_session_attendance_rollups'))[0][0].total_seconds).toBe(420);
    expect(computeSegmentSeconds([{started_at:toSql(start),ended_at:toSql(start+2*60000)},{started_at:toSql(start+60000),ended_at:toSql(start+4*60000),source:'dial_in'}],{start_at:toSql(start)})).toBe(240);
  });
});
