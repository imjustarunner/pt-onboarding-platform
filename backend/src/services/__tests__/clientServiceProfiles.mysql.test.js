import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {assignmentServicesForProviders,requireAssignmentService} from '../providerServiceOfferings.service.js';
import {inventoryClientServiceGroups} from '../clientServiceGroupInventory.service.js';
vi.mock('../../config/database.js',()=>({default:{}}));

const socketPath=process.env.HUB_SCOPE_MYSQL_SOCKET;
describe.skipIf(!socketPath)('client service inventory and provider assignments on MySQL',()=>{
  const database=`client_service_profiles_test_${process.pid}`;
  let db;
  beforeAll(async()=>{
    db=await mysql.createConnection({socketPath,user:'root'});
    await db.query(`CREATE DATABASE ${database}`);
    await db.query(`USE ${database}`);
    for (const sql of [
      'CREATE TABLE users(id INT,role VARCHAR(32),status VARCHAR(32),credential VARCHAR(32),sees_clients INT,has_provider_access INT,is_active INT,is_archived INT)',
      'CREATE TABLE user_agencies(user_id INT,agency_id INT,agency_role VARCHAR(32),is_active INT)',
      'CREATE TABLE provider_public_profiles(user_id INT,public_details_json JSON)',
      'CREATE TABLE provider_public_service_enrollments(user_id INT,agency_id INT,service_type VARCHAR(32),is_active INT)',
      'CREATE TABLE agencies(id INT PRIMARY KEY,organization_type VARCHAR(32),slug VARCHAR(80),name VARCHAR(80),feature_flags JSON)',
      'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,organization_id INT)',
      'CREATE TABLE client_agency_assignments(client_id INT,agency_id INT,is_active INT)',
      'CREATE TABLE client_organization_assignments(client_id INT,organization_id INT,is_active INT)',
      'CREATE TABLE organization_affiliations(agency_id INT,organization_id INT,is_active INT)',
      'CREATE TABLE client_service_enrollments(client_id INT,agency_id INT,organization_id INT,is_active INT)',
      "INSERT INTO agencies VALUES(30,'clinical','counseling-and-psychotherapy-2','Counseling and Psychotherapy',NULL),(31,'program','genuine-program','Counseling and Psychotherapy',NULL),(32,'clinical','counseling-and-psychotherapy-3','Counseling and Psychotherapy',NULL),(33,'program','pcp','Parent Child Partnership',NULL)",
      'INSERT INTO clients VALUES(10,2,30),(11,2,31),(12,3,32),(13,2,30),(14,2,33)',
      'INSERT INTO organization_affiliations VALUES(2,30,1),(2,31,1),(3,32,1),(2,33,1)',
      'INSERT INTO client_agency_assignments VALUES(12,2,1)',
      'INSERT INTO client_organization_assignments VALUES(10,30,1),(13,30,0)',
      'INSERT INTO client_service_enrollments VALUES(10,2,30,1),(12,3,32,1)',
      "INSERT INTO users VALUES(20,'provider','ACTIVE','LPC',1,0,1,0),(21,'tutor','ACTIVE','',1,0,1,0),(22,'provider','ACTIVE','LPC',1,0,1,0),(23,'provider','ACTIVE','LPC',1,0,1,0),(24,'provider','ACTIVE','LPC',1,0,1,0)",
      "INSERT INTO user_agencies VALUES(20,2,NULL,1),(21,2,NULL,1),(22,2,NULL,1),(22,3,'tutor',1),(23,2,NULL,0),(24,3,NULL,1)"
    ]) await db.query(sql);
    await db.execute('INSERT INTO provider_public_profiles VALUES(22,?)',[JSON.stringify({serviceOfferingsByAgency:{2:['counseling','tutoring'],3:['tutoring']}})]);
  });
  afterAll(async()=>{if(db){try {await db.query(`DROP DATABASE IF EXISTS ${database}`);} finally {await db.end();}}});
  it('returns distinct eligible providers per agency even when none offers public booking',async()=>{
    const ids=[20,21,22,23,24];
    expect(Object.fromEntries(await assignmentServicesForProviders(2,ids,db))).toEqual({20:['counseling'],21:['tutoring'],22:['counseling','tutoring'],23:[]});
    expect(Object.fromEntries(await assignmentServicesForProviders(3,[22],db))).toEqual({22:['tutoring']});
    await expect(requireAssignmentService(2,21,'counseling',db)).rejects.toMatchObject({status:409});
    await expect(requireAssignmentService(2,22,'counseling',db)).resolves.toBeUndefined();
    await expect(requireAssignmentService(2,22,'tutoring',db)).resolves.toBeUndefined();
  });
  it('counts the seeded clinical group once per chart and sends a same-name program for review',async()=>{
    const expected=[{organizationId:30,organizationType:'clinical',charts:1,classification:'verified clinical group'},
      {organizationId:31,organizationType:'program',charts:1,classification:'review identity'}];
    expect(await inventoryClientServiceGroups(db,2)).toEqual(expected);
    expect(await inventoryClientServiceGroups(db,2)).toEqual(expected);
  });
});
