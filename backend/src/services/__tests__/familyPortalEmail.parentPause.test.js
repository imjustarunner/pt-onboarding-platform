import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {routineParentEmailGate} from '../routineParentEmailPause.service.js';
let db,users,metadata,paused;
const input={agencyId:2,to:'parent@example.test',templateType:'identity_send'};
const gate=override=>routineParentEmailGate({...input,...override},db);
beforeEach(()=>{
  users=[{email:input.to,role:'client_guardian'}];metadata={source:'auto'};paused=new Set([2,6]);
  db={execute:vi.fn(async(sql,args)=>{
    if(sql.includes('agency_parent_email_controls'))return [[{routine_emails_paused:paused.has(args[0])?1:0}]];
    if(sql.includes('user_communications'))return [[{metadata}]];
    if(sql.includes('FROM users'))return [users.filter(u=>args.includes(u.email))];
    if(sql.includes('FROM clients'))return [[{guardian_email:'anonymous@example.test'}]];
    throw new Error(`Unexpected query ${sql}`);
  })};
});
it('pauses real guardian automation only for the selected agencies',async()=>{
  for(const agencyId of [2,6])expect(await gate({agencyId})).toEqual({allowed:false,reason:'routine_parent_emails_paused'});
  expect(await gate({agencyId:9})).toEqual({allowed:true});
});
it.each(['enrollment_unfinished_reminder_24h','intake_packet_completion','co_guardian_invite','school_session_notice','family_balance_due','provider_waitlist_update'])('covers %s before a parent has an account',async templateType=>{
  users=[];expect((await gate({templateType})).allowed).toBe(false);
});
it('recognizes clinical client and legacy guardian accounts',async()=>{
  for(const role of ['client','guardian']){users[0].role=role;expect((await gate({})).allowed).toBe(false);}
});
it('checks cc/bcc and display-name addresses without allowing a mixed test/real envelope',async()=>{
  expect((await gate({to:'testing@itsco.health',bcc:'Parent <parent@example.test>'})).allowed).toBe(false);
  expect((await gate({to:'Demo <fake@example.com>',cc:[{address:input.to}]})).allowed).toBe(false);
});
it('allows only-test previews and does not query production recipients for them',async()=>{
  expect((await gate({to:['testing@itsco.health','Demo <fake@example.com>']})).allowed).toBe(true);
  expect(db.execute).not.toHaveBeenCalled();
});
it('preserves staff notifications even when a shared template is used',async()=>{
  users=[{email:'staff@example.test',role:'provider'}];
  expect((await gate({to:users[0].email,templateType:'intake_packet_completion'})).allowed).toBe(true);
});
it('does not exempt a staff address that also belongs to a guardian account',async()=>{
  users.push({email:input.to,role:'provider'});expect((await gate({})).allowed).toBe(false);
});
it('matches unregistered client contacts for an uncategorized automation',async()=>{
  users=[];expect((await gate({to:'anonymous@example.test',clientId:22})).allowed).toBe(false);
});
it.each(['password_reset','admin_initiated_password_reset','account_login_help','guardian_portal_login_info','auricwell_account_recovery','security_password_changed'])('preserves requested recovery/security: %s',async templateType=>{
  expect((await gate({templateType})).allowed).toBe(true);
});
it('preserves deliberately sent staff mail but does not exempt approval of an automatic reminder',async()=>{
  expect((await gate({source:'manual'})).allowed).toBe(true);
  expect((await gate({source:'manual',existingCommunicationId:123})).allowed).toBe(false);
  metadata={source:'manual'};expect((await gate({source:'manual',existingCommunicationId:123})).allowed).toBe(true);
});
it('does not treat missing or malformed original metadata as manual authorization',async()=>{
  for(const value of [null,'bad json','{}']){metadata=value;expect((await gate({source:'manual',existingCommunicationId:123})).allowed).toBe(false);}
});
it('uses fresh pause state rather than caching across sends',async()=>{
  expect((await gate({})).allowed).toBe(false);paused.clear();expect((await gate({})).allowed).toBe(true);
});
