import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args)}}));
vi.mock('../../models/IntakeSubmission.model.js',()=>({default:{findById:vi.fn(async()=>{throw new Error('Private enrollment answers must not be read for an active linked requester.');})}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:async id=>(await state.db.execute('SELECT id,agency_id,full_name,initials FROM clients WHERE id=?',[id]))[0][0]}}));
import {requestingGuardianContext} from '../coGuardianRequestOrigin.service.js';

describe.skipIf(!recoveryMysqlEnabled)('guardian invitation origin with actual mixed-collation MySQL',()=>{
 let fixture;
 beforeAll(async()=>{
  fixture=await isolatedWorkflowMysql('guardian_request_origin');state.db=fixture.db;
  const statements=[
   `CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(64),last_name VARCHAR(64),email VARCHAR(255),role VARCHAR(32))`,
   `CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,full_name VARCHAR(128),initials VARCHAR(32))`,
   `CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,access_enabled TINYINT)`,
   `CREATE TABLE intake_links(public_key VARCHAR(80) COLLATE utf8mb4_0900_ai_ci,language_code VARCHAR(8))`,
   `CREATE TABLE co_guardian_invites(id INT PRIMARY KEY,agency_id INT,invited_by_user_id INT,requesting_submission_id INT,public_key VARCHAR(80) COLLATE utf8mb4_unicode_ci)`,
   `CREATE TABLE co_guardian_invite_clients(invite_id INT,client_id INT)`,
   `INSERT INTO users VALUES(9,'Fictional','Parent','testing+origin@example.com','client_guardian')`,
   `INSERT INTO clients VALUES(5,450,'Fictional Child One','FCO'),(6,450,'Fictional Child Two','FCT'),(7,999,'Other agency child','OAC')`,
   `INSERT INTO client_guardians VALUES(5,9,1),(6,9,1)`,
   `INSERT INTO intake_links VALUES('form-en','en'),('form-es','es')`,
   `INSERT INTO co_guardian_invites VALUES(35,450,9,NULL,'form-en'),(36,450,9,NULL,'form-es')`,
   `INSERT INTO co_guardian_invite_clients VALUES(35,5),(35,6),(35,7),(36,5)`
  ];
  for(const sql of statements)await state.db.query(sql);
 });
 afterAll(async()=>{if(fixture)await fixture.close();});
 it('reproduces the actual uncollated lookup failure before any invitation transport',async()=>{
  await expect(state.db.query('SELECT i.id FROM co_guardian_invites i LEFT JOIN intake_links l ON l.public_key=i.public_key WHERE i.id=35'))
   .rejects.toMatchObject({code:'ER_CANT_AGGREGATE_2COLLATIONS',errno:1267});
 });
 it.each([[35,'en'],[36,'es']])('resolves the active requester and packet locale for invitation%s',async(inviteId,locale)=>{
  const result=await requestingGuardianContext({inviteId,agencyId:450,clientId:5});
  expect(result).toMatchObject({name:'Fictional Parent',locale});
  expect(result.clientNames).not.toContain('Other agency child');
  if(inviteId===35)expect(result.clientNames).toEqual(['Fictional Child One','Fictional Child Two']);
 });
 it('cannot borrow requester context from another child or agency',async()=>{
  expect(await requestingGuardianContext({inviteId:35,agencyId:999,clientId:5})).toBeNull();
  expect(await requestingGuardianContext({inviteId:35,agencyId:450,clientId:7})).toBeNull();
  expect(await requestingGuardianContext({inviteId:35,agencyId:450,clientId:88})).toBeNull();
 });
});
