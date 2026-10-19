import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),notice:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../credentialChangeNotification.service.js',()=>({recordCredentialChangeNotice:m.notice}));
vi.mock('bcrypt',()=>({default:{hash:vi.fn(async()=> 'hashed-code')}}));
import {createInitialPasscode,resetPasscode} from '../quickViewAuth.service.js';
beforeEach(()=>{vi.resetAllMocks();m.notice.mockResolvedValue(1);m.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT'))return [[{passcode_version:3,passcode_set_at:new Date()}]];
  return [{affectedRows:1}];
});});
it('creates a missing code and queues an alert without passing the code to mail',async()=>{
 const result=await createInitialPasscode({userId:7,agencyId:2});expect(result.passcode).toMatch(/^\d{6}$/);
 expect(m.notice).toHaveBeenCalledWith({userId:7,agencyId:2,kind:'quick_view'});
 expect(JSON.stringify(m.notice.mock.calls)).not.toContain(result.passcode);
});
it('never overwrites an existing code or sends a success notice on a concurrent setup',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('UPDATE')?[{affectedRows:0}]:[[]]);
 await expect(createInitialPasscode({userId:7})).rejects.toMatchObject({status:409});expect(m.notice).not.toHaveBeenCalled();
});
it('notifies on every reset and revokes existing Quick View sessions',async()=>{
 await resetPasscode({userId:7,agencyId:2});await resetPasscode({userId:7,agencyId:2});
 expect(m.notice).toHaveBeenCalledTimes(2);expect(m.notice).toHaveBeenLastCalledWith({userId:7,agencyId:2,kind:'quick_view',version:3});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('UPDATE quick_view_sessions SET revoked_at'))).toBe(true);
});
it('does not queue a notice when saving the credential fails',async()=>{
 m.execute.mockRejectedValue(new Error('Database unavailable'));
 await expect(resetPasscode({userId:7})).rejects.toThrow('Database unavailable');expect(m.notice).not.toHaveBeenCalled();
});
