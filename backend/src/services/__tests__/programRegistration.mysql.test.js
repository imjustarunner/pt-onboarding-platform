import {readFileSync} from 'node:fs';
import mysql from 'mysql2/promise';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {retireLegacyPrograms} from '../programRetirement.service.js';
import {programParticipation} from '../programParticipation.service.js';
import {enrollClientsInCompanyEvent} from '../skillBuildersIntakeEnrollment.service.js';
import LearningProgramClass from '../../models/LearningProgramClass.model.js';
import {assertClinicalInsuranceService} from '../clientServiceContext.service.js';

const state=vi.hoisted(()=>({pool:null}));
vi.mock('../../config/database.js',()=>({default:{getConnection:()=>state.pool.getConnection(),execute:(...args)=>state.pool.execute(...args)},onTableWrite:vi.fn()}));
vi.mock('../familyBillingPolicy.service.js',()=>({requireResponsiblePayer:vi.fn(async(uid)=>{if(uid!==91)throw Object.assign(new Error('Payer required'),{status:403});}),billingError:(status,message)=>Object.assign(new Error(message),{status})}));
vi.mock('../familyLedger/receivables.js',()=>({createReceivable:vi.fn(async(input,db)=>{
  await db.execute("INSERT INTO family_receivables(agency_id,source_type,source_key,status) VALUES (?,?,?,'open') ON DUPLICATE KEY UPDATE status=status",[input.agencyId,input.sourceType,input.sourceKey]);
  return {status:'open',id:7};
})}));
it('requires clinical services for insurance coverage, including a dual-service provider billing tutoring',()=>{
  expect(()=>assertClinicalInsuranceService('tutoring','insurance')).toThrow('Clinical');
  expect(()=>assertClinicalInsuranceService('consulting','medicaid')).toThrow('Clinical');
  expect(()=>assertClinicalInsuranceService('mental_health','insurance')).not.toThrow();
  expect(()=>assertClinicalInsuranceService('tutoring','self_pay')).not.toThrow();
});

