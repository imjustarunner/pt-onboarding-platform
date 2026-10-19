import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),notice:vi.fn(),identity:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../credentialChangeNotification.service.js',()=>({recordCredentialChangeNotice:m.notice}));
vi.mock('../productIdentity.service.js',()=>({assertFullSuiteIdentity:m.identity,fullSuiteIdentityAllowed:vi.fn()}));
vi.mock('bcrypt',()=>({default:{hash:vi.fn(async()=> 'hashed-password')}}));
import User from '../../models/User.model.js';
beforeEach(()=>{vi.resetAllMocks();m.identity.mockResolvedValue();m.execute.mockResolvedValue([[]]);vi.spyOn(User,'findById').mockResolvedValue({id:7});});
it('queues a notice for every successful password change, not only the first',async()=>{
 await User.changePassword(7,'new-password');await User.changePassword(7,'another-password');expect(m.notice).toHaveBeenCalledTimes(2);expect(m.notice).toHaveBeenLastCalledWith({userId:7,kind:'password'});
 expect(JSON.stringify(m.notice.mock.calls)).not.toContain('password-hash');
});
it('also notifies when an administrator replaces a password with a temporary one',async()=>{
 await User.setTemporaryPassword(7,'temporary-password');expect(m.notice).toHaveBeenCalledWith({userId:7,kind:'password'});
});
it('does not notify when the password write or identity check fails',async()=>{
 m.execute.mockImplementation(async sql=>{if(sql.startsWith('UPDATE users'))throw new Error('Write failed');return [[]];});
 await expect(User.changePassword(7,'new-password')).rejects.toThrow('Write failed');expect(m.notice).not.toHaveBeenCalled();
 m.identity.mockRejectedValue(new Error('Wrong product'));await expect(User.changePassword(7,'new-password')).rejects.toThrow('Wrong product');expect(m.notice).not.toHaveBeenCalled();
});
