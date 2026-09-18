import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { splitSqlStatements, stripSqlLineComments } from '../../../../database/migrationSqlUtils.js';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => state.db.execute(...args), getConnection: () => state.db.getConnection() } }));
vi.mock('../../services/sessionSecurity.service.js', () => ({ loadSessionPolicy: async () => ({ idleBeforeTimedownSeconds: 600, timedownSeconds: 600 }) }));
import { beginAuthenticator, verifyAuthenticator, accountSecurityState, forgetDevice, DEVICE_COOKIE } from '../../services/accountSecurity.service.js';
import { sendSchoolEmailCode, verifySchoolEmailCode } from '../../services/schoolEmailVerification.service.js';
import { recordAccountSession, personalSessions } from '../../services/personalSessionHistory.service.js';
import { authenticator } from '../../utils/accountSecurity.js';
import { sessionReference } from '../../utils/securityEvidence.js';
import { sessionEvents, endSession } from '../accountSecurity.controller.js';

const socket=process.env.EVIDENCE_TEST_SOCKET;
describe.skipIf(!socket)('isolated account security integration', () => {
  const password='a-disposable-test-password';
  const request=(id=1) => ({ user:{id,email:`person${id}@example.invalid`,role:'provider',sessionId:`session-${id}`}, sessionSecurity:{key:crypto.createHash('sha256').update(`${id}:session-${id}`).digest('hex')}, authClaims:{iat:Math.floor(Date.now()/1000)}, method:'POST',headers:{'user-agent':'Synthetic browser'},cookies:{},body:{}, evidenceContext:{requestId:crypto.randomUUID(),method:'POST',route:'/api/account-security',clientIp:'192.0.2.1',ipSource:'direct_peer',peerIp:'192.0.2.1',forwardedIps:[]} });
  async function setup(req) { req.body={password};const result=await beginAuthenticator(req);req.body={code:authenticator(result.secret).generate()};return result; }
  beforeAll(async () => {
    if(!/^\/private\/tmp\/pt-security-evidence-db\.[^/]+\/mysql\.sock$/.test(socket)) throw new Error('Use an isolated temporary test database socket');
    const db=await mysql.createConnection({socketPath:socket,user:'root'});await db.query('CREATE DATABASE account_security_test');await db.end();
    state.db=mysql.createPool({socketPath:socket,user:'root',database:'account_security_test',timezone:'Z',connectionLimit:4});
    await state.db.query('CREATE TABLE users (id INT PRIMARY KEY,email VARCHAR(255),role VARCHAR(64),password_hash VARCHAR(255),password_changed_at DATETIME(3),temporary_password_set_at DATETIME(3))');
    const hash=await bcrypt.hash(password,4);await state.db.execute('INSERT INTO users VALUES (1,?,"provider",?,NULL,NULL),(2,?,"provider",?,NULL,NULL)', ['person1@example.invalid',hash,'person2@example.invalid',hash]);
    for(const name of ['1452_auth_session_security.sql','1456_security_evidence.sql','1458_account_security.sql','902_user_platform_sessions.sql','1463_school_email_verification.sql']) {
      const sql=await fs.readFile(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8');
      for(const statement of splitSqlStatements(stripSqlLineComments(sql)))await state.db.query(statement);
    }
  });
  beforeEach(async () => {
    vi.stubEnv('MFA_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,3).toString('base64'));
    vi.spyOn(console,'info').mockImplementation(()=>{});
    for(const name of ['account_email_sessions','account_email_challenges','account_mfa_sessions','account_mfa_devices','account_mfa','auth_session_security','user_platform_sessions','user_auth_revocations'])await state.db.query(`DELETE FROM ${name}`);
    await state.db.query("UPDATE users SET password_changed_at=NULL,role='provider',email=CONCAT('person',id,'@example.invalid')");
  });
  afterAll(async () => { if(state.db){await state.db.query('DROP DATABASE account_security_test');await state.db.end();} });
  it('requires primary verification and binds a pending setup to the initiating session',async()=>{
    const req=request();req.body={password:'incorrect'};await expect(beginAuthenticator(req)).rejects.toMatchObject({code:'PRIMARY_VERIFICATION_REQUIRED'});
    await setup(req);req.sessionSecurity.key='b'.repeat(64);await expect(verifyAuthenticator(req,true)).rejects.toMatchObject({code:'MFA_SETUP_REQUIRED'});
  });
  it('enrolls only after a valid code; only the verifying session gains access',async()=>{
    const req=request();const started=await setup(req);
    expect((await accountSecurityState(req)).verified).toBe(false);delete req.accountSecurityState;
    const result=await verifyAuthenticator(req,true);expect(result.recoveryCodes).toHaveLength(10);expect((await accountSecurityState(req)).verified).toBe(true);
    const other=request();other.sessionSecurity.key='a'.repeat(64);expect((await accountSecurityState(other)).verified).toBe(false);
    const[[row]]=await state.db.query('SELECT * FROM account_mfa WHERE user_id=1');expect(row.secret_cipher).not.toContain(started.secret);expect(JSON.stringify(row)).not.toContain(result.recoveryCodes[0]);
  });
  it('rejects OTP replay and permits each recovery code only once, even concurrently',async()=>{
    const req=request();await setup(req);const result=await verifyAuthenticator(req,true);
    await expect(verifyAuthenticator(req)).rejects.toMatchObject({code:'MFA_INVALID_CODE'});
    req.body={code:result.recoveryCodes[0],useRecoveryCode:true,rememberDevice:true,personalDevice:true};
    const outcomes=await Promise.allSettled([verifyAuthenticator(req),verifyAuthenticator(req)]);
    expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.find(r=>r.status==='fulfilled').value.deviceToken).toBeNull();
  });
  it('persists failed-code limits across requests and sessions',async()=>{
    const req=request();await setup(req);req.body={code:'invalid'};
    for(let i=0;i<5;i++)await expect(verifyAuthenticator(req,true)).rejects.toMatchObject({code:i===4?'MFA_RATE_LIMITED':'MFA_INVALID_CODE'});
    const[[row]]=await state.db.query('SELECT failed_attempts,locked_until FROM account_mfa WHERE user_id=1');expect(row.failed_attempts).toBe(5);expect(new Date(row.locked_until).getTime()).toBeGreaterThan(Date.now());
  });
  it('remembers only an opted-in device, scopes it to its owner and invalidates it after a password change',async()=>{
    const req=request();await setup(req);req.body.rememberDevice=true;req.body.personalDevice=true;
    const result=await verifyAuthenticator(req,true);expect(result.deviceToken).toHaveLength(64);
    const later=request();later.sessionSecurity.key='c'.repeat(64);later.cookies[DEVICE_COOKIE]=result.deviceToken;
    expect((await accountSecurityState(later)).verified).toBe(true);
    const stranger=request(2);stranger.cookies[DEVICE_COOKIE]=result.deviceToken;expect((await accountSecurityState(stranger)).verified).toBe(false);
    await state.db.query('UPDATE users SET password_changed_at=UTC_TIMESTAMP(3)+INTERVAL 1 SECOND WHERE id=1');delete later.accountSecurityState;
    expect((await accountSecurityState(later)).verified).toBe(false);
  });
  it('cannot forget someone else’s device and revokes sessions verified using a forgotten device',async()=>{
    const req=request();await setup(req);req.body.rememberDevice=true;req.body.personalDevice=true;await verifyAuthenticator(req,true);
    const[[device]]=await state.db.query('SELECT id FROM account_mfa_devices WHERE user_id=1');
    expect((await forgetDevice(request(2),device.id)).forgotten).toBe(false);
    expect((await forgetDevice(req,device.id)).forgotten).toBe(true);expect((await accountSecurityState(req)).verified).toBe(false);
  });
  it('requires a fresh factor and primary proof to replace an authenticator, and revokes prior access',async()=>{
    const req=request();await setup(req);const result=await verifyAuthenticator(req,true);
    req.body={password:'wrong',code:result.recoveryCodes[0],useRecoveryCode:true};
    await expect(verifyAuthenticator(req,false,true)).rejects.toMatchObject({code:'PRIMARY_VERIFICATION_REQUIRED'});
    req.body.password=password;expect((await verifyAuthenticator(req,false,true)).reset).toBe(true);
    const[[factor]]=await state.db.query('SELECT enabled_at,secret_cipher,recovery_hashes,factor_version FROM account_mfa WHERE user_id=1');
    expect(factor).toMatchObject({enabled_at:null,secret_cipher:null,recovery_hashes:null,factor_version:2});
    const[[cutoff]]=await state.db.query('SELECT reject_issued_before FROM user_auth_revocations WHERE user_id=1');expect(Number(cutoff.reject_issued_before)).toBeGreaterThan(Date.now()/1000-1);
  });
  it('lists only the owner’s sessions and preserves an unknown ending for historical sessions',async()=>{
    for(const id of [1,2])await recordAccountSession({...request(id).user,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600},request(id));
    await state.db.execute("INSERT INTO user_platform_sessions (session_id,user_id,started_at) VALUES ('old-session',1,UTC_TIMESTAMP(3)-INTERVAL 1 DAY)");
    const list=await personalSessions(request().user);expect(list.items).toHaveLength(2);expect(list.items.some(r=>r.reference===sessionReference('session-2'))).toBe(false);
    expect(list.items.find(r=>r.reference===sessionReference('old-session'))).toMatchObject({phase:'unknown',endedAt:null});
  });
  it('cannot end or inspect a different user’s session by changing the URL',async()=>{
    await recordAccountSession({...request(2).user,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600},request(2));
    const req={...request(),params:{reference:sessionReference('session-2')},query:{}};let body;const res={setHeader(){},json:v=>{body=v;},status(){return this;}};const next=vi.fn();
    await endSession(req,res,next);expect(next).not.toHaveBeenCalled();expect(body.ended).toBe(false);
    const[[row]]=await state.db.query('SELECT revoked_at FROM auth_session_security WHERE user_id=2');expect(row.revoked_at).toBeNull();
    await sessionEvents(req,res,next);expect(body.items).toEqual([]);
  });
  async function schoolChallenge(req=request(), delivery=vi.fn()) {
    await state.db.query("UPDATE users SET role='school_staff' WHERE id=1");
    req.user.role='school_staff';
    let code;
    await sendSchoolEmailCode(req,async message=>{code=message.code;await delivery(message);});
    return {req,code,delivery};
  }
  it('sends only to the stored address, stores no plaintext code, and consumes the code once',async()=>{
    const req=request();req.body={email:'attacker@example.invalid'};
    const challenge=await schoolChallenge(req);
    expect(challenge.delivery).toHaveBeenCalledWith({to:'person1@example.invalid',code:expect.stringMatching(/^\d{6}$/)});
    const [[row]]=await state.db.query('SELECT code_hash FROM account_email_challenges WHERE user_id=1');expect(row.code_hash).toHaveLength(64);expect(row.code_hash).not.toBe(challenge.code);
    expect(await accountSecurityState(req)).toMatchObject({method:'email',verified:false,rememberDays:0});delete req.accountSecurityState;
    req.body={code:challenge.code};await verifySchoolEmailCode(req);
    expect(await accountSecurityState(req)).toMatchObject({method:'email',verified:true});
    await expect(verifySchoolEmailCode(req)).rejects.toMatchObject({code:'MFA_INVALID_CODE'});
  });
  it('never lets another role request or verify an email code, including after promotion',async()=>{
    const req=request();await expect(sendSchoolEmailCode(req,vi.fn())).rejects.toMatchObject({code:'MFA_METHOD_NOT_ALLOWED'});
    const {code}=await schoolChallenge(req);req.body={code};await verifySchoolEmailCode(req);
    await state.db.query("UPDATE users SET role='admin' WHERE id=1");
    expect(await accountSecurityState(req)).toMatchObject({method:'authenticator',verified:false});
    await expect(verifySchoolEmailCode(req)).rejects.toMatchObject({code:'MFA_METHOD_NOT_ALLOWED'});
  });
  it('binds email verification to the requesting session and current recipient',async()=>{
    const {req,code}=await schoolChallenge();req.body={code};const original=req.sessionSecurity.key;
    req.sessionSecurity.key='b'.repeat(64);await expect(verifySchoolEmailCode(req)).rejects.toMatchObject({code:'MFA_INVALID_CODE'});
    req.sessionSecurity.key=original;await verifySchoolEmailCode(req);
    await state.db.query("UPDATE users SET email='changed@example.invalid' WHERE id=1");
    expect(await accountSecurityState(req)).toMatchObject({verified:false});
  });
  it('invalidates verification after a password reset and rejects expired codes',async()=>{
    const {req,code}=await schoolChallenge();req.body={code};await verifySchoolEmailCode(req);
    await state.db.query('UPDATE users SET password_changed_at=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE id=1');
    expect(await accountSecurityState(req)).toMatchObject({verified:false});
    await state.db.query('UPDATE account_email_challenges SET sent_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 61 SECOND)');
    let next;await sendSchoolEmailCode(req,async m=>{next=m.code;});req.body={code:next};
    await state.db.query('UPDATE account_email_challenges SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND)');
    await expect(verifySchoolEmailCode(req)).rejects.toMatchObject({code:'MFA_INVALID_CODE'});
  });
  it('limits guesses and resends without resetting guess counts on resend',async()=>{
    const {req}=await schoolChallenge();await expect(sendSchoolEmailCode(req,vi.fn())).rejects.toMatchObject({code:'MFA_RATE_LIMITED'});
    req.body={code:'bad'};for(let i=0;i<4;i++)await expect(verifySchoolEmailCode(req)).rejects.toMatchObject({code:'MFA_INVALID_CODE'});
    await state.db.query('UPDATE account_email_challenges SET sent_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 61 SECOND)');
    await sendSchoolEmailCode(req,vi.fn());await expect(verifySchoolEmailCode(req)).rejects.toMatchObject({code:'MFA_RATE_LIMITED'});
    await expect(sendSchoolEmailCode(req,vi.fn())).rejects.toMatchObject({code:'MFA_RATE_LIMITED'});
  });
  it('does not accept codes when delivery fails and does not expose provider errors',async()=>{
    const req=request();await state.db.query("UPDATE users SET role='school_staff' WHERE id=1");
    await expect(sendSchoolEmailCode(req,async()=>{throw new Error('private mail body');})).rejects.toMatchObject({code:'MFA_EMAIL_DELIVERY_FAILED'});
    const [[row]]=await state.db.query('SELECT code_hash,delivery_state FROM account_email_challenges WHERE user_id=1');expect(row).toMatchObject({code_hash:null,delivery_state:'failed'});
  });
  it('allows only one of two simultaneous verifications to consume a code',async()=>{
    const {req,code}=await schoolChallenge();req.body={code};
    const outcomes=await Promise.allSettled([verifySchoolEmailCode(req),verifySchoolEmailCode(req)]);
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  });

});
