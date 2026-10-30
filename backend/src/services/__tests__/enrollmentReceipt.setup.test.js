import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default:{}, onTableWrite:vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default:{} }));
import { enrollmentReceiptPortalAction } from '../enrollmentReceiptPortal.service.js';
import { enrollmentConfirmationContent } from '../enrollmentReceiptContent.js';

let user, db, users, chain;
const input = { submission:{ guardian_user_id:20,client_id:8 }, agency:{id:2,slug:'practice'},to:'parent@example.test',enrollmentChannel:'counseling' };
beforeEach(() => {
  user = {id:20,email:input.to,role:'client_guardian',status:'PENDING_SETUP',is_active:1,identity_product:'full_suite',password_hash:null};
  chain=Promise.resolve();
  const unlocks=[];
  db={execute:vi.fn(async(sql,args)=>{
    if(sql.includes('GET_LOCK')){const prior=chain;chain=new Promise(resolve=>unlocks.push(resolve));await prior;return [[{acquired:1}]];}
    if(sql.includes('RELEASE_LOCK')){unlocks.shift()();return [[]];}
    if(sql.includes('FROM users'))return [[user].filter(Boolean)];
    throw Error('Unexpected query');
  })};
  users={generatePasswordlessToken:vi.fn(async()=>{
    Object.assign(user,{passwordless_token:'personal-setup-token',passwordless_token_purpose:'setup',passwordless_token_expires_at:new Date(Date.now()+48*3600000)});
    return {token:user.passwordless_token};
  })};
});
const action=(overrides={})=>enrollmentReceiptPortalAction({...input,...overrides},{db,users});

it.each([null,30])('takes a first-time office or school guardian directly to password creation (%s)',async schoolOrganizationId=>{
  const result=await action({schoolOrganizationId});
  expect(result).toMatchObject({needsPasswordSetup:true});
  const url=new URL(result.portalLoginUrl);expect(url.origin).toBe('https://auricwell.com');
  expect(url.pathname).toBe('/practice/new_account/personal-setup-token');expect(url.searchParams.get('portal')).toBe('practice');
  expect(users.generatePasswordlessToken).toHaveBeenCalledExactlyOnceWith(20,48,'setup',db);
  const [sql,params]=db.execute.mock.calls.find(([sql])=>sql.includes('FROM users'));
  expect(sql).toContain('c.agency_id=?');expect(sql).toContain('cg.access_enabled=1');expect(params).toEqual([20,8,2]);
});
it('keeps an established account on sign-in without issuing or changing credentials',async()=>{
  user.password_hash='existing-password';const result=await action();
  expect(result.needsPasswordSetup).toBe(false);expect(new URL(result.portalLoginUrl).pathname).toBe('/practice/login');
  expect(users.generatePasswordlessToken).not.toHaveBeenCalled();expect(user.password_hash).toBe('existing-password');
  const content=enrollmentConfirmationContent(result);expect(content.html).toContain('Open my portal');expect(content.html).not.toContain('Create my password');
});
it.each(['setup','reset'])('reuses an unexpired %s link so another enrollment does not break the earlier email',async purpose=>{
  Object.assign(user,{passwordless_token:'earlier-link',passwordless_token_purpose:purpose,passwordless_token_expires_at:'2030-01-01T00:00:00Z'});
  const result=await action();expect(result.portalLoginUrl).toContain('/new_account/earlier-link');expect(users.generatePasswordlessToken).not.toHaveBeenCalled();
});
it('replaces an expired setup link without creating a password',async()=>{
  Object.assign(user,{passwordless_token:'expired',passwordless_token_purpose:'setup',passwordless_token_expires_at:'2020-01-01T00:00:00Z'});
  const result=await action();expect(result.portalLoginUrl).toContain('/new_account/personal-setup-token');expect(user.password_hash).toBeNull();
});
it('shares one valid setup token when sibling receipts finalize concurrently',async()=>{
  const results=await Promise.all([action(),action({submission:{guardian_user_id:20,client_id:9}})]);
  expect(results[0].portalLoginUrl).toBe(results[1].portalLoginUrl);expect(users.generatePasswordlessToken).toHaveBeenCalledTimes(1);
});
it.each([{status:'INACTIVE_EMPLOYEE'},{is_archived:1},{is_active:0},{pending_access_locked:1},{identity_product:'auricwell_ehr'}])('does not issue setup credentials for a restricted account %j',async restriction=>{
  Object.assign(user,restriction);const result=await action();expect(result.needsPasswordSetup).toBe(false);expect(users.generatePasswordlessToken).not.toHaveBeenCalled();
});
it.each([{email:'other-parent@example.test'},{role:'provider'}])('never sends another identity’s setup link %j',async mismatch=>{
  Object.assign(user,mismatch);expect(await action()).toEqual({});expect(users.generatePasswordlessToken).not.toHaveBeenCalled();
});
it('does not grant setup for a missing or disabled relationship in this tenant',async()=>{
  user=null;expect(await action()).toEqual({});expect(users.generatePasswordlessToken).not.toHaveBeenCalled();
});
it('does not invent an account when the enrollment has no linked guardian',async()=>{
  expect(await action({submission:{client_id:8}})).toEqual({});expect(db.execute).not.toHaveBeenCalled();
});
it.each([['en','Create my password'],['es','Crear mi contraseña']])('explains direct setup in the %s receipt without requesting another email',async(locale,label)=>{
  const content=enrollmentConfirmationContent({...await action(),locale});
  expect(content.html).toContain(label);expect(content.text).toContain('/new_account/personal-setup-token');
  expect(content.text).not.toContain('Request a password setup link');expect(content.text).not.toContain('solicite un enlace');
});
