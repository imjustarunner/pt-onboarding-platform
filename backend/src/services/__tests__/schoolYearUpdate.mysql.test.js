import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{}}));
vi.mock('../emailSettings.service.js',()=>({getEmailSendingMode:async()=>'manual_only',isEmailNotificationsEnabled:async()=>false}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:()=>{throw new Error('Real sends forbidden in integration tests');}}));
vi.mock('../schoolEmailPortal.service.js',()=>({schoolEmailPortalUrl:async()=>'',schoolEmailAdminOverviewUrl:()=>''}));
vi.mock('../../utils/publicPortalUrl.js',()=>({buildPublicAppUrl:()=>''}));
import {deliverAnnualEmail,reconcileAnnualDeliveries,queueAnnualCompletionReceipt} from '../schoolYearUpdateAutomation.service.js';
import {listAnnualSchools,getAnnualAccess} from '../schoolYearUpdateAccess.service.js';
const enabled=recoveryMysqlEnabled;let db,fixture,migration;
const install=async()=>{for(const statement of migration.match(/CREATE TABLE IF NOT EXISTS[\s\S]*?;/g))await db.query(statement);};
beforeAll(async()=>{
 if(!enabled)return;vi.stubEnv('SCHOOL_YEAR_UPDATE_AUTOMATION_ENABLED','true');
 fixture=await isolatedWorkflowMysql('school_annual_test');db=fixture.db;
 migration=await fs.readFile(new URL('../../../../database/migrations/1751_school_annual_update_runtime.sql',import.meta.url),'utf8');
 await install();await install();
 await db.query('CREATE TABLE user_communications (id INT PRIMARY KEY,agency_id INT,delivery_status VARCHAR(24),external_message_id VARCHAR(100),metadata JSON)');
 for(const statement of [
  'CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(40),slug VARCHAR(40),portal_url VARCHAR(100),organization_type VARCHAR(20),is_active BOOLEAN,is_archived BOOLEAN,created_at DATETIME)',
  'CREATE TABLE organization_affiliations(agency_id INT,organization_id INT,is_active BOOLEAN,created_at DATETIME)',
  'CREATE TABLE agency_schools(agency_id INT,school_organization_id INT,is_active BOOLEAN,created_at DATETIME)',
  'CREATE TABLE school_profiles(school_organization_id INT,itsco_email VARCHAR(100))',
  'CREATE TABLE school_onboarding_invites(agency_id INT,school_organization_id INT,status VARCHAR(30),created_at DATETIME)',
  'CREATE TABLE school_reinit_campaigns(agency_id INT,school_year VARCHAR(16),status VARCHAR(30))'
 ])await db.query(statement);
});
it.skipIf(!enabled)('uses current active affiliations including legacy schools and enforces a saved school-specific deadline extension',async()=>{
 await db.query("INSERT INTO agencies VALUES(5,'Current','current',NULL,'school',1,0,'2025-01-01'),(6,'Legacy','legacy',NULL,'school',1,0,'2025-01-01'),(7,'Archived','archived',NULL,'school',1,1,'2025-01-01'),(8,'Foreign','foreign',NULL,'school',1,0,'2025-01-01')");
 await db.query("INSERT INTO organization_affiliations VALUES(2,5,1,'2025-01-01'),(2,7,1,'2025-01-01'),(3,8,1,'2025-01-01')");
 await db.query("INSERT INTO agency_schools VALUES(2,6,1,'2025-01-01')");
 expect((await listAnnualSchools(2,db)).map(s=>s.id)).toEqual([5,6]);
 await db.query("INSERT INTO school_reinit_rules(agency_id,enabled) VALUES(2,1)");
 await db.query("INSERT INTO school_reinit_campaigns VALUES(2,'2026-27','pushed')");
 const cycle={id:900010,status:'in_progress'};
 const args={agencyId:2,schoolOrganizationId:6,schoolYear:'2026-27',cycle,now:new Date('2026-10-22T18:00:00Z')};
 expect(await getAnnualAccess(args,db)).toMatchObject({canWrite:false,reason:'deadline_passed'});
 await db.query("INSERT INTO school_reinit_followups(cycle_id,outstanding_json,extension_until) VALUES(900010,JSON_ARRAY(),'2026-10-29')");
 expect(await getAnnualAccess(args,db)).toMatchObject({canWrite:true});
 await db.query("UPDATE agency_schools SET is_active=0 WHERE school_organization_id=6");
 expect(await getAnnualAccess(args,db)).toMatchObject({canWrite:false});
});
afterAll(async()=>{if(fixture)await fixture.close();vi.unstubAllEnvs();});
it.skipIf(!enabled)('uses real MySQL claims and reconciles receipts in a randomly named isolated schema without sending mail',async()=>{
 const send=vi.fn().mockResolvedValue({id:'synthetic',communicationId:900001});
 const input={agencyId:2,schoolYear:'2026-27',schoolId:900001,cycleId:900001,key:'test-reminder',kind:'reminder',context:{identity:{id:900001},schoolsEmail:'schools@example.invalid'},to:['school@example.invalid'],content:{subject:'Synthetic test',text:'No real email'}};
 await Promise.all([deliverAnnualEmail(input,{db,send}),deliverAnnualEmail(input,{db,send})]);await deliverAnnualEmail(input,{db,send});expect(send).toHaveBeenCalledTimes(1);
 await db.execute("UPDATE school_reinit_deliveries SET status='sending',updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 20 MINUTE)");
 await db.execute("INSERT INTO user_communications (id,agency_id,delivery_status,external_message_id,metadata) VALUES (900001,2,'sent','synthetic',JSON_OBJECT())");
 await reconcileAnnualDeliveries(db);const [[row]]=await db.query('SELECT status FROM school_reinit_deliveries');expect(row.status).toBe('sent');
 await db.execute("INSERT INTO school_reinit_followups (cycle_id,outstanding_json) VALUES (900001,JSON_ARRAY('Missing answer'))");
 await queueAnnualCompletionReceipt({id:900001,agency_id:2,school_organization_id:900001,school_year:'2026-27'},db);
 const [[followup]]=await db.query('SELECT status FROM school_reinit_followups');expect(followup.status).toBe('resolved');
 const [[receipt]]=await db.query("SELECT status FROM school_reinit_deliveries WHERE kind='receipt'");expect(receipt.status).toBe('pending');
});

it.skipIf(!enabled)('reapplies migration1751 without changing saved rules, followups or receipts',async()=>{
 const tables=['school_reinit_rules','school_reinit_deliveries','school_reinit_followups'];
 const before=await Promise.all(tables.map(async table=>(await db.query(`SELECT * FROM ${table}`))[0]));
 expect(before.every(rows=>rows.length>0)).toBe(true);
 await install();await install();
 const after=await Promise.all(tables.map(async table=>(await db.query(`SELECT * FROM ${table}`))[0]));
 expect(after).toEqual(before);
});
