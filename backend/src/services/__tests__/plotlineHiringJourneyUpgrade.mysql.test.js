import {it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {HIRING_UPGRADE_USER as user,HIRING_UPGRADE_PROCEDURE as procedure,HIRING_UPGRADE_HASH as hash,plotlineHiringUpgradeSql} from '../../utils/plotlineHiringSenderUpgrade.js';
import {plotlineSenderPlan} from '../../utils/plotlineInterviewSenderProvisioning.js';
import {upgradePlotlineHiringSender} from '../../scripts/upgradePlotlineHiringSender.mjs';
import {plotlineHiringCampaignDigest as digest} from '../../utils/plotlineHiringCampaign.js';
it.skipIf(!process.env.PLOTLINE_HIRING_TEST_MYSQL_URL)('executes the narrow upgrade, preserves old audit and consent rows, and denies direct access in disposable local MySQL',async()=>{
 const url=new URL(process.env.PLOTLINE_HIRING_TEST_MYSQL_URL);
 if(url.protocol!=='mysql:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.port!=='33319')throw new Error('LOCAL_DISPOSABLE_MYSQL_ON_33319_REQUIRED');
 const mysql=(await import('mysql2/promise')).default;
 const name='plotline_hiring_test_'+randomBytes(5).toString('hex'),password='Test9!'+randomBytes(24).toString('hex');
 let admin,scoped,createdDb=false,createdUser=false;
 try{
  admin=await mysql.createConnection(url.href);await admin.query('CREATE DATABASE `'+name+'`');createdDb=true;await admin.query('USE `'+name+'`');
  await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?",[user,password]);createdUser=true;
  for(const ddl of ['CREATE TABLE twilio_numbers(id INT PRIMARY KEY,agency_id INT NULL,phone_number VARCHAR(32),number_purpose VARCHAR(64),status VARCHAR(32),is_active BOOLEAN)',
   'CREATE TABLE sms_sender_registrations(number_id INT PRIMARY KEY,campaign_id VARCHAR(64),registration_json JSON,updated_by_user_id INT NULL)',
   'CREATE TABLE sms_consent_requests(id INT PRIMARY KEY,evidence VARCHAR(100))',
   "CREATE TABLE user_activity_log(id INT AUTO_INCREMENT PRIMARY KEY,action_type ENUM('api_call'),user_id INT NULL,agency_id INT NULL,metadata JSON)"])await admin.query(ddl);
  await admin.query("INSERT INTO twilio_numbers VALUES(23,NULL,'+17197165766','platform_contact','active',TRUE)");
  await admin.query('INSERT INTO sms_sender_registrations VALUES(23,?,?,NULL)',['VCZOP4JO',JSON.stringify(plotlineSenderPlan.registration)]);
  await admin.query("INSERT INTO sms_consent_requests VALUES(77,'PRESERVE ORIGINAL CONSENT')");
  await admin.query("INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES('api_call',12,2,JSON_OBJECT('original',TRUE))");
  await admin.query(plotlineHiringUpgradeSql());await admin.query(`GRANT EXECUTE ON PROCEDURE \`${name}\`.\`${procedure}\` TO ?@'%'`,[user]);
  const campaign={brand_id:'BCGLCIL',campaign_id:'VCZOP4JO',status:'ACTIVE',traffic_enabled:true,reseller_id:'R000000',usecase:'ACCOUNT_NOTIFICATION',opt_out_assist:false,embedded_link:true,message_flow_details:{consent_mechanisms:[{method:'ONLINE_FORM',details:'Synthetic opt-in flow',attachment:'https://plotlinepo.com/hiring-sms-consent'}]}};
  const options={env:{DB_USER:user,DB_PASSWORD:password,DB_NAME:name,DB_HOST:url.hostname,DB_PORT:url.port},approvalDigest:digest(campaign),connect:config=>mysql.createConnection(config),readCarrier:async path=>path.includes('/numbers/')?{number:'17197165766',status:'LINKED'}:campaign};
  expect((await upgradePlotlineHiringSender(options)).summary[0].upgrade_status).toBe('preview');
  expect((await upgradePlotlineHiringSender({...options,apply:true})).summary[0].upgrade_status).toBe('applied');
  expect((await upgradePlotlineHiringSender({...options,apply:true})).summary[0].upgrade_status).toBe('already_configured');
  const [[record]]=await admin.query('SELECT registration_json,updated_by_user_id FROM sms_sender_registrations');
  const registration=typeof record.registration_json==='string'?JSON.parse(record.registration_json):record.registration_json;
  expect(registration).toMatchObject({interviewOnly:false,platformHiringSender:true,applicationOptInApproved:true,hiringJourneyApprovalDigest:digest(campaign)});expect(record.updated_by_user_id).toBeNull();
  const [audit]=await admin.query('SELECT * FROM user_activity_log ORDER BY id');expect(audit).toHaveLength(2);expect(audit[0].user_id).toBe(12);expect(audit[1].user_id).toBeNull();
  const metadata=typeof audit[1].metadata==='string'?JSON.parse(audit[1].metadata):audit[1].metadata;expect(metadata.actor_type).toBe('automation');expect(metadata.database_session_user).toMatch(new RegExp('^'+user+'@'));
  const [[consent]]=await admin.query('SELECT evidence FROM sms_consent_requests');expect(consent.evidence).toBe('PRESERVE ORIGINAL CONSENT');
  scoped=await mysql.createConnection({host:url.hostname,port:Number(url.port),user,password,database:name});
  await expect(scoped.query('SELECT * FROM sms_consent_requests')).rejects.toHaveProperty('code','ER_TABLEACCESS_DENIED_ERROR');
  await expect(scoped.query('UPDATE sms_sender_registrations SET updated_by_user_id=12')).rejects.toHaveProperty('code','ER_TABLEACCESS_DENIED_ERROR');
  await expect(admin.query(`CALL ${procedure}(?,?,TRUE)`,[hash,digest(campaign)])).rejects.toHaveProperty('code','ER_SIGNAL_EXCEPTION');
  await admin.query('UPDATE twilio_numbers SET agency_id=2');await expect(scoped.query(`CALL ${procedure}(?,?,TRUE)`,[hash,digest(campaign)])).rejects.toHaveProperty('code','ER_SIGNAL_EXCEPTION');
 }catch(error){if(error.code)throw new Error('Isolated MySQL: '+error.code);throw error;}
 finally{await scoped?.end();if(createdUser)await admin.query("DROP USER ?@'%'",[user]);if(createdDb)await admin.query('DROP DATABASE `'+name+'`');await admin?.end();}
},30000);
