import { expect, it } from 'vitest';

it.skipIf(process.env.RUN_MYSQL_SCHOOL_EMAIL_TEST !== '1')('shares only exact school group envelopes, including in a mixed private thread', async () => {
  process.env.SKIP_DB_CONNECT='1';
  const {default:pool}=await import('../../config/database.js');
  const {schoolEmailScope}=await import('../schoolPortalEmail.service.js');
  const db=await pool.getConnection();
  try {
    await db.query('CREATE TEMPORARY TABLE school_email_test_conversations (id INT PRIMARY KEY,agency_id INT,is_spam INT DEFAULT 0,is_unknown_sender INT DEFAULT 0,visible_after DATETIME NULL)');
    await db.query('CREATE TEMPORARY TABLE school_email_test_messages (id INT PRIMARY KEY,conversation_id INT,channel VARCHAR(20),is_internal_note INT DEFAULT 0,direction VARCHAR(20),send_status VARCHAR(20),from_json JSON,to_json JSON,cc_json JSON,bcc_json JSON)');
    await db.query('INSERT INTO school_email_test_conversations (id,agency_id) VALUES (1,2),(2,3)');
    const group='school_one@example.org';
    const cases=[
      [1,1,'staff@example.org',group,null,null,0,'sent'],
      [2,1,'staff@example.org','recipient@example.org',group,null,0,'sent'],
      [3,1,group,'recipient@example.org',null,null,0,'sent'],
      [4,1,'staff@example.org','other_school@example.org',null,null,0,'sent'],
      [5,1,'staff@example.org','viewer@example.org',null,null,0,'sent'],
      [6,1,'staff@example.org',group,null,null,1,'sent'],
      [7,1,'staff@example.org','recipient@example.org',null,group,0,'sent'],
      [8,1,'staff@example.org','schoolXone@example.org',null,null,0,'sent'],
      [9,2,'staff@example.org',group,null,null,0,'sent'],
      [10,1,'staff@example.org',group,null,null,0,'scheduled'],
      [11,1,'staff@example.org','prefix-school_one@example.org',null,null,0,'sent']
    ];
    for(const [id,conversationId,from,to,cc,bcc,note,status] of cases){
      const list=email=>JSON.stringify(email?[{email}]:[]);
      await db.query("INSERT INTO school_email_test_messages VALUES (?,?,'email',?,'inbound',?,?,?,?,?)",[id,conversationId,note,status,JSON.stringify({email:from}),list(to),list(cc),list(bcc)]);
    }
    const scope=schoolEmailScope({agencyId:2,groupEmail:group,userId:42,email:'viewer@example.org'});
    const [rows]=await db.query(`SELECT m.id FROM school_email_test_messages m JOIN school_email_test_conversations c ON c.id=m.conversation_id WHERE ${scope.sql} ORDER BY m.id`,scope.params);
    expect(rows.map(row=>row.id)).toEqual([1,2,3]);
  }finally{
    await db.query('DROP TEMPORARY TABLE IF EXISTS school_email_test_messages,school_email_test_conversations');
    db.release();await pool.end();
  }
});
