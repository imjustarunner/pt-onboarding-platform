// Disposable CI database only. Never load production credentials or use its proxy port.
import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import {createGuardianServiceCancellationService} from '../guardianServiceCancellation.service.js';
import {assertClientServiceSchedulingActive} from '../clientServiceSchedulingGuard.service.js';
import {createGuardianServiceExitFeedback} from '../guardianServiceExitFeedback.service.js';
import {serviceNotificationBlocked} from '../clientServiceNotificationPolicy.service.js';
import {updateClientServiceStatus} from '../clientServiceEnrollment.service.js';
import {guardianSessionHistory} from '../guardianServicePortal.service.js';
import {createClientServiceReturnRequests} from '../clientServiceReturnRequest.service.js';
const enabled=!!process.env.CLINICAL_INTEGRATION_MYSQL_PORT;
let admin,db,service,created=false;
const name=`codex_guardian_cancellation_${process.pid}`;
const notify=vi.fn(),cancel=vi.fn();
const request={userId:9,clientId:8,agencyId:2,appointmentId:1,scope:'end_services',reason:'Changing provider',personalNote:'Thank you.',confirmed:true,requestId:'11111111-1111-4111-8111-111111111111'};
beforeAll(async()=>{
 if(!enabled)return;
 const port=Number(process.env.CLINICAL_INTEGRATION_MYSQL_PORT);if(port===3307)throw new Error('Never run this test on the production proxy port.');
 const settings={host:'127.0.0.1',port,user:'root',password:'',timezone:'+00:00',dateStrings:true};
 admin=await mysql.createConnection(settings);await admin.query(`CREATE DATABASE ${name}`);created=true;db=mysql.createPool({...settings,database:name,connectionLimit:6});
 for(const sql of [
  'CREATE TABLE clients (id INT PRIMARY KEY,agency_id INT,client_type VARCHAR(30),status VARCHAR(30),client_status_id INT)',
  'CREATE TABLE users (id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80))',
  'CREATE TABLE agencies (id INT PRIMARY KEY,name VARCHAR(80))',
  'CREATE TABLE client_agency_assignments (client_id INT,agency_id INT,is_active BOOL)',
  'CREATE TABLE client_statuses (id INT PRIMARY KEY,status_key VARCHAR(30))',
  'CREATE TABLE appointments (id INT PRIMARY KEY,agency_id INT,provider_user_id INT,business_type VARCHAR(30),source VARCHAR(100),start_at DATETIME,end_at DATETIME,status VARCHAR(40),provider_schedule_event_id INT,office_event_id INT,cancellation_fee_cents INT DEFAULT 0)',
  'CREATE TABLE appointment_participants (appointment_id INT,client_id INT)',
  'CREATE TABLE provider_schedule_events (id INT PRIMARY KEY,agency_id INT,provider_id INT,recurrence_series_id VARCHAR(80),recurrence_stopped BOOL DEFAULT 0)',
  'CREATE TABLE office_events (id INT PRIMARY KEY,booking_plan_id INT)',
  'CREATE TABLE office_booking_plans (id INT PRIMARY KEY,is_active BOOL,session_context_json JSON)',
  'CREATE TABLE client_status_history (client_id INT,changed_by_user_id INT,field_changed VARCHAR(40),from_value VARCHAR(40),to_value VARCHAR(40),note TEXT)',
  'CREATE TABLE appointment_reminders (appointment_id INT,status VARCHAR(24))',
  'CREATE TABLE appointment_schedule_notices (appointment_id INT,status VARCHAR(24),event_type VARCHAR(24))',
  'CREATE TABLE notifications (type VARCHAR(100),severity VARCHAR(30),title VARCHAR(150),message TEXT,user_id INT,agency_id INT,related_entity_type VARCHAR(80),related_entity_id INT,actor_user_id INT,actor_source VARCHAR(40))'
 ])await db.query(sql);
 const enroll=await readFile(new URL('../../../../database/migrations/1681_client_service_enrollments.sql',import.meta.url),'utf8');await db.query(enroll.split(';')[0]);
 await db.query(await readFile(new URL('../../../../database/migrations/1818_guardian_service_cancellations.sql',import.meta.url),'utf8'));
 for(const sql of (await readFile(new URL('../../../../database/migrations/1819_guardian_service_exit_feedback.sql',import.meta.url),'utf8')).split(';').filter(sql=>sql.trim()))await db.query(sql);
 for(const sql of (await readFile(new URL('../../../../database/migrations/1820_client_service_lifecycle.sql',import.meta.url),'utf8')).split(';').filter(sql=>sql.trim()))await db.query(sql);
 await db.query("INSERT INTO clients VALUES (8,2,'clinical','CURRENT',1),(99,2,'clinical','CURRENT',1)");
 await db.query("INSERT INTO users VALUES (7,'Provider','One'),(99,'Provider','Two')");
 await db.query("INSERT INTO agencies VALUES (2,'Agency One'),(3,'Agency Two')");
 await db.query("INSERT INTO client_statuses VALUES (1,'current')");await db.query('INSERT INTO client_agency_assignments VALUES (8,3,1)');
 for(let id=1;id<=26;id++){
  await db.execute("INSERT INTO appointments VALUES (?,2,7,'mental_health','reserved_office_session:abc',?,?,'scheduled',NULL,?,0)",[id,`2030-01-${String(id+1).padStart(2,'0')} 16:00:00`,`2030-01-${String(id+1).padStart(2,'0')} 17:00:00`,id+100]);
  await db.execute('INSERT INTO appointment_participants VALUES (?,8)',[id]);await db.execute('INSERT INTO office_events VALUES (?,350)',[id+100]);
  await db.execute("INSERT INTO appointment_reminders VALUES (?,'pending')",[id]);await db.execute("INSERT INTO appointment_schedule_notices VALUES (?,'pending','created')",[id]);
 }
 for(const [id,agency,provider,kind,client]of [[60,3,7,'mental_health',8],[61,2,99,'mental_health',8],[62,2,7,'learning',8],[63,2,7,'mental_health',99]]){
  await db.execute("INSERT INTO appointments VALUES (?,?,?,?,'other','2030-01-02 16:00:00','2030-01-02 17:00:00','scheduled',NULL,NULL,0)",[id,agency,provider,kind]);await db.execute('INSERT INTO appointment_participants VALUES (?,?)',[id,client]);
 }
 await db.query("INSERT INTO office_booking_plans VALUES (350,1,JSON_OBJECT('agencyId',2,'bookingSource','automatic_office_reservation'))");
 await db.query("INSERT INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,label) VALUES (8,2,'counseling',7,'Counseling'),(8,2,'tutoring',7,'Tutoring'),(8,3,'counseling',7,'Other agency'),(8,2,'counseling',99,'Other provider')");
 await db.query("ALTER TABLE appointments ADD COLUMN source_timezone VARCHAR(80) DEFAULT 'America/Denver', ADD COLUMN modality VARCHAR(24) DEFAULT 'IN_PERSON'");
 const appointment=async id=>{const[[a]]=await db.execute('SELECT * FROM appointments WHERE id=?',[id]);return a&&{...a,agencyId:a.agency_id,providerUserId:a.provider_user_id,businessType:a.business_type,startAt:a.start_at,endAt:a.end_at,providerScheduleEventId:a.provider_schedule_event_id,officeEventId:a.office_event_id,cancellationFeeCents:a.cancellation_fee_cents};};
 cancel.mockImplementation(async(id)=>{await db.execute("UPDATE appointments SET status='canceled_by_client' WHERE id=?",[id]);return {cancellationFeeCents:0};});
 service=createGuardianServiceCancellationService({db,appointment,authorize:async()=>({agency_id:2,client_type:'clinical'}),authorizeEnd:async()=>{},requireCancellation:async()=>{},
  evaluate:async()=>({allowed:true,policy:{id:3,name:'Counseling policy',noticeHours:24},recommendedFeeCents:0,recommendedPackageAction:'release'}),cancel,notify,
  calendarCleanup:async()=>{},encrypt:JSON.stringify,decrypt:JSON.parse,now:()=>new Date('2030-01-01T16:00:00.123Z'),clientLock:async(ids,work)=>work()});
});
afterAll(async()=>{if(db)await db.end();if(created)await admin.query(`DROP DATABASE ${name}`);if(admin)await admin.end();});
it.skipIf(!enabled)('cancels all 26 through real migration-defined SQL while preserving other care, the room plan and retry identity',async()=>{
 const preview=await service.preview(request);expect(preview.count).toBe(26);
 const input={...request,reviewToken:preview.reviewToken};await service.submit(input);await service.submit(input);
 const[[jobs]]=await db.query('SELECT COUNT(*) AS n FROM guardian_service_cancellations');expect(jobs.n).toBe(1);
 const[[reminders]]=await db.query("SELECT COUNT(*) AS n FROM appointment_reminders WHERE status='pending'");expect(reminders.n).toBe(0);
 const[[plan]]=await db.query('SELECT is_active FROM office_booking_plans WHERE id=350');expect(plan.is_active).toBe(1);
 const[active]=await db.query('SELECT service_kind,provider_user_id,agency_id FROM client_service_enrollments WHERE is_active=1');expect(active).toHaveLength(3);
 await service.processPending();expect(cancel).toHaveBeenCalledTimes(26);expect(notify).toHaveBeenCalledTimes(1);
 const[other]=await db.query('SELECT status FROM appointments WHERE id>=60');expect(other.every(a=>a.status==='scheduled')).toBe(true);
 const[[job]]=await db.query('SELECT status,completed_count,confirmed_at FROM guardian_service_cancellations');expect(job.status).toBe('completed');expect(job.completed_count).toBe(26);expect(job.confirmed_at).toContain('.123');
 await service.processPending();expect(cancel).toHaveBeenCalledTimes(26);expect(notify).toHaveBeenCalledTimes(1);
 await expect(assertClientServiceSchedulingActive({clientId:8,agencyId:2,providerUserId:7,businessType:'mental_health'},db)).rejects.toMatchObject({code:'CLIENT_SERVICE_ENDED'});
 await expect(assertClientServiceSchedulingActive({clientId:8,agencyId:2,providerUserId:7,businessType:'learning'},db)).resolves.toBeUndefined();
 // A client who already canceled every visible date can still end the service.
 // Reactivation here is test setup, not part of client cancellation behavior.
 await db.query("UPDATE client_service_enrollments SET is_active=1 WHERE client_id=8 AND agency_id=2 AND provider_user_id=7 AND service_kind='counseling'");
 const empty={...request,requestId:'22222222-2222-4222-8222-222222222222'};
 const emptyReview=await service.preview(empty);expect(emptyReview.count).toBe(0);
 await service.submit({...empty,reviewToken:emptyReview.reviewToken});await service.processPending();
 const[[emptyJob]]=await db.execute('SELECT status,completed_count FROM guardian_service_cancellations WHERE id=?',[empty.requestId]);
 expect(emptyJob).toMatchObject({status:'completed',completed_count:0});expect(cancel).toHaveBeenCalledTimes(26);expect(notify).toHaveBeenCalledTimes(2);
 const[[finished]]=await db.execute('SELECT team_notified_at FROM guardian_service_cancellations WHERE id=?',[empty.requestId]);expect(finished.team_notified_at).toBeTruthy();
 const messageInput={appointment:{id:1,agencyId:2,providerUserId:7,businessType:'mental_health'},clientId:8};
 expect(await serviceNotificationBlocked(messageInput,db)).toBe(true);
 expect(await serviceNotificationBlocked({...messageInput,facts:{guardianSummary:{endsService:true},guardianCancellationOperationId:empty.requestId,cancellationActorUserId:9}},db)).toBe(false);
 const feedback=createGuardianServiceExitFeedback({db,authorize:async()=>{},encrypt:JSON.stringify});
 const response={userId:9,clientId:8,operationId:empty.requestId,rating:4,comments:'More evening appointments.',contactRequested:false};
 expect(await feedback.read(response)).toEqual({submitted:false});await feedback.submit(response);await feedback.submit(response);
 expect(await feedback.read(response)).toEqual({submitted:true});
 const[[feedbackCount]]=await db.query('SELECT COUNT(*) AS n FROM guardian_service_exit_feedback');expect(feedbackCount.n).toBe(1);
 const[[alertCount]]=await db.query("SELECT COUNT(*) AS n FROM notifications WHERE title='Client service feedback'");expect(alertCount.n).toBe(1);
 const[[enrollment]]=await db.query("SELECT * FROM client_service_enrollments WHERE client_id=8 AND agency_id=2 AND provider_user_id=7 AND service_kind='counseling'");
 expect(enrollment.service_status).toBe('discontinued');expect(enrollment.ended_at).toBeTruthy();
 const returns=createClientServiceReturnRequests({db,authorize:async()=>({agency_id:2}),encrypt:JSON.stringify,decrypt:JSON.parse});
 const again={userId:9,clientId:8,agencyId:2,serviceId:enrollment.id,requestId:'33333333-3333-4333-8333-333333333333',note:'Please consider me again.'};
 await returns.submit(again);await returns.submit(again);
 const[[requests]]=await db.query('SELECT COUNT(*) AS n FROM client_service_return_requests');expect(requests.n).toBe(1);
 expect((await returns.read(again)).request).toMatchObject({status:'pending',note:again.note});
 expect((await returns.read({...again,userId:10})).request).toBeNull();
 await returns.review({...again,userId:7,decision:'reviewed',message:'Please discuss availability with us.'});
 const[[notResumed]]=await db.execute('SELECT is_active FROM client_service_enrollments WHERE id=?',[enrollment.id]);expect(notResumed.is_active).toBe(0);
 expect((await returns.read(again)).request).toMatchObject({status:'reviewed',response:'Please discuss availability with us.'});
 await returns.submit({...again,requestId:'44444444-4444-4444-8444-444444444444'});
 const staff={clientId:8,agencyId:2,serviceId:enrollment.id,userId:9,input:{status:'active',expectedStatus:'discontinued',reason:'Authorized return to care',confirmed:true}};
 const options={lock:async(ids,work)=>work()};
 await updateClientServiceStatus(staff,db,options);
 const[[openReview]]=await db.query("SELECT COUNT(*) AS n FROM client_service_return_requests WHERE status='pending'");expect(openReview.n).toBe(0);
 await expect(assertClientServiceSchedulingActive({clientId:8,agencyId:2,providerUserId:7,businessType:'mental_health',source:'reserved_office_session:abc'},db)).rejects.toMatchObject({code:'CLIENT_SERIES_ENDED'});
 await expect(assertClientServiceSchedulingActive({clientId:8,agencyId:2,providerUserId:7,businessType:'mental_health',source:'reserved_office_session:fresh'},db)).resolves.toBeUndefined();
 await updateClientServiceStatus({...staff,input:{status:'completed',expectedStatus:'active',reason:'Care completed',confirmed:true}},db,options);
 const[[updated]]=await db.execute('SELECT service_status,is_active FROM client_service_enrollments WHERE id=?',[enrollment.id]);expect(updated).toEqual({service_status:'completed',is_active:0});
 const[remaining]=await db.query('SELECT id FROM client_service_enrollments WHERE is_active=1');expect(remaining).toHaveLength(3);
 const closed=await updateClientServiceStatus({...staff,input:{status:'terminated',expectedStatus:'completed',closureReason:'discontinued_contact',reason:'Private outreach history.',confirmed:true}},db,options);
 const publicService=closed.services.find(s=>Number(s.id)===Number(enrollment.id));
 expect(publicService).toMatchObject({service_status:'terminated',portal_status:'discontinued',portal_status_label:'Discontinued services',closure_reason:'discontinued_contact'});
 expect(publicService.client_end_reason).toContain('unable to re-establish contact');expect(publicService.client_end_reason).not.toContain('Private outreach');
 const[[canceledCount]]=await db.query("SELECT COUNT(*) AS n FROM appointments WHERE id<60 AND status='canceled_by_client'");expect(canceledCount.n).toBe(26);
 const history=await guardianSessionHistory({userId:9,clientId:8,agencyId:2,serviceId:enrollment.id},db,{authorize:async()=>({client_id:8,agency_id:2,service:enrollment})});
 expect(history).toHaveLength(26);expect(history.every(row=>row.status==='canceled_by_client')).toBe(true);expect(history.some(row=>row.providerName==='Provider Two')).toBe(false);

});
