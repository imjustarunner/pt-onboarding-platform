import {beforeEach,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>({beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>db}}));
vi.mock('../activityProtection.service.js',()=>({resourceReference:x=>x,recordProtectionAlert:vi.fn()}));
import {reserveLoginAttempts} from '../../middleware/loginProtection.middleware.js';
beforeEach(()=>{vi.clearAllMocks();db.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[{attempts:0,expired:false}]]:[{affectedRows:1}]);});
it('uses only a source bucket for discoverable passkeys instead of one shared blank-account limit',async()=>{const req={socket:{remoteAddress:'127.0.0.1'},headers:{},body:{}};await reserveLoginAttempts(req,{identify:true,namespace:'passkey',sourceOnly:true});const inserts=db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT'));expect(inserts).toHaveLength(1);expect(inserts[0][1][0]).toBe('passkey:source:127.0.0.1');});
it('keys security-management limits by the authenticated account, ignoring a supplied username',async()=>{const req={socket:{remoteAddress:'127.0.0.1'},headers:{},user:{id:42},body:{username:'attacker-selected'}};await reserveLoginAttempts(req,{identify:true,namespace:'passkey-security',accountFromSession:true});const keys=db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT')).map(([,args])=>args[0]);expect(keys).toContain('passkey-security:account:42');expect(keys.join(' ')).not.toContain('attacker-selected');});
