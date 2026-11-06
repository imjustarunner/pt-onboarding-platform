import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { splitSqlStatements } from '../../../../database/migrationSqlUtils.js';
import { AGENCY_ACCESS_FIELDS } from '../../utils/agencyAccessPolicy.js';

test('agency access migration and platform/company boundaries on isolated MySQL', {skip:!process.env.AGENCY_ACCESS_TEST_SOCKET}, async t=>{
  assert.match(process.env.AGENCY_ACCESS_TEST_SOCKET,/^\/private\/tmp\/agency-access-[\w-]+\.sock$/);
  const options={socketPath:process.env.AGENCY_ACCESS_TEST_SOCKET,user:'root'};
  const setup=await mysql.createConnection(options);
  let pool;
  try {
    await setup.query('DROP DATABASE IF EXISTS agency_access_test');
    await setup.query('CREATE DATABASE agency_access_test');await setup.query('USE agency_access_test');
    const scoped=new Set(['has_payroll_access','has_billing_access','has_department_access','can_manage_credentialing','is_marketing_contact']);
    const global=AGENCY_ACCESS_FIELDS.filter(f=>!scoped.has(f.key)).map(f=>`${f.key} BOOLEAN DEFAULT 0`).join(',');
    await setup.query(`CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(40),last_name VARCHAR(40),email VARCHAR(100),role VARCHAR(64),status VARCHAR(40) DEFAULT 'ACTIVE_EMPLOYEE',is_active BOOLEAN DEFAULT 1,is_archived BOOLEAN DEFAULT 0,is_assistant_account BOOLEAN DEFAULT 0,has_platform_support BOOLEAN DEFAULT 0,has_platform_gear_access BOOLEAN DEFAULT 0,${global})`);
    await setup.query("CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(100),slug VARCHAR(100),portal_url VARCHAR(100),organization_type VARCHAR(30) DEFAULT 'agency',is_active BOOLEAN DEFAULT 1,is_archived BOOLEAN DEFAULT 0,color_palette JSON,feature_flags JSON,icon_id INT,logo_url VARCHAR(255),logo_path VARCHAR(255))");
    await setup.query('CREATE TABLE organization_affiliations(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,organization_id INT,is_active BOOLEAN DEFAULT 1)');
    await setup.query('CREATE TABLE icons(id INT PRIMARY KEY,file_path VARCHAR(255))');
    await setup.query('CREATE TABLE agency_billing_management(agency_id INT,manager_agency_id INT,is_active BOOLEAN DEFAULT 1,PRIMARY KEY(agency_id,manager_agency_id))');
    await setup.query(`CREATE TABLE user_agencies(user_id INT,agency_id INT,agency_role VARCHAR(64),is_active BOOLEAN DEFAULT 1,${[...scoped].map(f=>`${f} BOOLEAN DEFAULT 0`).join(',')},PRIMARY KEY(user_id,agency_id))`);
    await setup.query("INSERT INTO users(id,first_name,last_name,email,role,has_hiring_access) VALUES (1,'Global','Admin','root@test','super_admin',1),(2,'Platform','Employee','employee@test','provider',1),(3,'Support','Employee','support@test','support',1),(4,'Company','Admin','admin@test','provider',0),(476,'Dayana','Example','dayana@test','provider',1)");
    await setup.query("INSERT INTO agencies(id,name,slug) VALUES(1,'PlotTwistCo','plottwistco'),(2,'ITSCO','itsco'),(6,'Next Level Up','nlu')");
    await setup.query("INSERT INTO user_agencies(user_id,agency_id,agency_role,has_payroll_access) VALUES(2,1,NULL,0),(2,2,NULL,1),(3,2,NULL,0),(4,2,'admin',0),(476,2,NULL,0)");
    await setup.query("INSERT INTO agencies(id,name,slug) VALUES(7,'Legacy affiliated practice','legacy')");
    await setup.query('INSERT INTO organization_affiliations(agency_id,organization_id) VALUES(2,7)');
    await setup.query('UPDATE user_agencies SET can_manage_credentialing=1 WHERE user_id=2 AND agency_id=2');
    const before=await setup.query('SELECT * FROM user_agencies ORDER BY user_id,agency_id');
    const migration=await fs.readFile(new URL('../../../../database/migrations/1771_user_agency_access_profiles.sql',import.meta.url),'utf8');
    for(const sql of splitSqlStatements(migration)) await setup.query(sql);
    pool=mysql.createPool({...options,database:'agency_access_test',connectionLimit:2});
    Object.assign(process.env,{SKIP_DB_CONNECT:'1',DB_HOST:options.socketPath,DB_USER:'root',DB_PASSWORD:'',DB_NAME:'agency_access_test'});
    const service=await import('../agencyAccessProfiles.service.js');
    const {hiringAssigneesForAgency}=await import('../hiringAssignees.service.js');
    const {activateAgencyAccessProfiles}=await import('../agencyAccessTransitionAudit.service.js');
    await t.test('migration preserves every affiliation and grant, and starts with no platform defaults',async()=>{
      assert.deepEqual((await setup.query('SELECT * FROM user_agencies ORDER BY user_id,agency_id'))[0],before[0]);
      assert.equal((await setup.query('SELECT COUNT(*) AS n FROM user_agency_access_profiles'))[0][0].n,6);
      assert.equal(await service.accessProfileSchemaReady(pool),false);
      assert.equal((await service.platformAccessDefaults(2,pool)),null);
    });
    await t.test('cutover reconciles last-minute legacy changes before enabling enforcement',async()=>{
      await setup.query('UPDATE users SET has_outreach_access=1 WHERE id=2');
      const result=await activateAgencyAccessProfiles(setup,{expectedDatabase:'agency_access_test',actorUserId:1});
      assert.equal(result.report.ok,true);assert.equal(result.report.memberships,5);
      assert.equal((await service.readAgencyAccess(2,2,pool)).permissions.has_outreach_access,true);
      assert.equal((await service.readAgencyAccess(2,7,pool)).permissions.can_manage_credentialing,true);
      assert.equal(await service.readAgencyAccess(2,6,pool),null);
      assert.equal(await service.accessProfileSchemaReady(pool),true);
    });
    await t.test('a support employee cannot grant finance or hiring permissions',async()=>{
      await assert.rejects(service.saveAgencyAccess({actorUserId:3,userId:2,agencyId:2,input:{revision:1,permissions:{has_billing_access:true}}},pool),{status:403});
    });
    await t.test('only a superadmin can select defaults, and only for an active PlotTwistCo employee',async()=>{
      await assert.rejects(service.savePlatformAccessDefaults({actorUserId:4,userId:2,input:{revision:0,enabled:true}},pool),{status:403});
      await assert.rejects(service.savePlatformAccessDefaults({actorUserId:1,userId:476,input:{revision:0,enabled:true}},pool),{status:403});
    });
    await t.test('a selected platform hiring default reaches an unaffiliated company without creating a clinical membership',async()=>{
      await service.savePlatformAccessDefaults({actorUserId:1,userId:2,input:{revision:0,enabled:true,permissions:{has_hiring_access:true}}},pool);
      assert.equal((await service.readAgencyAccess(2,6,pool)).permissions.has_hiring_access,true);
      assert.equal((await setup.query('SELECT COUNT(*) AS n FROM user_agencies WHERE user_id=2 AND agency_id=6'))[0][0].n,0);
      assert.ok((await hiringAssigneesForAgency(6,pool)).some(p=>p.id===2));
      assert.ok(!(await hiringAssigneesForAgency(6,pool)).some(p=>p.id===476));
    });
    await t.test('local Off wins; returning to Inherit restores the platform default',async()=>{
      let current=await service.readAgencyAccess(2,6,pool);
      current=await service.saveAgencyAccess({actorUserId:1,userId:2,agencyId:6,input:{revision:current.revision,permissions:{has_hiring_access:false}}},pool);
      assert.equal(current.permissions.has_hiring_access,false);
      assert.ok(!(await hiringAssigneesForAgency(6,pool)).some(p=>p.id===2));
      assert.equal((await service.readAgencyAccess(2,2,pool)).permissions.has_hiring_access,true);
      current=await service.saveAgencyAccess({actorUserId:1,userId:2,agencyId:6,input:{revision:current.revision,permissions:{has_hiring_access:null}}},pool);
      assert.equal(current.permissions.has_hiring_access,true);
      await assert.rejects(service.saveAgencyAccess({actorUserId:1,userId:2,agencyId:6,input:{revision:1,permissions:{has_hiring_access:false}}},pool),{status:409});
    });
    await t.test('selected defaults also reach a newly added company',async()=>{
      await setup.query("INSERT INTO agencies(id,name,slug) VALUES(8,'New practice','practice')");
      assert.ok((await hiringAssigneesForAgency(8,pool)).some(p=>p.id===2));
      assert.equal((await setup.query('SELECT COUNT(*) AS n FROM user_agencies WHERE user_id=2 AND agency_id=8'))[0][0].n,0);
    });
    await t.test('a company administrator can manage only that company and edits are audited',async()=>{
      const current=await service.readAgencyAccess(2,2,pool);
      await service.saveAgencyAccess({actorUserId:4,userId:2,agencyId:2,input:{revision:current.revision,permissions:{has_billing_access:true}}},pool);
      await assert.rejects(service.saveAgencyAccess({actorUserId:4,userId:2,agencyId:6,input:{revision:1,permissions:{has_billing_access:true}}},pool),{status:403});
      assert.equal((await setup.query('SELECT has_billing_access FROM user_agencies WHERE user_id=2 AND agency_id=2'))[0][0].has_billing_access,1);
      assert.ok((await setup.query('SELECT COUNT(*) AS n FROM user_agency_access_audit'))[0][0].n>=4);
    });
    await t.test('disabling defaults removes virtual access and preserves original affiliation grants',async()=>{
      await service.savePlatformAccessDefaults({actorUserId:1,userId:2,input:{revision:1,enabled:false}},pool);
      assert.equal(await service.readAgencyAccess(2,6,pool),null);
      assert.equal((await service.readAgencyAccess(2,2,pool)).permissions.has_payroll_access,true);
    });
    await t.test('removing PlotTwistCo eligibility suspends all inherited access and services, and preserves company overrides',async()=>{
      await service.savePlatformAccessDefaults({actorUserId:1,userId:2,input:{revision:2,enabled:true,permissions:{has_payroll_access:true},platformServices:{has_platform_support:true}}},pool);
      let current=await service.readAgencyAccess(2,6,pool);
      await service.saveAgencyAccess({actorUserId:1,userId:2,agencyId:6,input:{revision:current.revision,permissions:{has_hiring_access:false}}},pool);
      assert.ok((await service.agencyIdsWithPermission(2,'has_payroll_access',pool)).includes(6));
      await service.changePlatformAffiliation(2,{active:false},pool);
      assert.equal(await service.readAgencyAccess(2,6,pool),null);
      assert.ok(!(await service.agencyIdsWithPermission(2,'has_payroll_access',pool)).includes(6));
      assert.equal((await setup.query('SELECT has_platform_support FROM users WHERE id=2'))[0][0].has_platform_support,0);
      assert.equal((await service.readAgencyAccess(2,2,pool)).permissions.has_payroll_access,true);
      await service.changePlatformAffiliation(2,{active:true},pool);
      current=await service.readAgencyAccess(2,6,pool);
      assert.equal(current.permissions.has_payroll_access,true);
      assert.equal(current.permissions.has_hiring_access,false);
      assert.equal((await setup.query('SELECT has_platform_support FROM users WHERE id=2'))[0][0].has_platform_support,1);
    });
    await t.test('managed billing survives the transition and a local denial can suspend it',async()=>{
      await setup.query('INSERT INTO agency_billing_management(agency_id,manager_agency_id) VALUES(8,2)');
      let current=await service.readAgencyAccess(3,2,pool);
      await service.saveAgencyAccess({actorUserId:1,userId:3,agencyId:2,input:{revision:current.revision,permissions:{has_billing_access:true}}},pool);
      current=await service.readAgencyAccess(3,8,pool);
      assert.equal(current.financialAccessOnly,true);assert.equal(current.role,'support');
      assert.equal(current.permissions.has_billing_access,true);assert.equal(current.permissions.has_hiring_access,false);
      current=await service.saveAgencyAccess({actorUserId:1,userId:3,agencyId:8,input:{revision:current.revision,permissions:{has_billing_access:false}}},pool);
      assert.equal(current.permissions.has_billing_access,false);
      assert.deepEqual(await service.filterBillingAgencyOverrides(3,[2,8],pool),[2]);
    });
  } finally {if(pool)await pool.end();await setup.end();await (await import('../../config/database.js')).default.end();}
});
