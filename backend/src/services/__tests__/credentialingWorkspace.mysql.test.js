import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {it,expect} from 'vitest';
import {credentialingWorkspace,saveCredentialingWorkflow} from '../credentialingWorkspace.service.js';

// Opt-in, disposable local schemas only. No production configuration is read.
it.skipIf(process.env.CREDENTIAL_WORKSPACE_MYSQL_TEST!=='1')('isolates tenant credentialing and serializes concurrent first saves against real MySQL',async()=>{
  const admin=await mysql.createConnection({socketPath:'/private/tmp/coverage-mysql.sock',user:'root',multipleStatements:true});
  const schema='credentialing_workspace_test';
  let main;
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${schema}; CREATE DATABASE ${schema}; USE ${schema};`);
    await admin.query(`
      CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(100),slug VARCHAR(100),logo_url VARCHAR(255),color_palette JSON,is_active BOOLEAN DEFAULT 1,organization_type VARCHAR(20) DEFAULT 'agency');
      CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(50),last_name VARCHAR(50));
      CREATE TABLE user_agencies(user_id INT,agency_id INT,has_department_access BOOLEAN);
      CREATE TABLE office_locations(id INT PRIMARY KEY,agency_id INT,name VARCHAR(100),street_address VARCHAR(100),city VARCHAR(100),state VARCHAR(10));
      CREATE TABLE user_info_field_definitions(id INT PRIMARY KEY,field_key VARCHAR(100),agency_id INT);
      CREATE TABLE user_info_values(id INT PRIMARY KEY,user_id INT,field_definition_id INT,value TEXT,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE claimmd_enrollments(agency_id INT,connection_id VARCHAR(100),payer_id VARCHAR(32),provider_npi VARCHAR(20),billing_office_location_id INT,enrollment_type VARCHAR(20),status VARCHAR(30),last_event_at TIMESTAMP NULL);
      CREATE TABLE clinical_sessions(id BIGINT PRIMARY KEY,agency_id INT,provider_user_id INT);
      CREATE TABLE clinical_claims(id BIGINT PRIMARY KEY,clinical_session_id BIGINT,agency_id INT,destination_payer_id VARCHAR(32),billing_npi VARCHAR(20),claim_lifecycle VARCHAR(40),is_deleted BOOLEAN DEFAULT 0);
    `);
    for(const file of ['534_credentialing_overhaul_foundation.sql','1012_agency_group_npis_and_payer_credentialing.sql','1496_credentialing_workspace.sql'])await admin.query(await readFile(new URL(`../../../../database/migrations/${file}`,import.meta.url),'utf8'));
    // Existing 916 migration adds this operational date along with unrelated seed data.
    await admin.query('ALTER TABLE user_insurance_credentialing ADD COLUMN returned_date DATE NULL');
    await admin.query(`
      INSERT INTO agencies(id,name) VALUES (1,'Synthetic Agency One'),(2,'Synthetic Agency Two');
      INSERT INTO users VALUES (9,'Synthetic','Credentialer'),(10,'Synthetic','Provider');
      INSERT INTO insurance_credentialing_definitions(id,agency_id,name) VALUES (11,1,'Synthetic Payer'),(12,2,'Synthetic Payer');
      INSERT INTO user_insurance_credentialing(id,user_id,insurance_credentialing_definition_id,effective_date) VALUES (21,10,11,'2024-09-15'),(22,10,12,'2024-09-15');
      INSERT INTO office_locations(id,agency_id,name) VALUES (1,1,'Office One'),(2,2,'Office Two');
      INSERT INTO agency_group_npis(id,agency_id,npi_number,office_location_id) VALUES (31,1,'1234567893',1),(32,2,'1234567893',2);
      INSERT INTO agency_group_npi_payer_credentialing(id,agency_group_npi_id,insurance_credentialing_definition_id) VALUES (41,31,11),(42,32,12);
      INSERT INTO user_info_field_definitions VALUES (1,'provider_identity_npi_number',NULL),(2,'provider_identity_npi_number',2);
      INSERT INTO user_info_values(id,user_id,field_definition_id,value) VALUES (1,10,1,'1111111111'),(2,10,2,'2222222222');
      INSERT INTO claimmd_enrollments VALUES (1,'account:current','SYNTH','1234567893',1,'era','requested',NULL),(1,'account:old','SYNTH','1234567893',1,'era','approved',NULL),(2,'account:current','SYNTH','1234567893',2,'era','approved',NULL);
      INSERT INTO clinical_sessions VALUES (51,1,10),(52,2,10);
      INSERT INTO clinical_claims(id,clinical_session_id,agency_id,destination_payer_id,billing_npi,claim_lifecycle) VALUES (61,51,1,'SYNTH','1234567893','rejected'),(62,52,2,'SYNTH','1234567893','paid'),(63,51,1,NULL,'1234567893','ready');
    `);
    main=mysql.createPool({socketPath:'/private/tmp/coverage-mysql.sock',user:'root',database:schema,connectionLimit:8});
    const d={main,clinical:main,grants:async()=>[1],expand:async x=>x,billing:async()=>false,connectionMeta:async()=>({configured:true,accountId:'current'})};
    const user={id:9,role:'staff'},input={version:0,status:'active',billingGroupNpiId:31,evidenceReference:'Synthetic payer letter'};
    const results=await Promise.allSettled(Array.from({length:5},()=>saveCredentialingWorkflow(user,1,'provider',21,input,d)));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected').every(r=>r.reason.status===409)).toBe(true);
    await saveCredentialingWorkflow(user,1,'payer',11,{version:0,payerId:'SYNTH',evidenceReference:'Synthetic directory'},d);
    await expect(saveCredentialingWorkflow(user,1,'provider',22,input,d)).rejects.toMatchObject({status:404});
    await expect(saveCredentialingWorkflow(user,1,'provider',21,{...input,version:1,billingGroupNpiId:32},d)).rejects.toMatchObject({status:400});
    const workspace=await credentialingWorkspace(user,{},d);
    expect(workspace.organizations.map(a=>a.id)).toEqual([1]);expect(workspace.records).toHaveLength(2);
    expect(workspace.records.find(r=>r.subjectType==='provider')).toMatchObject({providerNpi:'1111111111',status:'active',version:1});
    expect(workspace.enrollments).toHaveLength(1);expect(workspace.enrollments[0].status).toBe('requested');
    expect(workspace.claimCounts).toHaveLength(1);expect(workspace.claimCounts[0]).toMatchObject({status:'rejected',count:1,agencyId:1});
    const [[audit]]=await main.query('SELECT COUNT(*) AS count FROM credentialing_workflow_events');expect(audit.count).toBe(2);
    await expect(credentialingWorkspace(user,{agencyId:2},d)).rejects.toMatchObject({status:403});
  } finally {await main?.end();await admin.query(`DROP DATABASE IF EXISTS ${schema}`);await admin.end();}
},30000);
