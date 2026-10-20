import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),commit:vi.fn(),release:vi.fn(),append:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>({execute:m.execute,beginTransaction:async()=>{},commit:m.commit,rollback:async()=>{},release:m.release})}}));
vi.mock('../securityEvidence.service.js',()=>({appendSecurityEvidence:m.append,mirrorSecurityEvidence:vi.fn()}));
import {authorizeProtectedActivity} from '../activityProtection.service.js';
beforeEach(()=>{vi.clearAllMocks();m.append.mockResolvedValue('audit');m.execute.mockImplementation(async sql=>sql.includes('SELECT held_at')?[[{held_at:null}]]:sql.includes('SELECT COALESCE')?[[{recent:49,daily:100}]]:[{affectedRows:1}]);});
const req={user:{id:501},headers:{}};
it('records a temporary email volume limit without locking the account',async()=>{
 await expect(authorizeProtectedActivity(req,{kind:'email',resource:'send',units:2})).rejects.toThrow('account is not locked');
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE activity_protection_state'))).toBe(false);expect(m.commit).toHaveBeenCalled();
});
it('retains a durable security hold for an oversized bulk message',async()=>{
 await expect(authorizeProtectedActivity(req,{kind:'email',resource:'bulk',units:51,hardLimit:true})).rejects.toThrow('50-recipient');
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE activity_protection_state'))).toBe(true);
});
