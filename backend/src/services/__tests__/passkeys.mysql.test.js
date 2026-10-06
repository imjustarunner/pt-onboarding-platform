import {describe,it,expect,vi,beforeAll,beforeEach,afterAll} from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import {isoCBOR} from '@simplewebauthn/server/helpers';
import {splitSqlStatements} from '../../utils/migrationSql.js';
const fixture=vi.hoisted(()=>({db:null,sso:false}));
vi.mock('../../config/database.js',()=>({default:{execute:(...a)=>fixture.db.execute(...a),getConnection:()=>fixture.db.getConnection()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async id=>(await fixture.db.execute('SELECT * FROM users WHERE id=?',[id]))[0][0],getAgencies:async()=>[{feature_flags:{googleSsoEnabled:fixture.sso,googleSsoRequiredRoles:['provider','provider_plus','intern','intern_plus']}}]}}));
vi.mock('../../config/config.js',()=>({default:{cors:{origin:['https://portal.example.org','https://other.example.org','http://localhost:5186']},authCookie:{set:()=>({httpOnly:true,secure:true,sameSite:'strict'})}}}));
import * as service from '../passkeys.service.js';
import {accountSecurityState,beginAuthenticator} from '../accountSecurity.service.js';
const enabled=process.env.PASSKEY_MYSQL_TEST==='1';
describe.skipIf(!enabled)('real WebAuthn cryptography and isolated MySQL',()=>{
 const password='Synthetic passkey test password 84!';let db;
 const b64=b=>Buffer.from(b).toString('base64url'),hash=b=>crypto.createHash('sha256').update(b).digest();
 function request(id=1){const sessionId=crypto.randomUUID();return {user:{id,sessionId,role:'provider',email:`passkey-${id}@example.invalid`},authClaims:{iat:Math.floor(Date.now()/1000)},sessionSecurity:{key:hash(`${id}:${sessionId}`).toString('hex')},headers:{},cookies:{},body:{},get:()=> 'https://portal.example.org',evidenceContext:{requestId:crypto.randomUUID(),method:'POST',route:'/api/account-security/passkeys',clientIp:'127.0.0.1',ipSource:'direct_peer',peerIp:'127.0.0.1',forwardedIps:[]}};}
 const response=req=>({cookie:(name,value)=>{req.cookies[name]=value;}});
 function keypair(){const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'});return {...pair,id:crypto.randomBytes(32),cose:isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,'base64url')],[-3,Buffer.from(jwk.y,'base64url')]]))};}
 function registration(options,key,{origin='https://portal.example.org',uv=true}={}){
  const counter=Buffer.alloc(4),length=Buffer.alloc(2);length.writeUInt16BE(key.id.length);
  const auth=Buffer.concat([hash(options.rp.id),Buffer.from([0x41|(uv?4:0)]),counter,Buffer.alloc(16),length,key.id,Buffer.from(key.cose)]);
  return {id:b64(key.id),rawId:b64(key.id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin,crossOrigin:false})),attestationObject:b64(isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',auth]]))),transports:['internal']}};
 }
 function assertion(options,key,handle,{origin='https://portal.example.org',uv=true,counter=1,signer=key.privateKey}={}){
  const count=Buffer.alloc(4);count.writeUInt32BE(counter);
  const auth=Buffer.concat([hash(options.rpId),Buffer.from([1|(uv?4:0)]),count]);
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:options.challenge,origin,crossOrigin:false}));
  return {id:b64(key.id),rawId:b64(key.id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),authenticatorData:b64(auth),signature:b64(crypto.sign('sha256',Buffer.concat([auth,hash(client)]),signer)),userHandle:handle}};
 }
 async function enroll(req=request()){req.body={password,label:'Synthetic device'};const start=await service.beginPasskeyRegistration(req,response(req)),key=keypair();key.handle=start.options.user.id;req.body={challengeId:start.challengeId,response:registration(start.options,key)};const result=await service.finishPasskeyRegistration(req);return {req,key,result};}
 async function loginRequest(key,patch){const req=request();delete req.user;delete req.authClaims;delete req.sessionSecurity;const start=await service.beginPasskeyAuthentication(req,response(req));req.body={challengeId:start.challengeId,response:assertion(start.options,key,key.handle,patch)};return req;}
 beforeAll(async()=>{
  const setup=await mysql.createConnection({socketPath:'/tmp/mh4kidz-donation.sock',user:'root'});await setup.query('DROP DATABASE IF EXISTS passkeys_test');await setup.query('CREATE DATABASE passkeys_test');await setup.end();
  db=mysql.createPool({socketPath:'/tmp/mh4kidz-donation.sock',user:'root',database:'passkeys_test',timezone:'Z',connectionLimit:12});fixture.db=db;
  await db.query(`CREATE TABLE users (id INT PRIMARY KEY,email VARCHAR(255),role VARCHAR(64),status VARCHAR(64),is_active INT DEFAULT 1,is_archived INT DEFAULT 0,pending_access_locked INT DEFAULT 0,status_expires_at DATETIME(3),password_hash VARCHAR(255),password_changed_at DATETIME(3),temporary_password_set_at DATETIME(3),failed_login_attempts INT DEFAULT 0,locked_until DATETIME(3))`);
  for(const file of ['1452_auth_session_security.sql','1456_security_evidence.sql','1458_account_security.sql','1546_account_passkeys.sql']){
   for(const statement of splitSqlStatements(await fs.readFile(new URL(`../../../../database/migrations/${file}`,import.meta.url),'utf8')))await db.query(statement);
  }
 });
 beforeEach(async()=>{
  fixture.sso=false;
  for(const table of ['account_passkey_challenges','account_passkey_proofs','account_passkeys','account_passkey_accounts','account_mfa_sessions','account_mfa_devices','account_mfa','user_auth_revocations','auth_session_security','users'])await db.query(`DELETE FROM ${table}`);
  const pw=await bcrypt.hash(password,4);
  await db.execute("INSERT INTO users (id,email,role,status,password_hash) VALUES (1,'one@example.invalid','provider','ACTIVE_EMPLOYEE',?),(2,'two@example.invalid','client_guardian','ACTIVE_EMPLOYEE',?)",[pw,pw]);
 });
 afterAll(async()=>{await db?.end();});
 it('verifies registration, stores only public keys and recovery hashes, and verifies a real signature',async()=>{
  const {req,key,result}=await enroll();expect(result.recoveryCodes).toHaveLength(10);
  const [[stored]]=await db.query('SELECT * FROM account_passkey_accounts');expect(JSON.stringify(stored)).not.toContain(result.recoveryCodes[0]);
  expect((await accountSecurityState(req))).toMatchObject({required:true,verified:true,passkeyVerified:true});
  const result2=await service.finishPasskeyAuthentication(await loginRequest(key));expect(result2.user.id).toBe(1);
  const [[count]]=await db.query('SELECT signature_counter FROM account_passkeys');expect(Number(count.signature_counter)).toBe(1);
 });
 it('never enrolls from an email session without the account password or on behalf of another user',async()=>{
  const req=request();req.body={};await expect(service.beginPasskeyRegistration(req,response(req))).rejects.toMatchObject({code:'PRIMARY_VERIFICATION_REQUIRED'});
  req.user.switchedFromUserId=5;req.body={password};await expect(service.beginPasskeyRegistration(req,response(req))).rejects.toMatchObject({code:'ACCOUNT_SESSION_REQUIRED'});
 });
 it('rejects school staff, required SSO and inactive/expired accounts on enrollment and login',async()=>{
  const {key}=await enroll();
  for(const sql of ["UPDATE users SET role='school_staff' WHERE id=1","UPDATE users SET role='provider',is_active=0 WHERE id=1","UPDATE users SET is_active=1,status_expires_at='2020-01-01' WHERE id=1"]){await db.query(sql);await expect(service.finishPasskeyAuthentication(await loginRequest(key))).rejects.toMatchObject({code:'PASSKEY_ACCOUNT_UNAVAILABLE'});}
  await db.query('UPDATE users SET status_expires_at=NULL WHERE id=1');fixture.sso=true;await expect(service.finishPasskeyAuthentication(await loginRequest(key))).rejects.toMatchObject({code:'SSO_REQUIRED'});
  const req=request();req.body={password};await expect(service.beginPasskeyRegistration(req,response(req))).rejects.toMatchObject({code:'SSO_REQUIRED'});
 });
 it('keeps Google account setup unchanged even when SSO is optional',async()=>{const req=request();req.authClaims.authMethod='google';expect(await service.passkeyStatus(req)).toEqual({eligible:false});req.body={password};await expect(service.beginPasskeyRegistration(req,response(req))).rejects.toMatchObject({code:'PASSKEY_SSO_UNCHANGED'});});
 it('requires user verification at registration and does not reuse a failed challenge',async()=>{const req=request();req.body={password};const start=await service.beginPasskeyRegistration(req,response(req));req.body={challengeId:start.challengeId,response:registration(start.options,keypair(),{uv:false})};await expect(service.finishPasskeyRegistration(req)).rejects.toMatchObject({code:'PASSKEY_INVALID'});await expect(service.finishPasskeyRegistration(req)).rejects.toMatchObject({code:'PASSKEY_INVALID'});});
 it('rejects wrong origin, absent user verification, invalid signature and another account handle',async()=>{
  const {key}=await enroll();for(const patch of [{origin:'https://evil.example.org'},{uv:false},{signer:keypair().privateKey}])await expect(service.finishPasskeyAuthentication(await loginRequest(key,patch))).rejects.toMatchObject({code:'PASSKEY_INVALID'});
  const req=await loginRequest(key);req.body.response.response.userHandle='someone-else';await expect(service.finishPasskeyAuthentication(req)).rejects.toMatchObject({code:'PASSKEY_INVALID'});
 });
 it('binds challenges to browser, origin, session and expiry',async()=>{
  const {key}=await enroll();const req=await loginRequest(key);req.cookies[service.PASSKEY_COOKIE]='f'.repeat(64);await expect(service.finishPasskeyAuthentication(req)).rejects.toMatchObject({code:'PASSKEY_INVALID'});
  const old=await loginRequest(key);await db.execute('UPDATE account_passkey_challenges SET expires_at=UTC_TIMESTAMP(3)-INTERVAL 1 SECOND WHERE id=?',[old.body.challengeId]);await expect(service.finishPasskeyAuthentication(old)).rejects.toMatchObject({code:'PASSKEY_INVALID'});
  const wrongOrigin=await loginRequest(key);wrongOrigin.get=()=> 'https://other.example.org';await expect(service.finishPasskeyAuthentication(wrongOrigin)).rejects.toMatchObject({code:'PASSKEY_INVALID'});
  const reg=request(2);reg.body={password};const start=await service.beginPasskeyRegistration(reg,response(reg));reg.sessionSecurity.key='a'.repeat(64);reg.body={challengeId:start.challengeId,response:registration(start.options,keypair())};await expect(service.finishPasskeyRegistration(reg)).rejects.toMatchObject({code:'PASSKEY_INVALID'});
 });
 it('consumes concurrent login assertions exactly once and rejects counter replay',async()=>{const {key}=await enroll(),req=await loginRequest(key);const results=await Promise.allSettled([service.finishPasskeyAuthentication(req),service.finishPasskeyAuthentication(req)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);await expect(service.finishPasskeyAuthentication(await loginRequest(key,{counter:1}))).rejects.toMatchObject({code:'PASSKEY_INVALID'});});
 it('requires the enrolled factor after password or emailed-link login and for additional enrollment',async()=>{await enroll();const req=request();expect(await accountSecurityState(req)).toMatchObject({required:true,verified:false});req.body={password};await expect(service.beginPasskeyRegistration(req,response(req))).rejects.toMatchObject({code:'PASSKEY_PROOF_REQUIRED'});});
 it('cannot enroll an alternate authenticator with only a password to bypass a passkey',async()=>{await enroll();const req=request();req.body={password};await expect(beginAuthenticator(req)).rejects.toMatchObject({code:'MFA_REQUIRED'});});
 it('will not verify another user’s passkey for an existing session',async()=>{const {key}=await enroll();const req=request(2),start=await service.beginPasskeyAuthentication(req,response(req),'verify');req.body={challengeId:start.challengeId,response:assertion(start.options,key,key.handle)};await expect(service.finishPasskeyAuthentication(req,'verify')).rejects.toMatchObject({code:'PASSKEY_INVALID'});});
 it('uses a recovery code once, revokes lost keys and other sessions, and preserves the verification gate',async()=>{
  const {key,result}=await enroll(),req=request();req.body={password,code:result.recoveryCodes[0]};
  const results=await Promise.allSettled([service.recoverPasskeys(req),service.recoverPasskeys({...req,sessionSecurity:{key:'b'.repeat(64)}})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  await expect(service.finishPasskeyAuthentication(await loginRequest(key))).rejects.toMatchObject({code:'PASSKEY_INVALID'});
  expect(await accountSecurityState(request())).toMatchObject({required:true,verified:false});
  const [[proof]]=await db.query("SELECT session_key FROM account_passkey_proofs WHERE method='recovery'");req.sessionSecurity.key=proof.session_key;req.body={label:'Replacement'};const start=await service.beginPasskeyRegistration(req,response(req));expect(start.options.userVerification||start.options.authenticatorSelection.userVerification).toBe('required');
 });
 it('cannot remove the last key or use a revoked key’s session',async()=>{const {req}=await enroll();const [[key]]=await db.query('SELECT id FROM account_passkeys');req.params={id:key.id};await expect(service.removePasskey(req)).rejects.toMatchObject({code:'PASSKEY_LAST'});await db.query('UPDATE account_passkeys SET revoked_at=UTC_TIMESTAMP(3)');await expect(service.assertPasskeySession({id:1,authMethod:'passkey',passkeyId:key.id})).rejects.toMatchObject({code:'SESSION_EXPIRED'});});
 it.skipIf(process.env.PASSKEY_BROWSER_TEST!=='1')('completes real browser enrollment and login with a virtual verified authenticator',async()=>{
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true});
  try {
   const context=await browser.newContext(),page=await context.newPage(),cdp=await context.newCDPSession(page);
   page.setDefaultTimeout(12000);page.on('pageerror',e=>console.error('Browser error:',e.message));
   await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
   const base=request(2);base.get=()=> 'http://localhost:5186';
   await page.route('**/api/**',async route=>{
    const raw=route.request(),path=new URL(raw.url()).pathname,req={...base,body:raw.postDataJSON()||{},cookies:{...base.cookies}};
    let data,status=200;
    try {
     if(path.endsWith('/register/options'))data=await service.beginPasskeyRegistration(req,response(base));
     else if(path.endsWith('/register/verify'))data=await service.finishPasskeyRegistration(req);
     else if(path==='/api/account-security/passkeys')data=await service.passkeyStatus(req);
     else if(path==='/api/auth/passkeys/options')data=await service.beginPasskeyAuthentication(req,response(base));
     else if(path==='/api/auth/passkeys/verify'){const result=await service.finishPasskeyAuthentication(req);data={user:{id:result.user.id},sessionId:'synthetic-browser-session'};}
     else data={};
    }catch(e){status=e.status||500;data={error:{message:e.message,code:e.code}};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   });
   await page.goto('http://localhost:5186/test-fixtures/passkeys.html');
   await page.getByLabel('Confirm your account password').fill(password);
   await page.getByRole('button',{name:'Set up a passkey',exact:true}).click();
   await page.getByText('Passkey saved. You can use it the next time you sign in.').waitFor();
   await page.getByRole('button',{name:'I saved my codes',exact:true}).click();
   await page.getByRole('button',{name:'Sign in with a passkey',exact:true}).click();
   await page.getByText('Passkey sign-in completed',{exact:true}).waitFor();
   expect((await db.query('SELECT COUNT(*) total FROM account_passkeys WHERE user_id=2 AND revoked_at IS NULL'))[0][0].total).toBe(1);
   await page.screenshot({path:'/tmp/passkeys-desktop.png',fullPage:true});
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/passkeys-mobile.png',fullPage:true});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  } finally {await browser.close();}
 },30000);

});
