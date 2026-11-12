import { DatabaseSync } from 'node:sqlite';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { createNoteworthyPayrollService,noteworthyRates } from '../noteworthyPayroll.service.js';
import { ensureNoteworthyProvider,noteworthyMatchingUsers } from '../noteworthyRoster.service.js';
import { createNoteworthyReadiness } from '../noteworthyReadiness.service.js';
import { createNoteworthyImportReceipts } from '../noteworthyImportReceipt.service.js';
import { createNoteworthyLifecycle } from '../noteworthyLifecycle.service.js';
import { canManagePayrollForAgency } from '../payrollManagementAccess.service.js';

let sql,db,service,send,readiness,hashPassword,validatePassword;
const recipientPassword='Recipient!ChosenPassword2026';
const request=()=>({practiceName:'Synthetic Practice',firstName:'Synthetic',lastName:'Owner',email:'owner@example.test',role:'super_admin',plan:'growth'});
function makeDb() {
  const connection={
    async execute(query,args=[]) {
      let statement=query.replace(/\s+FOR UPDATE/g,'').replace(/UTC_TIMESTAMP\(\)/g,"datetime('now')").replace(/ON DUPLICATE KEY UPDATE/g,'ON CONFLICT DO UPDATE SET').replace(/VALUES\((\w+)\)/g,'excluded.$1');
      const compiled=sql.prepare(statement);
      const params=args.map(v=>v instanceof Date?v.toISOString():v);
      if(/^\s*SELECT/i.test(statement))return [compiled.all(...params)];
      const result=compiled.run(...params);return [{insertId:Number(result.lastInsertRowid),affectedRows:Number(result.changes)}];
    },async beginTransaction(){sql.exec('BEGIN')},async commit(){sql.exec('COMMIT')},async rollback(){sql.exec('ROLLBACK')},release(){}
  };
  return {...connection,async getConnection(){return connection;}};
}
beforeEach(()=>{
  vi.stubEnv('BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,8).toString('base64'));
  sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,username TEXT,personal_email TEXT,password_hash TEXT,first_name TEXT,last_name TEXT,role TEXT,status TEXT,is_active INTEGER DEFAULT 1,is_archived INTEGER DEFAULT 0,email_verified_at TEXT,is_roster_placeholder INTEGER DEFAULT 0,has_provider_access INTEGER);
    CREATE TABLE agencies(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,slug TEXT,organization_type TEXT,is_active INTEGER,is_archived INTEGER DEFAULT 0,feature_flags TEXT);
    CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER,is_active INTEGER,has_payroll_access INTEGER,UNIQUE(user_id,agency_id));
    CREATE TABLE noteworthy_practices(agency_id INTEGER PRIMARY KEY,owner_user_id INTEGER,plan_intent TEXT,activation_enc TEXT,activated_at TEXT,activated_by_user_id INTEGER,activation_requested_at TEXT,activation_request_enc TEXT,trial_policy_version INTEGER DEFAULT 0,trial_policy_accepted_at TEXT,trial_started_at TEXT,trial_ends_at TEXT,retention_days INTEGER DEFAULT 0,continuation_requested_at TEXT,commercial_activated_at TEXT,commercial_evidence_enc TEXT,deletion_requested_at TEXT,deleted_at TEXT);
    CREATE TABLE noteworthy_deletion_jobs(agency_id INTEGER PRIMARY KEY,status TEXT,attempts INTEGER,error_code TEXT,completed_at TEXT);
    CREATE TABLE support_tickets(id INTEGER PRIMARY KEY,agency_id INTEGER,school_organization_id INTEGER,created_by_user_id INTEGER);
    CREATE TABLE noteworthy_contact_threads(id TEXT,agency_id INTEGER,owner_user_id INTEGER,email_hash TEXT,support_ticket_id INTEGER);
    CREATE TABLE noteworthy_signups(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,practice_name TEXT,first_name TEXT,last_name TEXT,password_hash TEXT,token_hash TEXT UNIQUE,expires_at TEXT,verified_agency_id INTEGER,plan_intent TEXT);
    CREATE TABLE noteworthy_email_verifications(user_id INTEGER PRIMARY KEY,email TEXT,token_hash TEXT UNIQUE,expires_at TEXT);
    CREATE TABLE noteworthy_roster(agency_id INTEGER,payroll_user_id INTEGER,source_name_key TEXT,credential TEXT,contact_email TEXT,auth_user_id INTEGER,invited_at TEXT,accepted_at TEXT,UNIQUE(agency_id,payroll_user_id),UNIQUE(agency_id,source_name_key),UNIQUE(agency_id,auth_user_id));
    CREATE TABLE noteworthy_employee_invites(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,payroll_user_id INTEGER,email TEXT,token_hash TEXT,expires_at TEXT,accepted_at TEXT,invited_by_user_id INTEGER);
    CREATE TABLE noteworthy_credential_rates(agency_id INTEGER,credential TEXT,rates_json TEXT,updated_by_user_id INTEGER,UNIQUE(agency_id,credential));
    CREATE TABLE payroll_rates(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,user_id INTEGER,service_code TEXT,rate_amount REAL,rate_unit TEXT,effective_start TEXT,effective_end TEXT,pay_method TEXT,UNIQUE(agency_id,user_id,service_code,effective_start));
    CREATE TABLE payroll_periods(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,label TEXT,period_start TEXT,period_end TEXT,status TEXT,created_by_user_id INTEGER,posted_at TEXT,ran_at TEXT,ran_by_user_id INTEGER);
    CREATE TABLE payroll_imports(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,payroll_period_id INTEGER);
    CREATE TABLE payroll_import_rows(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,payroll_period_id INTEGER,payroll_import_id INTEGER,user_id INTEGER,provider_name TEXT,service_code TEXT,service_date TEXT,unit_count REAL,note_status TEXT,draft_payable INTEGER);
    CREATE TABLE payroll_stage_carryovers(agency_id INTEGER,payroll_period_id INTEGER,user_id INTEGER,service_code TEXT,carryover_finalized_units REAL,carryover_meta_json TEXT);
    CREATE TABLE payroll_summaries(id INTEGER PRIMARY KEY AUTOINCREMENT,payroll_period_id INTEGER,agency_id INTEGER,user_id INTEGER,total_units REAL,total_amount REAL,subtotal_amount REAL,adjustments_amount REAL,breakdown TEXT);
    CREATE TABLE organization_agreement_records(id TEXT,agency_id INTEGER,kind TEXT,payload TEXT);
    CREATE TABLE noteworthy_import_receipts(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,payroll_period_id INTEGER,file_sha256 TEXT,status TEXT DEFAULT 'processing',payroll_import_id INTEGER,UNIQUE(agency_id,payroll_period_id,file_sha256));`);
  db=makeDb();send=vi.fn().mockResolvedValue({sent:true});
  hashPassword=vi.fn(async()=>'$hashed-recipient-password');validatePassword=vi.fn(async()=>({valid:true}));
  service=createNoteworthyPayrollService({db,send,hashPassword,validatePassword});
  readiness=createNoteworthyReadiness({db,openAgreement:JSON.parse});
});
afterEach(()=>{sql.close();vi.unstubAllEnvs();});
async function onboard() {
  await service.signup(request());
  const token=send.mock.calls.at(-1)[0].text.match(/#token=([a-f0-9]{64})/)[1];
  const result=await service.verify(token,recipientPassword);await createNoteworthyLifecycle({db}).policy(1,result.practice.agencyId,{retentionDays:0,acknowledged:true});return result;
}
async function employee(agencyId=1) {return ensureNoteworthyProvider({agencyId,providerName:'Therapist, Synthetic',firstName:'Synthetic',lastName:'Therapist'},db);}

it('stages a signup without tenant privileges, then verifies one-use email ownership using the existing auth identity',async()=>{
  expect(await service.signup(request())).toMatchObject({verificationRequired:true,verificationSent:true});
  expect(sql.prepare('SELECT COUNT(*) n FROM users').get().n).toBe(0);
  expect(sql.prepare('SELECT COUNT(*) n FROM agencies').get().n).toBe(0);
  const saved=sql.prepare('SELECT * FROM noteworthy_signups').get();
  expect(saved.password_hash).toBe('');expect(hashPassword).not.toHaveBeenCalled();expect(validatePassword).not.toHaveBeenCalled();
  const email=send.mock.calls[0][0];expect(email.text).toContain('https://fundthred.com/noteworthy/verify#token=');
  const token=email.text.match(/#token=([a-f0-9]{64})/)[1];expect(saved.token_hash).not.toBe(token);
  expect(await service.verify(token)).toEqual({passwordRequired:true,verified:false});
  expect(sql.prepare('SELECT COUNT(*) n FROM users').get().n).toBe(0);
  expect(sql.prepare('SELECT token_hash,expires_at FROM noteworthy_signups').get()).toEqual({token_hash:saved.token_hash,expires_at:saved.expires_at});
  expect(await service.verify(token,recipientPassword)).toMatchObject({verified:true,signInRequired:true,practice:{agencyId:1,role:'owner',plan:'growth'}});
  expect(hashPassword).toHaveBeenCalledWith(recipientPassword);expect(validatePassword).toHaveBeenCalledWith(recipientPassword,{accountId:request().email});
  expect(sql.prepare('SELECT password_hash FROM users').get().password_hash).toBe('$hashed-recipient-password');
  expect(sql.prepare('SELECT role,has_provider_access FROM users').get()).toEqual({role:'provider',has_provider_access:0});
  expect(sql.prepare('SELECT has_payroll_access FROM user_agencies').get().has_payroll_access).toBe(1);
  expect(sql.prepare('SELECT password_hash FROM noteworthy_signups').get().password_hash).toBe('');
  await expect(service.verify(token)).rejects.toMatchObject({code:'INVALID_TOKEN'});
});
it('ignores an initiator password and a legacy staged hash even after resending verification',async()=>{
  await service.signup({...request(),password:'Attacker!ChosenPassword2026'});
  expect(sql.prepare('SELECT password_hash FROM noteworthy_signups').get().password_hash).toBe('');
  const oldToken=send.mock.calls.at(-1)[0].text.match(/#token=([a-f0-9]{64})/)[1];
  sql.exec("UPDATE noteworthy_signups SET password_hash='legacy-attacker-staged-hash'");
  await service.resend(request().email);
  const token=send.mock.calls.at(-1)[0].text.match(/#token=([a-f0-9]{64})/)[1];
  await expect(service.verify(oldToken,recipientPassword)).rejects.toMatchObject({code:'INVALID_TOKEN'});
  expect(await service.verify(token)).toEqual({passwordRequired:true,verified:false});
  await expect(service.verify(token,'short')).rejects.toMatchObject({code:'INVALID_PASSWORD'});
  expect(sql.prepare('SELECT verified_agency_id FROM noteworthy_signups').get().verified_agency_id).toBeNull();
  expect(await service.verify(token,recipientPassword)).toMatchObject({verified:true});
  expect(sql.prepare('SELECT password_hash FROM users').get().password_hash).toBe('$hashed-recipient-password');
  expect(hashPassword).toHaveBeenCalledTimes(1);expect(hashPassword).toHaveBeenCalledWith(recipientPassword);
});
it('verifies an existing account email without changing its password or MFA, regardless of an extra password input',async()=>{
  sql.exec("INSERT INTO users(id,email,password_hash,role,is_active) VALUES(40,'existing@example.test','existing-password-hash','provider',1);CREATE TABLE account_mfa(user_id INTEGER,secret_cipher TEXT,factor_version INTEGER);INSERT INTO account_mfa VALUES(40,'retained-mfa-secret',4)");
  await service.requestAccountVerification(40);
  const token=send.mock.calls.at(-1)[0].text.match(/#token=([a-f0-9]{64})/)[1];
  expect(await service.verify(token,'an-ignored-password')).toEqual({verified:true,signInRequired:true});
  expect(sql.prepare('SELECT password_hash,email_verified_at FROM users WHERE id=40').get()).toMatchObject({password_hash:'existing-password-hash',email_verified_at:expect.any(String)});
  expect(sql.prepare('SELECT * FROM account_mfa WHERE user_id=40').get()).toEqual({user_id:40,secret_cipher:'retained-mfa-secret',factor_version:4});
  expect(hashPassword).not.toHaveBeenCalled();expect(validatePassword).not.toHaveBeenCalled();
  expect(sql.prepare('SELECT COUNT(*) n FROM noteworthy_practices').get().n).toBe(0);
});
it('does not report email delivered when transport failed and never leaks verification tokens in API results',async()=>{
  send.mockRejectedValue(new Error('Synthetic failed delivery'));
  const result=await service.signup(request());expect(result.verificationSent).toBe(false);expect(JSON.stringify(result)).not.toContain('token=');
});
it('scopes auto-created non-login payroll identities to the importing practice despite a same-name account elsewhere',async()=>{
  await onboard();sql.exec("INSERT INTO users(id,email,first_name,last_name,role) VALUES(99,'other@example.test','Synthetic','Therapist','super_admin')");
  const first=await employee();const second=await employee();expect(first.userId).toBe(second.userId);expect(first.userId).not.toBe(99);
  const saved=sql.prepare('SELECT email,password_hash,role,is_roster_placeholder FROM users WHERE id=?').get(first.userId);
  expect(saved).toEqual({email:null,password_hash:null,role:'provider',is_roster_placeholder:1});
  expect(await noteworthyMatchingUsers(1,db)).toEqual([{id:first.userId,first_name:'Synthetic',last_name:'Therapist'}]);
  await expect(service.roster(99,1)).rejects.toMatchObject({status:403});
});
it('preserves explicit zero and pro bono zero, applies credential defaults only to missing codes, and never guesses credentials',async()=>{
  await onboard();const staff=await employee();
  const rate={serviceCode:'90837',rateAmount:0,rateUnit:'per_unit',effectiveStart:'2026-10-24'};
  await service.rateDefaults(1,1,{defaults:[{credential:'LPC',rates:[rate]}]});
  expect((await service.roster(1,1)).employees[0].credential).toBeNull();
  await service.updateRoster(1,1,staff.userId,{credential:'LPC'});
  expect(sql.prepare('SELECT rate_amount FROM payroll_rates').get().rate_amount).toBe(0);
  await service.updateRoster(1,1,staff.userId,{rates:[{...rate,rateAmount:50}]});
  await service.updateRoster(1,1,staff.userId,{credential:'LPC'});
  expect(sql.prepare('SELECT rate_amount FROM payroll_rates').get().rate_amount).toBe(50);
  expect(noteworthyRates([{...rate,serviceCode:'PROBONO',rateAmount:200}])[0].rateAmount).toBe(0);
  expect(()=>noteworthyRates([{...rate,rateAmount:null}])).toThrow(/zero or greater/);
  expect(()=>noteworthyRates([{...rate,effectiveStart:'2026-02-30'}])).toThrow(/valid date/);
  await service.rateDefaults(1,1,{defaults:[]});
  expect((await service.rateDefaults(1,1)).defaults).toEqual([]);
  expect(sql.prepare('SELECT rate_amount FROM payroll_rates').get().rate_amount).toBe(50);
});
it('keeps posted rate history immutable and invalidates unpublished calculations after dated rate changes',async()=>{
  await onboard();const staff=await employee();
  const period=await service.createPeriod(1,1,{periodStart:'2026-10-24',periodEnd:'2026-11-06'});
  sql.prepare("INSERT INTO payroll_import_rows(agency_id,payroll_period_id,user_id,service_code,service_date) VALUES(1,?,?,'90837','2026-11-01')").run(period.id,staff.userId);
  sql.prepare("UPDATE payroll_periods SET status='ran' WHERE id=?").run(period.id);
  await service.updateRoster(1,1,staff.userId,{rates:[{serviceCode:'90837',rateAmount:60,effectiveStart:'2026-10-24'}]});
  expect(sql.prepare('SELECT status FROM payroll_periods').get().status).toBe('raw_imported');
  sql.prepare("UPDATE payroll_periods SET status='posted' WHERE id=?").run(period.id);
  await expect(service.updateRoster(1,1,staff.userId,{rates:[{serviceCode:'90837',rateAmount:70,effectiveStart:'2026-10-24'}]})).rejects.toMatchObject({code:'PUBLISHED_RATE_HISTORY'});
  expect(sql.prepare('SELECT rate_amount FROM payroll_rates').get().rate_amount).toBe(60);
});
it('requires an explicitly addressed and confirmed invitation and existing-account sign-in without moving payroll history',async()=>{
  await onboard();const staff=await employee();const sends=send.mock.calls.length;
  await service.updateRoster(1,1,staff.userId,{email:'employee@example.test'});expect(send).toHaveBeenCalledTimes(sends);
  await expect(service.invite(1,1,staff.userId,{confirm:false})).rejects.toMatchObject({code:'INVITATION_CONFIRMATION_REQUIRED'});
  await service.invite(1,1,staff.userId,{confirm:true});
  const token=send.mock.calls.at(-1)[0].text.match(/#token=([a-f0-9]{64})/)[1];
  sql.exec("INSERT INTO users(id,email,password_hash,role) VALUES(999,'employee@example.test','unchanged-auth-hash','provider')");
  await expect(service.acceptInvite({token,password:'ignored'})).rejects.toMatchObject({code:'EXISTING_ACCOUNT_SIGN_IN_REQUIRED'});
  expect(await service.acceptInvite({token},999)).toMatchObject({accepted:true,agencyId:1,signInRequired:false});
  expect(sql.prepare('SELECT payroll_user_id,auth_user_id FROM noteworthy_roster').get()).toEqual({payroll_user_id:staff.userId,auth_user_id:999});
  expect(sql.prepare('SELECT password_hash FROM users WHERE id=999').get().password_hash).toBe('unchanged-auth-hash');
});
it('shows an employee only their own posted pay lines and strips internal snapshots and client identifiers',async()=>{
  await onboard();const staff=await employee();
  sql.prepare("UPDATE noteworthy_roster SET auth_user_id=999,accepted_at='2026-11-11' WHERE payroll_user_id=?").run(staff.userId);
  sql.exec("INSERT INTO payroll_periods(id,agency_id,period_start,period_end,status) VALUES(1,1,'2026-10-24','2026-11-06','posted'),(2,1,'2026-11-07','2026-11-20','ran')");
  const breakdown=JSON.stringify({'90837':{units:2,amount:100,rateAmount:50,patientFirstName:'PRIVATE CLIENT'},__clinicalSnapshot:{patient:'PRIVATE CLIENT'}});
  for(const [period,user] of [[1,staff.userId],[2,staff.userId],[1,42]])sql.prepare('INSERT INTO payroll_summaries(payroll_period_id,agency_id,user_id,total_amount,breakdown) VALUES(?,1,?,100,?)').run(period,user,breakdown);
  const result=await service.paystubs(999,1);expect(result.paystubs).toHaveLength(1);expect(result.paystubs[0].lines).toEqual([{serviceCode:'90837',units:2,amount:100,rateAmount:50}]);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE CLIENT|clinicalSnapshot/);
  await expect(service.paystubs(1,1)).rejects.toMatchObject({status:403});
});
it('creates biweekly periods idempotently and rejects overlap and invalid calendar dates',async()=>{
  await onboard();const period=await service.createPeriod(1,1,{periodStart:'2026-10-24',periodEnd:'2026-11-06'});
  expect((await service.createPeriod(1,1,{periodStart:'2026-10-24',periodEnd:'2026-11-06'})).id).toBe(period.id);
  await expect(service.createPeriod(1,1,{periodStart:'2026-10-25',periodEnd:'2026-11-07'})).rejects.toMatchObject({code:'OVERLAPPING_PERIOD'});
  await expect(service.createPeriod(1,1,{periodStart:'2026-02-30',periodEnd:'2026-03-13'})).rejects.toMatchObject({code:'INVALID_DATE'});
});
it('requires operator-reviewed executed BAA and legal identity before accepting patient-bearing imports',async()=>{
  await onboard();expect((await readiness.activation(1)).canImport).toBe(false);
  await expect(readiness.assertImport(1)).rejects.toMatchObject({code:'NOTEWORTHY_ACTIVATION_REQUIRED'});
  expect(await readiness.activation(42)).toBeNull();
  const evidence={verified:true,legalName:'Synthetic Legal Entity',legalAddress:'Synthetic Address',baaId:'baa-doc',serviceAgreementReference:'Executed payroll services agreement',orderReference:'Executed order',infrastructureEvidence:'Verified operator evidence'};
  await expect(readiness.activate(1,1,evidence)).rejects.toMatchObject({status:403});
  sql.exec("INSERT INTO users(id,role,is_active) VALUES(10,'super_admin',1)");
  sql.prepare("INSERT INTO organization_agreement_records VALUES('baa-doc',1,'agreement',?)").run(JSON.stringify({type:'baa',status:'draft',parties:{practice:{legalName:evidence.legalName}}}));
  await expect(readiness.activate(10,1,evidence)).rejects.toMatchObject({code:'EXECUTED_BAA_REQUIRED'});
  sql.prepare("UPDATE organization_agreement_records SET payload=? WHERE id='baa-doc'").run(JSON.stringify({type:'baa',status:'completed',parties:{practice:{legalName:evidence.legalName}}}));
  expect(await readiness.activate(10,1,evidence)).toMatchObject({canImport:true});
  expect(sql.prepare('SELECT activation_enc FROM noteworthy_practices').get().activation_enc).not.toContain('Synthetic Legal Entity');
});
it('blocks unconfigured rates on the actual service date, accepts explicit zero and pro bono, and rejects cross-practice periods',async()=>{
  await onboard();const staff=await employee();
  sql.exec("UPDATE noteworthy_practices SET activated_at='2026-11-11'");
  const {encryptBillingSecret}=await import('../billingEncryption.service.js');sql.prepare('UPDATE noteworthy_practices SET activation_enc=?').run(JSON.stringify(encryptBillingSecret(JSON.stringify({verified:true}))));
  const period=await service.createPeriod(1,1,{periodStart:'2026-10-24',periodEnd:'2026-11-06'});
  sql.prepare('INSERT INTO payroll_imports(id,agency_id,payroll_period_id) VALUES(1,1,?)').run(period.id);
  for(const code of ['90837','PROBONO'])sql.prepare("INSERT INTO payroll_import_rows(agency_id,payroll_period_id,payroll_import_id,user_id,service_code,service_date,unit_count,note_status) VALUES(1,?,1,?,?,'2026-11-01',1,'FINALIZED')").run(period.id,staff.userId,code);
  expect((await readiness.payrollReadiness(1,period.id)).missingEmployeeRates).toHaveLength(1);
  await expect(readiness.assertPayrollReady(1,period.id)).rejects.toMatchObject({code:'NOTEWORTHY_PAYROLL_SETUP_REQUIRED'});
  await service.updateRoster(1,1,staff.userId,{rates:[{serviceCode:'90837',rateAmount:0,effectiveStart:'2026-10-24'}]});
  expect((await readiness.payrollReadiness(1,period.id)).ready).toBe(true);
  await expect(readiness.payrollReadiness(1,400)).rejects.toMatchObject({status:404});
});
it('deduplicates identical completed report uploads and blocks concurrent or interrupted writes without losing decisions',async()=>{
  await onboard();const period=await service.createPeriod(1,1,{periodStart:'2026-10-24',periodEnd:'2026-11-06'});
  const receipts=createNoteworthyImportReceipts(db),input={agencyId:1,periodId:period.id,buffer:Buffer.from('synthetic report')};
  const receipt=await receipts.begin(input);
  await expect(receipts.begin(input)).rejects.toMatchObject({code:'NOTEWORTHY_IMPORT_IN_PROGRESS'});
  sql.prepare('INSERT INTO payroll_imports(id,agency_id,payroll_period_id) VALUES(1,1,?)').run(period.id);
  await receipts.created(receipt,1);await receipts.complete(receipt);
  expect(await receipts.begin(input)).toMatchObject({reused:true,response:{import:{id:1},reused:true}});
  expect(sql.prepare('SELECT COUNT(*) n FROM noteworthy_import_receipts').get().n).toBe(1);
});
it('revokes legacy payroll management when membership, person or agency is inactive or archived',async()=>{
  await onboard();const input={userId:1,role:'provider',agencyId:1};expect(await canManagePayrollForAgency(input,db)).toBe(true);
  sql.exec('UPDATE user_agencies SET is_active=0');expect(await canManagePayrollForAgency(input,db)).toBe(false);
  sql.exec('UPDATE user_agencies SET is_active=1;UPDATE users SET is_active=0');expect(await canManagePayrollForAgency(input,db)).toBe(false);
  sql.exec('UPDATE users SET is_active=1,is_archived=1');expect(await canManagePayrollForAgency(input,db)).toBe(false);
  sql.exec('UPDATE users SET is_archived=0;UPDATE agencies SET is_active=0');expect(await canManagePayrollForAgency(input,db)).toBe(false);
  sql.exec('UPDATE agencies SET is_active=1,is_archived=1');expect(await canManagePayrollForAgency(input,db)).toBe(false);
  expect(await canManagePayrollForAgency({...input,userId:22},db)).toBe(false);
});
