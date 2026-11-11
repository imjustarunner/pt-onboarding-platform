import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';
import { listFamilySecureHistory } from '../familySecureHistory.service.js';
import { familyMessageVisibilitySql, canReadFamilySecureMessage, assertCanReadFamilySecureMessage } from '../familySecureMessageAccess.service.js';

const migration = name => new URL(`../../../../database/migrations/${name}`, import.meta.url);
describe.skipIf(!recoveryMysqlEnabled)('historical secure message audience on actual MySQL', () => {
  let fixture, db;
  beforeAll(async () => {
    fixture = await isolatedWorkflowMysql('family_history'); db = fixture.db;
    // Referenced parent tables are intentionally minimal. Message/membership
    // timestamps, JSON and reply foreign keys come from deployed migrations.
    for (const table of ['users','agencies','clients']) await db.query(`CREATE TABLE ${table}(id INT PRIMARY KEY)`);
    for (const name of ['137_create_platform_chat_and_presence.sql','1000_chat_reply_threads_and_mentions.sql']) {
      const source = await readFile(migration(name),'utf8');
      for (const sql of source.split(';').map(s=>s.trim()).filter(Boolean)) await db.query(sql);
    }
    await db.query("ALTER TABLE users ADD role VARCHAR(50),ADD first_name VARCHAR(50),ADD last_name VARCHAR(50)");
    await db.query(await readFile(migration('281_chat_threads_add_organization_id.sql'),'utf8'));
    await db.query("ALTER TABLE chat_threads ADD client_id INT NULL,ADD service_enrollment_id BIGINT NOT NULL DEFAULT 0");
    await db.query("ALTER TABLE chat_threads ADD message_channel ENUM('internal','secure') NOT NULL DEFAULT 'internal'");
    const secureSource = await readFile(migration('1556_secure_message_boundaries.sql'),'utf8');
    const recordTable = secureSource.match(/CREATE TABLE client_secure_message_records[\s\S]*?;/)?.[0];
    expect(recordTable).toBeTruthy(); await db.query(recordTable);
    await db.query(await readFile(migration('1794_family_shared_conversations.sql'),'utf8'));
    const dependentSource=await readFile(migration('1687_dependent_portal_access.sql'),'utf8');
    await db.query(dependentSource.match(/CREATE TABLE IF NOT EXISTS dependent_portal_threads[\s\S]*?;/)[0]);
    await db.query('CREATE TABLE chat_message_deletes(message_id INT,user_id INT)');
    await db.query('CREATE TABLE chat_message_attachments(id INT PRIMARY KEY,message_id INT,original_filename VARCHAR(100))');
    await db.query("INSERT INTO users(id,role,first_name) VALUES(1,'provider','Provider'),(2,'client_guardian','Original parent'),(3,'client_guardian','New parent'),(4,'client_guardian','Unrelated'),(5,'provider','Other provider')");
    await db.query('INSERT INTO agencies VALUES(450),(451);');
    await db.query('INSERT INTO clients VALUES(10),(11);');
  });
  afterAll(async () => { if(fixture) await fixture.close(); });
  beforeEach(async () => {
    await db.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of ['chat_messages','chat_thread_participants','chat_threads','client_secure_message_records','family_shared_conversations','chat_message_attachments']) await db.query(`TRUNCATE ${table}`);
    await db.query('SET FOREIGN_KEY_CHECKS=1');
    await db.query("INSERT INTO chat_threads(id,agency_id,message_channel) VALUES(100,450,'secure'),(200,450,'internal'),(300,450,'secure')");
    await db.query("INSERT INTO chat_thread_participants(thread_id,user_id,created_at) VALUES(100,1,'2026-11-10 08:00:00'),(100,2,'2026-11-10 08:00:00'),(100,3,'2026-11-11 08:00:00'),(200,3,'2026-11-11 08:00:00'),(300,1,'2026-11-10 08:00:00'),(300,3,'2026-11-10 08:00:00')");
    await db.query("INSERT INTO chat_messages(id,thread_id,sender_user_id,body,created_at) VALUES(1000,100,1,'older family message','2026-11-10 09:00:00'),(1001,100,2,'legacy without audience','2026-11-10 10:00:00'),(1002,100,1,'current message','2026-11-11 09:00:00'),(2000,200,1,'ordinary internal chat','2026-11-10 09:00:00'),(3000,300,1,'mapped history','2026-11-10 09:00:00')");
    await db.execute('INSERT INTO client_secure_message_records(agency_id,client_id,thread_id,message_id,sender_user_id,audience_json) VALUES(450,10,100,1000,1,?),(450,10,100,1002,1,?)', [JSON.stringify([{id:1,name:'Provider'},{id:2,name:'Original parent'}]), JSON.stringify([{id:1},{id:2},{id:3}])]);
  });
  const ids = async uid => (await db.query(`SELECT m.id FROM chat_messages m JOIN chat_thread_participants p ON p.thread_id=m.thread_id AND p.user_id=? WHERE ${familyMessageVisibilitySql(uid)} ORDER BY m.id`,[uid]))[0].map(r=>r.id);
  it('new parent sees current addressed messages without inheriting earlier body or legacy history', async () => {
    expect(await ids(3)).toEqual([1002,2000,3000]);
    expect(await canReadFamilySecureMessage({userId:3,messageId:1000,checkCurrent:false},db)).toBe(false);
    expect(await canReadFamilySecureMessage({userId:3,messageId:1001,checkCurrent:false},db)).toBe(false);
  });
  it('a snapshot excludes someone even if their membership predates the message',async()=>{
    await db.query("UPDATE chat_thread_participants SET created_at='2026-11-09 08:00:00' WHERE user_id=3");
    expect(await ids(3)).not.toContain(1000);
  });
  it('numeric audience snapshots and explicit author remain readable',async()=>{
    await db.execute('UPDATE client_secure_message_records SET audience_json=? WHERE message_id=1000',[JSON.stringify([2])]);
    expect(await ids(2)).toEqual([1000,1001,1002]);
    expect(await ids(1)).toContain(1000);
  });
  it('empty or malformed-shaped snapshots do not fall back to membership',async()=>{
    for(const audience of [[],{id:2},null]) {
      await db.execute('UPDATE client_secure_message_records SET audience_json=? WHERE message_id=1000',[JSON.stringify(audience)]);
      expect(await ids(2)).not.toContain(1000);
    }
  });
  it('missing snapshot falls back only to explicit original membership timestamp',async()=>{
    expect(await ids(2)).toContain(1001);
    expect(await ids(3)).not.toContain(1001);
    await db.query("UPDATE chat_thread_participants SET created_at='2026-11-10 09:30:00' WHERE thread_id=100 AND user_id=3");
    expect(await ids(3)).toContain(1001);
  });
  it('unread count, newest preview and file lists use the same historical predicate',async()=>{
    await db.query("INSERT INTO chat_message_attachments VALUES(1,1000,'old-private.pdf'),(2,1002,'current.pdf')");
    const [[count]]=await db.query(`SELECT COUNT(*) AS n,MAX(m.id) AS latest FROM chat_messages m WHERE m.thread_id=100 AND ${familyMessageVisibilitySql(3)}`);
    const [files]=await db.query(`SELECT a.original_filename FROM chat_message_attachments a JOIN chat_messages m ON m.id=a.message_id WHERE ${familyMessageVisibilitySql(3)}`);
    expect(count).toEqual({n:1,latest:1002});expect(files.map(r=>r.original_filename)).toEqual(['current.pdf']);
  });
  it('a reply cannot reveal an unreadable original, even with an addressed reply snapshot',async()=>{
    await db.query("INSERT INTO chat_messages(id,thread_id,sender_user_id,body,parent_message_id,created_at) VALUES(1003,100,1,'quoted old content',1000,'2026-11-11 10:00:00')");
    await db.execute('INSERT INTO client_secure_message_records(agency_id,client_id,thread_id,message_id,sender_user_id,audience_json) VALUES(450,10,100,1003,1,?)',[JSON.stringify([1,2,3])]);
    expect(await ids(3)).not.toContain(1003);expect(await ids(2)).toContain(1003);
  });
  it('immutable mapped audience also rejects a mistakenly added old-thread member',async()=>{
    await db.execute('INSERT INTO family_shared_conversations(thread_id,client_id,agency_id,provider_user_id,policy_version,audience_hash,audience_json,created_by_user_id) VALUES(300,10,450,1,?,?,?,1)',['2026-11-11','a'.repeat(64),JSON.stringify([1,2])]);
    expect(await ids(3)).not.toContain(3000);
  });
  it('revoked membership and wrong child/thread cannot be bypassed with direct IDs',async()=>{
    await db.query('DELETE FROM chat_thread_participants WHERE thread_id=100 AND user_id=2');
    expect(await ids(2)).toEqual([]);
    await expect(assertCanReadFamilySecureMessage({userId:2,messageId:1000,checkCurrent:false},db)).rejects.toMatchObject({status:404});
    expect(await canReadFamilySecureMessage({userId:1,messageId:1000,threadId:300,checkCurrent:false},db)).toBe(false);
    expect(await canReadFamilySecureMessage({userId:4,messageId:1000,checkCurrent:false},db)).toBe(false);
  });
  it('history selector finds only originally addressed child history without opening or changing membership',async()=>{
    const dependencies={refresh:async()=>{},shared:{requireAccess:async()=>null},contacts:async()=>[]};
    const before=(await db.query('SELECT * FROM chat_thread_participants ORDER BY thread_id,user_id'))[0];
    const original=await listFamilySecureHistory({userId:2,clientId:10,agencyId:450},db,dependencies);
    expect(original.map(t=>t.threadId)).toEqual([100]);expect(original[0].readOnly).toBe(true);
    const newcomer=await listFamilySecureHistory({userId:3,clientId:10,agencyId:450},db,dependencies);
    expect(newcomer.map(t=>t.threadId)).toEqual([100]);
    expect(newcomer[0].last_message_at.getTime()).toBe(new Date('2026-11-11T09:00:00Z').getTime());
    expect(await listFamilySecureHistory({userId:3,clientId:11,agencyId:450},db,dependencies)).toEqual([]);
    expect(await listFamilySecureHistory({userId:2,clientId:10,agencyId:451},db,dependencies)).toEqual([]);
    expect((await db.query('SELECT * FROM chat_thread_participants ORDER BY thread_id,user_id'))[0]).toEqual(before);
  });
  it('current-rights rejection removes previous history without broadening its audience',async()=>{
    const history=await listFamilySecureHistory({userId:2,clientId:10,agencyId:450},db,{refresh:async()=>{throw Object.assign(new Error('Revoked'),{status:403});},shared:{requireAccess:async()=>null},contacts:async()=>[]});
    expect(history).toEqual([]);
  });
  it('does not change internal chat history and rejects SQL interpolation inputs',async()=>{
    expect(await ids(3)).toContain(2000);
    expect(()=>familyMessageVisibilitySql('1 OR 1=1')).toThrow();
    expect(()=>familyMessageVisibilitySql(1,'m);DROP TABLE users')).toThrow();
  });
});
