import {it,expect,vi} from 'vitest';
import {billingSenderMembers} from '../familyLedger/senders.js';
it('accepts explicitly authorized staff across verified Workspace domains and excludes unmanaged addresses',async()=>{
 const db={execute:vi.fn(async()=>[[{id:1,email:'biller@platform.invalid'},{id:2,email:'outsider@gmail.com'},{id:3,email:'unapproved@platform.invalid'}]])};
 const authorize=async user=>{if(user.id===3)throw Object.assign(new Error('Denied'),{status:403});};
 const resolveAddress=async email=>email.endsWith('@platform.invalid')?email:'';
 expect(await billingSenderMembers(10,'practice.invalid',{db,authorize,resolveAddress,allowManagedWorkspaceAddresses:true})).toEqual(['biller@platform.invalid']);
});
it('includes authorized managed billers and skips administrators whose billing access is off',async()=>{const db={execute:vi.fn(async()=>[[{id:1,email:'biller@example.invalid'},{id:2,email:'support@example.invalid'},{id:3,email:'outside@other.invalid'}]])},authorize=vi.fn(async user=>{if(user.id===2)throw Object.assign(new Error('Denied'),{status:403});});expect(await billingSenderMembers(10,'example.invalid',{db,authorize})).toEqual(['biller@example.invalid']);expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('agency_billing_management'),[0,10,10]);expect(authorize).toHaveBeenCalledWith(expect.objectContaining({id:1}),10,db);});
it('does not hide an authorization service failure while provisioning financial mailboxes',async()=>{const db={execute:vi.fn(async()=>[[{id:1,email:'biller@example.invalid'}]])};await expect(billingSenderMembers(10,'example.invalid',{db,authorize:async()=>{throw new Error('Database unavailable');}})).rejects.toThrow('Database unavailable');});
