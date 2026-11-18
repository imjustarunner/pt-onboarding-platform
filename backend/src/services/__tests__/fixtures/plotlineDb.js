import {DatabaseSync} from 'node:sqlite';
export function plotlineDb(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`
 CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,username TEXT,personal_email TEXT,password_hash TEXT,first_name TEXT,last_name TEXT,role TEXT,status TEXT,is_active INTEGER DEFAULT 1,is_archived INTEGER DEFAULT 0,email_verified_at TEXT,has_provider_access INTEGER DEFAULT 0,has_staff_access INTEGER DEFAULT 0,has_hiring_access INTEGER DEFAULT 0);
 CREATE TABLE agencies(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,slug TEXT UNIQUE,portal_url TEXT,organization_type TEXT,is_active INTEGER DEFAULT 1,is_archived INTEGER DEFAULT 0,feature_flags TEXT,color_palette TEXT,theme_settings TEXT,careers_page_json TEXT,logo_url TEXT,timezone TEXT);
 CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER,is_active INTEGER,agency_role TEXT,PRIMARY KEY(user_id,agency_id));
 CREATE TABLE user_agency_access_profiles(user_id INTEGER,agency_id INTEGER,role_baseline TEXT,permissions_baseline TEXT,role_override TEXT,permissions_overrides TEXT,effective_role TEXT,effective_permissions TEXT,PRIMARY KEY(user_id,agency_id));
 CREATE TABLE agency_business_types(agency_id INTEGER,business_type TEXT,is_enabled INTEGER);
 CREATE TABLE email_sender_identities(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,identity_key TEXT,display_name TEXT,from_email TEXT,reply_to TEXT,is_active INTEGER);
 CREATE TABLE plotline_capacity(bucket_key TEXT PRIMARY KEY,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE plotline_signups(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,token_hash TEXT UNIQUE,expires_at TEXT,sent_at TEXT,requested_at TEXT,consumed_at TEXT,user_id INTEGER);
 CREATE TABLE plotline_company_drafts(id TEXT PRIMARY KEY,owner_user_id INTEGER,revision INTEGER DEFAULT 1,content_json TEXT,logo_webp BLOB,logo_sha256 TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE plotline_companies(agency_id INTEGER PRIMARY KEY,owner_user_id INTEGER,draft_id TEXT UNIQUE,industry TEXT,timezone TEXT,is_qa INTEGER DEFAULT 0,trial_started_at TEXT,trial_ends_at TEXT,terms_version TEXT,terms_accepted_at TEXT,continuation_requested_at TEXT,commercial_activated_at TEXT,created_at TEXT);
 CREATE TABLE plotline_audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,actor_user_id INTEGER,action TEXT,object_id TEXT,metadata_json TEXT,created_at TEXT);
 CREATE TABLE user_agency_access_rollout(id INTEGER PRIMARY KEY,enabled INTEGER);
 INSERT INTO user_agency_access_rollout VALUES(1,1);
 INSERT INTO users(id,email,role,status,email_verified_at) VALUES(1,'owner@example.test','staff','ACTIVE_EMPLOYEE','2026-11-18 12:00:00'),(2,'other@example.test','staff','ACTIVE_EMPLOYEE','2026-11-18 12:00:00'),(1434,'qa@example.test','support','ACTIVE_EMPLOYEE','2026-11-18 12:00:00');
 `);
 const execute=async(query,args=[])=>{
  if(query.includes('information_schema.TABLES'))return [[{ready:6}]];
  const text=query.replace(/\s+FOR UPDATE/g,'').replace(/INSERT IGNORE INTO/g,'INSERT OR IGNORE INTO').replace('ON DUPLICATE KEY UPDATE used=used','ON CONFLICT(bucket_key) DO UPDATE SET used=used');
  const statement=sql.prepare(text),params=args.map(v=>v instanceof Date?v.toISOString():v);
  if(/^\s*SELECT/.test(text))return [statement.all(...params)];
  const result=statement.run(...params);return [{insertId:Number(result.lastInsertRowid),affectedRows:Number(result.changes)}];
 };
 let tail=Promise.resolve();
 const db={execute,async getConnection(){let release;const before=tail;tail=new Promise(resolve=>release=resolve);await before;return {execute,async beginTransaction(){sql.exec('BEGIN')},async commit(){sql.exec('COMMIT')},async rollback(){sql.exec('ROLLBACK')},release};}};
 return {sql,db,close:()=>sql.close()};
}
