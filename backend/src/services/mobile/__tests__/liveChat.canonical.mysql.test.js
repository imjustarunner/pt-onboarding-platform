import {beforeAll,afterAll,beforeEach,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
const sql=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../../config/database.js',()=>({default:{execute:sql.execute},onTableWrite:vi.fn()}));
import {createMobileLiveChat} from '../liveChat.service.js';
import {createWebsiteChatNotifications} from '../../websiteChatNotifications.service.js';
import {createWebsiteChatService} from '../../publicWebsiteChat.service.js';
// Intentionally use the real canonical presence controller and website-chat service.
// Their reads/writes target only a disposable local fixture database.
describe.runIf(process.env.MOBILE_MYSQL_TEST==='1')('mobile Live Chat canonical presence integration',()=>{
 let db,admin,run,canonicalChat;const database=`auricwell_livechat_test_${process.pid}`,user={id:7,role:'provider'},agency={id:450,name:'Synthetic support agency'};
 const site={slug:'synthetic',name:'Synthetic website',support_agency_id:450,chat_enabled:1,coming_soon:0};
 const request=operation=>({mobileLiveChatOperation:operation,quickView:{mobileDeviceSessionId:4,userId:7,agencyId:450},user,headers:{},sessionSecurity:{key:'verified-mobile-proof-without-browser-state'},query:{},params:{},body:{}});
 const response=()=>({set:vi.fn(),status:vi.fn(function(value){this.statusCode=value;return this;}),json:vi.fn()});
 beforeAll(async()=>{
  const options=process.env.MOBILE_MYSQL_SOCKET?{socketPath:process.env.MOBILE_MYSQL_SOCKET}:{host:'127.0.0.1',port:Number(process.env.MOBILE_MYSQL_PORT||3408)};
  admin=await mysql.createConnection({...options,user:'root',password:process.env.MOBILE_MYSQL_PASSWORD||'',multipleStatements:true});await admin.query(`CREATE DATABASE ${database}`);db=mysql.createPool({...options,user:'root',password:process.env.MOBILE_MYSQL_PASSWORD||'',database,multipleStatements:true});
  await db.query(`CREATE TABLE users(id INT PRIMARY KEY,role VARCHAR(40),is_active BOOLEAN DEFAULT 1,is_archived BOOLEAN DEFAULT 0,is_assistant_account BOOLEAN DEFAULT 0,is_demo BOOLEAN DEFAULT 0,status VARCHAR(40));
   CREATE TABLE user_agencies(user_id INT,agency_id INT,role VARCHAR(40));
   CREATE TABLE mobile_device_sessions(id BIGINT PRIMARY KEY,user_id INT,revoked_at DATETIME,push_enabled BOOLEAN,push_token VARCHAR(255),web_push_subscription JSON,primary_authentication_json JSON,enrolled_at DATETIME);
   CREATE TABLE user_presence_status(user_id INT PRIMARY KEY,status VARCHAR(40));
   CREATE TABLE user_presence(user_id INT PRIMARY KEY,agency_id INT,last_heartbeat_at DATETIME,last_activity_at DATETIME,availability_level VARCHAR(40),session_phase VARCHAR(40));
   CREATE TABLE public_website_support_sites(slug VARCHAR(80),name VARCHAR(80),support_agency_id INT,chat_enabled BOOLEAN,coming_soon BOOLEAN,accent_color VARCHAR(10),logo_url VARCHAR(255));
   CREATE TABLE public_website_chat_sessions(id CHAR(36),site_slug VARCHAR(80),created_at DATETIME,last_seen_at DATETIME,page_path VARCHAR(255),state VARCHAR(20),claimed_by INT,expires_at DATETIME,visitor_ended_at DATETIME,visitor_left_at DATETIME,initiated_at DATETIME,visitor_typing_at DATETIME);
   CREATE TABLE public_website_chat_messages(id INT,session_id CHAR(36),sender VARCHAR(40));
   CREATE TABLE public_website_chat_staff(user_id INT PRIMARY KEY,last_seen_at DATETIME,mobile_device_session_id BIGINT);
   CREATE TABLE public_website_chat_staff_dismissals(user_id INT,session_id CHAR(36),last_message_id INT);
   CREATE TABLE public_website_chat_notification_events(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,agency_id INT,session_id CHAR(36),event_key VARCHAR(64),locked_until DATETIME,attempts INT DEFAULT 0,completed_at DATETIME,last_error VARCHAR(80),notification_id INT,UNIQUE KEY uq_event(user_id,session_id,event_key));
   CREATE TABLE notifications(id INT,user_id INT,type VARCHAR(80),audience_json JSON);
   CREATE TABLE mobile_push_deliveries(device_session_id BIGINT,source_kind VARCHAR(30),source_id INT,target_id INT,UNIQUE KEY uq_delivery(device_session_id,source_kind,source_id));
   CREATE TABLE public_website_chat_participants(user_id INT,viewing_at DATETIME,typing_at DATETIME);`);
 });
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP DATABASE ${database}`);await admin.end();}});
 beforeEach(async()=>{
  await db.query(`TRUNCATE public_website_chat_notification_events;TRUNCATE notifications;TRUNCATE mobile_push_deliveries;TRUNCATE public_website_chat_sessions;TRUNCATE mobile_device_sessions;TRUNCATE user_presence_status;TRUNCATE users;TRUNCATE user_agencies;TRUNCATE user_presence;TRUNCATE public_website_support_sites;TRUNCATE public_website_chat_staff;
   INSERT INTO mobile_device_sessions(id,user_id,push_enabled,push_token,enrolled_at) VALUES(4,7,1,'synthetic-push-token',UTC_TIMESTAMP());INSERT INTO users(id,role,status)VALUES(7,'provider','ACTIVE_EMPLOYEE');INSERT INTO user_agencies VALUES(7,450,'support');
   INSERT INTO public_website_support_sites(slug,name,support_agency_id,chat_enabled,coming_soon)VALUES('synthetic','Synthetic website',450,1,0);`);
  sql.execute.mockImplementation((statement,values)=>db.execute(statement,values));
  const chat=createWebsiteChatService(db,async slug=>slug==='synthetic'?site:null,null,{agencyAccess:async(uid,aid)=>(await db.execute('SELECT role FROM user_agencies WHERE user_id=? AND agency_id=?',[uid,aid]))[0][0]||null});
  const context=async()=>({user,allowed:[{agency,user:{...user,role:'support'}}],require(id){if(Number(id)!==450)throw Object.assign(new Error('Agency unavailable'),{status:403});return this.allowed[0];}});
  canonicalChat=chat;run=createMobileLiveChat({db,context,chat});
 });
 it('loads the offline all-website queue using the canonical authorization and query adapter',async()=>{
  const req=request('queue'),res=response(),next=vi.fn();await run(req,res,next);expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({sessions:[],sites:[expect.objectContaining({slug:'synthetic'})]}));expect((await db.execute('SELECT * FROM public_website_chat_staff'))[0]).toEqual([]);
 });
 it('goes online with the real heartbeat when mobile verification has no browser session state, then goes offline',async()=>{
  const req=request('availability'),res=response(),next=vi.fn();req.body={available:true,agencyId:450};await run(req,res,next);expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({available:true});
  const [[presence]]=await db.execute('SELECT * FROM user_presence WHERE user_id=7');expect(presence.session_phase).toBe('active');expect(presence.agency_id).toBe(450);expect((await db.execute('SELECT * FROM public_website_chat_staff'))[0]).toHaveLength(1);
  req.body={available:false};await run(req,res,next);expect(next).not.toHaveBeenCalled();expect((await db.execute('SELECT * FROM public_website_chat_staff'))[0]).toHaveLength(0);
 });
 it('keeps explicit mobile availability with stale heartbeats and stops on offline, revoked device or expired primary login',async()=>{
  const req=request('availability'),res=response();req.body={available:true,agencyId:450};await run(req,res,vi.fn());
  await db.query('UPDATE public_website_chat_staff SET last_seen_at=UTC_TIMESTAMP()-INTERVAL 5 MINUTE; UPDATE user_presence SET last_heartbeat_at=UTC_TIMESTAMP()-INTERVAL 5 MINUTE');
  expect((await canonicalChat.staffAvailability(user)).backgroundReady).toBe(true);
  expect((await canonicalChat.publicConfig('synthetic','USCO')).online).toBe(true);
  await db.query('UPDATE mobile_device_sessions SET revoked_at=UTC_TIMESTAMP()');expect((await canonicalChat.publicConfig('synthetic','USCO')).online).toBe(false);
  await db.query('UPDATE mobile_device_sessions SET revoked_at=NULL,enrolled_at=UTC_TIMESTAMP()-INTERVAL 31 DAY');expect((await canonicalChat.publicConfig('synthetic','USCO')).online).toBe(false);
  req.body={available:false};await run(req,res,vi.fn());expect((await canonicalChat.staffAvailability(user)).available).toBe(false);req.body={available:true,refreshOnly:true};await run(req,res,vi.fn());expect(res.json).toHaveBeenLastCalledWith({available:false});expect((await canonicalChat.staffAvailability(user)).available).toBe(false);
 });
 it('queues one durable mobile notification after app heartbeats stop, and skips departed visitors',async()=>{
  const req=request('availability'),res=response();req.body={available:true,agencyId:450};await run(req,res,vi.fn());
  await db.query('UPDATE public_website_chat_staff SET last_seen_at=UTC_TIMESTAMP()-INTERVAL 5 MINUTE; UPDATE user_presence SET last_heartbeat_at=UTC_TIMESTAMP()-INTERVAL 5 MINUTE');
  const id='11111111-2222-4333-8444-555555555555';await db.execute("INSERT INTO public_website_chat_sessions(id,site_slug,last_seen_at,expires_at) VALUES(?,'synthetic',UTC_TIMESTAMP(),UTC_TIMESTAMP()+INTERVAL 1 HOUR)",[id]);
  const create=vi.fn(async()=>({id:100})),dispatch=vi.fn();const notices=createWebsiteChatNotifications({db,access:async()=>({role:'support'}),create,dispatch,channelEnabled:async()=>true});
  await notices.enqueue({sessionId:id,eventKey:'started'});await notices.drain();expect(create).toHaveBeenCalledTimes(1);expect(dispatch).toHaveBeenCalledTimes(1);expect((await db.query('SELECT * FROM mobile_push_deliveries'))[0]).toHaveLength(1);
  await db.query('UPDATE public_website_chat_sessions SET visitor_left_at=UTC_TIMESTAMP()');await notices.enqueue({sessionId:id,eventKey:'later'});expect((await db.query('SELECT * FROM public_website_chat_notification_events'))[0]).toHaveLength(1);
 });
 it('preserves timedown security state and rejects a foreign agency instead of manufacturing access',async()=>{
  const req=request('availability'),res=response(),next=vi.fn();req.sessionSecurity.state={phase:'timedown'};req.body={available:true,agencyId:450};await run(req,res,next);expect(next).not.toHaveBeenCalled();expect((await db.execute('SELECT session_phase FROM user_presence WHERE user_id=7'))[0][0].session_phase).toBe('timedown');
  await db.query('TRUNCATE user_presence');req.body={available:true,agencyId:999};await run(req,res,next);expect(res.statusCode).toBe(403);expect((await db.execute('SELECT * FROM user_presence'))[0]).toHaveLength(0);
 });
});
