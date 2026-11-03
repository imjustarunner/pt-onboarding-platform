import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements,stripSqlLineComments} from '../../utils/migrationSql.js';

test('diagnosis-review migrations and exact appointment-alert acknowledgements in MySQL', {skip:process.env.DIAGNOSIS_ALERTS_MYSQL_TEST!=='1'},async()=>{
 const socketPath=process.env.DIAGNOSIS_ALERTS_MYSQL_SOCKET;
 assert.ok(socketPath?.startsWith('/private/tmp/pt-billing-workflow-mysql-20261103/'));
 process.env.NODE_ENV='test';process.env.SKIP_DB_CONNECT='1';
 for(const prefix of ['DB','CLINICAL_DB'])for(const [key,value]of Object.entries({HOST:'127.0.0.1',PORT:'33429',NAME:'diagnosis_alerts_test',USER:'root',PASSWORD:'synthetic-only'}))process.env[`${prefix}_${key}`]=value;
 const {default:mysql}=await import('mysql2/promise');const admin=await mysql.createConnection({socketPath,user:'root'});let db;
 try{
  await admin.query('DROP DATABASE IF EXISTS diagnosis_alerts_test');await admin.query('CREATE DATABASE diagnosis_alerts_test');db=mysql.createPool({socketPath,user:'root',database:'diagnosis_alerts_test',connectionLimit:4,timezone:'Z'});
  await db.query('CREATE TABLE clinical_diagnoses(id BIGINT PRIMARY KEY)');
  await db.query('CREATE TABLE appointments(id INT UNSIGNED PRIMARY KEY,agency_id INT,start_at DATETIME,provider_user_id INT,source_timezone VARCHAR(64),office_event_id INT,clinical_session_id BIGINT)');
  await db.query('CREATE TABLE appointment_participants(appointment_id INT UNSIGNED,client_id INT)');
  await db.query('CREATE TABLE appointment_staff_alerts(appointment_id INT UNSIGNED PRIMARY KEY,revision INT,alert_text TEXT,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  for(const file of ['clinical_migrations/028_diagnosis_review_controls.sql','migrations/1737_appointment_alert_acknowledgements.sql'])for(const statement of splitSqlStatements(stripSqlLineComments(await readFile(new URL(`../../../../database/${file}`,import.meta.url),'utf8'))))await db.query(statement);
  await db.query('INSERT INTO clinical_diagnoses VALUES(4)');await db.execute('INSERT INTO clinical_diagnosis_reviews(diagnosis_id,agency_id,client_id,review_reason,reviewed_by_user_id) VALUES(4,2,31,?,9)',['Synthetic evidence review']);await assert.rejects(db.query('DELETE FROM clinical_diagnoses WHERE id=4'),/foreign key constraint/i);await assert.rejects(db.query("UPDATE clinical_diagnosis_reviews SET review_reason='overwrite'"),/append-only/);await assert.rejects(db.query('DELETE FROM clinical_diagnosis_reviews'),/cannot be deleted/);
  await db.query("INSERT INTO appointments VALUES(12,2,'2026-11-03 18:00:00',9,'America/Denver',NULL,NULL)");await db.query('INSERT INTO appointment_participants VALUES(12,31)');await db.query("INSERT INTO appointment_staff_alerts(appointment_id,revision,alert_text) VALUES(12,2,'ciphertext')");
  const {createClinicalAppointmentAlerts}=await import('../clinicalAppointmentAlerts.service.js');
  const service=createClinicalAppointmentAlerts({db,clinical:db,tools:{get:async()=>({})},clientAccess:async()=>({ok:true}),agencyAccess:async()=>{},decrypt:()=> 'Synthetic alert',diagnosisAlerts:async()=>[]});
  const user={id:9,role:'provider'},input={agencyId:2,clientId:31,dateOfService:'2026-11-03'};
  await assert.rejects(service.assertReviewed(user,input),{code:'APPOINTMENT_ALERT_REVIEW_REQUIRED'});
  await service.acknowledge(user,12,2);await service.assertReviewed(user,input);
  await db.query('UPDATE appointment_staff_alerts SET revision=3 WHERE appointment_id=12');
  await assert.rejects(service.assertReviewed(user,input),{code:'APPOINTMENT_ALERT_REVIEW_REQUIRED'});
  await assert.rejects(service.acknowledge(user,12,2),{status:409});
  await service.acknowledge(user,12,3);const [[count]]=await db.query('SELECT COUNT(*) AS n FROM appointment_staff_alert_acknowledgements');assert.equal(count.n,2);await assert.rejects(db.query('UPDATE appointment_staff_alert_acknowledgements SET revision=5'),/append-only/);await assert.rejects(db.query('DELETE FROM appointment_staff_alert_acknowledgements'),/cannot be deleted/);
  await assert.rejects(service.assertReviewed({id:10,role:'provider'},input),{code:'APPOINTMENT_ALERT_REVIEW_REQUIRED'});
 }finally{if(db)await db.end();for(const file of ['../../config/database.js','../../config/clinicalDatabase.js']){const {default:unused}=await import(file);await unused.end();}await admin.query('DROP DATABASE IF EXISTS diagnosis_alerts_test');await admin.end();}
});
