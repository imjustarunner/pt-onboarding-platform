import { beforeEach, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import { schoolSessionEmailScope, createSchoolSessionEmailOptOutLink, schoolSessionEmailOptOutContext,
  disableSchoolSessionEmails, isSchoolSessionEmailOptedOut, schoolSessionEmailDeliveryGate } from '../schoolSessionEmailPreferences.service.js';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const base={agencyId:2,clientId:22,to:'Guardian@example.test'};
let rows,tokens,db,communication;
beforeEach(()=>{
  rows=new Map();tokens=new Map();communication={};
  db={execute:vi.fn(async(sql,args)=>{
    if(sql.startsWith('INSERT IGNORE')) rows.set(args[0],rows.get(args[0]) || {scope_key:args[0],product:args[1],agency_id:args[2],client_id:args[3],practice_id:args[4],patient_id:args[5],recipient_hash:args[6],disabled_at:null});
    else if(sql.startsWith('INSERT INTO school_session_email_opt_out_tokens')) tokens.set(args[0],{scope_key:args[1],expires_at:args[2]});
    else if(sql.includes('FROM school_session_email_opt_out_tokens')) {const token=tokens.get(args[0]);return [[...(token?[{...rows.get(token.scope_key),...token}]:[])]];}
    else if(sql.includes('FROM school_session_email_preferences')) return [[...(rows.has(args[0])?[rows.get(args[0])]:[])]];
    else if(sql.startsWith('UPDATE')) rows.get(args[0]).disabled_at ||= new Date();
    else if(sql.includes('FROM user_communications')) return [[communication]];
    return [{affectedRows:1}];
  })};
});
const link=async scope=>{const value=await createSchoolSessionEmailOptOutLink(scope,db);return {...value,token:value.url.split('/').pop()};};
it('persists only hashes and leaves preferences unchanged when a scanner opens the link',async()=>{
  const value=await link(base);expect(value.token).toMatch(/^[a-f0-9]{64}$/);
  expect(tokens.has(hash(value.token))).toBe(true);
  expect(JSON.stringify([...rows.values()])).not.toContain('Guardian@');
  await schoolSessionEmailOptOutContext(value.token,db);
  expect(await isSchoolSessionEmailOptedOut(base,db)).toBe(false);
  expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('stops one child, agency and recipient without muting other guardians or siblings',async()=>{
  const value=await link(base);
  await disableSchoolSessionEmails(value.token,db);
  expect(await isSchoolSessionEmailOptedOut({...base,to:' guardian@EXAMPLE.test '},db)).toBe(true);
  for(const scope of [{...base,clientId:23},{...base,agencyId:6},{...base,to:'other-guardian@example.test'}])
    expect(await isSchoolSessionEmailOptedOut(scope,db)).toBe(false);
  const previous=rows.get(value.scopeKey).disabled_at;
  await disableSchoolSessionEmails(value.token,db);expect(rows.get(value.scopeKey).disabled_at).toBe(previous);
  const another=await link(base);expect(another.token).not.toBe(value.token);
  expect((await schoolSessionEmailOptOutContext(value.token,db)).disabled_at).toBeTruthy();
  expect(await isSchoolSessionEmailOptedOut(base,db)).toBe(true);
});
it('keeps native AuricWell practices, patients and recipients independent',async()=>{
  const native={agencyId:2,practiceId:'practice-a',patientId:'patient-a',to:base.to};
  const value=await link(native);await disableSchoolSessionEmails(value.token,db);
  expect(await isSchoolSessionEmailOptedOut(native,db)).toBe(true);
  for(const scope of [{...native,practiceId:'practice-b'},{...native,patientId:'patient-b'},{...native,to:'other@example.test'},base])
    expect(await isSchoolSessionEmailOptedOut(scope,db)).toBe(false);
});
it('rejects forged and expired links, with no mutation',async()=>{
  const value=await link(base);tokens.get(hash(value.token)).expires_at='2000-01-01 00:00:00';
  for(const token of [value.token,'x', 'b'.repeat(64)]) await expect(disableSchoolSessionEmails(token,db)).rejects.toThrow();
  expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('rechecks a queued email at approval and leaves every other email category alone',async()=>{
  const value=await link(base);
  const input={templateType:'school_session_notice',schoolSessionScopeKey:value.scopeKey,...base};
  expect((await schoolSessionEmailDeliveryGate(input,db)).allowed).toBe(true);
  communication.metadata=JSON.stringify({schoolSessionScopeKey:value.scopeKey});
  await disableSchoolSessionEmails(value.token,db);
  expect(await schoolSessionEmailDeliveryGate({...input,schoolSessionScopeKey:undefined,existingCommunicationId:8},db)).toMatchObject({allowed:false,reason:'school_session_email_opted_out'});
  for(const templateType of ['session_reminder','session_confirmation','family_balance_due','secure_message_notification','guardian_plan_review'])
    expect(await schoolSessionEmailDeliveryGate({...input,templateType},db)).toEqual({allowed:true});
  for(const changed of [{to:'other@example.test'},{clientId:23},{agencyId:6},{schoolSessionScopeKey:'c'.repeat(64)}])
    await expect(schoolSessionEmailDeliveryGate({...input,...changed},db)).rejects.toMatchObject({status:409});
});
it('requires a valid explicit scope',()=>{
  for(const input of [{...base,clientId:null},{...base,agencyId:null},{...base,to:''},{practiceId:'practice',to:base.to}])
    expect(()=>schoolSessionEmailScope(input)).toThrow();
});