const socketPath=process.env.HUB_SCOPE_MYSQL_SOCKET;
describe.skipIf(!socketPath)('agency programs with isolated MySQL',()=>{
  let server,db;
  const database='program_regression_'+process.pid;
  const query=(sql,args=[])=>db.execute(sql,args).then(([rows])=>rows);
  beforeAll(async()=>{
    server=await mysql.createConnection({socketPath,user:'root'});
    await server.query(`CREATE DATABASE ${database}`);
    state.pool=mysql.createPool({database,socketPath,user:'root',connectionLimit:5});
    db=await state.pool.getConnection();
    const tables=[
      "agencies(id INT PRIMARY KEY,name VARCHAR(80),organization_type VARCHAR(20),slug VARCHAR(80),feature_flags JSON)",
      "organization_affiliations(agency_id INT,organization_id INT,is_active INT)",
      "clients(id INT PRIMARY KEY,agency_id INT,organization_id INT NOT NULL,created_at DATETIME DEFAULT '2025-01-01')",
      "client_organization_assignments(client_id INT,organization_id INT,is_primary INT,is_active INT,updated_at TIMESTAMP DEFAULT '2025-01-01',PRIMARY KEY(client_id,organization_id))",
      "client_agency_assignments(client_id INT,agency_id INT,is_active INT)",
      "client_service_enrollments(client_id INT,agency_id INT,organization_id INT,is_active INT)",
      "client_provider_assignments(client_id INT,organization_id INT,provider_user_id INT,is_active INT)",
      "learning_program_classes(id INT PRIMARY KEY,organization_id INT,class_name VARCHAR(80),starts_at DATETIME,ends_at DATETIME,enrollment_opens_at DATETIME,enrollment_closes_at DATETIME,status VARCHAR(20),is_active INT DEFAULT 1,registration_eligible INT,medicaid_eligible INT DEFAULT 0,cash_eligible INT DEFAULT 0,created_at DATETIME DEFAULT '2025-01-01')",
      "learning_class_client_memberships(learning_class_id INT,client_id INT,membership_status VARCHAR(20),updated_at TIMESTAMP DEFAULT '2025-01-01',joined_at DATETIME,removed_at DATETIME,role_label VARCHAR(32),notes VARCHAR(120),created_by_user_id INT,PRIMARY KEY(learning_class_id,client_id))",
      "learning_class_provider_memberships(learning_class_id INT,provider_user_id INT)",
      "learning_class_sessions(learning_class_id INT,status VARCHAR(32),starts_at DATETIME,ends_at DATETIME)",
      "company_events(id INT PRIMARY KEY,agency_id INT,organization_id INT,title VARCHAR(80),event_type VARCHAR(60),created_at DATETIME DEFAULT '2025-01-01',starts_at DATETIME,ends_at DATETIME,recurrence_json JSON,is_active INT,registration_eligible INT,medicaid_eligible INT DEFAULT 0,cash_eligible INT DEFAULT 0,program_cost_billing_mode VARCHAR(16),program_cost_dollars INT,per_session_cost_dollars INT)",
      "skills_groups(id INT PRIMARY KEY,company_event_id INT,agency_id INT,organization_id INT,end_date DATE)",
      "skills_group_clients(skills_group_id INT,client_id INT,active_for_providers INT DEFAULT 0,ready_confirmed_by_user_id INT,ready_confirmed_at DATETIME,PRIMARY KEY(skills_group_id,client_id))",
      "company_event_session_dates(company_event_id INT,starts_at DATETIME,ends_at DATETIME)",
      "skill_builders_event_sessions(company_event_id INT,starts_at DATETIME,ends_at DATETIME)",
      "company_event_clients(company_event_id INT,agency_id INT,client_id INT,is_active INT,enrolled_by_user_id INT,enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(company_event_id,client_id))",
      "family_receivables(id INT PRIMARY KEY AUTO_INCREMENT,agency_id INT,source_type VARCHAR(30),source_key VARCHAR(50),status VARCHAR(12),UNIQUE(agency_id,source_type,source_key))",
      "family_fulfillment_jobs(receivable_id INT,status VARCHAR(15))",
      "booking_packages(id INT PRIMARY KEY,agency_id INT,allowed_tenant_service_ids_json JSON,name VARCHAR(60))",
      "booking_package_entitlements(id INT PRIMARY KEY,agency_id INT,learning_program_class_id INT,client_id INT,package_id INT,status VARCHAR(15),payment_status VARCHAR(15),sessions_remaining INT,sessions_reserved INT DEFAULT 0,bonus_sessions_remaining INT DEFAULT 0,purchaser_user_id INT,pricing_snapshot_json JSON,activated_at DATETIME)",
      "booking_package_ledger(agency_id INT,entitlement_id INT,client_id INT,direction VARCHAR(12),quantity INT,reason_code VARCHAR(30),metadata_json JSON,created_by_user_id INT)"
    ];
    for(const definition of tables) await query('CREATE TABLE '+definition);
    const migration=readFileSync(new URL('../../../../database/migrations/1865_registration_service_audience.sql',import.meta.url),'utf8');
    for(const statement of migration.split(';').filter(s=>s.trim())) await db.query(statement);
    await query("INSERT INTO agencies(id,name,organization_type) VALUES (1,'Agency','agency'),(2,'Other','agency'),(10,'School','school'),(20,'Parent Child Partnership','program'),(21,'Learning center','learning'),(22,'Other program','program')");
    await query('INSERT INTO organization_affiliations VALUES (1,10,1),(1,20,1),(1,21,1),(2,22,1)');
    await query('INSERT INTO clients(id,agency_id,organization_id) VALUES (11,1,20),(12,1,10),(13,2,22)');
    await query('INSERT INTO client_organization_assignments(client_id,organization_id,is_primary,is_active) VALUES (11,10,0,1),(11,20,1,1),(11,21,0,1),(13,22,1,1)');
    await query('INSERT INTO client_provider_assignments VALUES (11,10,50,1),(11,20,51,1)');
    await query("INSERT INTO learning_program_classes(id,organization_id,class_name,status,registration_eligible) VALUES (30,21,'Old class','active',1),(31,21,'Scheduled','active',1),(32,21,'Unused credit','active',1)");
    await query("INSERT INTO learning_class_sessions VALUES (31,'scheduled','2099-09-01','2099-09-01')");
    await query("INSERT INTO learning_class_client_memberships(learning_class_id,client_id,membership_status) VALUES (30,11,'active')");
    await query('INSERT INTO learning_class_provider_memberships VALUES (30,55)');
    await query("INSERT INTO booking_packages VALUES (60,1,NULL,'Class pack')");
    await query("INSERT INTO booking_package_entitlements(id,agency_id,learning_program_class_id,client_id,package_id,status,payment_status,sessions_remaining,purchaser_user_id) VALUES (70,1,32,11,60,'ACTIVE','PAID',1,91)");
    await query("INSERT INTO company_events(id,agency_id,organization_id,title,is_active,registration_eligible) VALUES(40,1,10,'Skill Builders',1,1),(41,1,20,'Old event',1,1),(42,2,22,'Other event',1,1)");
    await query("INSERT INTO skills_groups VALUES (7,40,1,10,'2025-04-01')");
    await query("INSERT INTO skills_group_clients(skills_group_id,client_id) VALUES (7,11)");
  });
  afterAll(async()=>{db?.release(); await state.pool?.end(); if(server){await server.query(`DROP DATABASE IF EXISTS ${database}`);await server.end();}});
  it('previews exceptions and retires only past programs, preserving school, providers, roster history and other agencies',async()=>{
    const preview=await retireLegacyPrograms(db,1);
    expect(preview.counts).toEqual({programEnrollments:1,classes:1,events:2});
    expect(preview.conflicts.map(c=>c.id).sort()).toEqual([31,32]);
    expect((await query('SELECT COUNT(*) n FROM client_program_retired_offerings'))[0].n).toBe(0);
    await retireLegacyPrograms(db,1,{apply:true});
    expect(await query('SELECT * FROM family_receivables')).toEqual([]);
    expect(await query('SELECT organization_id FROM clients WHERE id=11')).toEqual([{organization_id:1}]);
    expect((await query('SELECT organization_id,is_active FROM client_organization_assignments WHERE client_id=11 ORDER BY organization_id')).map(r=>[r.organization_id,r.is_active])).toEqual([[10,1],[20,0],[21,1]]);
    expect((await query('SELECT COUNT(*) n FROM client_provider_assignments WHERE is_active=1'))[0].n).toBe(2);
    expect((await query('SELECT COUNT(*) n FROM learning_class_provider_memberships'))[0].n).toBe(1);
    expect((await query('SELECT is_active FROM company_events WHERE id=42'))[0].is_active).toBe(1);
    expect((await programParticipation(11,1,db)).filter(r=>r.period==='past').map(r=>r.name).sort()).toEqual(['Old class','Parent Child Partnership','Skill Builders']);
    await query("UPDATE learning_program_classes SET status='active',registration_eligible=1 WHERE id=30");
    await query("UPDATE learning_class_client_memberships SET membership_status='active' WHERE learning_class_id=30");
    await query("UPDATE client_organization_assignments SET is_active=1 WHERE client_id=11 AND organization_id=20");
    expect((await retireLegacyPrograms(db,1,{apply:true})).counts).toEqual({programEnrollments:0,classes:0,events:0});
    expect((await programParticipation(11,1,db)).filter(r=>r.id===30).map(r=>r.period).sort()).toEqual(['current','past']);
    expect(await programParticipation(11,2,db)).toEqual([]);
    await query("INSERT INTO learning_program_classes(id,organization_id,class_name,status,registration_eligible) VALUES (38,21,'Previously closed','closed',0)");
    await query("INSERT INTO family_receivables(agency_id,source_type,source_key,status) VALUES (1,'class_registration','38:11','review')");
    expect((await retireLegacyPrograms(db,1)).conflicts.find(c=>c.id===38)?.reasons).toContain('Registration payment or fulfillment pending');
    await query("UPDATE family_receivables SET status='void' WHERE source_key='38:11'");
    expect((await retireLegacyPrograms(db,1)).conflicts.some(c=>c.id===38)).toBe(false);
  });
  it('enrolls on event and staff-facing rosters without creating a school or provider assignment',async()=>{
    await query("INSERT INTO company_events(id,agency_id,organization_id,title,is_active,registration_eligible) VALUES(50,1,10,'New group',1,1)");
    await query("INSERT INTO skills_groups VALUES (8,50,1,10,'2099-01-01')");
    const args={agencyId:1,clientIds:[12],eventId:50,actorUserId:91};
    await Promise.all([enrollClientsInCompanyEvent(args),enrollClientsInCompanyEvent(args)]);
    expect(await query('SELECT is_active,enrolled_by_user_id FROM company_event_clients WHERE company_event_id=50')).toEqual([{is_active:1,enrolled_by_user_id:91}]);
    expect(await query('SELECT client_id FROM skills_group_clients WHERE skills_group_id=8')).toEqual([{client_id:12}]);
    expect(await query('SELECT * FROM client_organization_assignments WHERE client_id=12')).toEqual([]);
    expect(await query('SELECT * FROM client_provider_assignments WHERE client_id=12')).toEqual([]);
    expect((await enrollClientsInCompanyEvent({...args,clientIds:[13]})).ok).toBe(false);
  });
  it('prices a future series from its published sessions, respects consent to the displayed total, and fulfills on payment',async()=>{
    await query("INSERT INTO company_events(id,agency_id,organization_id,title,is_active,registration_eligible,cash_eligible,program_cost_billing_mode,per_session_cost_dollars) VALUES(51,1,20,'New series',1,1,1,'per_session',20)");
    await query("INSERT INTO company_event_session_dates VALUES (51,'2099-01-03','2099-01-03 12:00'),(51,'2099-01-10','2099-01-10 12:00')");
    const args={agencyId:1,eventId:51,clientIds:[12],actorUserId:91,payerType:'cash',allowCheckout:true};
    expect((await enrollClientsInCompanyEvent({...args,expectedPriceCents:2000})).ok).toBe(false);
    expect((await enrollClientsInCompanyEvent({...args,expectedPriceCents:4000})).results[0].orderStatus).toBe('open');
    expect(await query('SELECT * FROM company_event_clients WHERE company_event_id=51')).toEqual([]);
    await enrollClientsInCompanyEvent({...args,paidOrder:true});
    expect(await query('SELECT client_id FROM company_event_clients WHERE company_event_id=51')).toEqual([{client_id:12}]);
  });
  it('records a paid registration only after settlement or an exact-class credit and debits that credit once',async()=>{
    await query("UPDATE learning_program_classes SET cash_eligible=1,registration_price_cents=2000 WHERE id IN (31,32)");
    const args={classId:32,clientId:11,agencyId:1,actorUserId:91,portalRegistration:true,payerType:'cash'};
    await expect(LearningProgramClass.addClientMember({...args,creditId:70,classId:31})).rejects.toThrow('credit');
    await expect(LearningProgramClass.addClientMember({...args,creditId:70,actorUserId:92})).rejects.toThrow('Payer');
    await Promise.all([1,2].map(()=>LearningProgramClass.addClientMember({...args,creditId:70})));
    expect(await query('SELECT sessions_remaining,status FROM booking_package_entitlements WHERE id=70')).toEqual([{sessions_remaining:0,status:'EXHAUSTED'}]);
    expect((await query('SELECT COUNT(*) n FROM booking_package_ledger'))[0].n).toBe(1);
    const pay={...args,classId:31,allowCheckout:true,expectedPriceCents:2000};
    const order=await LearningProgramClass.addClientMember(pay);
    expect(order.orderStatus).toBe('open');
    expect(await query('SELECT * FROM learning_class_client_memberships WHERE learning_class_id=31')).toEqual([]);
    await expect(LearningProgramClass.addClientMember({...pay,creditId:70})).rejects.toThrow('balance');
    await LearningProgramClass.addClientMember({...pay,paidOrder:true});
    expect(await query('SELECT membership_status FROM learning_class_client_memberships WHERE learning_class_id=31')).toEqual([{membership_status:'active'}]);
  });
});
