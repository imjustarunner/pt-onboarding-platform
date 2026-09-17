import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{isConfigured:()=>false}}));
import { expandMailboxRecipients } from '../groupMailboxRouting.service.js';
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
