import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),encrypt:vi.fn(),decrypt:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:m.encrypt,decryptChatText:m.decrypt}));
import {readPhoneWorkflow,storePhoneWorkflow} from '../phoneWorkflowStorage.service.js';
beforeEach(()=>{vi.clearAllMocks();m.encrypt.mockReturnValue({ciphertextB64:'cipher',ivB64:'iv',authTagB64:'tag',keyId:'key'});m.execute.mockResolvedValue([{affectedRows:1}]);});
const input=()=>({agencyId:2,userId:7,revision:1,config:{mainNumber:'+17196577444'}});
describe('encrypted workflow storage',()=>{
 it('stores ciphertext scoped to agency and revision',async()=>{expect(await storePhoneWorkflow(input())).toBe(2);const [sql,args]=m.execute.mock.calls[0];expect(sql).toContain('WHERE agency_id=? AND revision=?');expect(args).toEqual(['cipher','iv','tag','key',7,2,1]);expect(sql).not.toContain('feature_flags');});
 it('aborts before writing when encryption is unavailable',async()=>{m.encrypt.mockImplementation(()=>{throw Error('No key');});await expect(storePhoneWorkflow(input())).rejects.toThrow('No key');expect(m.execute).not.toHaveBeenCalled();});
 it('rejects stale revisions',async()=>{m.execute.mockResolvedValue([{affectedRows:0}]);await expect(storePhoneWorkflow(input())).rejects.toMatchObject({status:409});});
 it('handles concurrent first saves',async()=>{m.execute.mockRejectedValue({code:'ER_DUP_ENTRY'});await expect(storePhoneWorkflow({...input(),revision:0})).rejects.toMatchObject({status:409});});
 it('returns defaults only for an existing agency with no draft',async()=>{m.execute.mockResolvedValue([[{name:'ITSCO',revision:null}]]);const r=await readPhoneWorkflow(2);expect(r.revision).toBe(0);expect(r.config.greeting).toContain('ITSCO');m.execute.mockResolvedValue([[]]);await expect(readPhoneWorkflow(2)).rejects.toMatchObject({status:404});});
 it('decrypts only the selected agency workflow',async()=>{m.execute.mockResolvedValue([[{revision:2,config_ciphertext:'c',config_iv:'i',config_auth_tag:'t',encryption_key_id:'k'}]]);m.decrypt.mockReturnValue('{"mainNumber":"+17196577444"}');expect(await readPhoneWorkflow(2)).toEqual({revision:2,config:{mainNumber:'+17196577444'}});expect(m.execute.mock.calls[0][1]).toEqual([2]);});
});
