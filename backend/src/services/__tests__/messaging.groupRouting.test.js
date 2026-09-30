import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{isConfigured:()=>true,getClient:vi.fn(),getUser:vi.fn()}}));
vi.mock('../unifiedEmail/gmailClient.js',()=>({getImpersonatedUser:()=> 'ai@itsco.health'}));
import pool from '../../config/database.js';
import Directory from '../googleWorkspaceDirectory.service.js';
import { expandMailboxRecipients, resolvePersonalMailRecipients, mailboxDomainOwners } from '../groupMailboxRouting.service.js';
const boxes=[{id:1,from_email:'eden@itsco.health'},{id:2,from_email:'alex@itsco.health'}];
it('delivers nested group mail to every addressed staff inbox exactly once',async()=>{
  const graph={'staff@itsco.health':[{type:'GROUP',email:'team@itsco.health'},{type:'GROUP',email:'eden@itsco.health'}],'team@itsco.health':[{type:'GROUP',email:'eden@itsco.health'},{type:'USER',email:'alex@itsco.health'},{type:'GROUP',email:'staff@itsco.health'}]};
  expect((await expandMailboxRecipients(['staff@itsco.health','eden@itsco.health'],boxes,async e=>graph[e]||[])).map(b=>b.id).sort()).toEqual([1,2]);
});
it('never expands a personal group into its owners or delegate',async()=>{
  const list=vi.fn(async()=>[{email:'alex@itsco.health',type:'GROUP'}]);
  expect((await expandMailboxRecipients(['eden@itsco.health'],boxes,list)).map(b=>b.id)).toEqual([1]);expect(list).not.toHaveBeenCalled();
});
it('does not deliver disabled membership or expand outside managed domains',async()=>{
  const list=vi.fn(async()=>[{email:'eden@itsco.health',type:'GROUP',delivery_settings:'NONE'}]);
  expect(await expandMailboxRecipients(['staff@itsco.health','outsiders@example.org'],boxes,list)).toEqual([]);expect(list).toHaveBeenCalledTimes(1);
});
it('propagates a directory outage instead of acknowledging a partial delivery',async()=>{
  await expect(expandMailboxRecipients(['eden@itsco.health','staff@itsco.health'],boxes,async()=>{throw Error('offline');})).rejects.toThrow('offline');
});
it('prefers the same owner’s tenant mailbox over a duplicate school context',async()=>{
 const duplicates=[{id:1,from_email:'eden@itsco.health',owner_user_id:5,organization_type:'school'},{id:2,from_email:'eden@itsco.health',owner_user_id:5,organization_type:'agency'}];
 expect((await expandMailboxRecipients(['eden@itsco.health'],duplicates,async()=>[])).map(b=>b.id)).toEqual([2]);
 await expect(expandMailboxRecipients(['eden@itsco.health'],[{...duplicates[0],owner_user_id:9},duplicates[1]],async()=>[])).rejects.toThrow('Ambiguous');
});

it('does not expand the app relay or actual Workspace users as Groups alongside a provider invitation',async()=>{
 pool.execute.mockResolvedValue([boxes]);const list=vi.fn().mockRejectedValue(Object.assign(new Error('Not Authorized'),{code:403}));Directory.getClient.mockResolvedValue({members:{list}});Directory.getUser.mockResolvedValue({id:'workspace-user'});
 expect((await resolvePersonalMailRecipients(['ai@itsco.health','host@itsco.health','eden@itsco.health'])).map(b=>b.id)).toEqual([1]);
 expect(Directory.getUser).not.toHaveBeenCalledWith({primaryEmail:'ai@itsco.health'});expect(list).not.toHaveBeenCalled();
});

it('uses the addressed tenant group to disambiguate a shared staff login across tenants',async()=>{
 const shared=[{id:1,from_email:'staff@plottwistco.com',owner_user_id:5,agency_id:1},{id:2,from_email:'staff@plottwistco.com',owner_user_id:5,agency_id:2}];
 const list=async()=>[{email:'staff@plottwistco.com',type:'USER'}];
 expect((await expandMailboxRecipients(['licensed@itsco.health'],shared,list,new Map([['licensed@itsco.health',2]]))).map(b=>b.id)).toEqual([2]);
});
it('routes authenticated Sent Bcc copies to the sender tenant, keeping a shared login unambiguous',async()=>{
 const shared=[{id:1,inbox_id:10,agency_id:1,from_email:'staff@plottwistco.com'},{id:2,inbox_id:20,agency_id:2,from_email:'staff@plottwistco.com'}];
 pool.execute.mockImplementation(async sql=>[sql.startsWith('SELECT agency_id')?[{agency_id:2}]:shared]);
 const found=await resolvePersonalMailRecipients([],{sentFromEmail:'messages@itsco.health',bccAddresses:['staff@plottwistco.com']});
 expect(found.map(b=>b.inbox_id)).toEqual([20]);
});

it('retains tenant context when a managed group is nested inside another group',async()=>{
 const shared=[{id:1,from_email:'shared@plottwistco.com',owner_user_id:5,agency_id:1},{id:2,from_email:'shared@plottwistco.com',owner_user_id:5,agency_id:2}];
 const list=async email=>email==='support@itsco.health'?[{email:'staff@itsco.health',type:'GROUP'}]:[{email:'shared@plottwistco.com',type:'USER'}];
 expect((await expandMailboxRecipients(['support@itsco.health'],shared,list,new Map([['staff@itsco.health',2]]))).map(b=>b.id)).toEqual([2]);
});
it('routes a direct shared login only to its uniquely configured tenant domain for the same owner',async()=>{
 const shared=[{id:1,from_email:'staff@itsco.health',owner_user_id:5,agency_id:2,organization_type:'agency'},{id:2,from_email:'staff@itsco.health',owner_user_id:5,agency_id:6,organization_type:'agency'}];
 const domains=new Map([['itsco.health',2]]);
 expect((await expandMailboxRecipients(['staff@itsco.health'],shared,async()=>[],new Map(),domains)).map(b=>b.id)).toEqual([1]);
 await expect(expandMailboxRecipients(['staff@itsco.health'],[{...shared[0],owner_user_id:9},shared[1]],async()=>[],new Map(),domains)).rejects.toHaveProperty('code','AMBIGUOUS_MAILBOX');
 await expect(expandMailboxRecipients(['staff@itsco.health'],shared,async()=>[])).rejects.toHaveProperty('code','AMBIGUOUS_MAILBOX');
 // Explicit tenant-group context wins over the address's default domain.
 expect((await expandMailboxRecipients(['team@nextlevel.test'],shared,async()=>[{type:'USER',email:'staff@itsco.health'}],new Map([['team@nextlevel.test',6]]),domains)).map(b=>b.id)).toEqual([2]);
});

it('uses explicit Workspace ownership over fallback sender domains without hiding explicit conflicts', () => {
 const senders=[{domain:'shared.test',agency_id:1},{domain:'shared.test',agency_id:9},{domain:'other.test',agency_id:2}];
 expect([...mailboxDomainOwners(senders,[{domain:'shared.test',agency_id:1}])]).toEqual([['shared.test',1],['other.test',2]]);
 expect(mailboxDomainOwners(senders,[{domain:'shared.test',agency_id:1},{domain:'shared.test',agency_id:9}]).has('shared.test')).toBe(false);
});
