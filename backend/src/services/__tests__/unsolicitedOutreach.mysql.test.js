// A disposable CI database; directory services and email transport remain mocked.
import {describe,it,expect,vi,beforeAll,beforeEach,afterAll} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements} from '../../../../database/migrationSqlUtils.js';
const m=vi.hoisted(()=>({pool:null,send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.pool.execute(...args),getConnection:()=>m.pool.getConnection()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async id=>({id,name:'Fictional agency'})}}));
vi.mock('../../models/AgencyContact.model.js',()=>({default:{findByEmail:async()=>null}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantNoreplyMailbox:async agencyId=>({noreply:{id:40,agency_id:agencyId,is_active:1,from_email:'noreply@agency.test'}})}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import {filterUnsolicitedOutreach,sendQueuedOutreachRejections} from '../unsolicitedOutreach.service.js';
import {cleanUpWebsiteSolicitations} from '../unsolicitedOutreachCleanup.service.js';
const name=`codex_outreach_${process.pid}`;let admin;
const pitch={agencyId:2,fromEmail:'vendor@outside.test',subject:'SEO Report',bodyText:'We provide SEO services. Interested in a free audit and prices?'};
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('outreach outbox in real MySQL',()=>{
 beforeAll(async()=>{
  const options={host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:'',timezone:'+00:00'};
  admin=await mysql.createConnection(options);await admin.query(`CREATE DATABASE ${name}`);
  m.pool=mysql.createPool({...options,database:name,connectionLimit:8});
  for(const sql of [
   'CREATE TABLE agencies(id INT PRIMARY KEY)',
   'INSERT INTO agencies VALUES(2)',
   'CREATE TABLE users(id INT PRIMARY KEY,email VARCHAR(255),work_email VARCHAR(255),personal_email VARCHAR(255),is_archived BOOLEAN)',
   'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,email VARCHAR(255))',
   'CREATE TABLE client_guardians(client_id INT,guardian_user_id INT)',
   'CREATE TABLE school_contacts(id INT PRIMARY KEY,email VARCHAR(255))',
   "CREATE TABLE communication_blocked_addresses(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,address VARCHAR(255),address_kind VARCHAR(20),reason VARCHAR(500),UNIQUE KEY address_unique(agency_id,address_kind,address))",
   'CREATE TABLE support_tickets(id INT PRIMARY KEY,agency_id INT,source_channel VARCHAR(30),status VARCHAR(30),source_email_from VARCHAR(255),subject VARCHAR(255),question TEXT)'
  ])await m.pool.query(sql);
  const migration=await readFile(new URL('../../../../database/migrations/1822_unsolicited_outreach_filter.sql',import.meta.url),'utf8');
  for(const sql of splitSqlStatements(migration))await m.pool.query(sql);
 });
 beforeEach(async()=>{
  for(const table of ['unsolicited_outreach_notices','communication_blocked_addresses','support_tickets'])await m.pool.query(`TRUNCATE ${table}`);
  m.send.mockReset();m.send.mockResolvedValue({id:'accepted-1',communicationId:8});
 });
 afterAll(async()=>{await m.pool?.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}});
 it('migrates, blocks, claims and sends once through the real prepared-query path',async()=>{
  expect(await filterUnsolicitedOutreach(pitch)).toMatchObject({filtered:true,noticeQueued:true});
  expect(await sendQueuedOutreachRejections({limit:2})).toEqual([{id:1,status:'sent'}]);
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:40,replyToOverride:'noreply@agency.test'}));
  await sendQueuedOutreachRejections({limit:2});expect(m.send).toHaveBeenCalledOnce();
  const [[row]]=await m.pool.query('SELECT status,communication_id FROM unsolicited_outreach_notices');
  expect(row).toMatchObject({status:'sent',communication_id:8});
 });
 it('keeps LIMIT a bounded integer and cannot interpolate a caller SQL expression',async()=>{
  await filterUnsolicitedOutreach(pitch);
  await filterUnsolicitedOutreach({...pitch,fromEmail:'another@outside.test'});
  expect(await sendQueuedOutreachRejections({limit:1.9})).toHaveLength(1);
  expect(await sendQueuedOutreachRejections({limit:'1; DROP TABLE agencies'})).toHaveLength(1);
  const [[row]]=await m.pool.query('SELECT COUNT(*) AS n FROM agencies');expect(Number(row.n)).toBe(1);
 });
 it('previews existing website spam with prepared agency/ticket values and an integer LIMIT',async()=>{
  await m.pool.execute("INSERT INTO support_tickets VALUES(646,2,'public_web','open',?,?,?)",[pitch.fromEmail,pitch.subject,pitch.bodyText]);
  expect(await cleanUpWebsiteSolicitations({agencyId:2,ticketId:646,limit:1})).toMatchObject({dryRun:true,scanned:1,matches:[{ticketId:646,category:'seo',action:'would_close_and_block'}]});
  const [[row]]=await m.pool.query('SELECT COUNT(*) AS n FROM unsolicited_outreach_notices');expect(Number(row.n)).toBe(0);
 });
});
