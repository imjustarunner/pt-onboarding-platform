import { DatabaseSync } from 'node:sqlite';
export function noteworthyTrialDb(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,first_name TEXT,last_name TEXT,email TEXT,role TEXT,is_active INTEGER DEFAULT 1,is_archived INTEGER DEFAULT 0);
    CREATE TABLE agencies(id INTEGER PRIMARY KEY,name TEXT,slug TEXT,is_active INTEGER DEFAULT 1,is_archived INTEGER DEFAULT 0,feature_flags TEXT);
    CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER,is_active INTEGER DEFAULT 1,has_payroll_access INTEGER DEFAULT 1);
    CREATE TABLE noteworthy_practices(agency_id INTEGER PRIMARY KEY,owner_user_id INTEGER,plan_intent TEXT DEFAULT 'essential',trial_policy_version INTEGER DEFAULT 1,trial_policy_accepted_at TEXT,trial_started_at TEXT,trial_ends_at TEXT,activated_at TEXT,activated_by_user_id INTEGER,activation_enc TEXT,activation_requested_at TEXT,activation_request_enc TEXT,retention_days INTEGER DEFAULT 0,continuation_requested_at TEXT,commercial_activated_at TEXT,commercial_evidence_enc TEXT,deletion_requested_at TEXT,deleted_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE noteworthy_deletion_jobs(agency_id INTEGER PRIMARY KEY,status TEXT DEFAULT 'queued',reason TEXT,requested_by_user_id INTEGER,attempts INTEGER DEFAULT 0,error_code TEXT,completed_at TEXT);
    CREATE TABLE support_tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,school_organization_id INTEGER,client_id INTEGER,created_by_user_id INTEGER,agency_id INTEGER,subject TEXT,question TEXT,status TEXT,priority TEXT,target_scope TEXT,source_channel TEXT,topic TEXT,question_ciphertext TEXT,question_iv TEXT,question_auth_tag TEXT,question_encryption_key_id TEXT);
    CREATE TABLE support_ticket_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id INTEGER,parent_message_id INTEGER,author_user_id INTEGER,author_role TEXT,body TEXT,is_internal INTEGER DEFAULT 0,is_deleted INTEGER DEFAULT 0,body_ciphertext TEXT,body_iv TEXT,body_auth_tag TEXT,encryption_key_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE noteworthy_contact_threads(id TEXT PRIMARY KEY,agency_id INTEGER,owner_user_id INTEGER,support_ticket_id INTEGER,email_hash TEXT,request_hash TEXT,contact_enc TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE noteworthy_message_receipts(thread_id TEXT,request_id TEXT,request_hash TEXT,PRIMARY KEY(thread_id,request_id));
    CREATE TABLE clients(id INTEGER PRIMARY KEY,agency_id INTEGER);
    CREATE TABLE appointments(id INTEGER PRIMARY KEY,agency_id INTEGER);
    INSERT INTO users VALUES(1,'Example','Owner','owner@example.test','provider',1,0),(2,'Other','Owner','other@example.test','provider',1,0),(10,'FundThred','Operator','operator@example.test','super_admin',1,0);
    INSERT INTO agencies VALUES(100,'Plot Twist Co.','plottwistco',1,0,'{}'),(1,'Example Practice','example-practice',1,0,'{"noteworthyPayrollOnly":true}'),(2,'Other Practice','other-practice',1,0,'{"noteworthyPayrollOnly":true}');
    INSERT INTO user_agencies VALUES(1,1,1,1),(2,2,1,1);
    INSERT INTO noteworthy_practices(agency_id,owner_user_id) VALUES(1,1),(2,2);`);
  const conn={async execute(query,args=[]){
    if(query.includes('INFORMATION_SCHEMA.TABLES'))return [[...sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('auricwell_practices','clients','appointments','hiring_candidates')").all()]];
    const text=query.replace(/\s+FOR UPDATE/g,'').replace(/UTC_TIMESTAMP\(\)/g,"datetime('now')").replace(/ON DUPLICATE KEY UPDATE/g,'ON CONFLICT DO UPDATE SET').replace(/VALUES\((\w+)\)/g,'excluded.$1');
    const statement=sql.prepare(text),parameters=args.map(v=>v instanceof Date?v.toISOString():v);
    if(/^\s*SELECT/.test(text))return [statement.all(...parameters)];
    const result=statement.run(...parameters);return [{insertId:Number(result.lastInsertRowid),affectedRows:Number(result.changes)}];
  },async beginTransaction(){sql.exec('BEGIN')},async commit(){sql.exec('COMMIT')},async rollback(){sql.exec('ROLLBACK')},release(){}};
  return {sql,db:{...conn,async getConnection(){return conn;}},close(){sql.close();}};
}
